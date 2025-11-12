// Load data
const raw = await fetch('./database.json').then(r=>r.json());
const DATA = raw.map(r => ({
  id: r.id,
  city: r.features.city,
  tier: (r.features.articleship_tier || 'Other'),
  domain: r.features.domain,
  attempts: r.features.attempts === '5+' ? 5 : r.features.attempts,
  score_bucket: r.features.score_bucket,
  it_present: !!r.features.it_present,
  rank_present: !!r.features.rank_present,
  shortlisted_by: r.shortlisted_by || [],
  shortlist_count: r.shortlist_count || (r.shortlisted_by ? new Set(r.shortlisted_by).size : 0),
}));

// Precompute global stats for smoothing
const COMPANY_PRIOR_BY_CITY = buildCityCompanyPrior(DATA);

// UI wiring
const form = document.getElementById('profile-form');
const resultsPanel = document.getElementById('results-panel');
const cityTabsEl = document.getElementById('city-tabs');
const resultsEl = document.getElementById('results-content');

form.onsubmit = (e) => {
  e.preventDefault();
  const city = document.getElementById('city').value;
  if (!city) { alert('Please select a city to get your prediction.'); return; }
  const profile = {
    cities: [city],
    tier: document.getElementById('tier').value,
    domain: document.getElementById('domain').value || null,
    score_bucket: document.getElementById('score').value,
    attempts: parseAttempts(document.getElementById('attempts').value),
    it_present: document.getElementById('it_present').value === 'true',
    rank_present: document.getElementById('rank_present').value === 'true',
  };
  
  const perCity = [ { city, ...predictForCity(profile, city) } ];
  renderResults(perCity);

  resultsPanel.classList.remove('hidden');
  resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// --- CORE MODEL PARAMETERS & HELPERS ---

function parseAttempts(v){ return v==='5+'?5:parseInt(v,10); }
const SCORE_MAP = {'50-55':1,'55-60':2,'60-65':3,'65-70':4,'70+':5};
const SCORE_BOOST = { '50-55': -0.8, '55-60': -0.4, '60-65': 0.0, '65-70': 0.4, '70+': 0.8 };
const ATTEMPT_PENALTY = { 1: 0, 2: -0.25, 3: -0.5, 4: -0.8, 5: -1.0 };
function catDist(a,b){ return a===b?0:1; }
function boolDist(a,b){ return a===b?0:1; }
function norm(a,min,max){ return max===min?0: (a-min)/(max-min); }

// NEW: Overhauled Gower distance weights for better neighbor selection
const WEIGHTS = { 
  attempts: 4.0, // Significantly increased as requested
  score: 2.0,
  tier: 2.0,
  domain: 1.5,
  it: 3.0,     // Strong differentiator
  rank: 4.0,   // Strongest differentiator
  city: 1.0,   // Reduced weight, as we already filter by city
};
const ATT_MIN = 1, ATT_MAX = 5;

function distance(p, q){
  let num=0, den=0;
  num += WEIGHTS.attempts * Math.abs(norm(p.attempts,ATT_MIN,ATT_MAX) - norm(q.attempts,ATT_MIN,ATT_MAX)); den += WEIGHTS.attempts;
  num += WEIGHTS.score * Math.abs((SCORE_MAP[p.score_bucket]-SCORE_MAP[q.score_bucket]) / 4); den += WEIGHTS.score;
  num += WEIGHTS.tier * catDist(p.tier, q.tier); den += WEIGHTS.tier;
  if (p.city && q.city) { num += WEIGHTS.city * catDist(p.city, q.city); den += WEIGHTS.city; }
  if (p.domain) { num += WEIGHTS.domain * catDist(p.domain, q.domain); den += WEIGHTS.domain; }
  num += WEIGHTS.it * boolDist(p.it_present, q.it_present); den += WEIGHTS.it;
  num += WEIGHTS.rank * boolDist(p.rank_present, q.rank_present); den += WEIGHTS.rank;
  return den ? num/den : 1;
}

// NEW: Inverse distance kernel to give more weight to the closest neighbors.
const kernel = (d) => 1 / (d + 0.01);

// --- PREDICTION ENGINE ---

function predictForCity(profile, city){
  const seed = { ...profile, city };
  const pool = DATA.filter(d => d.city === city);
  if (!pool.length) return emptyCityResult(city, 'No data for this city');

  const scored = pool.map(d => ({ d, dist: distance(seed, d) })).sort((a,b)=>a.dist-b.dist);
  const K = Math.min(75, scored.length);
  const nbrs = scored.slice(0, K);

  // --- Step 1: Calculate KNN Evidence Score ---
  const compWeightKnn = new Map();
  let totalWeightKnn = 0;
  const weights = nbrs.map(n => kernel(n.dist));
  nbrs.forEach((n, i) => {
    const w = weights[i];
    (n.d.shortlisted_by||[]).forEach(c => {
      compWeightKnn.set(c, (compWeightKnn.get(c)||0)+w);
    });
    totalWeightKnn += w;
  });
  if (totalWeightKnn === 0) totalWeightKnn = 1;

  // --- Step 2: Get City Prior Evidence ---
  const prior = COMPANY_PRIOR_BY_CITY.get(city) || new Map();

  // --- Step 3: Define Reliability Weights (Effective Sample Size) ---
  const w_knn = Math.min(nbrs.length, 60); 
  const cityPoolSize = pool.length;
  const w_prior = Math.min(cityPoolSize, 60);

  // --- Step 4: Profile Strength Adjustment ---
  const uplift = (seed.rank_present ? 1.0 : 0) + (seed.it_present ? 0.5 : 0);
  const scoreBoost = SCORE_BOOST[seed.score_bucket] || 0;
  const attemptPenalty = ATTEMPT_PENALTY[Math.min(5, seed.attempts)] || 0;
  const totalDelta = uplift + scoreBoost + attemptPenalty;
  const profileStrengthMultiplier = Math.exp(totalDelta / 4);

  // --- Step 5: Combine Sources using Reliability-Weighted Pooling ---
  const allCompaniesInCohort = nbrs.flatMap(n => n.d.shortlisted_by);
  const topCohortCompanies = topKFreq(allCompaniesInCohort, 5);
  const unionCompanies = new Set([...compWeightKnn.keys(), ...prior.keys()]);
  
  const companies = Array.from(unionCompanies).map(name => {
    const p_knn = (compWeightKnn.get(name) || 0) / totalWeightKnn;
    const p_prior = (prior.get(name) || 0);
    let combined_score = (w_knn * p_knn + w_prior * p_prior) / (w_knn + w_prior);
    combined_score *= profileStrengthMultiplier;
    return { name, score: combined_score };
  })
  .sort((a,b)=>b.score-a.score)
  .slice(0,10)
  .map(x => ({ ...x, reasons: buildInsightfulReasons(seed, city, x.name, topCohortCompanies) }));

  // --- Step 6: Predict Shortlist Count ---
  const counts = nbrs.map(n=>n.d.shortlist_count).sort((a,b)=>a-b);
  let p50 = quantile(counts, 0.5), p10 = quantile(counts, 0.1), p90 = quantile(counts, 0.9);
  p50 = Math.max(0, p50 + totalDelta); p10 = Math.max(0, p10 + totalDelta); p90 = Math.max(0, p90 + totalDelta);

  // --- Step 7: Gather Similar Profiles for UI ---
  const allSimilar = scored.map(n => ({
    similarity: 1 - n.dist,
    profile: n.d,
    shortlisted_by: n.d.shortlisted_by
  }));
  let similarExamples = allSimilar.filter(ex => ex.similarity > 0.90);
  if (similarExamples.length < 3) {
    similarExamples = allSimilar.slice(0, 3);
  }

  return {
    shortlist_count: { p50, p10, p90, drivers: buildDrivers(seed, totalDelta) },
    companies,
    similar_profiles: {
      cohort_size: nbrs.length,
      examples: similarExamples
    }
  };
}

// --- REASONING ENGINE & HELPERS ---

function buildInsightfulReasons(p, city, company, topCohortCompanies) {
    const reasons = new Set(); // Use a Set to avoid duplicate reasons
    const cName = company.toLowerCase();

    // Pattern 1 & 8: Attempts
    if (p.attempts === 1) reasons.add('First attempt is a significant advantage.');
    if (p.attempts >= 4) reasons.add('Multiple attempts can be a hurdle.');

    // Pattern 3: Articleship
    if (p.tier === 'Big4') {
        reasons.add('Big 4 articleship is a major multiplier.');
        if (p.domain === 'Statutory Audit' && /pwc|ey|kpmg|deloitte/i.test(cName)) {
            reasons.add('Prime target for Big 4 Stat Audit profiles.');
        }
    }

    // Pattern 2: Score
    if (SCORE_MAP[p.score_bucket] >= 4) reasons.add('Strong academic scores open doors.');

    // Pattern 6 & 11: Company & City Patterns
    if (topCohortCompanies.includes(company)) reasons.add('Very popular among similar profiles.');
    if (city === 'Mumbai' && /icici bank|mska/i.test(cName)) reasons.add('Key player in Mumbai\'s BFSI ecosystem.');
    if (city === 'Bengaluru' && /pwc sdc|kpmg global services|apex fund/i.test(cName)) reasons.add('Core recruiter in the Bengaluru tech/services hub.');
    if (city === 'Kolkata' && /pwc sdc|kpmg gs|ey gds/i.test(cName)) reasons.add('Dominant recruiter in the Kolkata region.');
    if (city === 'Chennai' && /barclays|ford|shell|standard chartered/i.test(cName)) reasons.add('Strong fit for Chennai\'s MNC back-office sector.');
    if (city === 'Ahmedabad' && /adani|waaree|arcelormittal/i.test(cName)) reasons.add('Matches Ahmedabad\'s industrial focus.');
    if (/axis bank|wipro|d\. e\. shaw/i.test(cName) && (p.attempts > 2 || SCORE_MAP[p.score_bucket] < 2)) {
      // Negative signal for selective recruiters
    } else if (/axis bank|wipro/i.test(cName) && (p.attempts <= 2 && SCORE_MAP[p.score_bucket] >= 2)) {
        reasons.add('Fits criteria for performance-selective firms.');
    }
    
    // Pattern 9: Industrial Training
    if (p.it_present) reasons.add('Industrial training provides a key edge.');
    
    if (reasons.size === 0) reasons.add('Based on general market trends.');
    
    return Array.from(reasons).slice(0, 2); // Return top 2 reasons
}


function buildDrivers(p, totalDelta){
  const tags = [];
  if (totalDelta !== 0) {
    tags.push(`Profile Adjustment: ${totalDelta > 0 ? '+' : ''}${totalDelta.toFixed(1)}`);
  }
  if (p.rank_present) tags.push(`Rank Holder`);
  if (p.it_present) tags.push(`Ind. Training`);
  if (SCORE_BOOST[p.score_bucket] > 0) tags.push(`High Score`);
  if (ATTEMPT_PENALTY[p.attempts] < 0) tags.push(`${p.attempts} Attempts`);
  tags.push(p.tier);
  return tags.slice(0,5);
}

function emptyCityResult(city, msg){
  return {
    shortlist_count: { p50:0, p10:0, p90:0, drivers:[] },
    companies: [],
    similar_profiles: { cohort_size:0, examples:[] },
    note: msg
  };
}

function quantile(arr, q){
  if (!arr.length) return 0;
  const pos = (arr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return arr[base] + (arr[base+1] !== undefined ? rest * (arr[base+1]-arr[base]) : 0);
}

function topKFreq(arr, k){
  const m = new Map();
  arr.forEach(a=>m.set(a,(m.get(a)||0)+1));
  return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).slice(0,k).map(([n])=>n);
}

function buildCityCompanyPrior(data){
  const byCity = new Map();
  data.forEach(d => {
    const city = d.city;
    if (!byCity.has(city)) byCity.set(city, new Map());
    const m = byCity.get(city);
    (d.shortlisted_by||[]).forEach(c => m.set(c, (m.get(c)||0)+1));
  });
  for (const [city, m] of byCity.entries()){
    let total = 0;
    m.forEach(v=>total+=v);
    if (total===0) total=1;
    for (const [k,v] of m.entries()){
      m.set(k, v/total);
    }
  }
  return byCity;
}

// --- UI RENDERING ---

function renderResults(perCity){
  cityTabsEl.innerHTML = '';
  const tabs = [];
  perCity.forEach((c,idx)=>{
    const btn = document.createElement('button');
    btn.textContent = c.city;
    if (idx===0) btn.classList.add('active');
    btn.onclick = ()=>{ tabs.forEach(x=>x.classList.remove('active')); btn.classList.add('active'); mountCity(c); };
    cityTabsEl.appendChild(btn); tabs.push(btn);
  });

  mountCity(perCity[0]);

  function mountCity(c){
    resultsEl.innerHTML = '';
    
    // CARD 1: Similar Profiles (now at the top)
    resultsEl.appendChild(card(`
      <h3>Learning from ${c.similar_profiles.examples.length} Profiles Like Yours</h3>
      <div class="muted">Our AI found these candidates in our database who most closely match your profile.</div>
      <div class="list" style="margin-top: 1rem;">
        ${c.similar_profiles.examples.map(ex=>`
          <div class="item-profile">
            <div>
              <div style="font-weight:600; font-size: 1.1rem; color: var(--primary);">${(ex.similarity*100).toFixed(0)}% Profile Match</div>
              <div class="muted">${ex.profile.tier} · ${ex.profile.score_bucket}% · ${ex.profile.attempts} Attempt(s)</div>
              <div class="muted">IT: ${ex.profile.it_present?'Yes':'No'} · Rank: ${ex.profile.rank_present?'Yes':'No'}</div>
              <div class="muted" style="margin-top: 8px;"><b>Was shortlisted by:</b> ${ex.shortlisted_by.join(', ') || 'None'}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `));
    
    // CARD 2: Shortlist Count Prediction
    resultsEl.appendChild(card(`
      <div class="muted">Expected Shortlists</div>
      <div class="big">${c.shortlist_count.p50.toFixed(0)}</div>
      <div class="muted">Likely Range: ${c.shortlist_count.p10.toFixed(0)}–${c.shortlist_count.p90.toFixed(0)}</div>
      <div class="tags">${c.shortlist_count.drivers.map(x=>`<span class="tag">${x}</span>`).join('')}</div>
    `));
    
    // CARD 3: Company Matches (ranked list, no scores)
    resultsEl.appendChild(card(`
      <div class="muted">Your Top 10 Company Matches</div>
      <div class="list">
        <ol class="ranked-list">
          ${c.companies.map(co=>`
            <li>
              <div class="company-item">
                <span class="company-name">${co.name}</span>
                <div class="reasons">${co.reasons.map(t=>`<span class="reason-tag">${t}</span>`).join('')}</div>
              </div>
            </li>
          `).join('')}
        </ol>
      </div>
    `));
  }

  function card(html){
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = html;
    return el;
  }
}