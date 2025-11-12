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
const tabs = document.querySelectorAll('.tab');
const panels = { profile: document.getElementById('profile-panel'), results: document.getElementById('results-panel') };
tabs.forEach(t=>t.onclick=()=>{ tabs.forEach(x=>x.classList.remove('active')); t.classList.add('active');
  Object.values(panels).forEach(p=>p.classList.add('hidden')); panels[t.dataset.tab].classList.remove('hidden'); });

const form = document.getElementById('profile-form');
const cityTabsEl = document.getElementById('city-tabs');
const resultsEl = document.getElementById('results-content');

// Remove multi-select code (no-op here since HTML no longer contains widget)

form.onsubmit = (e) => {
  e.preventDefault();
  const city = document.getElementById('city').value;
  if (!city) { alert('Select a city'); return; }
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
  // aggregated is no longer used for a button, but keep function for internal use if needed
  const aggregated = aggregateResults(perCity);
  renderResults(perCity, aggregated);
  // switch to results tab
  tabs.forEach(x=>x.classList.remove('active')); tabs[1].classList.add('active');
  panels.profile.classList.add('hidden'); panels.results.classList.remove('hidden');
};

// Batch export button wiring
document.getElementById('batch-export').onclick = async () => {
  // Ask user for a range in the form "start-end" (inclusive start, exclusive end)
  const input = prompt('Enter permutation index range (e.g. 0-500). Use start-end (end optional):', '0-500');
  if (!input) return;
  const m = input.split('-').map(s => s.trim()).filter(Boolean);
  let start = parseInt(m[0]||'0',10);
  let end = m[1] ? parseInt(m[1],10) : start + 500;
  if (isNaN(start) || isNaN(end) || end <= start) { alert('Invalid range'); return; }

  // Build deterministic cartesian space for profile permutations.
  const CITIES = ['Mumbai','Delhi','Bengaluru','Hyderabad','Chennai','Pune','Kolkata','Ahmedabad','Other'];
  const TIERS = ['Big4','Big6','Mid Size','Small Size','Other'];
  const DOMAINS = [null,'Statutory Audit','Internal Audit','Direct Taxation','Indirect Taxation','Mixed Exposure'];
  const SCORES = ['50-55','55-60','60-65','65-70','70+'];
  const ATTEMPTS = [1,2,3,4,5];
  const BOOLS = [false,true]; // for it_present and rank_present

  // Determine total permutations
  const dims = [CITIES.length, TIERS.length, DOMAINS.length, SCORES.length, ATTEMPTS.length, BOOLS.length, BOOLS.length];
  const TOTAL = dims.reduce((a,b)=>a*b,1);
  if (start < 0) start = 0;
  if (end > TOTAL) end = TOTAL;
  if (start >= TOTAL) { alert('Start index beyond total permutations: ' + TOTAL); return; }

  // Mapping index -> combination using lexicographic / mixed-radix method (deterministic)
  function indexToProfile(idx){
    let rem = idx;
    const picks = [];
    for (let i=0;i<dims.length;i++){
      const base = dims.slice(i+1).reduce((a,b)=>a*b,1);
      const digit = Math.floor(rem / base);
      picks.push(digit);
      rem = rem % base;
    }
    const [ci, ti, di, si, ai, itb, rb] = picks;
    return {
      city: CITIES[ci],
      tier: TIERS[ti],
      domain: DOMAINS[di],
      score_bucket: SCORES[si],
      attempts: ATTEMPTS[ai],
      it_present: BOOLS[itb],
      rank_present: BOOLS[rb],
    };
  }

  // Iterate sequentially and collect input-output pairs (progressively)
  const out = [];
  const BATCH_SIZE = 200; // yield to UI every batch
  for (let i = start; i < end; i++){
    const p = indexToProfile(i);
    // Build profile object expected by predictForCity: note predictForCity expects cities array/tier naming as 'tier'
    const profile = {
      cities: [p.city],
      tier: p.tier,
      domain: p.domain,
      score_bucket: p.score_bucket,
      attempts: p.attempts,
      it_present: p.it_present,
      rank_present: p.rank_present
    };
    // run prediction for that city only
    try {
      const res = predictForCity(profile, p.city);
      out.push({ index: i, input: p, output: res });
    } catch(err){
      out.push({ index: i, input: p, error: String(err) });
    }
    // yield to UI occasionally to keep browser responsive
    if ((i - start) % BATCH_SIZE === 0) await new Promise(r=>setTimeout(r,1));
  }

  // Create downloadable JSON
  const blob = new Blob([JSON.stringify({ start, end, total_permutations: TOTAL, results: out }, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fname = `permutation_results_${start}_${end}.json`;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  alert(`Saved ${out.length} results to ${fname}`);
};

// Helpers
function parseAttempts(v){ return v==='5+'?5:parseInt(v,10); }
const SCORE_MAP = {'50-55':1,'55-60':2,'60-65':3,'65-70':4,'70+':5};
const SCORE_BOOST = { '50-55': -0.6, '55-60': -0.3, '60-65': 0, '65-70': 0.3, '70+': 0.6 };
const ATTEMPT_PENALTY = { 1: 0, 2: -0.3, 3: -0.6, 4: -0.9, 5: -1.2 };
function catDist(a,b){ return a===b?0:1; }
function boolDist(a,b){ return a===b?0:1; }
function norm(a,min,max){ return max===min?0: (a-min)/(max-min); }

// Gower distance with weights (subset as available)
// Tuned to avoid cliffs and reduce boolean dominance
const WEIGHTS = { attempts:1.5, score:1.2, tier:1.5, city:2.0, domain:1.2, it:0.5, rank:0.5 };
const ATT_MIN = 1, ATT_MAX = 5;

function distance(p, q){
  let num=0, den=0;
  // attempts
  num += WEIGHTS.attempts * Math.abs(norm(p.attempts,ATT_MIN,ATT_MAX) - norm(q.attempts,ATT_MIN,ATT_MAX)); den += WEIGHTS.attempts;
  // score bucket
  num += WEIGHTS.score * Math.abs((SCORE_MAP[p.score_bucket]-SCORE_MAP[q.score_bucket]) / 4); den += WEIGHTS.score;
  // tier
  num += WEIGHTS.tier * catDist(p.tier, q.tier); den += WEIGHTS.tier;
  // city
  num += WEIGHTS.city * catDist(p.city, q.city); den += WEIGHTS.city;
  // domain (optional: only if provided)
  if (p.domain) { num += WEIGHTS.domain * catDist(p.domain, q.domain); den += WEIGHTS.domain; }
  // it_present
  num += WEIGHTS.it * boolDist(p.it_present, q.it_present); den += WEIGHTS.it;
  // rank_present
  num += WEIGHTS.rank * boolDist(p.rank_present, q.rank_present); den += WEIGHTS.rank;
  return den ? num/den : 1;
}

// Gaussian kernel to avoid 1/(dist) blow-ups and bipolar scores
const SIGMA = 0.6;
const kernel = (d) => Math.exp(-(d*d)/(2*SIGMA*SIGMA));

function predictForCity(profile, city){
  const seed = { ...profile, city };
  const pool = DATA.filter(d => d.city === city);
  if (!pool.length) return emptyCityResult(city, 'No data for this city');

  // neighbors
  const scored = pool.map(d => ({ d, dist: distance(seed, d) })).sort((a,b)=>a.dist-b.dist);
  const K = Math.min(40, scored.length);
  const nbrs = scored.slice(0, K);
  const weights = nbrs.map(n => kernel(n.dist));
  const wSum = weights.reduce((a,b)=>a+b,0) || 1;

  // company scores with city prior smoothing
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
  if (totalCompWeight === 0) totalCompWeight = wSum; // fallback

  const alpha = 1.0; // strength of prior (mixing factor)
  // union of companies from neighbors and city prior
  const unionCompanies = new Set([...compWeight.keys(), ...prior.keys()]);

  const companies = Array.from(unionCompanies).map(name => {
    const emp = compWeight.get(name) || 0;
    const pr = (prior.get(name) || 0);
    // posterior mixture normalized; prevents zeros and extremes
    const post = (emp + alpha * pr * totalCompWeight) / ((1+alpha) * totalCompWeight);
    return { name, score: post };
  })
  .sort((a,b)=>b.score-a.score)
  .slice(0,10)
  .map(x => ({ ...x, reasons: inferReasons(seed, city, x.name) }));

  // counts and cohort
  const counts = nbrs.map(n=>n.d.shortlist_count).sort((a,b)=>a-b);
  let p50 = quantile(counts, 0.5), p10 = quantile(counts, 0.1), p90 = quantile(counts, 0.9);

  // Calibrations: monotonic score uplift and progressive attempts penalty
  const uplift = (seed.rank_present ? 1.0 : 0) + (seed.it_present ? 0.5 : 0);
  const scoreBoost = SCORE_BOOST[seed.score_bucket] || 0;
  const attemptPenalty = ATTEMPT_PENALTY[Math.min(5, seed.attempts)] || 0;
  const totalDelta = uplift + scoreBoost + attemptPenalty;
  p50 = Math.max(0, p50 + totalDelta); p10 = Math.max(0, p10 + totalDelta); p90 = Math.max(0, p90 + totalDelta);

  const pZero = 0; // MVP: not from Poisson-binomial
  const cohortSize = nbrs.length;
  const allCompanies = [];
  nbrs.forEach(n => allCompanies.push(...n.d.shortlisted_by));
  const topCohortCompanies = topKFreq(allCompanies, 3);

  const examples = nbrs.slice(0, Math.min(5, nbrs.length)).map((n,i)=>{
    const sim = +(1 - n.dist).toFixed(2);
    return {
      similarity: sim,
      profile: { attempts: n.d.attempts, score_bucket: n.d.score_bucket, tier: n.d.tier, domain: n.d.domain, city: n.d.city },
      shortlisted_by: n.d.shortlisted_by.slice(0,5)
    };
  });

  return {
    shortlist_count: { p50, p10, p90, p_zero: 0, drivers: buildDrivers(seed, { uplift, scoreBoost, attemptPenalty }) },
    companies,
    similar_profiles: {
      cohort_size: cohortSize,
      cohort_stats: { median_shortlists: p50, iqr: [quantile(counts,0.25), quantile(counts,0.75)], top_companies: topCohortCompanies },
      examples
    }
  };
}

function emptyCityResult(city, msg){
  return {
    shortlist_count: { p50:0, p10:0, p90:0, p_zero:1, drivers:[`City: ${city}`] },
    companies: [],
    similar_profiles: { cohort_size:0, cohort_stats:{ median_shortlists:0, iqr:[0,0], top_companies:[] }, examples:[] },
    note: msg
  };
}

function aggregateResults(perCity){
  const top = [];
  perCity.forEach(c => c.companies.forEach(co => top.push({ ...co, city: c.city })));
  top.sort((a,b)=>b.score-a.score);
  return {
    shortlist_count: {
      p50: Math.max(...perCity.map(c=>c.shortlist_count.p50), 0),
      p10: Math.max(...perCity.map(c=>c.shortlist_count.p10), 0),
      p90: Math.max(...perCity.map(c=>c.shortlist_count.p90), 0),
      p_zero: Math.min(...perCity.map(c=>c.shortlist_count.p_zero), 1),
    },
    top_companies: top.slice(0,10)
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

function buildDrivers(p, deltas){
  const tags = [];
  if (deltas.scoreBoost) tags.push(`Score uplift ${deltas.scoreBoost>0?'+':''}${deltas.scoreBoost.toFixed(1)}`);
  if (deltas.attemptPenalty) tags.push(`Attempts penalty ${deltas.attemptPenalty.toFixed(1)}`);
  if (p.it_present) tags.push(`Industrial Training +0.5`);
  if (p.rank_present) tags.push(`Rank +1.0`);
  tags.push(p.tier);
  return tags.slice(0,5);
}

function inferReasons(p, city, company){
  const r = [];
  r.push('Neighbor evidence');
  if (['Mumbai','Delhi','Bengaluru'].includes(city)) r.push('Metro city prior');
  if (p.tier==='Big4' && p.domain==='Statutory Audit') r.push('Big4 Stat Audit fit');
  if (p.attempts<=2) r.push('Low attempts');
  return r.slice(0,3);
}

function buildCityCompanyPrior(data){
  const byCity = new Map();
  // count appearances per company within each city
  data.forEach(d => {
    const city = d.city;
    if (!byCity.has(city)) byCity.set(city, new Map());
    const m = byCity.get(city);
    (d.shortlisted_by||[]).forEach(c => m.set(c, (m.get(c)||0)+1));
  });
  // normalize to probabilities
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

function renderResults(perCity, aggregated){
  // city tabs (single city)
  cityTabsEl.innerHTML = '';
  const tabs = [];
  perCity.forEach((c,idx)=>{
    const btn = document.createElement('button');
    btn.textContent = c.city;
    if (idx===0) btn.classList.add('active');
    btn.onclick = ()=>{ tabs.forEach(x=>x.classList.remove('active')); btn.classList.add('active'); mountCity(c); };
    cityTabsEl.appendChild(btn); tabs.push(btn);
  });

  // mount first city by default
  mountCity(perCity[0]);

  function mountCity(c){
    resultsEl.innerHTML = '';
    // Card 1: Count
    resultsEl.appendChild(card(`
      <div class="big">${c.shortlist_count.p50.toFixed(0)}</div>
      <div class="muted">Expected Shortlists (Range: ${c.shortlist_count.p10.toFixed(1)}–${c.shortlist_count.p90.toFixed(1)})</div>
      <div class="tags">${c.shortlist_count.drivers.map(x=>`<span class="tag">${x}</span>`).join('')}</div>
    `));
    // Card 2: Companies
    resultsEl.appendChild(card(`
      <div class="muted">Top Companies</div>
      <div class="list">
        ${c.companies.map(co=>`
          <div class="item">
            <div>
              <div>${co.name}</div>
              <div class="tags">${co.reasons.map(t=>`<span class="tag">${t}</span>`).join('')}</div>
            </div>
            <span class="badge">Score ${(co.score*100).toFixed(0)}</span>
          </div>
        `).join('')}
      </div>
    `));
    // Card 3: Similar Profiles
    resultsEl.appendChild(card(`
      <div class="muted">Similar Profiles</div>
      <div class="list">
        ${c.similar_profiles.examples.map(ex=>`
          <div class="item">
            <div>
              <div>${(ex.similarity*100).toFixed(0)}% match</div>
              <div class="muted">${ex.profile.tier} · ${ex.profile.domain} · ${ex.profile.score_bucket}% · Attempts ${ex.profile.attempts}</div>
              <div class="muted">Shortlisted by: ${ex.shortlisted_by.join(', ')}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `));
    // NOTE: Peer Group card removed as requested
  }

  function mountAggregated(agg){
    // Aggregated view removed from UI - function retained if needed
    resultsEl.innerHTML = '';
    resultsEl.appendChild(card(`
      <div class="big">${agg.shortlist_count.p50.toFixed(0)}</div>
      <div class="muted">Best across cities (Range: ${agg.shortlist_count.p10.toFixed(1)}–${agg.shortlist_count.p90.toFixed(1)})</div>
    `));
    resultsEl.appendChild(card(`
      <div class="muted">Top Companies (All Cities)</div>
      <div class="list">
        ${agg.top_companies.slice(0,10).map(co=>`
          <div class="item">
            <div>${co.name} <span class="badge">${co.city}</span></div>
            <span class="badge">Score ${(co.score*100).toFixed(0)}</span>
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