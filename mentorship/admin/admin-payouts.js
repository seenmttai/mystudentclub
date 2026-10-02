/* Admin: Payouts tab (per mentor, per batch month; mark due / paid / not payable; CSV). Owner: admin builder. */
import {
  html, setContent, emptyState, statusBadge, PAYOUT_STATUS, MATCH_STATUS, programLabel, formatDate, formatINR,
  debounce, downloadCsv, rpc, toast, showError, confirmDialog, istDateKey, plural, firstName, DEFAULT_CONFIG,
} from '/mentorship/assets/mentorship-core.js?v=1';
import {
  load, chipsHtml, errorBlock, haystack, istMonthKey, monthLabel, askText, invalidate, waIconLink, sumBy, csvPhone,
} from './admin-shared.js?v=1';

const PAY_FILTERS = [
  { value: 'due', label: 'Due' },
  { value: 'unpaid', label: 'Not due yet' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Not payable' },
  { value: 'all', label: 'All' },
];

export async function renderPayouts(panel, app, token) {
  const f = app.filters.payouts || (app.filters.payouts = { status: 'due', month: 'all', q: '', selected: new Set() });
  let rows;
  try { rows = await load.matches(null, null); } catch (e) {
    if (!app.isLive(token)) return;
    setContent(panel, errorBlock(e, 'adm-pay-retry'));
    panel.querySelector('#adm-pay-retry')?.addEventListener('click', () => app.refresh({ hard: true }));
    return;
  }
  if (!app.isLive(token)) return;

  const fee = Number(app.ctx.config?.mentor_fee_inr ?? DEFAULT_CONFIG.mentor_fee_inr);
  const months = [...new Set(rows.map((r) => istMonthKey(r.started_at)).filter(Boolean))].sort().reverse();
  if (f.month !== 'all' && !months.includes(f.month)) f.month = 'all';
  const totals = Object.fromEntries(['unpaid', 'due', 'paid', 'void'].map((k) => {
    const rs = rows.filter((r) => r.payout_status === k);
    return [k, { n: rs.length, inr: sumBy(rs, (r) => r.fee_inr) }];
  }));

  const filtered = () => {
    const term = f.q.trim().toLowerCase();
    return rows
      .filter((r) => f.status === 'all' || r.payout_status === f.status)
      .filter((r) => f.month === 'all' || istMonthKey(r.started_at) === f.month)
      .filter((r) => !term || haystack(r.mentor?.full_name, r.mentor?.email, r.mentee?.full_name, r.payout_ref).includes(term));
  };
  const groupsOf = (list) => {
    const map = new Map();
    list.forEach((r) => {
      const k = r.mentor?.id || 'unknown';
      if (!map.has(k)) map.set(k, { mentor: r.mentor || { full_name: 'Unknown mentor' }, rows: [] });
      map.get(k).rows.push(r);
    });
    return [...map.values()]
      .map((g) => ({ ...g, rows: g.rows.sort((a, b) => String(a.started_at).localeCompare(String(b.started_at))) }))
      .sort((a, b) => String(a.mentor.full_name).localeCompare(String(b.mentor.full_name)));
  };

  const stat = (label, t, tone = '') => html`<div class="ms-stat${tone ? ` ms-stat--${tone}` : ''}"><div class="ms-stat__label">${label}</div><div class="ms-stat__value">${formatINR(t.inr)}</div><div class="ms-stat__sub">${plural(t.n, 'match', 'matches')}</div></div>`;

  setContent(panel, html`<div data-root>
    <div class="ms-stats ms-mb-16">
      ${stat('Due', totals.due, totals.due.n ? 'warn' : '')}
      ${stat('Not due yet', totals.unpaid)}
      ${stat('Paid', totals.paid, 'good')}
      ${stat('Not payable', totals.void)}
    </div>
    <div class="ms-callout ms-callout--gray ms-mb-16"><i class="fas fa-circle-info" aria-hidden="true"></i><span>${formatINR(fee)} per mentee for new matches (each match keeps the fee from the day it started). Mark a match due when it qualifies, then mark it paid once the transfer is done. Mentees never pay mentors.</span></div>
    <div class="ms-admin-toolbar">
      <label class="ms-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><input class="ms-input" type="search" placeholder="Search mentor, mentee or reference" value="${f.q}" data-q aria-label="Search payouts"></label>
      <select class="ms-select ms-admin-select" data-month aria-label="Batch month">
        <option value="all">All months</option>
        ${months.map((m) => html`<option value="${m}"${m === f.month ? ' selected' : ''}>${monthLabel(m)}</option>`)}
      </select>
      <button type="button" class="ms-btn ms-btn--outline" data-csv><i class="fas fa-file-csv" aria-hidden="true"></i><span>Export CSV</span></button>
    </div>
    <div class="ms-admin-toolbar">${chipsHtml('payst', PAY_FILTERS.map((o) => ({ ...o, count: o.value === 'all' ? rows.length : totals[o.value]?.n })), f.status, { label: 'Payout status' })}</div>
    <p class="ms-xs ms-muted ms-mb-8">Grouped by mentor. Batch month is the month the match started (IST).</p>
    <div data-list></div>
    ${app.canWrite ? html`<div class="ms-admin-bulkbar" data-bulk hidden>
      <span class="ms-small" data-bulk-text></span>
      <span class="ms-grow"></span>
      <div class="ms-btn-row">
        <button type="button" class="ms-btn ms-btn--ghost ms-btn--sm" data-clear><span>Clear</span></button>
        <button type="button" class="ms-btn ms-btn--outline ms-btn--sm" data-set="void"><span>Not payable</span></button>
        <button type="button" class="ms-btn ms-btn--outline ms-btn--sm" data-set="due"><span>Mark due</span></button>
        <button type="button" class="ms-btn ms-btn--success ms-btn--sm" data-set="paid"><i class="fas fa-check" aria-hidden="true"></i><span>Mark paid</span></button>
      </div>
    </div>` : ''}
  </div>`);

  const root = panel.querySelector('[data-root]');
  const list = root.querySelector('[data-list]');
  const bulk = root.querySelector('[data-bulk]');

  const syncBulk = () => {
    const visible = new Set(filtered().map((r) => r.match_id));
    [...f.selected].forEach((id) => { if (!visible.has(id)) f.selected.delete(id); });
    const sel = rows.filter((r) => f.selected.has(r.match_id));
    if (bulk) {
      bulk.hidden = !sel.length;
      root.querySelector('[data-bulk-text]').textContent = sel.length ? `${plural(sel.length, 'match', 'matches')} selected · ${formatINR(sumBy(sel, (r) => r.fee_inr))}` : '';
    }
    list.querySelectorAll('[data-group]').forEach((cb) => {
      const ids = (cb.dataset.ids || '').split(',').filter(Boolean);
      const n = ids.filter((id) => f.selected.has(id)).length;
      cb.checked = n > 0 && n === ids.length;
      cb.indeterminate = n > 0 && n < ids.length;
    });
    list.querySelectorAll('[data-row]').forEach((cb) => { cb.checked = f.selected.has(cb.dataset.row); });
  };

  const draw = () => {
    const shown = filtered();
    if (!shown.length) {
      setContent(list, html`<div class="ms-card">${emptyState({ icon: 'fa-indian-rupee-sign', title: rows.length ? 'Nothing here' : 'No matches yet', text: rows.length ? (f.status === 'due' ? 'No payouts are marked due. Mark matches due from "Not due yet" when they qualify.' : 'Try another filter.') : 'Payouts appear once students are matched with mentors.' })}</div>`);
      syncBulk();
      return;
    }
    const groups = groupsOf(shown);
    setContent(list, html`${groups.map((g) => {
      const ids = g.rows.map((r) => r.match_id);
      return html`<section class="ms-admin-group">
        <header class="ms-admin-group__head">
          ${app.canWrite ? html`<label class="ms-admin-cbwrap" title="Select all for ${g.mentor.full_name}"><input type="checkbox" class="ms-admin-cb" data-group="${g.mentor.id || ''}" data-ids="${ids.join(',')}" aria-label="Select all payouts for ${g.mentor.full_name}"></label>` : ''}
          <div class="ms-grow">
            <button type="button" class="ms-admin-linkbtn" data-mentor="${g.mentor.id || ''}">${g.mentor.full_name}</button>
            <div class="ms-xs ms-muted">${plural(g.rows.length, 'mentee')} · ${formatINR(sumBy(g.rows, (r) => r.fee_inr))}${g.mentor.email ? ` · ${g.mentor.email}` : ''}</div>
          </div>
          ${waIconLink(g.mentor.whatsapp, `Hi ${firstName(g.mentor.full_name)}, Team My Student Club here about your mentor payout.`, `WhatsApp ${g.mentor.full_name}`)}
        </header>
        <ul class="ms-admin-payrows">${g.rows.map((r) => html`<li class="ms-admin-payrow">
          ${app.canWrite ? html`<label class="ms-admin-cbwrap"><input type="checkbox" class="ms-admin-cb" data-row="${r.match_id}" aria-label="Select payout for ${r.mentee?.full_name || 'mentee'}"></label>` : ''}
          <div class="ms-grow">
            <div class="ms-small"><strong>${r.mentee?.full_name || 'Mentee'}</strong> <span class="ms-muted">· ${programLabel(r.program)}</span></div>
            <div class="ms-xs ms-muted">Started ${formatDate(r.started_at)} · ${MATCH_STATUS[r.status]?.label || r.status}${r.paid_at ? ` · paid ${formatDate(r.paid_at)}` : ''}${r.payout_ref ? ` · ref ${r.payout_ref}` : ''}</div>
          </div>
          <div class="ms-admin-payrow__right"><span class="ms-strong">${formatINR(r.fee_inr)}</span>${statusBadge('payout', r.payout_status)}</div>
        </li>`)}</ul>
      </section>`;
    })}`);
    syncBulk();
  };
  draw();

  root.querySelector('[data-q]').addEventListener('input', debounce((e) => { f.q = e.target.value; draw(); }, 150));
  root.querySelector('[data-month]').addEventListener('change', (e) => { f.month = e.target.value; draw(); });
  root.querySelector('[data-chips="payst"]').addEventListener('change', (e) => { f.status = e.target.value; f.selected.clear(); draw(); });
  list.addEventListener('change', (e) => {
    const g = e.target.closest('[data-group]');
    if (g) { (g.dataset.ids || '').split(',').filter(Boolean).forEach((id) => (g.checked ? f.selected.add(id) : f.selected.delete(id))); syncBulk(); return; }
    const r = e.target.closest('[data-row]');
    if (r) { if (r.checked) f.selected.add(r.dataset.row); else f.selected.delete(r.dataset.row); syncBulk(); }
  });
  list.addEventListener('click', (e) => {
    const mn = e.target.closest('[data-mentor]');
    if (mn && mn.dataset.mentor) app.openMentor(mn.dataset.mentor);
  });
  root.querySelector('[data-clear]')?.addEventListener('click', () => { f.selected.clear(); syncBulk(); });
  root.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => applyStatus(b.dataset.set, rows, f, app)));

  root.querySelector('[data-csv]').addEventListener('click', () => {
    downloadCsv(`msc-payouts-${f.status}-${f.month}-${istDateKey()}`, filtered(), [
      { label: 'Mentor', value: (r) => r.mentor?.full_name || '' },
      { label: 'Mentor email', value: (r) => r.mentor?.email || '' },
      { label: 'Mentor WhatsApp', value: (r) => csvPhone(r.mentor?.whatsapp) },
      { label: 'Mentee', value: (r) => r.mentee?.full_name || '' },
      { label: 'Program', value: (r) => programLabel(r.program) },
      { label: 'Batch month', value: (r) => monthLabel(istMonthKey(r.started_at)) },
      { label: 'Started', value: (r) => istDateKey(r.started_at) },
      { label: 'Match status', value: (r) => MATCH_STATUS[r.status]?.label || r.status },
      { label: 'Fee (Rs)', value: (r) => r.fee_inr ?? '' },
      { label: 'Payout status', value: (r) => PAYOUT_STATUS[r.payout_status]?.label || r.payout_status },
      { label: 'Paid on', value: (r) => (r.paid_at ? istDateKey(r.paid_at) : '') },
      { label: 'Reference', value: (r) => r.payout_ref || '' },
      { label: 'Match id', value: (r) => r.match_id },
    ]);
  });
}

async function applyStatus(status, rows, f, app) {
  const sel = rows.filter((r) => f.selected.has(r.match_id));
  if (!sel.length || !app.canWrite) return;
  const total = formatINR(sumBy(sel, (r) => r.fee_inr));
  const byMentor = new Map();
  sel.forEach((r) => { const k = r.mentor?.full_name || 'Unknown'; byMentor.set(k, (byMentor.get(k) || 0) + Number(r.fee_inr || 0)); });
  const breakdown = [...byMentor.entries()].map(([n, v]) => `${n}: ${formatINR(v)}`).join('; ');
  let reference = null;
  if (status === 'paid') {
    reference = await askText({
      title: `Mark ${plural(sel.length, 'payout')} as paid?`,
      intro: `${total} in total. ${breakdown}.${byMentor.size > 1 ? ' Paying mentors separately? Select one mentor at a time so each gets their own reference.' : ''}`,
      label: 'Payment reference', placeholder: 'UPI reference or bank transfer id', hint: 'Shown to the mentor on their earnings tab.',
      required: false, multiline: false, max: 120, confirmLabel: 'Mark paid', variant: 'success',
    });
    if (reference === null) return;
  } else {
    const ok = await confirmDialog({
      title: status === 'due' ? `Mark ${plural(sel.length, 'payout')} as due?` : `Mark ${plural(sel.length, 'payout')} as not payable?`,
      message: `${total} in total. ${breakdown}.${status === 'void' ? ' Use this for matches that ended before they qualified.' : ''}`,
      confirmText: status === 'due' ? 'Mark due' : 'Not payable', danger: status === 'void',
    });
    if (!ok) return;
  }
  try {
    const n = await rpc('mentorship_admin_set_payout', { p_match_ids: sel.map((r) => r.match_id), p_status: status, p_reference: reference || null });
    toast(`${plural(Number(n ?? sel.length), 'payout')} marked ${PAYOUT_STATUS[status]?.label.toLowerCase() || status}.`, { type: 'success' });
    f.selected.clear();
    invalidate('matches', 'overview', 'detail');
    app.refresh();
  } catch (e) { showError(e); }
}
