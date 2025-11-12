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

const COMPANY_PRIOR_BY_CITY = buildCityCompanyPrior(DATA);

// --- UI Elements ---
const form = document.getElementById('profile-form');
const resultsPanel = document.getElementById('results-panel');
const tabularModeBtn = document.getElementById('tabular-mode-btn');
const aiModeBtn = document.getElementById('ai-mode-btn');
const tabularContentEl = document.getElementById('tabular-content');
const aiContentEl = document.getElementById('ai-content');

// --- Mode Switching Logic ---
tabularModeBtn.onclick = () => {
  aiModeBtn.classList.remove('active');
  tabularModeBtn.classList.add('active');
  aiContentEl.classList.add('hidden');
  tabularContentEl.classList.remove('hidden');
};
aiModeBtn.onclick = () => {
  tabularModeBtn.classList.remove('active');
  aiModeBtn.classList.add('active');
  tabularContentEl.classList.add('hidden');
  aiContentEl.classList.remove('hidden');
};

// --- Main Form Submission ---
form.onsubmit = (e) => {
  e.preventDefault();
  const city = document.getElementById('city').value;
  if (!city) { alert('Please select a city to get your prediction.'); return; }
  const profile = {
    city: city,
    tier: document.getElementById('tier').value,
    domain: document.getElementById('domain').value || null,
    score_bucket: document.getElementById('score').value,
    attempts: parseAttempts(document.getElementById('attempts').value),
    it_present: document.getElementById('it_present').value === 'true',
    rank_present: document.getElementById('rank_present').value === 'true',
  };
  
  // Generate content for both modes
  renderAiMode({ city, ...predictForCity(profile, city) });
  renderTabularMode(profile);

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

const WEIGHTS = { 
  attempts: 4.0, score: 2.0, tier: 2.0, domain: 1.5,
  it: 3.0, rank: 4.0, city: 1.0,
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

const kernel = (d) => 1 / (d + 0.01);

// --- AI PREDICTION ENGINE ---
function predictForCity(profile, city){
  const seed = { ...profile, city };
  const pool = DATA.filter(d => d.city === city);
  if (!pool.length) return emptyCityResult(city, 'No data for this city');

  const scored = pool.map(d => ({ d, dist: distance(seed, d) })).sort((a,b)=>a.dist-b.dist);
  const K = Math.min(75, scored.length);
  const nbrs = scored.slice(0, K);

  // --- Reliability-Weighted Pooling ---
  const compWeightKnn = new Map();
  let totalWeightKnn = 0;
  const weights = nbrs.map(n => kernel(n.dist));
  nbrs.forEach((n, i) => {
    const w = weights[i];
    (n.d.shortlisted_by||[]).forEach(c => compWeightKnn.set(c, (compWeightKnn.get(c)||0)+w));
    totalWeightKnn += w;
  });
  if (totalWeightKnn === 0) totalWeightKnn = 1;

  const prior = COMPANY_PRIOR_BY_CITY.get(city) || new Map();
  const w_knn = Math.min(nbrs.length, 60); 
  const w_prior = Math.min(pool.length, 60);

  // --- Profile Strength Adjustment ---
  const uplift = (seed.rank_present ? 1.0 : 0) + (seed.it_present ? 0.5 : 0);
  const scoreBoost = SCORE_BOOST[seed.score_bucket] || 0;
  const attemptPenalty = ATTEMPT_PENALTY[Math.min(5, seed.attempts)] || 0;
  const totalDelta = uplift + scoreBoost + attemptPenalty;
  const profileStrengthMultiplier = Math.exp(totalDelta / 4);

  // --- Combine Sources and Rank Companies ---
  const allCompaniesInCohort = nbrs.flatMap(n => n.d.shortlisted_by);
  const topCohortCompanies = topKFreq(allCompaniesInCohort, 5);
  const unionCompanies = new Set([...compWeightKnn.keys(), ...prior.keys()]);
  
  const companies = Array.from(unionCompanies).map(name => {
    const p_knn = (compWeightKnn.get(name) || 0) / totalWeightKnn;
    const p_prior = (prior.get(name) || 0);
    let combined_score = (w_knn * p_knn + w_prior * p_prior) / (w_knn + w_prior);
    combined_score *= profileStrengthMultiplier;
    return { name, score: combined_score };
  }).sort((a,b)=>b.score-a.score).slice(0,10);

  // --- Shortlist Count Prediction ---
  let p50, p10, p90;
  const highSimilarityGroup = scored.filter(s => (1 - s.dist) > 0.9).map(s => s.d.shortlist_count);
  
  if (highSimilarityGroup.length >= 3) {
    p50 = highSimilarityGroup.reduce((a, b) => a + b, 0) / highSimilarityGroup.length;
    p10 = Math.min(...highSimilarityGroup);
    p90 = Math.max(...highSimilarityGroup);
  } else {
    const counts = nbrs.map(n=>n.d.shortlist_count).sort((a,b)=>a-b);
    p50 = quantile(counts, 0.5);
    p10 = quantile(counts, 0.1);
    p90 = quantile(counts, 0.9);
    p50 = Math.max(0, p50 + totalDelta); p10 = Math.max(0, p10 + totalDelta); p90 = Math.max(0, p90 + totalDelta);
  }

  // --- Gather Similar Profiles for UI ---
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
    shortlist_count: { p50, p10, p90 },
    companies,
    similar_profiles: {
      cohort_size: nbrs.length,
      examples: similarExamples
    }
  };
}

function emptyCityResult(city, msg){
  return {
    shortlist_count: { p50:0, p10:0, p90:0 },
    companies: [],
    similar_profiles: { cohort_size:0, examples:[] },
    note: msg
  };
}

// --- GENERAL HELPERS ---
function quantile(arr, q){ /* ... (same as before) ... */ }
function topKFreq(arr, k){ /* ... (same as before) ... */ }
function buildCityCompanyPrior(data){ /* ... (same as before) ... */ }

// --- RENDER FUNCTIONS ---
function renderAiMode(c) {
  aiContentEl.innerHTML = '';
  aiContentEl.appendChild(card(`
    <h3>Learning from ${c.similar_profiles.examples.length} Profiles Like Yours</h3>
    <div class="muted">Our AI found these candidates who most closely match your profile.</div>
    <div class="list" style="margin-top: 1rem;">
      ${c.similar_profiles.examples.map(ex=>`
        <div class="item-profile">
          <div>
            <div style="font-weight:600; font-size: 1.1rem; color: var(--primary);">${(ex.similarity*100).toFixed(0)}% Profile Match</div>
            <div class="muted">${ex.profile.tier} · ${ex.profile.score_bucket}% · ${ex.profile.attempts} Attempt(s)</div>
            <div class="muted">IT: ${ex.profile.it_present?'Yes':'No'} · Rank: ${ex.profile.rank_present?'Yes':'No'}</div>
            <div class="muted" style="margin-top: 8px;"><b>Was shortlisted by:</b> ${ex.shortlisted_by.join(', ') || 'None'}</div>
          </div>
        </div>`).join('') || '<p class="muted">No highly similar profiles found in this city.</p>'}
    </div>
  `));
  
  aiContentEl.appendChild(card(`
    <div class="muted">Expected Shortlists</div>
    <div class="big">${c.shortlist_count.p50.toFixed(0)}</div>
    <div class="muted">Likely Range: ${c.shortlist_count.p10.toFixed(0)}–${c.shortlist_count.p90.toFixed(0)}</div>
  `));
  
  aiContentEl.appendChild(card(`
    <div class="muted">Your Top 10 Company Matches</div>
    <div class="list">
      <ol class="ranked-list">
        ${c.companies.map(co=>`
          <li>
            <div class="company-item">
              <span class="company-name">${co.name}</span>
            </div>
          </li>
        `).join('')}
      </ol>
    </div>
  `));
}

function renderTabularMode(profile) {
  tabularContentEl.innerHTML = `
    <div class="tabular-section">
      <h3>Explore Average Shortlists</h3>
      <div class="pivot-controls">
        <div class="field">
          <label>Rows</label>
          <select id="pivot-rows">
            <option value="score_bucket">CA Final %</option>
            <option value="attempts">Attempts</option>
            <option value="tier">Articleship Tier</option>
          </select>
        </div>
        <div class="field">
          <label>Columns</label>
          <select id="pivot-cols">
            <option value="city">Campus/City</option>
            <option value="domain">Domain</option>
          </select>
        </div>
      </div>
      <div id="pivot-table-container" class="table-container"></div>
    </div>
  `;

  const rowSelect = document.getElementById('pivot-rows');
  const colSelect = document.getElementById('pivot-cols');
  
  const updatePivot = () => {
    const rowField = rowSelect.value;
    const colField = colSelect.value;
    const pivotData = generatePivotData(DATA, rowField, colField, 'shortlist_count');
    renderPivotTable(pivotData, document.getElementById('pivot-table-container'));
  };

  rowSelect.onchange = updatePivot;
  colSelect.onchange = updatePivot;
  updatePivot(); // Initial render
}

function generatePivotData(data, rowField, colField, valueField) {
  const rowKeys = [...new Set(data.map(d => d[rowField]))].sort();
  const colKeys = [...new Set(data.map(d => d[colField]))].sort();
  const grouped = {};

  for (const item of data) {
    const r = item[rowField];
    const c = item[colField];
    if (!grouped[r]) grouped[r] = {};
    if (!grouped[r][c]) grouped[r][c] = { sum: 0, count: 0 };
    grouped[r][c].sum += item[valueField];
    grouped[r][c].count++;
  }

  const values = {};
  for (const r of rowKeys) {
    values[r] = {};
    for (const c of colKeys) {
      if (grouped[r] && grouped[r][c]) {
        values[r][c] = (grouped[r][c].sum / grouped[r][c].count).toFixed(1);
      } else {
        values[r][c] = 'NA';
      }
    }
  }
  return { rows: rowKeys, cols: colKeys, values };
}

function renderPivotTable(pivotData, container) {
  let tableHTML = '<table class="pivot-table"><thead><tr><th></th>';
  pivotData.cols.forEach(c => tableHTML += `<th>${c || 'N/A'}</th>`);
  tableHTML += '</tr></thead><tbody>';
  pivotData.rows.forEach(r => {
    tableHTML += `<tr><td class="row-header">${r || 'N/A'}</td>`;
    pivotData.cols.forEach(c => {
      tableHTML += `<td>${pivotData.values[r][c]}</td>`;
    });
    tableHTML += '</tr>';
  });
  tableHTML += '</tbody></table>';
  container.innerHTML = tableHTML;
}

function card(html) {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = html;
  return el;
}

// Ensure these utility functions are defined
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