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
  
  // Predict only for the single selected city
  const perCity = [ { city, ...predictForCity(profile, city) } ];
  renderResults(perCity);

  // Show results and scroll to them
  resultsPanel.classList.remove('hidden');
  resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Helpers
function parseAttempts(v){ return v==='5+'?5:parseInt(v,10); }
const SCORE_MAP = {'50-55':1,'55-60':2,'60-65':3,'65-70':4,'70+':5};
const SCORE_BOOST = { '50-55': -0.8, '55-60': -0.4, '60-65': 0.0, '65-70': 0.4, '70+': 0.8 };
const ATTEMPT_PENALTY = { 1: 0, 2: -0.25, 3: -0.5, 4: -0.8, 5: -1.0 };
function catDist(a,b){ return a===b?0:1; }
function boolDist(a,b){ return a===b?0:1; }
function norm(a,min,max){ return max===min?0: (a-min)/(max-min); }

// Use aggressive weights for rank/IT to fix "similar profiles" and improve neighbor selection
const WEIGHTS = { attempts:1.5, score:1.8, tier:1.5, city:1.5, domain:1.2, it:2.0, rank:3.0 };
const ATT_MIN = 1, ATT_MAX = 5;

function distance(p, q){
  let num=0, den=0;
  num += WEIGHTS.attempts * Math.abs(norm(p.attempts,ATT_MIN,ATT_MAX) - norm(q.attempts,ATT_MIN,ATT_MAX)); den += WEIGHTS.attempts;
  num += WEIGHTS.score * Math.abs((SCORE_MAP[p.score_bucket]-SCORE_MAP[q.score_bucket]) / 4); den += WEIGHTS.score;
  num += WEIGHTS.tier * catDist(p.tier, q.tier); den += WEIGHTS.tier;
  num += WEIGHTS.city * catDist(p.city, q.city); den += WEIGHTS.city;
  if (p.domain) { num += WEIGHTS.domain * catDist(p.domain, q.domain); den += WEIGHTS.domain; }
  num += WEIGHTS.it * boolDist(p.it_present, q.it_present); den += WEIGHTS.it;
  num += WEIGHTS.rank * boolDist(p.rank_present, q.rank_present); den += WEIGHTS.rank;
  return den ? num/den : 1;
}

// Guarantees that strong profiles get a direct boost for top companies.
function companyAffinity(company, p){
  const name = company.toLowerCase();
  const isElite = /pwc|ey|kpmg|deloitte|grant|icici|axis|kotak|goldman|bank of|nabfid|nse|barclays|hsbc/.test(name);
  const scoreFactor = (SCORE_MAP[p.score_bucket]-3) * 0.15;
  const attemptsFactor = - (p.attempts - 1) * 0.06;
  const rankFactor = p.rank_present ? (isElite ? 0.30 : 0.12) : 0;
  const itFactor = p.it_present ? (isElite ? 0.06 : 0.04) : 0;
  let base = 1 + scoreFactor + attemptsFactor + rankFactor + itFactor;
  if (isElite && (p.rank_present || SCORE_MAP[p.score_bucket] > 3)) base += 0.05;
  return Math.max(0.6, Math.min(1.5, base));
}

const SIGMA = 0.6;
const kernel = (d) => Math.exp(-(d*d)/(2*SIGMA*SIGMA));

function predictForCity(profile, city){
  const seed = { ...profile, city };
  const pool = DATA.filter(d => d.city === city);
  if (!pool.length) return emptyCityResult(city, 'No data for this city');

  const scored = pool.map(d => ({ d, dist: distance(seed, d) })).sort((a,b)=>a.dist-b.dist);
  const K = Math.min(75, scored.length);
  const nbrs = scored.slice(0, K);
  const weights = nbrs.map(n => kernel(n.dist));
  const wSum = weights.reduce((a,b)=>a+b,0) || 1;

  const prior = COMPANY_PRIOR_BY_CITY.get(city) || new Map();
  const compWeight = new Map();
  let totalCompWeight = 0;
  nbrs.forEach((n, i) => {
    const w = weights[i];
    (n.d.shortlisted_by||[]).forEach(c => {
      compWeight.set(c, (compWeight.get(c)||0)+w);
      totalCompWeight += w;
    });
  });
  if (totalCompWeight === 0) totalCompWeight = wSum;

  const alpha = 4.0;
  const unionCompanies = new Set([...compWeight.keys(), ...prior.keys()]);

  const companies = Array.from(unionCompanies).map(name => {
    const emp = compWeight.get(name) || 0;
    const pr = (prior.get(name) || 0);
    const post = (emp + alpha * pr * totalCompWeight) / ((1+alpha) * totalCompWeight);
    const affinity = companyAffinity(name, seed);
    return { name, score: post * affinity };
  })
  .sort((a,b)=>b.score-a.score)
  .slice(0,10);

  const counts = nbrs.map(n=>n.d.shortlist_count).sort((a,b)=>a-b);
  let p50 = quantile(counts, 0.5), p10 = quantile(counts, 0.1), p90 = quantile(counts, 0.9);

  const uplift = (seed.rank_present ? 1.0 : 0) + (seed.it_present ? 0.5 : 0);
  const scoreBoost = SCORE_BOOST[seed.score_bucket] || 0;
  const attemptPenalty = ATTEMPT_PENALTY[Math.min(5, seed.attempts)] || 0;
  const totalDelta = uplift + scoreBoost + attemptPenalty;
  p50 = Math.max(0, p50 + totalDelta); p10 = Math.max(0, p10 + totalDelta); p90 = Math.max(0, p90 + totalDelta);

  const zeroRate = counts.length ? (counts.filter(c=>c===0).length / counts.length) : 0;
  let pZero = zeroRate;
  pZero = pZero
    - 0.10 * (seed.rank_present ? 1 : 0)
    - 0.06 * (seed.it_present ? 1 : 0)
    - 0.08 * ((SCORE_MAP[seed.score_bucket] || 3)-3)
    + 0.08 * (seed.attempts-1);
  pZero = Math.max(0, Math.min(1, pZero));

  const cohortSize = nbrs.length;
  const examples = nbrs.slice(0, Math.min(3, nbrs.length)).map((n)=>{
    const sim = +(1 - n.dist).toFixed(2);
    return {
      similarity: sim,
      profile: { attempts: n.d.attempts, score_bucket: n.d.score_bucket, tier: n.d.tier, domain: n.d.domain, city: n.d.city, it_present: n.d.it_present, rank_present: n.d.rank_present },
      shortlisted_by: n.d.shortlisted_by.slice(0,5)
    };
  });

  return {
    shortlist_count: { p50, p10, p90, p_zero: pZero, drivers: buildDrivers(seed, { uplift, scoreBoost, attemptPenalty }) },
    companies,
    similar_profiles: {
      cohort_size: cohortSize,
      examples
    }
  };
}

function emptyCityResult(city, msg){
  return {
    shortlist_count: { p50:0, p10:0, p90:0, p_zero:1, drivers:[`City: ${city}`] },
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

function buildDrivers(p, deltas){
  const tags = [];
  if (p.rank_present) tags.push(`Rank Holder`);
  if (p.it_present) tags.push(`Industrial Training`);
  tags.push(`${p.score_bucket}% Score`);
  tags.push(`${p.attempts} Attempt${p.attempts > 1 ? 's' : ''}`);
  tags.push(p.tier);
  return tags;
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
    
    resultsEl.appendChild(card(`
      <div class="muted">Expected Shortlists</div>
      <div class="big">${c.shortlist_count.p50.toFixed(0)}</div>
      <div class="muted">Likely Range: ${c.shortlist_count.p10.toFixed(0)}–${c.shortlist_count.p90.toFixed(0)}</div>
      <div class="muted" style="margin-top:4px; font-size: 0.8rem;">Chance of 0 shortlists: ${(c.shortlist_count.p_zero * 100).toFixed(0)}%</div>
      <div class="tags">${c.shortlist_count.drivers.map(x=>`<span class="tag">${x}</span>`).join('')}</div>
    `));
    
    resultsEl.appendChild(card(`
      <div class="muted">Top Company Matches</div>
      <div class="list">
        ${c.companies.map(co=>`
          <div class="item">
            <div>
              <div style="font-weight: 500;">${co.name}</div>
            </div>
            <span class="badge">Match ${(co.score*100).toFixed(0)}%</span>
          </div>
        `).join('')}
      </div>
    `));
    
    resultsEl.appendChild(card(`
      <div class="muted">Based on ${c.similar_profiles.cohort_size} Similar Profiles</div>
      <div class="list">
        ${c.similar_profiles.examples.map(ex=>`
          <div class="item-profile">
            <div>
              <div style="font-weight:500;">${(ex.similarity*100).toFixed(0)}% Profile Match</div>
              <div class="muted">${ex.profile.tier} · ${ex.profile.score_bucket}% · ${ex.profile.attempts} Attempt(s)</div>
              <div class="muted">IT: ${ex.profile.it_present?'Yes':'No'} · Rank: ${ex.profile.rank_present?'Yes':'No'}</div>
              <div class="muted" style="margin-top: 4px;">Was shortlisted by: ${ex.shortlisted_by.join(', ') || 'None'}</div>
            </div>
          </div>
        `).join('')}
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