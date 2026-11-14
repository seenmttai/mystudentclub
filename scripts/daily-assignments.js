/**
 * Daily assignments (MSC-26): pure helpers shared by the page and the tests.
 * No DOM and no Supabase here, so node --test can load it directly.
 */
(function (global) {
  const PLACES_KEY = 'msc_assignment_places';
  const WORK_TYPES = ['Stock audit', 'Bank branch audit', 'Concurrent audit', 'Physical verification', 'Other'];

  function normPlace(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function titleCase(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());
  }

  function parsePlaces(raw) {
    let list = [];
    try { list = JSON.parse(raw || '[]'); } catch (_) { list = []; }
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const key = normPlace(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(titleCase(item));
    }
    return out.slice(0, 12);
  }

  function loadPlaces(storage) {
    try { return parsePlaces(storage && storage.getItem(PLACES_KEY)); } catch (_) { return []; }
  }

  function savePlaces(storage, places) {
    const clean = parsePlaces(JSON.stringify(places || []));
    try { if (storage) storage.setItem(PLACES_KEY, JSON.stringify(clean)); } catch (_) { /* private mode: keep in memory only */ }
    return clean;
  }

  function addPlace(places, place) {
    return parsePlaces(JSON.stringify([...(places || []), place]));
  }

  function removePlace(places, place) {
    const key = normPlace(place);
    return (places || []).filter((p) => normPlace(p) !== key);
  }

  function toDate(value) {
    if (value instanceof Date) return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }

  /**
   * filters.location: a single place typed or picked ("I'm in").
   * filters.places: saved places; used only when no single location is set.
   * filters.workType: one of WORK_TYPES or ''.
   */
  function filterAssignments(items, filters, today) {
    const f = filters || {};
    const now = toDate(today || new Date());
    const loc = normPlace(f.location);
    const places = (f.places || []).map(normPlace).filter(Boolean);
    return (items || [])
      .filter((a) => a && a.status !== 'closed' && a.status !== 'hidden')
      .filter((a) => { const end = toDate(a.end_date); return !end || !now || end >= now; })
      .filter((a) => {
        const city = normPlace(a.city);
        const state = normPlace(a.state);
        if (loc) return city.includes(loc) || state.includes(loc);
        if (places.length) return places.some((p) => city === p || state === p);
        return true;
      })
      .filter((a) => !f.workType || a.work_type === f.workType)
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)) || String(a.city).localeCompare(String(b.city)));
  }

  function cityOptions(items) {
    const seen = new Map();
    for (const a of items || []) {
      const key = normPlace(a && a.city);
      if (key && !seen.has(key)) seen.set(key, titleCase(a.city));
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatDates(start, end) {
    const s = toDate(start);
    const e = toDate(end);
    if (!s) return '';
    const fmt = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    if (!e || e.getTime() === s.getTime()) return `${fmt(s)} · 1 day`;
    const days = Math.round((e - s) / 86400000) + 1;
    return `${fmt(s)} – ${fmt(e)} · ${days} days`;
  }

  function formatPay(amount, unit) {
    if (amount === null || amount === undefined || amount === '') return 'Pay on discussion';
    const n = Number(amount);
    if (!Number.isFinite(n)) return 'Pay on discussion';
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })} ${unit === 'total' ? 'total' : 'per day'}`;
  }

  /** Optional answers from the apply sheet → the row the database accepts. */
  function applicationRow(assignmentId, answers) {
    const a = answers || {};
    const yesNo = (v) => (v === 'yes' ? true : v === 'no' ? false : null);
    const text = (v, max) => { const t = String(v || '').trim(); return t ? t.slice(0, max) : null; };
    return {
      assignment_id: assignmentId,
      current_location: text(a.currentLocation, 80),
      pay_ok: yesNo(a.payOk),
      done_before: yesNo(a.doneBefore),
      note: text(a.note, 1000),
    };
  }

  const api = { PLACES_KEY, WORK_TYPES, normPlace, titleCase, parsePlaces, loadPlaces, savePlaces, addPlace, removePlace, filterAssignments, cityOptions, formatDates, formatPay, applicationRow };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.MSCDailyAssignments = api;
})(typeof window !== 'undefined' ? window : globalThis);
