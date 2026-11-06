// Job portal v2: the listing page controller (search, filters, freshness-ranked list, older vacancies, detail drawer).
// portal3.js mounts it and passes a "host" with the parts it already owns: the Supabase client, the session and
// enrolments, and the apply flows (BrowserGuard unlock, application records, Easy Apply, AI Apply, share).

import {
    activeFilterCount,
    applicationTargets,
    applyServerFilters,
    canSeeApplyDetails,
    companyName,
    detailColumns,
    emptyFilters,
    facetCounts,
    filtersFromParams,
    filtersToParams,
    freshnessCutoff,
    FRESH_DAYS,
    isExclusiveJob,
    isFresh,
    isTeamPosted,
    listColumns,
    matchesFilters,
    matchesPortalBase,
    mergeById,
    payPresetLabel,
    peersSearchUrl,
    portalFromJobType,
    POSTED_WINDOWS,
    postedAt,
    postedLabel,
    publicJob,
    rankJobs,
    roleTitle,
    selectWithFallback,
    SORTS,
    YOE_BUCKETS,
    escapeHtml,
} from './jobs-core.js?v=1';
import { applyHtml, cardHtml, detailHtml, skeletonCardsHtml } from './job-view.js?v=1';

const PAGE_SIZE = 24;
const FIRST_CHUNK = 40;
const CHUNK = 1000;
const MAX_FRESH_ROWS = 6000;
const OLDER_PAGE = 30;
const SAVED_KEY = 'msc_saved_jobs';
const FACET_LIMIT = { city: 8, domain: 8, companyType: 6, industry: 6, firmType: 6 };
const FACET_TITLE = {
    city: 'City',
    domain: 'Domain',
    companyType: 'Company type',
    industry: 'Industry',
    firmType: 'Firm type',
    experience: 'Experience',
    yoe: 'Years of experience',
};
const FILTER_KEY = { city: 'cities', domain: 'domains', companyType: 'companyTypes', industry: 'industries', firmType: 'firmTypes' };

function readSaved() {
    try {
        const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch {
        return [];
    }
}

function writeSaved(list) {
    try {
        localStorage.setItem(SAVED_KEY, JSON.stringify(list));
    } catch { /* storage blocked: saving just doesn't persist */ }
}

function plural(count, one, many = `${one}s`) {
    return `${count.toLocaleString('en-IN')} ${count === 1 ? one : many}`;
}

export function mountPortalApp(host) {
    const root = document.getElementById('pv2');
    if (!root) return null;
    const portal = host.portal;
    const supabase = host.supabase;
    const el = {
        search: document.getElementById('pv2Search'),
        searchForm: document.getElementById('pv2SearchForm'),
        summary: document.getElementById('pv2Summary'),
        quick: document.getElementById('pv2Quick'),
        filters: document.getElementById('pv2Filters'),
        filterBody: document.getElementById('pv2FilterBody'),
        showResults: document.getElementById('pv2ShowResults'),
        count: document.getElementById('pv2Count'),
        sort: document.getElementById('pv2Sort'),
        active: document.getElementById('pv2Active'),
        list: document.getElementById('pv2List'),
        more: document.getElementById('pv2More'),
        older: document.getElementById('pv2Older'),
        olderList: document.getElementById('pv2OlderList'),
        olderButton: document.getElementById('pv2OlderButton'),
        olderStatus: document.getElementById('pv2OlderStatus'),
        drawer: document.getElementById('pv2Drawer'),
        drawerPanel: document.getElementById('pv2DrawerPanel'),
        drawerBody: document.getElementById('pv2DrawerBody'),
    };

    const initial = filtersFromParams(window.location.search);
    const state = {
        filters: initial.filters,
        sort: initial.sort,
        fresh: [],
        freshDone: false,
        error: null,
        omit: [],
        view: [],
        rendered: 0,
        older: [],
        olderOffset: 0,
        olderDone: false,
        olderLoading: false,
        olderOpen: false,
        expanded: new Set(),
        ratings: new Map(),
        unlocked: new Map(),
        postLinks: new Map(),
        jobsById: new Map(),
        current: null,
        trigger: null,
        pushedHistory: false,
        newestAt: null,
    };

    const OMIT_KEY = `msc_pv2_omit:${portal.table}`;
    const OMIT_TTL_MS = 6 * 60 * 60 * 1000;
    try {
        const cached = JSON.parse(localStorage.getItem(OMIT_KEY) || 'null');
        if (cached && Array.isArray(cached.omit) && Date.now() - cached.at < OMIT_TTL_MS) state.omit = cached.omit;
    } catch { /* no cache */ }
    const rememberOmit = () => {
        try {
            if (state.omit.length) localStorage.setItem(OMIT_KEY, JSON.stringify({ omit: state.omit, at: Date.now() }));
            else localStorage.removeItem(OMIT_KEY);
        } catch { /* storage blocked */ }
    };

    const now = () => new Date();
    const session = () => host.getSession();
    const courses = () => host.getCourses() || [];
    const appliedIds = () => new Set([...(host.getAppliedIds() || [])].map(String));
    const savedIds = () => new Set(readSaved().filter((s) => s.table === portal.table).map((s) => String(s.id)));
    const returnUrl = () => window.location.pathname + window.location.search;

    function remember(jobs) {
        for (const job of jobs) state.jobsById.set(String(job.id), job);
    }

    function cardContext(job, applied = appliedIds(), saved = savedIds()) {
        return {
            now: now(),
            courses: courses(),
            applied: applied.has(String(job.id)),
            saved: saved.has(String(job.id)),
            rating: portal.key === 'articleship' ? state.ratings.get(companyName(job).toLowerCase()) : null,
        };
    }

    // ---------------------------------------------------------------- loading

    function baseQuery(omit, columns = listColumns(portal, { omit })) {
        return supabase.from(portal.table).select(columns);
    }

    async function loadFresh() {
        const cutoff = freshnessCutoff(now()).toISOString();
        const page = (from, to) => (omit) => applyServerFilters(baseQuery(omit).gte('Created_At', cutoff), emptyFilters(), portal)
            .order('Created_At', { ascending: false, nullsFirst: false })
            .order('id', { ascending: false })
            .range(from, to);
        let from = 0;
        let size = FIRST_CHUNK;
        while (from < MAX_FRESH_ROWS) {
            const result = await selectWithFallback(page(from, from + size - 1), state.omit);
            if (result.error) {
                if (!state.fresh.length) throw result.error;
                console.warn('Could not load the rest of the vacancies:', result.error);
                break;
            }
            state.omit = result.omitted;
            const rows = result.data.map(publicJob).filter((job) => matchesPortalBase(job, portal));
            remember(rows);
            state.fresh = mergeById(state.fresh, rows);
            for (const row of rows) {
                const at = postedAt(row, now());
                if (at && (!state.newestAt || at > state.newestAt)) state.newestAt = at;
            }
            if (result.data.length < size) break;
            from += size;
            size = CHUNK;
            refresh({ keepList: true });
        }
        state.freshDone = true;
        rememberOmit();
    }

    // ---------------------------------------------------------------- rendering

    // Rows of the last 15 days by load date (Created_At) whose own date (Posted_Date) is older go to the older list.
    function freshRows() {
        const at = now();
        return state.fresh.filter((job) => isFresh(job, at));
    }

    function recompute() {
        const ctx = { now: now(), appliedIds: appliedIds() };
        const matching = state.fresh.filter((job) => matchesFilters(job, state.filters, portal, ctx));
        const ranked = rankJobs(matching, { sort: state.sort, now: ctx.now, portal });
        state.view = ranked.fresh;
    }

    function renderCards(jobs) {
        const applied = appliedIds();
        const saved = savedIds();
        return jobs.map((job) => cardHtml(job, portal, cardContext(job, applied, saved))).join('');
    }

    function renderMore(count = PAGE_SIZE) {
        if (state.rendered >= state.view.length) return;
        const next = state.view.slice(state.rendered, state.rendered + count);
        el.list.insertAdjacentHTML('beforeend', renderCards(next));
        state.rendered += next.length;
        loadRatings(next);
    }

    function emptyStateHtml() {
        const filtered = activeFilterCount(state.filters) > 0 || state.filters.q;
        return `<div class="pv2-empty">
  <div class="pv2-empty-art" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></div>
  <h3>${filtered ? 'No new vacancies match these filters' : `No new vacancies in the last ${FRESH_DAYS} days`}</h3>
  <p>${filtered ? 'Try fewer filters, or look at older vacancies that match.' : 'New vacancies are added every day. Turn on alerts to hear first.'}</p>
  <div class="pv2-empty-actions">
    ${filtered ? '<button type="button" class="pv2-btn pv2-btn-primary" data-action="clear">Clear filters</button>' : ''}
    <button type="button" class="pv2-btn pv2-btn-secondary" data-action="show-older">Show older matches</button>
    <button type="button" class="pv2-btn pv2-btn-ghost" data-action="alerts"><i class="fa-regular fa-bell" aria-hidden="true"></i> Get alerts</button>
  </div>
</div>`;
    }

    function renderList(count = PAGE_SIZE) {
        state.rendered = 0;
        el.list.innerHTML = '';
        if (!state.view.length) {
            el.list.innerHTML = state.freshDone ? emptyStateHtml() : skeletonCardsHtml(4);
            return;
        }
        renderMore(count);
    }

    function updateCount() {
        // Fresh by the vacancy's own date (Posted_Date, else Created_At), the same rule the list uses.
        const total = freshRows().length;
        const shown = state.view.length;
        const filtered = activeFilterCount(state.filters) > 0 || Boolean(state.filters.q);
        let text;
        if (!state.freshDone) text = shown ? `Loading vacancies… ${shown.toLocaleString('en-IN')} so far` : 'Loading vacancies…';
        else if (filtered) text = `${shown.toLocaleString('en-IN')} of ${plural(total, 'vacancy', 'vacancies')}`;
        else text = plural(shown, 'vacancy', 'vacancies');
        el.count.textContent = text;
        if (el.showResults) el.showResults.textContent = shown ? `Show ${plural(shown, 'vacancy', 'vacancies')}` : 'Close';
        if (el.summary && state.freshDone) {
            const newest = state.newestAt
                ? ` · newest added ${postedLabel({ Created_At: state.newestAt.toISOString() }, now()).replace('Just now', 'just now')}`
                : '';
            el.summary.textContent = total
                ? `${plural(total, 'vacancy', 'vacancies')} from the last ${FRESH_DAYS} days, newest first${newest}`
                : `No new vacancies in the last ${FRESH_DAYS} days yet.`;
        }
    }

    function optionHtml(facet, value, label, count, checked, type = 'checkbox') {
        const name = `pv2-${facet}`;
        return `<label class="pv2-opt${checked ? ' is-checked' : ''}">
  <input type="${type}" name="${name}" value="${escapeHtml(value)}" data-facet="${facet}"${checked ? ' checked' : ''}>
  <span class="pv2-opt-label">${escapeHtml(label)}</span>
  ${count === null ? '' : `<span class="pv2-opt-count">${count.toLocaleString('en-IN')}</span>`}
</label>`;
    }

    function groupHtml(id, title, body, extra = '') {
        return `<fieldset class="pv2-group" data-group="${id}"><legend>${escapeHtml(title)}</legend>${body}${extra}</fieldset>`;
    }

    function renderFilters(counts, ctx = { now: now(), appliedIds: appliedIds() }) {
        if (!el.filterBody) return;
        const focusKey = document.activeElement && el.filterBody.contains(document.activeElement)
            ? `${document.activeElement.dataset.facet || document.activeElement.dataset.action}|${document.activeElement.value || ''}`
            : null;
        const f = state.filters;
        const rows = freshRows();
        if (!counts) counts = facetCounts(rows, f, portal, ctx);
        const groups = [];

        // Posted
        const postedBase = rows.filter((job) => matchesFilters(job, { ...f, posted: '' }, portal, ctx));
        const postedOpts = [optionHtml('posted', '', `Last ${FRESH_DAYS} days`, postedBase.length, !f.posted, 'radio')];
        for (const window of POSTED_WINDOWS) {
            const count = postedBase.filter((job) => matchesFilters(job, { ...emptyFilters(), posted: window.id }, portal, ctx)).length;
            postedOpts.push(optionHtml('posted', window.id, window.label, count, f.posted === window.id, 'radio'));
        }
        groups.push(groupHtml('posted', 'Posted', postedOpts.join('')));

        // Quick toggles
        const toggles = [];
        const exclusiveCount = rows.filter((job) => isExclusiveJob(job) && matchesFilters(job, { ...f, exclusiveOnly: false }, portal, ctx)).length;
        if (exclusiveCount || f.exclusiveOnly) toggles.push(optionHtml('exclusive', '1', 'MSC Exclusive', exclusiveCount, f.exclusiveOnly));
        const easyCount = rows.filter((job) => isTeamPosted(job) && matchesFilters(job, { ...f, easyApplyOnly: false }, portal, ctx)).length;
        if (easyCount || f.easyApplyOnly) toggles.push(optionHtml('easy', '1', 'Easy Apply', easyCount, f.easyApplyOnly));
        if (session()) toggles.push(optionHtml('notapplied', '1', 'Not applied yet', null, f.notApplied));
        if (toggles.length) groups.push(groupHtml('quick', 'Show only', toggles.join('')));

        for (const facet of portal.facets) {
            if (facet === 'experience') {
                const opts = [optionHtml('experience', '', 'All', null, !f.experience, 'radio')]
                    .concat((counts.experience || []).map((o) => optionHtml('experience', o.value, o.value, o.count, f.experience === o.value, 'radio')));
                if ((counts.experience || []).length) groups.push(groupHtml('experience', FACET_TITLE.experience, opts.join('')));
                continue;
            }
            if (facet === 'yoe') {
                const byId = new Map((counts.yoe || []).map((o) => [o.value, o.count]));
                const opts = [optionHtml('yoe', '', 'Any', null, !f.yoe, 'radio')]
                    .concat(YOE_BUCKETS.map((b) => optionHtml('yoe', b.id, b.label, byId.get(b.id) || 0, f.yoe === b.id, 'radio')));
                groups.push(groupHtml('yoe', FACET_TITLE.yoe, opts.join('')));
                continue;
            }
            const key = FILTER_KEY[facet];
            const selected = f[key] || [];
            const options = (counts[facet] || []).slice();
            for (const value of selected) if (!options.some((o) => o.value === value)) options.push({ value, count: 0 });
            if (!options.length) continue;
            const limit = FACET_LIMIT[facet] || 8;
            const expanded = state.expanded.has(facet);
            const visible = expanded ? options : options.filter((o, i) => i < limit || selected.includes(o.value));
            const more = options.length > visible.length || expanded
                ? `<button type="button" class="pv2-more-opts" data-action="expand" data-facet-toggle="${facet}" aria-expanded="${expanded}">${expanded ? 'Show fewer' : `Show all ${options.length}`}</button>`
                : '';
            groups.push(groupHtml(facet, FACET_TITLE[facet], visible.map((o) => optionHtml(facet, o.value, o.value, o.count, selected.includes(o.value))).join(''), more));
        }

        // Pay
        const payOpts = [optionHtml('pay', '', 'Any', null, !f.payMin, 'radio')];
        for (const amount of portal.payPresets) {
            const count = rows.filter((job) => matchesFilters(job, { ...f, payMin: amount }, portal, ctx)).length;
            payOpts.push(optionHtml('pay', String(amount), payPresetLabel(amount, portal), count, f.payMin === amount, 'radio'));
        }
        groups.push(groupHtml('pay', portal.payLabel, payOpts.join(''), `<p class="pv2-group-note">Only vacancies that state a ${portal.payLabel.toLowerCase()}.</p>`));

        el.filterBody.innerHTML = groups.join('');
        if (focusKey) {
            const [facet, value] = focusKey.split('|');
            const target = [...el.filterBody.querySelectorAll('input, button')].find((node) =>
                (node.dataset.facet || node.dataset.action) === facet && (node.value || '') === value);
            if (target) target.focus({ preventScroll: true });
        }
    }

    function quickChip(label, action, value, pressed, extra = '') {
        return `<button type="button" class="pv2-qchip${pressed ? ' is-on' : ''}" data-action="${action}" data-value="${escapeHtml(value)}" aria-pressed="${pressed}">${extra}${escapeHtml(label)}</button>`;
    }

    function renderQuick(counts) {
        if (!el.quick) return;
        const f = state.filters;
        const count = activeFilterCount(f);
        const cities = ((counts || {}).city || []).slice(0, 4).map((o) => o.value);
        for (const city of f.cities) if (!cities.includes(city)) cities.unshift(city);
        const chips = [
            `<button type="button" class="pv2-qchip pv2-qchip-filters" data-action="open-filters" aria-controls="pv2Filters" aria-expanded="false"><i class="fa-solid fa-sliders" aria-hidden="true"></i> Filters${count ? ` <span class="pv2-qcount">${count}</span>` : ''}</button>`,
            quickChip('Last 3 days', 'quick-posted', '3', f.posted === '3'),
        ];
        if (state.fresh.some(isExclusiveJob) || f.exclusiveOnly) chips.push(quickChip('Exclusive', 'quick-exclusive', '1', f.exclusiveOnly, '<i class="fa-solid fa-crown" aria-hidden="true"></i> '));
        for (const city of cities.slice(0, 4)) chips.push(quickChip(city, 'quick-city', city, f.cities.includes(city)));
        el.quick.innerHTML = chips.join('');
    }

    function renderActive() {
        if (!el.active) return;
        const f = state.filters;
        const pills = [];
        const pill = (label, action, value = '') => pills.push(`<button type="button" class="pv2-pill" data-action="${action}" data-value="${escapeHtml(value)}" aria-label="Remove filter: ${escapeHtml(label)}">${escapeHtml(label)}<i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`);
        if (f.q) pill(`“${f.q}”`, 'remove-q');
        for (const [facet, key] of Object.entries(FILTER_KEY)) for (const value of f[key]) pill(value, 'remove-value', `${facet}|${value}`);
        if (f.experience) pill(f.experience, 'remove-field', 'experience');
        if (f.yoe) pill(YOE_BUCKETS.find((b) => b.id === f.yoe)?.label || f.yoe, 'remove-field', 'yoe');
        if (f.payMin) pill(`${portal.payLabel} ${payPresetLabel(f.payMin, portal)}`, 'remove-field', 'payMin');
        if (f.posted) pill(POSTED_WINDOWS.find((w) => w.id === f.posted)?.label || '', 'remove-field', 'posted');
        if (f.exclusiveOnly) pill('MSC Exclusive', 'remove-field', 'exclusiveOnly');
        if (f.easyApplyOnly) pill('Easy Apply', 'remove-field', 'easyApplyOnly');
        if (f.notApplied) pill('Not applied yet', 'remove-field', 'notApplied');
        el.active.innerHTML = pills.length ? `${pills.join('')}<button type="button" class="pv2-clear" data-action="clear">Clear all</button>` : '';
        el.active.hidden = !pills.length;
    }

    function syncUrl() {
        const params = filtersToParams(state.filters, state.sort);
        const current = new URLSearchParams(window.location.search);
        for (const key of ['id', 'type']) if (current.get(key) && state.current) params.set(key, current.get(key));
        const query = params.toString();
        const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
        if (url !== window.location.pathname + window.location.search) {
            window.history.replaceState(window.history.state, '', url);
        }
    }

    function renderOlderShell() {
        if (!el.older) return;
        el.older.hidden = !state.freshDone;
        if (!state.olderOpen) {
            el.olderList.innerHTML = '';
            el.olderButton.hidden = false;
            el.olderButton.textContent = `Show vacancies older than ${FRESH_DAYS} days`;
            el.olderStatus.textContent = '';
        }
    }

    /**
     * Re-rank and re-draw. keepList keeps the cards already on screen when they are still the top of the new
     * ranking (more rows arrived), so the page does not jump while the rest of the vacancies load.
     */
    function refresh({ keepList = false, redraw = false } = {}) {
        const shownIds = [...el.list.querySelectorAll('.pv2-card[data-job-id]')].map((node) => node.dataset.jobId);
        recompute();
        const samePrefix = keepList && shownIds.length > 0 && shownIds.length === state.rendered
            && shownIds.every((id, index) => state.view[index] && String(state.view[index].id) === id);
        if (redraw) {
            // Same cards, new state (login, enrolments, applications): redraw as many as are on screen.
            renderList(Math.max(state.rendered, PAGE_SIZE));
        } else if (samePrefix) {
            if (state.rendered < PAGE_SIZE) renderMore();
        } else {
            renderList(keepList ? Math.max(state.rendered, PAGE_SIZE) : PAGE_SIZE);
        }
        el.list.setAttribute('aria-busy', state.freshDone ? 'false' : 'true');
        const ctx = { now: now(), appliedIds: appliedIds() };
        const counts = facetCounts(freshRows(), state.filters, portal, ctx);
        updateCount();
        renderFilters(counts, ctx);
        renderQuick(counts);
        renderActive();
    }

    function filtersChanged() {
        resetOlder();
        refresh();
        syncUrl();
        renderOlderShell();
    }

    // ---------------------------------------------------------------- older vacancies

    function resetOlder() {
        state.older = [];
        state.olderOffset = 0;
        state.olderDone = false;
        state.olderOpen = false;
    }

    async function loadOlder() {
        if (state.olderLoading || state.olderDone) return;
        state.olderLoading = true;
        state.olderOpen = true;
        el.olderButton.disabled = true;
        el.olderStatus.textContent = 'Loading older vacancies…';
        const cutoff = freshnessCutoff(now()).toISOString();
        const ctx = { now: now(), appliedIds: appliedIds() };
        // Asking for older vacancies overrides a "posted in the last N days" choice; every other filter applies.
        const olderFilters = { ...state.filters, posted: '' };
        const from = state.olderOffset;
        try {
            const result = await selectWithFallback((omit) => applyServerFilters(baseQuery(omit).lt('Created_At', cutoff), olderFilters, portal)
                .order('Created_At', { ascending: false, nullsFirst: false })
                .order('id', { ascending: false })
                .range(from, from + OLDER_PAGE - 1), state.omit);
            if (result.error) throw result.error;
            const rows = result.data.map(publicJob);
            remember(rows);
            state.olderOffset += result.data.length;
            state.olderDone = result.data.length < OLDER_PAGE;
            let matching = rows.filter((job) => matchesFilters(job, olderFilters, portal, ctx));
            if (from === 0) {
                // Vacancies scraped in the last 15 days but posted earlier belong here too, at the top.
                const stale = state.fresh.filter((job) => !isFresh(job, ctx.now) && matchesFilters(job, olderFilters, portal, ctx));
                matching = rankJobs(stale, { now: ctx.now, portal }).older.concat(matching);
                el.olderList.innerHTML = '';
            }
            const known = new Set(state.older.map((job) => String(job.id)));
            const added = matching.filter((job) => !known.has(String(job.id)));
            state.older = mergeById(state.older, added);
            el.olderList.insertAdjacentHTML('beforeend', renderCards(added));
            loadRatings(added);
            el.olderStatus.textContent = state.older.length
                ? (state.olderDone ? `That's everything (${plural(state.older.length, 'older vacancy', 'older vacancies')}).` : '')
                : (state.olderDone ? 'No older vacancies match either.' : 'None in this batch.');
            el.olderButton.hidden = state.olderDone;
            el.olderButton.textContent = 'Load more older vacancies';
        } catch (error) {
            console.error('Older vacancies failed:', error);
            el.olderStatus.textContent = 'Could not load older vacancies. Try again.';
        } finally {
            state.olderLoading = false;
            el.olderButton.disabled = false;
        }
    }

    // ---------------------------------------------------------------- articleship firm ratings

    async function loadRatings(jobs) {
        if (portal.key !== 'articleship' || !jobs.length) return;
        const names = [...new Set(jobs.map((job) => companyName(job)).filter((name) => !state.ratings.has(name.toLowerCase())))];
        if (!names.length) return;
        for (const name of names) state.ratings.set(name.toLowerCase(), null);
        try {
            const { data, error } = await supabase.from('articleship_firm_reviews_public').select('firm_name, overall_rating').in('firm_name', names);
            if (error) throw error;
            const groups = new Map();
            for (const row of data || []) {
                const key = String(row.firm_name || '').trim().toLowerCase();
                if (!key) continue;
                const group = groups.get(key) || { sum: 0, rated: 0, count: 0 };
                group.count += 1;
                if (typeof row.overall_rating === 'number') {
                    group.sum += row.overall_rating;
                    group.rated += 1;
                }
                groups.set(key, group);
            }
            for (const [key, group] of groups) {
                state.ratings.set(key, { avg: group.rated ? group.sum / group.rated : NaN, count: group.count });
            }
            const applied = appliedIds();
            const saved = savedIds();
            for (const job of jobs) {
                const rating = state.ratings.get(companyName(job).toLowerCase());
                if (!rating || !(rating.count > 5)) continue;
                document.querySelectorAll(`.pv2-card[data-job-id="${CSS.escape(String(job.id))}"]`).forEach((node) => {
                    node.outerHTML = cardHtml(job, portal, cardContext(job, applied, saved));
                });
            }
        } catch (error) {
            console.warn('Firm reviews could not load:', error);
        }
    }

    // ---------------------------------------------------------------- saved jobs

    function toggleSaved(job) {
        const list = readSaved();
        const index = list.findIndex((s) => String(s.id) === String(job.id) && s.table === portal.table);
        if (index >= 0) {
            list.splice(index, 1);
            host.toast('Removed from saved vacancies.', 'info');
        } else {
            list.push({ id: job.id, table: portal.table, savedAt: new Date().toISOString() });
            host.toast('Saved. Find it under My Applications → Saved Jobs.', 'success');
        }
        writeSaved(list);
        refreshJob(job);
    }

    /** Re-draw one vacancy everywhere it shows (cards and the open drawer). */
    function refreshJob(job) {
        const applied = appliedIds();
        const saved = savedIds();
        document.querySelectorAll(`.pv2-card[data-job-id="${CSS.escape(String(job.id))}"]`).forEach((node) => {
            const hadFocus = node.contains(document.activeElement) ? document.activeElement.dataset.action : null;
            const replacement = document.createElement('div');
            replacement.innerHTML = cardHtml(job, portal, cardContext(job, applied, saved));
            const fresh = replacement.firstElementChild;
            node.replaceWith(fresh);
            if (hadFocus) fresh.querySelector(`[data-action="${hadFocus}"]`)?.focus({ preventScroll: true });
        });
        if (state.current && String(state.current.id) === String(job.id)) renderDrawer();
    }

    // ---------------------------------------------------------------- detail drawer

    function detailContext(job) {
        const enrolledForPerks = host.isEnrolledForPerks();
        return {
            now: now(),
            loggedIn: Boolean(session()),
            courses: courses(),
            applied: appliedIds().has(String(job.id)),
            saved: savedIds().has(String(job.id)),
            unlocked: state.unlocked.get(String(job.id)) || host.getCachedUnlock(job) || null,
            rating: portal.key === 'articleship' ? state.ratings.get(companyName(job).toLowerCase()) : null,
            returnUrl: returnUrl(),
            postLink: enrolledForPerks ? state.postLinks.get(String(job.id)) : null,
            headingId: 'pv2-detail-title',
            descriptionLoading: !job.__detailLoaded,
        };
    }

    function renderDrawer() {
        const job = state.current;
        if (!job) return;
        const active = document.activeElement;
        const focusAction = active && el.drawerBody.contains(active) ? active.dataset.action : null;
        const scroll = el.drawerPanel.scrollTop;
        el.drawerBody.innerHTML = detailHtml(job, portal, detailContext(job));
        el.drawerPanel.scrollTop = scroll;
        if (focusAction) el.drawerBody.querySelector(`[data-action="${focusAction}"]`)?.focus({ preventScroll: true });
    }

    async function loadDetail(job) {
        if (job.__detailLoaded) return;
        try {
            const result = await selectWithFallback((omit) => supabase.from(portal.table).select(detailColumns(portal, { omit })).eq('id', job.id).maybeSingle(), state.omit);
            const row = Array.isArray(result.data) ? result.data[0] : result.data;
            if (row) Object.assign(job, publicJob(row));
        } catch (error) {
            console.warn('Vacancy description could not load:', error);
        }
        job.__detailLoaded = true;
        if (state.current === job) renderDrawer();
    }

    async function loadPostLink(job) {
        // The original LinkedIn post: only for logged-in students with the programme perks, never for a locked
        // exclusive vacancy, and only fetched for them (it is never part of a listing query).
        if (!session() || !host.isEnrolledForPerks() || !canSeeApplyDetails(job, portal, courses())) return;
        if (state.postLinks.has(String(job.id))) return;
        state.postLinks.set(String(job.id), null);
        try {
            const { data, error } = await supabase.from(portal.table).select('posts_link').eq('id', job.id).maybeSingle();
            if (error) throw error;
            if (data && data.posts_link) {
                state.postLinks.set(String(job.id), data.posts_link);
                if (state.current === job) renderDrawer();
            }
        } catch (error) {
            console.warn('Original post link could not load:', error);
        }
    }

    function focusables() {
        return [...el.drawerPanel.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')]
            .filter((node) => node.getClientRects().length > 0);
    }

    function openJob(job, { trigger = null, push = true } = {}) {
        state.current = job;
        state.trigger = trigger;
        remember([job]);
        renderDrawer();
        el.drawer.hidden = false;
        document.documentElement.classList.add('pv2-noscroll');
        requestAnimationFrame(() => el.drawer.classList.add('is-open'));
        el.drawerPanel.scrollTop = 0;
        el.drawerPanel.querySelector('[data-action="close"]')?.focus({ preventScroll: true });
        const params = new URLSearchParams(window.location.search);
        params.set('id', job.id);
        params.set('type', portal.jobType);
        const url = `${window.location.pathname}?${params.toString()}`;
        if (push) {
            window.history.pushState({ pv2Job: String(job.id) }, '', url);
            state.pushedHistory = true;
        } else {
            window.history.replaceState({ pv2Job: String(job.id) }, '', url);
            state.pushedHistory = false;
        }
        document.title = `${roleTitle(job, portal)} at ${companyName(job)} | My Student Club`;
        loadDetail(job);
        loadPostLink(job);
        if (portal.key === 'articleship') loadRatings([job]);
    }

    const pageTitle = document.title;

    function closeJob({ fromHistory = false } = {}) {
        if (!state.current) return;
        const job = state.current;
        state.current = null;
        el.drawer.classList.remove('is-open');
        document.documentElement.classList.remove('pv2-noscroll');
        document.title = pageTitle;
        setTimeout(() => { if (!state.current) el.drawer.hidden = true; }, 220);
        if (!fromHistory) {
            if (state.pushedHistory) {
                state.pushedHistory = false;
                window.history.back();
            } else {
                const params = new URLSearchParams(window.location.search);
                params.delete('id');
                params.delete('type');
                const query = params.toString();
                window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
            }
        }
        const target = state.trigger && document.contains(state.trigger)
            ? state.trigger
            : document.querySelector(`.pv2-card[data-job-id="${CSS.escape(String(job.id))}"] .pv2-card-link`);
        target?.focus({ preventScroll: true });
    }

    async function openSharedJob(id, type) {
        const sharedPortal = portalFromJobType(type, portal);
        if (sharedPortal.table !== portal.table) {
            // A link to another portal's vacancy: open it on that portal, where applying uses the right table.
            window.location.replace(`${sharedPortal.path}?id=${encodeURIComponent(id)}&type=${encodeURIComponent(sharedPortal.jobType)}`);
            return;
        }
        const known = state.jobsById.get(String(id));
        if (known) {
            openJob(known, { push: false });
            return;
        }
        try {
            const result = await selectWithFallback((omit) => supabase.from(sharedPortal.table).select(listColumns(sharedPortal, { omit })).eq('id', id).maybeSingle(), state.omit);
            const row = Array.isArray(result.data) ? result.data[0] : result.data;
            if (!row || row.hidden === true) {
                host.toast('That vacancy is no longer listed.', 'info');
                closeJob();
                return;
            }
            openJob(publicJob(row), { push: false });
        } catch (error) {
            console.error('Shared vacancy failed to load:', error);
        }
    }

    function unlockedJob(job) {
        const unlocked = state.unlocked.get(String(job.id)) || host.getCachedUnlock(job);
        return unlocked ? { ...job, 'Application ID': unlocked.applicationId, Description: unlocked.description || job.Description } : job;
    }

    function setBusy(button, busy) {
        if (!button) return;
        if (busy) {
            button.dataset.label = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span class="pv2-visually-hidden">Working…</span>';
        } else if (button.dataset.label !== undefined) {
            button.disabled = false;
            button.innerHTML = button.dataset.label;
        }
    }

    async function unlock(job, button) {
        setBusy(button, true);
        try {
            const unlocked = await host.unlock(job);
            state.unlocked.set(String(job.id), unlocked);
            return unlocked;
        } catch (error) {
            setBusy(button, false);
            host.toast(error?.message || 'Could not verify this browser. Please try again.', 'error');
            return null;
        }
    }

    function requireLogin() {
        window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.href)}`;
    }

    async function onDrawerAction(action, button, event) {
        const job = state.current;
        if (!job) return;
        if (!canSeeApplyDetails(job, portal, courses()) && ['apply', 'reveal', 'simple-apply', 'ai-apply', 'apply-link', 'post', 'peers', 'easy-apply'].includes(action)) {
            event.preventDefault();
            host.requireEnrollment(portal);
            return;
        }
        switch (action) {
            case 'close':
                closeJob();
                break;
            case 'apply': {
                if (!session()) return requireLogin();
                const unlocked = await unlock(job, button);
                if (!unlocked) return;
                const full = unlockedJob(job);
                await host.recordApplication(full, button);
                renderDrawer();
                refreshJob(job);
                const target = applicationTargets(unlocked.applicationId)[0];
                if (target?.kind === 'email') host.openMailto(full);
                else if (target) window.open(target.href, '_blank', 'noopener');
                break;
            }
            case 'reveal': {
                if (!session()) return requireLogin();
                const unlocked = await unlock(job, button);
                if (unlocked) renderDrawer();
                break;
            }
            case 'easy-apply':
                await host.easyApply(job, button);
                refreshJob(job);
                break;
            case 'simple-apply':
                await host.simpleApply(unlockedJob(job), button);
                refreshJob(job);
                break;
            case 'ai-apply':
                await host.aiApply(unlockedJob(job), button);
                refreshJob(job);
                break;
            case 'apply-link': {
                event.preventDefault();
                const href = button.getAttribute('href');
                if (session()) await host.recordApplication(unlockedJob(job), button);
                window.open(href, '_blank', 'noopener');
                refreshJob(job);
                break;
            }
            case 'copy': {
                const text = button.dataset.copy || '';
                try {
                    await navigator.clipboard.writeText(text);
                    button.classList.add('is-done');
                    button.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
                    setTimeout(() => {
                        button.classList.remove('is-done');
                        button.innerHTML = '<i class="fa-regular fa-copy" aria-hidden="true"></i>';
                    }, 1800);
                } catch {
                    host.toast('Could not copy. Select the text and copy it instead.', 'error');
                }
                break;
            }
            case 'save':
                toggleSaved(job);
                break;
            case 'share':
                host.share(job, button);
                break;
            case 'peers':
                event.preventDefault();
                if (!session()) return requireLogin();
                if (!host.isEnrolledForPerks()) {
                    host.requireEnrollment(portal);
                    return;
                }
                window.open(peersSearchUrl(job, portal), '_blank', 'noopener');
                break;
            default:
                break;
        }
    }

    // ---------------------------------------------------------------- events

    function setFilter(mutator) {
        mutator(state.filters);
        filtersChanged();
    }

    function onFilterChange(event) {
        const input = event.target;
        const facet = input.dataset.facet;
        if (!facet) return;
        setFilter((f) => {
            if (FILTER_KEY[facet]) {
                const key = FILTER_KEY[facet];
                f[key] = input.checked ? [...new Set([...f[key], input.value])] : f[key].filter((v) => v !== input.value);
            } else if (facet === 'posted') f.posted = input.value;
            else if (facet === 'pay') f.payMin = Number(input.value) || 0;
            else if (facet === 'experience') f.experience = input.value;
            else if (facet === 'yoe') f.yoe = input.value;
            else if (facet === 'exclusive') f.exclusiveOnly = input.checked;
            else if (facet === 'easy') f.easyApplyOnly = input.checked;
            else if (facet === 'notapplied') f.notApplied = input.checked;
        });
    }

    function openFilters() {
        el.filters.classList.add('is-open');
        document.documentElement.classList.add('pv2-noscroll-sm');
        el.quick?.querySelector('[data-action="open-filters"]')?.setAttribute('aria-expanded', 'true');
        el.filters.querySelector('[data-action="close-filters"]')?.focus({ preventScroll: true });
    }

    function closeFilters() {
        if (!el.filters.classList.contains('is-open')) return;
        el.filters.classList.remove('is-open');
        document.documentElement.classList.remove('pv2-noscroll-sm');
        const opener = el.quick?.querySelector('[data-action="open-filters"]');
        opener?.setAttribute('aria-expanded', 'false');
        opener?.focus({ preventScroll: true });
    }

    function onPageClick(event) {
        const target = event.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        if (el.drawer.contains(target)) {
            onDrawerAction(action, target, event);
            return;
        }
        const card = target.closest('.pv2-card');
        if (card && (action === 'open' || action === 'save')) {
            const job = state.jobsById.get(card.dataset.jobId);
            if (!job) return;
            if (action === 'open') {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
                event.preventDefault();
                openJob(job, { trigger: target });
            } else {
                event.preventDefault();
                toggleSaved(job);
            }
            return;
        }
        switch (action) {
            case 'clear':
                state.filters = emptyFilters();
                if (el.search) el.search.value = '';
                filtersChanged();
                break;
            case 'remove-q':
                state.filters.q = '';
                if (el.search) el.search.value = '';
                filtersChanged();
                break;
            case 'remove-value': {
                const [facet, ...rest] = target.dataset.value.split('|');
                const value = rest.join('|');
                setFilter((f) => { f[FILTER_KEY[facet]] = f[FILTER_KEY[facet]].filter((v) => v !== value); });
                break;
            }
            case 'remove-field': {
                const field = target.dataset.value;
                setFilter((f) => { f[field] = emptyFilters()[field]; });
                break;
            }
            case 'expand': {
                const facet = target.dataset.facetToggle;
                if (state.expanded.has(facet)) state.expanded.delete(facet);
                else state.expanded.add(facet);
                renderFilters();
                el.filterBody.querySelector(`[data-facet-toggle="${facet}"]`)?.focus({ preventScroll: true });
                break;
            }
            case 'open-filters':
                openFilters();
                break;
            case 'close-filters':
                closeFilters();
                break;
            case 'quick-posted':
                setFilter((f) => { f.posted = f.posted === '3' ? '' : '3'; });
                break;
            case 'quick-exclusive':
                setFilter((f) => { f.exclusiveOnly = !f.exclusiveOnly; });
                break;
            case 'quick-city': {
                const city = target.dataset.value;
                setFilter((f) => { f.cities = f.cities.includes(city) ? f.cities.filter((c) => c !== city) : [...f.cities, city]; });
                break;
            }
            case 'show-older':
                el.older.hidden = false;
                loadOlder().then(() => el.older.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                break;
            case 'alerts':
                event.stopPropagation();
                document.getElementById('notificationsBtn')?.click();
                break;
            case 'retry':
                start();
                break;
            default:
                break;
        }
    }

    function bind() {
        document.addEventListener('click', onPageClick);
        el.filterBody?.addEventListener('change', onFilterChange);
        el.sort?.addEventListener('change', () => {
            state.sort = el.sort.value;
            refresh();
            syncUrl();
        });
        let searchTimer = null;
        el.search?.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                state.filters.q = el.search.value.trim();
                filtersChanged();
            }, 200);
        });
        el.searchForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            clearTimeout(searchTimer);
            state.filters.q = el.search.value.trim();
            filtersChanged();
            if (window.matchMedia('(max-width: 1023px)').matches) {
                el.search.blur();
                el.count.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
        el.olderButton?.addEventListener('click', loadOlder);
        // Company logos are third-party images; when one fails, the initials underneath show instead.
        root.addEventListener('error', onImageError, true);
        el.drawer.addEventListener('error', onImageError, true);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (state.current) closeJob();
                else closeFilters();
            }
            if (event.key === 'Tab' && state.current) {
                const nodes = focusables();
                if (!nodes.length) return;
                const first = nodes[0];
                const last = nodes[nodes.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        });
        window.addEventListener('popstate', (event) => {
            const id = event.state && event.state.pv2Job;
            if (id && state.jobsById.has(id)) {
                if (!state.current || String(state.current.id) !== id) openJob(state.jobsById.get(id), { push: false });
                state.pushedHistory = false;
            } else if (state.current) {
                state.pushedHistory = false;
                closeJob({ fromHistory: true });
            }
        });
        if ('IntersectionObserver' in window && el.more) {
            new IntersectionObserver((entries) => {
                if (entries.some((entry) => entry.isIntersecting)) renderMore();
            }, { rootMargin: '600px 0px' }).observe(el.more);
        }
    }

    function onImageError(event) {
        const img = event.target;
        if (img && img.tagName === 'IMG' && img.parentElement?.classList.contains('pv2-logo')) {
            img.parentElement.classList.remove('has-img');
            img.remove();
        }
    }

    async function start() {
        state.error = null;
        el.list.innerHTML = skeletonCardsHtml(6);
        el.list.setAttribute('aria-busy', 'true');
        try {
            await loadFresh();
            refresh({ keepList: true });
            renderOlderShell();
        } catch (error) {
            console.error('Vacancies failed to load:', error);
            state.error = error;
            state.freshDone = true;
            const offline = /fetch|network/i.test(String(error?.message || ''));
            el.list.setAttribute('aria-busy', 'false');
            el.list.innerHTML = `<div class="pv2-empty pv2-error" role="alert">
  <div class="pv2-empty-art" aria-hidden="true"><i class="fa-solid fa-plug-circle-exclamation"></i></div>
  <h3>${offline ? 'You seem to be offline' : 'Vacancies could not load'}</h3>
  <p>${offline ? 'Check your connection and try again.' : 'Please try again in a moment.'}</p>
  <div class="pv2-empty-actions"><button type="button" class="pv2-btn pv2-btn-primary" data-action="retry">Try again</button></div>
</div>`;
            el.count.textContent = 'Vacancies could not load';
        }
    }

    // ---------------------------------------------------------------- boot

    if (el.search) el.search.value = state.filters.q;
    if (el.sort) {
        el.sort.innerHTML = Object.entries(SORTS).map(([value, label]) => `<option value="${value}"${value === state.sort ? ' selected' : ''}>${escapeHtml(label === 'Highest pay' ? `Highest ${portal.payLabel.toLowerCase()}` : label)}</option>`).join('');
    }
    bind();
    const ready = start();

    const api = {
        ready,
        state,
        // A shared link (?id=…&type=…) opens at once; the vacancy is fetched on its own if the list hasn't got it yet.
        openSharedJob: (id, type) => openSharedJob(id, type),
        /** Merge filter values (e.g. the student's experience level) unless the link already set them. */
        setFilters(partial) {
            Object.assign(state.filters, partial);
            filtersChanged();
        },
        /** Called by the host after login state, enrolments or applications change. */
        rerender() {
            if (state.freshDone) refresh({ redraw: true });
            if (state.current) renderDrawer();
        },
    };
    return api;
}
