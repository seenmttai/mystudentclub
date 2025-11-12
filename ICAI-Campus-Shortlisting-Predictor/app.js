// --- INITIALIZATION ---
const raw = await fetch('./database.json').then(r=>r.json());
const DATA = raw.map(r => {
  let tier = r.features.articleship_tier || 'Other';
  // Group Mid Size and Small Size into 'Other' for logical consistency
  if (['Mid Size', 'Small Size'].includes(tier)) {
    tier = 'Other';
  }
  return {
    id: r.id, city: r.features.city, tier: tier,
    domain: r.features.domain || 'N/A', attempts: r.features.attempts === '5+' ? 5 : parseInt(r.features.attempts, 10),
    score_bucket: r.features.score_bucket, it_present: !!r.features.it_present, rank_present: !!r.features.rank_present,
    shortlisted_by: r.shortlisted_by || [], shortlist_count: r.shortlist_count ?? 0,
  }
});
const COMPANY_PRIOR_BY_CITY = buildCityCompanyPrior(DATA);

// --- UI ELEMENTS & STATE ---
const profileForm = document.getElementById('profile-form');
const resultsPanel = document.getElementById('results-panel');
const tabularModeBtn = document.getElementById('tabular-mode-btn');
const aiModeBtn = document.getElementById('ai-mode-btn');
const tabularContentEl = document.getElementById('tabular-content');
const aiContentEl = document.getElementById('ai-content');
const aiResultsContainer = document.getElementById('ai-results-container');
const profilePanel = document.getElementById('profile-panel');

// --- MODE SWITCHING & INITIALIZATION ---
function setMode(mode) {
  if (mode === 'ai') {
    tabularModeBtn.classList.remove('active');
    aiModeBtn.classList.add('active');
    tabularContentEl.classList.add('hidden');
    aiContentEl.classList.remove('hidden');
    profilePanel.classList.remove('hidden');
    aiResultsContainer.innerHTML = '';
  } else { // 'tabular'
    aiModeBtn.classList.remove('active');
    tabularModeBtn.classList.add('active');
    aiContentEl.classList.add('hidden');
    tabularContentEl.classList.remove('hidden');
  }
}
tabularModeBtn.onclick = () => setMode('tabular');
aiModeBtn.onclick = () => setMode('ai');

renderTabularMode();

// --- FORM SUBMISSION FOR AI MODE ---
profileForm.onsubmit = (e) => {
  e.preventDefault();
  const city = document.getElementById('city').value;
  if (!city) { alert('Please select a city for the AI prediction.'); return; }
  
  let userTier = document.getElementById('tier').value;
  // Group Mid Size and Small Size into 'Other' to match the data logic
  if (['Mid Size', 'Small Size'].includes(userTier)) {
    userTier = 'Other';
  }

  const profile = {
    city, tier: userTier, domain: document.getElementById('domain').value || null,
    score_bucket: document.getElementById('score').value, attempts: parseAttempts(document.getElementById('attempts').value),
    it_present: document.getElementById('it_present').value === 'true', rank_present: document.getElementById('rank_present').value === 'true',
  };
  
  const prediction = predictForCity(profile, city);
  renderAiMode({ ...prediction, city });
  aiResultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// --- CORE AI MODEL PARAMETERS & HELPERS ---
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
const kernel = (d) => 1 / (d + 0.01);

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

// --- AI PREDICTION ENGINE (Sudra-Lite) ---
function predictForCity(profile, city){
  const seed = { ...profile, city };
  const pool = DATA.filter(d => d.city === city);
  if (!pool.length) return { shortlist_count: { p50:0, p10:0, p90:0 }, companies: [], similar_profiles: { examples:[] } };

  const scored = pool.map(d => ({ d, dist: distance(seed, d) })).sort((a,b)=>a.dist-b.dist);
  const nbrs = scored.slice(0, Math.min(75, scored.length));

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

  const totalDelta = (SCORE_BOOST[seed.score_bucket] || 0) + (ATTEMPT_PENALTY[Math.min(5, seed.attempts)] || 0) + (seed.rank_present ? 1.0 : 0) + (seed.it_present ? 0.5 : 0);
  const profileStrengthMultiplier = Math.exp(totalDelta / 4);

  const unionCompanies = new Set([...compWeightKnn.keys(), ...prior.keys()]);
  const companies = Array.from(unionCompanies).map(name => {
    const p_knn = (compWeightKnn.get(name) || 0) / totalWeightKnn;
    const p_prior = (prior.get(name) || 0);
    let combined_score = (w_knn * p_knn + w_prior * p_prior) / (w_knn + w_prior);
    combined_score *= profileStrengthMultiplier;
    return { name, score: combined_score };
  }).sort((a,b)=>b.score-a.score).slice(0,10);

  let p50, p10, p90;
  const highSimilarityGroup = scored.filter(s => (1 - s.dist) > 0.9).map(s => s.d.shortlist_count);
  
  if (highSimilarityGroup.length >= 3) {
      p50 = trimmedMean(highSimilarityGroup, 0.1);
      p10 = Math.min(...highSimilarityGroup);
      p90 = Math.max(...highSimilarityGroup);
  } else {
    const counts = nbrs.map(n=>n.d.shortlist_count).sort((a,b)=>a-b);
    p50 = quantile(counts, 0.5); p10 = quantile(counts, 0.1); p90 = quantile(counts, 0.9);
    p50 = Math.max(0, p50 + totalDelta); p10 = Math.max(0, p10 + totalDelta); p90 = Math.max(0, p90 + totalDelta);
  }

  const allSimilar = scored.map(n => ({ similarity: 1 - n.dist, profile: n.d, shortlisted_by: n.d.shortlisted_by }));
  let similarExamples = allSimilar.filter(ex => ex.similarity > 0.90);
  if (similarExamples.length < 3) similarExamples = allSimilar.slice(0, 3);

  return { shortlist_count: { p50, p10, p90 }, companies, similar_profiles: { examples: similarExamples } };
}

// --- TABULAR MODE LOGIC ---
function renderTabularMode() {
  let state = {
    filters: {},
    rowField: 'score_bucket',
    colField: 'city',
  };

  const controlsContainer = document.getElementById('tabular-controls-container');
  const resultsContainer = document.getElementById('tabular-results-container');
  
  function updateView() {
    controlsContainer.innerHTML = '';
    resultsContainer.innerHTML = '';

    const filteredData = DATA.filter(d => {
      for (const key in state.filters) {
        if (d[key] != state.filters[key]) return false;
      }
      return true;
    });

    const pivotData = generatePivotData(filteredData, state.rowField, state.colField, 'shortlist_count');
    const pivotTableContainer = document.createElement('div');
    pivotTableContainer.className = 'table-container';
    renderInteractivePivot(pivotData, pivotTableContainer, state);
    
    controlsContainer.appendChild(createPivotControls(state, (newState) => { state = newState; updateView(); }));
    resultsContainer.appendChild(pivotTableContainer);
    resultsContainer.appendChild(document.createElement('div'));
  }
  updateView();
}

function createPivotControls(state, onUpdate) { /* ... same as before ... */ }
function generatePivotData(data, rowField, colField, valueField) {
  const rowKeys = [...new Set(data.map(d => d[rowField]))].sort();
  const colKeys = [...new Set(data.map(d => d[colField]))].sort();
  const grouped = {};

  for (const item of data) {
    const r = item[rowField]; const c = item[colField];
    if (!grouped[r]) grouped[r] = {};
    if (!grouped[r][c]) grouped[r][c] = { sum: 0, count: 0 };
    grouped[r][c].sum += item[valueField]; grouped[r][c].count++;
  }

  const values = {};
  for (const r of rowKeys) {
    values[r] = {};
    for (const c of colKeys) {
      if (grouped[r] && grouped[r][c]) {
        // Round to nearest whole number
        values[r][c] = Math.round(grouped[r][c].sum / grouped[r][c].count);
      } else { values[r][c] = 'NA'; }
    }
  }
  return { rows: rowKeys, cols: colKeys, values };
}

function renderInteractivePivot(pivotData, container, state) {
  let tableHTML = '<table class="pivot-table"><thead><tr><th class="pivot-corner-header">Avg Shortlistings</th>';
  pivotData.cols.forEach(c => tableHTML += `<th>${c || 'N/A'}</th>`);
  tableHTML += '</tr></thead><tbody>';
  pivotData.rows.forEach(r => {
    tableHTML += `<tr><td class="row-header">${r || 'N/A'}</td>`;
    pivotData.cols.forEach(c => {
      const val = pivotData.values[r][c];
      if (val !== 'NA') {
        tableHTML += `<td><button data-row="${r}" data-col="${c}">${val}</button></td>`;
      } else { tableHTML += `<td>${val}</td>`; }
    });
    tableHTML += '</tr>';
  });
  tableHTML += '</tbody></table>';
  container.innerHTML = tableHTML;
  
  container.onclick = (e) => {
    if (e.target.tagName === 'BUTTON') {
      const filters = {...state.filters, [state.rowField]: e.target.dataset.row, [state.colField]: e.target.dataset.col};
      const matchingData = DATA.filter(d => {
        for (const key in filters) { if (d[key] != filters[key]) return false; }
        return true;
      }).sort((a,b) => b.shortlist_count - a.shortlist_count);
      renderDetailsTable(matchingData, e.target.closest('#tabular-content').querySelector('#tabular-results-container'));
    }
  };
}

function renderDetailsTable(data, container) {
    let detailsContainer = container.querySelector('.details-table-container');
    if (!detailsContainer) {
        detailsContainer = document.createElement('div');
        detailsContainer.className = 'details-table-container';
        container.appendChild(detailsContainer);
    }
    
    let tableHTML = `<h3>Top Matching Profiles (${data.length} found)</h3><div class="table-container"><table class="pivot-table details-table"><thead><tr>
        <th>Shortlists</th><th>City</th><th>Tier</th><th>Domain</th><th>Score</th><th>Attempts</th><th>IT</th><th>Rank</th><th>Shortlisted By</th>
    </tr></thead><tbody>`;
    data.slice(0, 20).forEach(d => {
        tableHTML += `<tr>
            <td>${d.shortlist_count}</td><td>${d.city}</td><td>${d.tier}</td><td>${d.domain}</td>
            <td>${d.score_bucket}</td><td>${d.attempts}</td><td>${d.it_present?'Yes':'No'}</td><td>${d.rank_present?'Yes':'No'}</td>
            <td>${d.shortlisted_by.join(', ') || 'None'}</td>
        </tr>`;
    });
    tableHTML += '</tbody></table></div>';
    detailsContainer.innerHTML = tableHTML;
    detailsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// --- UI RENDERING FOR AI MODE ---
function renderAiMode(c) {
  aiResultsContainer.innerHTML = '';
  aiResultsContainer.appendChild(card(`
    <h3>Learning from ${c.similar_profiles.examples.length} Profiles Like Yours</h3>
    <div class="muted">Our AI found these candidates who most closely match your profile.</div>
    <div class="list" style="margin-top: 1rem;">
      ${c.similar_profiles.examples.map(ex=>`
        <div class="item-profile">
            <div style="font-weight:600; font-size: 1.1rem; color: var(--primary);">${(ex.similarity*100).toFixed(0)}% Profile Match</div>
            <div class="muted">${ex.profile.tier} · ${ex.profile.score_bucket}% · ${ex.profile.attempts} Attempt(s)</div>
            <div class="muted">IT: ${ex.profile.it_present?'Yes':'No'} · Rank: ${ex.profile.rank_present?'Yes':'No'}</div>
            <div class="muted" style="margin-top: 8px;"><b>Was shortlisted by:</b> ${ex.shortlisted_by.join(', ') || 'None'}</div>
        </div>`).join('') || '<p class="muted">No highly similar profiles found in this city.</p>'}
    </div>
  `));
  
  aiResultsContainer.appendChild(card(`
    <div class="muted">Expected Shortlists</div>
    <div class="big">${c.shortlist_count.p50.toFixed(0)}</div>
    <div class="muted">Likely Range: ${c.shortlist_count.p10.toFixed(0)}–${c.shortlist_count.p90.toFixed(0)}</div>
  `));
  
  aiResultsContainer.appendChild(card(`
    <div class="muted">Your Top 10 Company Matches</div>
    <div class="list">
      <ol class="ranked-list">${c.companies.map(co=>`<li><div class="company-item"><span class="company-name">${co.name}</span></div></li>`).join('')}</ol>
    </div>
  `));
}

function card(html) { const el = document.createElement('div'); el.className = 'card'; el.innerHTML = html; return el; }

// --- GENERAL UTILITY FUNCTIONS ---
function trimmedMean(arr, percent) {
  if (!arr.length) return 0;
  arr.sort((a, b) => a - b);
  const trimCount = Math.floor(arr.length * percent);
  const trimmedArr = arr.slice(trimCount, arr.length - trimCount);
  if (!trimmedArr.length) return arr.reduce((a, b) => a + b, 0) / arr.length;
  return trimmedArr.reduce((a, b) => a + b, 0) / trimmedArr.length;
}

function quantile(arr, q){
  if (!arr.length) return 0;
  const pos = (arr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return arr[base] + (arr[base+1] !== undefined ? rest * (arr[base+1]-arr[base]) : 0);
}

function buildCityCompanyPrior(data){
  const byCity = new Map();
  data.forEach(d => {
    if (!byCity.has(d.city)) byCity.set(d.city, new Map());
    (d.shortlisted_by||[]).forEach(c => byCity.get(d.city).set(c, (byCity.get(d.city).get(c)||0)+1));
  });
  for (const m of byCity.values()){
    let total = Array.from(m.values()).reduce((a,b)=>a+b, 0) || 1;
    for (const [k,v] of m.entries()) m.set(k, v/total);
  }
  return byCity;
}

// Copied from previous implementation to avoid missing function error
function createPivotControls(state, onUpdate) {
  const container = document.createElement('div');
  container.className = 'pivot-controls';
  
  const createSelect = (id, label, options, selected) => {
    let selectHTML = `<div class="field"><label for="${id}">${label}</label><select id="${id}">`;
    for (const [value, text] of Object.entries(options)) {
      selectHTML += `<option value="${value}" ${value === selected ? 'selected' : ''}>${text}</option>`;
    }
    selectHTML += '</select></div>';
    return selectHTML;
  };
  
  const fieldOptions = { score_bucket: 'CA Final %', attempts: 'Attempts', tier: 'Articleship Tier', domain: 'Domain', city: 'City' };
  
  container.innerHTML += createSelect('pivot-rows', 'Rows', fieldOptions, state.rowField);
  container.innerHTML += createSelect('pivot-cols', 'Columns', fieldOptions, state.colField);
  
  const tierOptions = { '': 'All Tiers' };
  [...new Set(DATA.map(d=>d.tier))].sort().forEach(t => tierOptions[t] = t);
  container.innerHTML += createSelect('filter-tier', 'Filter by Tier', tierOptions, state.filters.tier || '');

  setTimeout(() => {
    document.getElementById('pivot-rows').onchange = (e) => onUpdate({...state, rowField: e.target.value});
    document.getElementById('pivot-cols').onchange = (e) => onUpdate({...state, colField: e.target.value});
    document.getElementById('filter-tier').onchange = (e) => {
      const newFilters = {...state.filters, tier: e.target.value};
      if (!e.target.value) delete newFilters.tier;
      onUpdate({...state, filters: newFilters});
    };
  }, 0);

  return container;
}