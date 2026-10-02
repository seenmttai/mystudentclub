/* =============================================================================
   Admin console: page-local mock extension (localhost only; admin.js imports it
   only when isMockMode() is true). Owner: admin builder.
   - Seeds from the shared mock (/mentorship/assets/mock-data.js) so shapes match the
     contract, then adds fixtures the admin views need (an application in review, a
     rejected and a paused mentor, completed / ended matches for payouts).
   - Makes every staff write stateful, with the server rules from SPEC §3.3 / §4.2,
     so the flows can be clicked through end to end.
   - ?staff=senior views the console as a senior mentor (?staff=admin to switch back).
   All data is fictional: example.com addresses, 98765 0xxxx numbers.
   ========================================================================== */
import { registerMocks, rpc, mockRole, MsError, REQUIRED_CONSENTS, CHECKLIST_ITEMS, weekNumber, daysSince } from '/mentorship/assets/mentorship-core.js?v=1';

await import('/mentorship/assets/mock-data.js?v=1');

const params = new URLSearchParams(location.search);
try { if (params.has('staff')) localStorage.setItem('ms_mock_staff', params.get('staff') === 'senior' ? 'senior' : 'admin'); } catch { /* ignore */ }
const SENIOR = (() => { try { return localStorage.getItem('ms_mock_staff') === 'senior'; } catch { return false; } })();

if (mockRole() === 'admin') await setup();

async function setup() {
  const now = Date.now();
  const ago = (d, h = 0) => new Date(now - d * 86400000 - h * 3600000).toISOString();
  const later = (d) => new Date(now + d * 86400000).toISOString();
  const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const clone = (v) => JSON.parse(JSON.stringify(v));

  const [who, mentors0, matches0, unmatched0, switches0, reviews0, staff0, flags0, config0] = await Promise.all([
    rpc('mentorship_whoami'), rpc('mentorship_admin_mentors', {}), rpc('mentorship_admin_matches', { p_status: null }),
    rpc('mentorship_admin_unmatched', {}), rpc('mentorship_admin_switch_requests', {}), rpc('mentorship_admin_reviews', {}),
    rpc('mentorship_admin_staff'), rpc('mentorship_admin_red_flags'), rpc('mentorship_admin_get_config'),
  ]);

  /* ---- mentors ----------------------------------------------------------- */
  const MENTORS = mentors0.map((m, i) => {
    const first = String(m.full_name).split(' ')[0].toLowerCase();
    return { ...m, email: `${first}@example.com`, mobile: `98765000${String(10 + i).padStart(2, '0')}`, whatsapp: `98765000${String(10 + i).padStart(2, '0')}`, active_count: Number(m.active_count || 0) };
  });
  const byId = (id) => MENTORS.find((m) => m.id === id);
  const base = byId(uid(11));
  const allConsents = Object.fromEntries(REQUIRED_CONSENTS.map((k) => [k, ago(4)]));
  MENTORS.push({
    ...clone(base), id: uid(23), user_id: uid(203), status: 'training_passed', full_name: 'Arjun Nair', email: 'arjun.nair@example.com', mobile: '9876500023', whatsapp: '9876500023',
    tier: 'peer_mentor', stage: 'final_it_done', city: 'indore', languages: ['english', 'hindi'], domains: ['internal_audit', 'statutory_audit'],
    headline: 'IT in internal audit at KPMG after a small-firm articleship in Indore.', bio: 'I did articleship at a small firm in Indore and was told Big 4 IT was not for students like me. I applied to 60 places, cleared KPMG in round three, and learnt a lot about applying smartly.',
    wish_i_knew: 'Your articleship work matters more than your firm name.', it_company: 'KPMG', it_domain: 'internal_audit', it_duration_months: 11, it_start: '2025-07', final_attempt: '2026-11',
    articleship_firm: 'Mehta & Co', articleship_firm_type: 'small', articleship_domain: 'statutory_audit', articleship_city: 'Indore', companies_known: ['KPMG', 'Grant Thornton', 'BDO India'],
    topmate_url: 'https://topmate.io/example-arjun', linkedin_url: 'https://www.linkedin.com/in/example-arjun', linkedin_checked: false, topmate_checked: false,
    scores: { foundation: { marks: 251, out_of: 400, attempts: 1 }, inter: { marks: 352, out_of: 600, attempts: 2 }, final: null, rank_note: 'Exemption in Accounts (Inter)' },
    why_mentor: 'A senior from my city kept me going when I had 0 shortlists for 6 weeks. I want to be that person for someone in a small city.',
    scenario_answer: 'Six rejections is painful, and it does not mean you are not good enough. Most openings come late in the season. Send me your CV and the list of places tonight. We will fix the CV and pick 10 better-fit roles this week. Call tomorrow at 8? Hojayega.',
    mentoring_experience: 'few_times', conflicts: ['student_group'], conflicts_note: 'I run a free WhatsApp group for CA students in Indore (no paid content).', heard_from: 'msc_student',
    consents: allConsents, training: { lecture_at: ago(3), playbook_at: ago(3) }, quiz_passed_at: ago(2), quiz_best_pct: 83, quiz_attempts: 2, quiz_last_at: ago(2),
    staff_note: '', senior_mentor_id: null, senior_mentor_name: null, submitted_at: ago(4), approved_at: null, status_changed_at: ago(2), rating_avg: null, review_count: 0,
    mentees_total: 0, active_mentees: 0, active_count: 0, max_mentees: 6, accepting: true,
  });
  MENTORS.push({
    ...clone(base), id: uid(24), user_id: uid(204), status: 'rejected', full_name: 'Priya Desai', email: 'priya.desai@example.com', mobile: '9876500024', whatsapp: '9876500024',
    stage: 'in_articleship', tier: 'peer_mentor', city: 'surat', it_company: null, it_domain: null, it_duration_months: null, final_attempt: null, articleship_year: 2,
    articleship_firm: 'Shah Patel & Co', articleship_firm_type: 'small', articleship_domain: 'direct_tax', headline: 'Second-year article assistant in direct tax.', linkedin_checked: false,
    topmate_url: null, consents: allConsents, quiz_passed_at: ago(14), quiz_best_pct: 92, quiz_attempts: 1, submitted_at: ago(16), rejected_at: ago(10),
    reject_reason: 'We already have enough mentors for your profile this batch.', reapply_after: later(20).slice(0, 10), approved_at: null, rating_avg: null, review_count: 0,
    active_mentees: 0, active_count: 0, senior_mentor_id: null, senior_mentor_name: null,
  });
  const fatima = byId(uid(15));
  if (fatima) Object.assign(fatima, { status: 'paused', paused_at: ago(3), pause_reason: 'Mentor asked for a break during exams.' });
  const meera = MENTORS.find((m) => m.status === 'submitted');
  if (meera) Object.assign(meera, { quiz_attempts: 1, quiz_best_pct: 58, quiz_last_at: ago(0, 6), training: { playbook_at: ago(1) } });

  /* ---- matches ----------------------------------------------------------- */
  const MATCHES = matches0.map((x) => ({ ...x, mentor: { ...x.mentor, whatsapp: base.whatsapp, email: base.email } }));
  const mentee = (n, name, city) => ({ user_id: uid(n), full_name: name, first_name: name.split(' ')[0], whatsapp: `98765${String(n).padStart(5, '0')}`, email: `${name.split(' ')[0].toLowerCase()}@example.com`, city });
  const mk = (o) => ({ program: 'industrial-training', status: 'active', ended_at: null, source: 'self', checklist_done: 0, checklist_total: CHECKLIST_ITEMS.length,
    last_call_on: null, days_since_call: null, latest_stage: null, last_pulse: null, review: null, fee_inr: 500, payout_status: 'unpaid', paid_at: null, payout_ref: null, ...o,
    week_no: weekNumber(o.started_at) });
  const rohit = byId(uid(12));
  const sneha = byId(uid(13));
  MATCHES.push(mk({ match_id: uid(704), started_at: ago(20), mentor: { id: rohit.id, full_name: rohit.full_name, whatsapp: rohit.whatsapp, email: rohit.email },
    mentee: mentee(106, 'Ishaan Verma', 'lucknow'), checklist_done: 2, last_call_on: ago(13).slice(0, 10), days_since_call: 13, latest_stage: 'applying',
    last_pulse: { rating: 2, mentor_called: false, applications_count: 3, issue: 'Mentor responds after 2 days and missed the last two calls.', created_at: ago(2) } }));
  MATCHES.push(mk({ match_id: uid(799), status: 'completed', started_at: ago(160), ended_at: ago(70), mentor: { id: base.id, full_name: base.full_name, whatsapp: base.whatsapp, email: base.email },
    mentee: mentee(107, 'Harsh Kapoor', 'pune'), checklist_done: 9, last_call_on: ago(75).slice(0, 10), days_since_call: 75, latest_stage: 'joined',
    review: { rating: 5, safety_flag: false }, payout_status: 'paid', paid_at: ago(60), payout_ref: 'UPI 6021' }));
  MATCHES.push(mk({ match_id: uid(798), status: 'ended', started_at: ago(70), ended_at: ago(50), mentor: { id: sneha.id, full_name: sneha.full_name, whatsapp: sneha.whatsapp, email: sneha.email },
    mentee: mentee(108, 'Tanvi Rao', 'pune'), checklist_done: 3, latest_stage: 'on_hold', payout_status: 'void' }));
  MATCHES.push(mk({ match_id: uid(797), status: 'completed', started_at: ago(45), ended_at: ago(5), mentor: { id: sneha.id, full_name: sneha.full_name, whatsapp: sneha.whatsapp, email: sneha.email },
    mentee: mentee(109, 'Rahul Jain', 'mumbai'), checklist_done: 8, last_call_on: ago(8).slice(0, 10), days_since_call: 8, latest_stage: 'offer', payout_status: 'due' }));

  let UNMATCHED = clone(unmatched0).concat([{ user_id: uid(110), email: 'sana.k@example.com', name: 'Sana Khan', whatsapp: null, city: 'hyderabad', enrolled_at: ago(9), batch: 'Oct 2026', days_waiting: 9, has_student_row: false }]);
  const SWITCHES = clone(switches0).map((s) => ({ ...s, mentee: { ...s.mentee } }));
  const REVIEWS = clone(reviews0).concat([{ id: uid(504), match_id: uid(704), mentor_id: rohit.id, mentor_name: rohit.full_name, mentee_name: 'Ishaan V.', rating: 2, tags: [], body: '',
    safety_flag: true, private_note: 'He said he can get me a referral at his company if I join his paid prep group.', published: true, program: 'industrial-training', created_at: ago(1) }]);
  const STAFF = clone(staff0);
  const CONFIG = clone(config0);
  if (!CONFIG.some((r) => r.key === 'unmatched_since')) CONFIG.push({ key: 'unmatched_since', value: '2026-10-01', is_public: false, note: '', updated_at: ago(3) });
  if (!CONFIG.some((r) => r.key === 'red_flag_call_days')) CONFIG.push({ key: 'red_flag_call_days', value: 8, is_public: false, note: '', updated_at: ago(3) });
  const BASE_FLAGS = clone(flags0).concat([
    { kind: 'mentor_not_calling', severity: 'high', match_id: uid(704), mentor_id: rohit.id, mentor_name: rohit.full_name, mentee_user_id: uid(106), mentee_name: 'Ishaan Verma', program: 'industrial-training', detail: 'Check-in this week: mentor did not call.', since: ago(2) },
    { kind: 'safety_flag', severity: 'high', match_id: uid(704), mentor_id: rohit.id, mentor_name: rohit.full_name, mentee_user_id: uid(106), mentee_name: 'Ishaan Verma', program: 'industrial-training', detail: 'Review says the mentor offered a referral for joining a paid group.', since: ago(1) },
    { kind: 'switch_pending', severity: 'medium', match_id: uid(704), mentor_id: rohit.id, mentor_name: rohit.full_name, mentee_user_id: uid(106), mentee_name: 'Ishaan Verma', program: 'industrial-training', detail: 'Asked for a different mentor.', since: ago(1) },
    { kind: 'unmatched', severity: 'high', match_id: null, mentor_id: null, mentor_name: null, mentee_user_id: uid(110), mentee_name: 'Sana Khan', program: 'industrial-training', detail: 'Enrolled 9 days ago, no mentor yet.', since: ago(9) },
  ]);
  const EVENTS = [];
  const ADMIN_NAME = who?.name || 'Team MSC Admin';
  const log = (kind, mentorId, detail = {}) => EVENTS.unshift({ id: EVENTS.length + 100, kind, mentor_id: mentorId, actor_name: ADMIN_NAME, detail, created_at: new Date().toISOString() });

  /* ---- helpers ----------------------------------------------------------- */
  const need = (cond, code, hint) => { if (!cond) throw new MsError(code, undefined, { hint: hint || null }); };
  const write = () => need(!SENIOR, 'forbidden');
  const isActive = (x) => x.status === 'active';
  const flags = () => BASE_FLAGS.filter((f) => {
    if (f.kind === 'unmatched') return UNMATCHED.some((u) => u.user_id === f.mentee_user_id);
    if (f.kind === 'switch_pending') return SWITCHES.some((s) => s.match_id === f.match_id && s.status === 'pending');
    if (f.kind === 'safety_flag') return REVIEWS.some((r) => r.match_id === f.match_id && r.safety_flag);
    return MATCHES.some((x) => x.match_id === f.match_id && isActive(x));
  });
  const shapeMentee = (u) => ({ user_id: u.user_id, full_name: u.name, first_name: String(u.name).split(' ')[0], whatsapp: u.whatsapp, email: u.email, city: u.city });
  const newMatch = (mentor, menteeObj, program, source, extra = {}) => {
    const row = mk({ match_id: crypto.randomUUID(), program, source, started_at: new Date().toISOString(),
      mentor: { id: mentor.id, full_name: mentor.full_name, whatsapp: mentor.whatsapp, email: mentor.email }, mentee: menteeObj, ...extra });
    MATCHES.push(row);
    mentor.active_count += 1;
    mentor.active_mentees = mentor.active_count;
    return row;
  };
  const closeMatch = (x, status, reason) => {
    x.status = status; x.ended_at = new Date().toISOString(); x.end_reason = reason || null;
    const m = byId(x.mentor?.id);
    if (m) { m.active_count = Math.max(0, m.active_count - 1); m.active_mentees = m.active_count; }
  };
  const checkCapacity = (mentor, force) => {
    need(mentor && mentor.status === 'approved', 'mentor_unavailable');
    if (!force) { need(mentor.accepting, 'mentor_unavailable'); need(mentor.active_count < mentor.max_mentees, 'mentor_full'); }
  };
  const detailOf = (m) => ({
    mentor: m, active_count: m.active_count,
    quiz_attempts: m.quiz_attempts ? Array.from({ length: m.quiz_attempts }, (_, i) => {
      const last = i === m.quiz_attempts - 1;
      const pct = last ? (m.quiz_best_pct || 0) : 67;
      return { id: `${m.id}-q${i}`, score_pct: pct, correct: Math.round((pct / 100) * 12), total: 12, passed: last && !!m.quiz_passed_at, created_at: last ? m.quiz_last_at : ago(4) };
    }).reverse() : [],
    matches: MATCHES.filter((x) => x.mentor?.id === m.id),
    reviews: REVIEWS.filter((r) => r.mentor_id === m.id),
    events: EVENTS.filter((e) => e.mentor_id === m.id).concat([
      m.approved_at ? { id: 3, kind: 'status_changed', actor_name: ADMIN_NAME, detail: { from: 'training_passed', to: 'approved' }, created_at: m.approved_at } : null,
      m.quiz_last_at ? { id: 2, kind: 'quiz_attempt', actor_name: m.full_name, detail: { score_pct: m.quiz_best_pct, passed: !!m.quiz_passed_at }, created_at: m.quiz_last_at } : null,
      m.submitted_at ? { id: 1, kind: 'application_submitted', actor_name: m.full_name, detail: {}, created_at: m.submitted_at } : null,
    ].filter(Boolean)),
  });

  /* ---- handlers ---------------------------------------------------------- */
  registerMocks({
    mentorship_whoami: () => ({ ...who, staff_role: SENIOR ? 'senior_mentor' : 'admin' }),
    mentorship_get_config: () => Object.fromEntries(CONFIG.filter((r) => r.is_public).map((r) => [r.key, r.value])),
    mentorship_admin_get_config: () => CONFIG,
    mentorship_admin_set_config: ({ p_key, p_value, p_is_public = null }) => {
      write();
      if (p_key === 'mentor_fee_inr') need(Number.isInteger(p_value) && p_value >= 0 && p_value <= 100000, 'invalid_input', 'mentor_fee_inr');
      if (/_url$/.test(p_key)) need(p_value === '' || /^https:\/\//.test(p_value), 'invalid_input', p_key);
      if (p_key === 'programs_enabled') need(Array.isArray(p_value) && p_value.every((k) => ['industrial-training', 'articleship', 'ca-fresher'].includes(k)), 'invalid_input', p_key);
      let r = CONFIG.find((x) => x.key === p_key);
      if (!r) { r = { key: p_key, value: p_value, is_public: p_is_public ?? true, note: '' }; CONFIG.push(r); }
      r.value = p_value; r.updated_at = new Date().toISOString();
      if (p_is_public !== null) r.is_public = p_is_public;
      return r;
    },

    mentorship_admin_overview: () => {
      const mentors = Object.fromEntries(['draft', 'submitted', 'training_passed', 'approved', 'rejected', 'paused'].map((s) => [s, MENTORS.filter((m) => m.status === s).length]));
      const act = MATCHES.filter(isActive);
      const byProgram = {};
      act.forEach((x) => { byProgram[x.program] = (byProgram[x.program] || 0) + 1; });
      const fl = flags();
      const sum = (s) => MATCHES.filter((x) => x.payout_status === s).reduce((a, x) => a + x.fee_inr, 0);
      return { counts: { mentors, active_matches: act.length, matches_by_program: byProgram, unmatched: UNMATCHED.length,
        red_flags: { high: fl.filter((f) => f.severity === 'high').length, medium: fl.filter((f) => f.severity === 'medium').length },
        switch_pending: SWITCHES.filter((s) => s.status === 'pending').length,
        payouts: { unpaid_inr: sum('unpaid'), due_inr: sum('due'), paid_inr: sum('paid'), due_count: MATCHES.filter((x) => x.payout_status === 'due').length } },
        generated_at: new Date().toISOString() };
    },
    mentorship_admin_red_flags: () => flags(),
    mentorship_admin_mentors: ({ p_status = null }) => MENTORS.filter((m) => !p_status || m.status === p_status),
    mentorship_admin_mentor_detail: ({ p_mentor_id }) => { const m = byId(p_mentor_id); need(m, 'not_found'); return detailOf(m); },
    mentorship_admin_matches: ({ p_status = 'active', p_program = null }) => MATCHES.filter((x) => (!p_status || x.status === p_status) && (!p_program || x.program === p_program))
      .map((x) => ({ ...x, week_no: weekNumber(x.started_at, x.ended_at || new Date()), days_since_call: x.last_call_on ? daysSince(x.last_call_on) : null })),
    mentorship_admin_unmatched: () => UNMATCHED,
    mentorship_admin_switch_requests: ({ p_status = 'pending' }) => SWITCHES.filter((s) => !p_status || s.status === p_status),
    mentorship_admin_reviews: ({ p_mentor_id = null }) => REVIEWS.filter((r) => !p_mentor_id || r.mentor_id === p_mentor_id),
    mentorship_admin_staff: () => STAFF,

    mentorship_admin_set_status: ({ p_mentor_id, p_status, p_reason = null }) => {
      write();
      const m = byId(p_mentor_id);
      need(m, 'not_found');
      const from = m.status;
      const ok = {
        approved: ['training_passed', 'paused', 'rejected'],
        rejected: ['submitted', 'training_passed', 'approved', 'paused'],
        paused: ['approved'],
      }[p_status] || [];
      need(ok.includes(from), 'invalid_transition', `${from}_to_${p_status}`);
      if (p_status === 'approved') need(m.quiz_passed_at, 'quiz_not_passed');
      if (p_status === 'rejected') { need(p_reason, 'invalid_input', 'p_reason'); need(m.active_count === 0, 'invalid_transition', 'has_active_mentees'); }
      if (p_status === 'paused') need(p_reason, 'invalid_input', 'p_reason');
      m.status = p_status; m.status_changed_at = new Date().toISOString();
      if (p_status === 'approved') { m.approved_at = m.approved_at || new Date().toISOString(); m.paused_at = null; m.pause_reason = null; m.reject_reason = null; m.reapply_after = null; }
      if (p_status === 'rejected') { m.rejected_at = new Date().toISOString(); m.reject_reason = p_reason; m.reapply_after = later(30).slice(0, 10); }
      if (p_status === 'paused') { m.paused_at = new Date().toISOString(); m.pause_reason = p_reason; }
      log('status_changed', m.id, { from, to: p_status, reason: p_reason || undefined });
      return m;
    },
    mentorship_admin_update_mentor: ({ p_mentor_id, p_patch = {} }) => {
      const m = byId(p_mentor_id);
      need(m, 'not_found');
      const allowed = SENIOR ? ['staff_note'] : ['linkedin_checked', 'topmate_checked', 'staff_note', 'senior_mentor_id', 'max_mentees'];
      need(Object.keys(p_patch).every((k) => allowed.includes(k)), 'forbidden');
      if ('max_mentees' in p_patch) need(Number(p_patch.max_mentees) >= m.active_count, 'invalid_input', 'max_mentees_below_active');
      Object.assign(m, p_patch);
      if ('senior_mentor_id' in p_patch) m.senior_mentor_name = STAFF.find((s) => s.user_id === p_patch.senior_mentor_id)?.name || null;
      log('mentor_updated_by_staff', m.id, { fields: Object.keys(p_patch) });
      return m;
    },
    mentorship_admin_create_match: ({ p_mentee_user_id, p_mentor_id, p_program, p_force = false }) => {
      write();
      need(!MATCHES.some((x) => x.mentee?.user_id === p_mentee_user_id && x.program === p_program && isActive(x)), 'already_matched');
      const mentor = byId(p_mentor_id);
      checkCapacity(mentor, p_force);
      const u = UNMATCHED.find((x) => x.user_id === p_mentee_user_id) || { user_id: p_mentee_user_id, name: 'Student', email: '', whatsapp: null, city: null };
      const row = newMatch(mentor, shapeMentee(u), p_program, 'admin');
      UNMATCHED = UNMATCHED.filter((x) => x.user_id !== p_mentee_user_id);
      log('match_created', mentor.id, { mentee_name: u.name });
      return row;
    },
    mentorship_admin_reassign: ({ p_match_id, p_new_mentor_id, p_reason, p_force = false }) => {
      write();
      const x = MATCHES.find((y) => y.match_id === p_match_id);
      need(x && isActive(x), 'match_not_active');
      need(p_reason, 'invalid_input', 'p_reason');
      const mentor = byId(p_new_mentor_id);
      need(mentor?.id !== x.mentor?.id, 'invalid_input', 'same_mentor');
      checkCapacity(mentor, p_force);
      closeMatch(x, 'switched', p_reason);
      const row = newMatch(mentor, x.mentee, x.program, 'switch', { previous_match_id: x.match_id });
      SWITCHES.filter((s) => s.match_id === x.match_id && s.status === 'pending').forEach((s) => Object.assign(s, { status: 'approved', resolved_at: new Date().toISOString(), new_match_id: row.match_id }));
      log('match_reassigned', x.mentor?.id, { mentee_name: x.mentee?.full_name, reason: p_reason });
      return row;
    },
    mentorship_admin_end_match: ({ p_match_id, p_status, p_reason = null }) => {
      write();
      need(['completed', 'ended'].includes(p_status), 'invalid_input', 'p_status');
      const x = MATCHES.find((y) => y.match_id === p_match_id);
      need(x && isActive(x), 'match_not_active');
      closeMatch(x, p_status, p_reason);
      log('match_ended', x.mentor?.id, { mentee_name: x.mentee?.full_name, status: p_status, reason: p_reason || undefined });
      return x;
    },
    mentorship_admin_resolve_switch: ({ p_request_id, p_approve, p_new_mentor_id = null, p_note = null }) => {
      write();
      const s = SWITCHES.find((y) => y.id === p_request_id);
      need(s && s.status === 'pending', 'invalid_transition', 'not_pending');
      if (p_approve) {
        need(p_new_mentor_id, 'invalid_input', 'p_new_mentor_id');
        let x = MATCHES.find((y) => y.match_id === s.match_id);
        if (!x) {
          const r = byId(s.mentor?.id) || rohit;
          x = mk({ match_id: s.match_id, started_at: ago(20), mentor: { id: r.id, full_name: r.full_name, whatsapp: r.whatsapp, email: r.email }, mentee: { ...s.mentee, email: '', city: null } });
          MATCHES.push(x);
        }
        const mentor = byId(p_new_mentor_id);
        checkCapacity(mentor, false);
        closeMatch(x, 'switched', 'Switch request approved');
        const row = newMatch(mentor, x.mentee, x.program, 'switch', { previous_match_id: x.match_id });
        Object.assign(s, { status: 'approved', resolution_note: p_note, resolved_at: new Date().toISOString(), new_match_id: row.match_id });
      } else {
        Object.assign(s, { status: 'declined', resolution_note: p_note, resolved_at: new Date().toISOString(), new_match_id: null });
      }
      return s;
    },
    mentorship_admin_set_payout: ({ p_match_ids = [], p_status, p_reference = null }) => {
      write();
      need(['unpaid', 'due', 'paid', 'void'].includes(p_status), 'invalid_input', 'p_status');
      let n = 0;
      MATCHES.forEach((x) => {
        if (!p_match_ids.includes(x.match_id)) return;
        x.payout_status = p_status;
        x.paid_at = p_status === 'paid' ? new Date().toISOString() : null;
        if (p_status === 'paid') x.payout_ref = p_reference || x.payout_ref;
        n += 1;
      });
      return n;
    },
    mentorship_admin_set_review: ({ p_review_id, p_published }) => {
      write();
      const r = REVIEWS.find((x) => x.id === p_review_id);
      need(r, 'not_found');
      r.published = !!p_published;
      return r;
    },
    mentorship_admin_upsert_staff: ({ p_email, p_role, p_name = null, p_whatsapp = null, p_active = true }) => {
      write();
      need(/@example\.com$/i.test(p_email || ''), 'not_found', 'email');
      need(['admin', 'senior_mentor'].includes(p_role), 'invalid_input', 'p_role');
      let s = STAFF.find((x) => x.email.toLowerCase() === p_email.toLowerCase());
      const admins = STAFF.filter((x) => x.role === 'admin' && x.active);
      if (s && s.role === 'admin' && s.active && (p_role !== 'admin' || !p_active)) need(admins.length > 1, 'invalid_transition', 'last_admin');
      if (!s) { s = { user_id: crypto.randomUUID(), email: p_email.toLowerCase(), created_at: new Date().toISOString() }; STAFF.push(s); }
      Object.assign(s, { role: p_role, name: p_name ?? s.name ?? null, whatsapp: p_whatsapp ?? s.whatsapp ?? '', active: !!p_active });
      return s;
    },
  });
}
