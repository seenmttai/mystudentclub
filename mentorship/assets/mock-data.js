/* =============================================================================
   Mock backend for UI work on localhost (never loaded in production: the core only
   imports this when isMockMode() is true, which needs a localhost/*.test host).
   Every handler returns the exact shape the real RPC returns (see SPEC.md §5), so this
   file doubles as an executable example of the contract. Owner: architect.
   Data is fictional: example.com addresses, 98765 0xxxx numbers.
   ========================================================================== */
import { registerMocks, setMockSession, mockRole, MsError, istWeekStart, weekNumber, daysSince, REQUIRED_CONSENTS, CHECKLIST_ITEMS } from '/mentorship/assets/mentorship-core.js?v=1';

const now = Date.now();
const ago = (d, h = 0) => new Date(now - d * 86400000 - h * 3600000).toISOString();
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/* ---- people ---------------------------------------------------------------- */
const USERS = {
  student: { id: uid(101), email: 'riya.sharma@example.com', name: 'Riya Sharma' },
  unmatched: { id: uid(102), email: 'aman.gupta@example.com', name: 'Aman Gupta' },
  guest: { id: uid(103), email: 'visitor@example.com', name: 'Neha Visitor' },
  applicant: { id: uid(201), email: 'vikram.applicant@example.com', name: 'Vikram Rao' },
  trainee: { id: uid(202), email: 'meera.trainee@example.com', name: 'Meera Joshi' },
  mentor: { id: uid(1), email: 'ananya.iyer@example.com', name: 'Ananya Iyer' },
  admin: { id: uid(900), email: 'team.admin@example.com', name: 'Team MSC Admin' },
};
const role = mockRole();
const me = USERS[role] || null;
setMockSession(me ? { user: { id: me.id, email: me.email, user_metadata: { full_name: me.name } }, access_token: 'mock' } : null);

/* ---- mentors --------------------------------------------------------------- */
const baseMentor = {
  status: 'approved', did_it: true, it_start: '2025-01', articleship_city: 'Mumbai', show_linkedin: false,
  linkedin_url: null, linkedin_checked: true, topmate_checked: false, accepting: true, call_slots: ['weekday_evening', 'sunday'],
  weekly_hours: '4-6', programs: ['industrial-training'], wish_i_knew: '', companies_known: [], max_mentees: 8,
  final_attempt: null, qualified_on: null, employer: null, role_title: null, experience_years: null, articleship_year: null,
};
const MENTORS = [
  { ...baseMentor, id: uid(11), user_id: uid(1), full_name: 'Ananya Iyer', photo_path: '', tier: 'peer_mentor', stage: 'final_it_done',
    city: 'mumbai', languages: ['english', 'hindi', 'tamil'], domains: ['risk_advisory', 'internal_audit', 'statutory_audit'],
    headline: 'IT in Risk Advisory at Deloitte. Cleared 9 interviews before my offer, happy to share every lesson.',
    bio: 'I spent 2 years in articleship at a mid-size firm in Mumbai, mostly statutory audit, then did my industrial training in risk advisory at Deloitte. My first 5 interviews were rejections, so I know how that week feels. I can help you pick a domain, fix your CV and practise interviews until you feel ready.',
    wish_i_knew: 'Apply early, but do not panic in October. Most good openings come late.',
    it_company: 'Deloitte', it_domain: 'risk_advisory', it_duration_months: 12, final_attempt: '2026-05',
    articleship_firm: 'Shah & Co', articleship_firm_type: 'mid_size', articleship_domain: 'statutory_audit',
    companies_known: ['Deloitte', 'EY', 'KPMG', 'Grant Thornton'], topmate_url: 'https://topmate.io/example-ananya', topmate_checked: true,
    rating_avg: 4.8, review_count: 12, mentees_total: 19, active_mentees: 3, approved_at: ago(120) },
  { ...baseMentor, id: uid(12), user_id: uid(2), full_name: 'Rohit Agarwal', photo_path: '', tier: 'ca_mentor', stage: 'qualified_fresher',
    city: 'delhi_ncr', languages: ['english', 'hindi'], domains: ['fpa', 'financial_reporting', 'accounts_ops'],
    headline: 'IT in FP&A at an FMCG major, now a qualified CA in corporate finance.',
    bio: 'I did my industrial training in FP&A and stayed in industry after qualifying. If you want to move from audit to a corporate finance role, I can tell you exactly what interviewers looked for.',
    it_company: 'Hindustan Unilever', it_domain: 'fpa', it_duration_months: 11, qualified_on: '2025-11', employer: 'Tata Steel', role_title: 'Finance Analyst',
    articleship_firm: 'Grant Thornton Bharat', articleship_firm_type: 'network', articleship_domain: 'statutory_audit',
    companies_known: ['Hindustan Unilever', 'ITC', 'Nestle', 'Tata Steel'], topmate_url: null,
    rating_avg: 4.6, review_count: 7, mentees_total: 9, active_mentees: 6, approved_at: ago(90) },
  { ...baseMentor, id: uid(13), user_id: uid(3), full_name: 'Sneha Patil', photo_path: '', tier: 'peer_mentor', stage: 'final_in_it',
    city: 'pune', languages: ['english', 'marathi', 'hindi'], domains: ['indirect_tax'],
    headline: 'Doing IT in GST at EY right now. Small-firm articleship, so I know the climb.',
    bio: 'I came from a small firm in Pune and was sure Big 4 IT was out of reach. It was not. I can help with GST interview prep and with applying smartly.',
    it_company: 'EY', it_domain: 'indirect_tax', it_duration_months: 12, final_attempt: '2027-05',
    articleship_firm: 'Patil & Associates', articleship_firm_type: 'small', articleship_domain: 'indirect_tax', articleship_city: 'Pune',
    companies_known: ['EY', 'KPMG'], topmate_url: null, rating_avg: 5, review_count: 1, mentees_total: 2, active_mentees: 2, max_mentees: 6, approved_at: ago(20) },
  { ...baseMentor, id: uid(14), user_id: uid(4), full_name: 'Karan Mehta', photo_path: '', tier: 'ca_mentor', stage: 'qualified_experienced',
    city: 'mumbai', languages: ['english', 'hindi', 'gujarati'], domains: ['investment_banking', 'deals', 'equity_research'],
    headline: 'IT in transaction advisory, now 3 years in investment banking.',
    bio: 'Deals and IB interviews are a different game. I help with technicals, the story of your CV and choosing between offers.',
    it_company: 'KPMG', it_domain: 'deals', it_duration_months: 12, qualified_on: '2023-07', employer: 'Avendus Capital', role_title: 'Associate', experience_years: '3-5',
    articleship_firm: 'KPMG', articleship_firm_type: 'big4', articleship_domain: 'statutory_audit',
    companies_known: ['KPMG', 'Avendus', 'JM Financial'], topmate_url: 'https://topmate.io/example-karan',
    rating_avg: 4.9, review_count: 21, mentees_total: 26, active_mentees: 5, max_mentees: 5, approved_at: ago(200) },
  { ...baseMentor, id: uid(15), user_id: uid(5), full_name: 'Fatima Shaikh', photo_path: '', tier: 'peer_mentor', stage: 'final_it_done',
    city: 'hyderabad', languages: ['english', 'hindi', 'urdu', 'telugu'], domains: ['direct_tax', 'transfer_pricing'],
    headline: 'IT in Transfer Pricing at PwC. Ask me anything about tax interviews.',
    bio: 'Tax interviews reward clear basics. I will help you revise the right topics and practise answers out loud.',
    it_company: 'PwC', it_domain: 'transfer_pricing', it_duration_months: 10, final_attempt: '2026-09',
    articleship_firm: 'Rao & Rao', articleship_firm_type: 'mid_size', articleship_domain: 'direct_tax', articleship_city: 'Hyderabad',
    companies_known: ['PwC', 'Deloitte', 'BDO India'], topmate_url: null, rating_avg: 4.4, review_count: 5, mentees_total: 6, active_mentees: 1, max_mentees: 5, accepting: true, approved_at: ago(60) },
];
const pub = (m) => {
  const slots = Math.max(0, m.max_mentees - m.active_mentees);
  return {
    id: m.id, full_name: m.full_name, first_name: m.full_name.split(' ')[0], photo_path: m.photo_path, tier: m.tier, stage: m.stage, city: m.city,
    languages: m.languages, domains: m.domains, programs: m.programs, headline: m.headline, bio: m.bio, wish_i_knew: m.wish_i_knew,
    did_it: m.did_it, it_company: m.it_company, it_domain: m.it_domain, it_duration_months: m.it_duration_months, it_start: m.it_start,
    articleship_firm: m.articleship_firm, articleship_firm_type: m.articleship_firm_type, articleship_domain: m.articleship_domain, articleship_city: m.articleship_city,
    final_attempt: m.final_attempt, qualified_on: m.qualified_on, employer: m.employer, role_title: m.role_title, experience_years: m.experience_years,
    companies_known: m.companies_known, call_slots: m.call_slots, topmate_url: m.topmate_url, linkedin_url: m.show_linkedin ? m.linkedin_url : null,
    linkedin_checked: m.linkedin_checked, topmate_checked: m.topmate_checked, rating_avg: m.rating_avg, review_count: m.review_count,
    mentees_total: m.mentees_total, max_mentees: m.max_mentees, active_mentees: m.active_mentees, slots_left: slots,
    accepting: m.accepting && m.status === 'approved', available: m.accepting && slots > 0 && m.status === 'approved', approved_at: m.approved_at,
  };
};
/** Matched-mentee view of a mentor: WhatsApp and email (the mobile number is staff-only). */
const contact = (m, i) => ({ ...pub(m), whatsapp: `98765000${String(10 + i).padStart(2, '0')}`, email: `${m.full_name.split(' ')[0].toLowerCase()}@example.com` });

const REVIEWS = [
  { id: uid(501), rating: 5, tags: ['always_reachable', 'great_mock'], body: 'Ananya di took three mock interviews with me and responded to every message within an hour. I felt ready on the real day.', author: 'Pooja N.', program: 'industrial-training', created_at: ago(40) },
  { id: uid(502), rating: 5, tags: ['kept_me_going', 'practical_advice'], body: 'When I had 0 shortlists after a month she sat with my application list and fixed it. Offer came in week 9.', author: 'Harsh K.', program: 'industrial-training', created_at: ago(70) },
  { id: uid(503), rating: 4, tags: ['great_cv_help'], body: '', author: 'Simran B.', program: 'industrial-training', created_at: ago(95) },
];

/* ---- student side ---------------------------------------------------------- */
const STUDENTS = {
  [USERS.student.id]: { full_name: 'Riya Sharma', whatsapp: '9876500101', city: 'jaipur', email: USERS.student.email },
  [USERS.unmatched.id]: { full_name: 'Aman Gupta', whatsapp: '9876500102', city: 'delhi_ncr', email: USERS.unmatched.email },
};
const MATCHES = [
  { match_id: uid(701), program: 'industrial-training', status: 'active', mentor_id: uid(11), mentee_user_id: USERS.student.id, started_at: ago(16), fee_inr: 500, payout_status: 'unpaid' },
];
const PULSES = [
  { id: uid(801), match_id: uid(701), week_start: istWeekStart(ago(9)), applications_count: 6, hunt_stage: 'applying', mentor_called: true, rating: 5, issue: '', created_at: ago(9) },
];
let SWITCHES = [];
let MY_REVIEWS = [];

function matchForStudent(m) {
  const mi = MENTORS.findIndex((x) => x.id === m.mentor_id);
  const thisWeek = istWeekStart();
  const pulse = PULSES.find((p) => p.match_id === m.match_id && p.week_start === thisWeek) || null;
  const lastPulse = PULSES.filter((p) => p.match_id === m.match_id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const eligibleAt = new Date(Date.parse(m.started_at) + 28 * 86400000).toISOString();
  const sw = SWITCHES.find((s) => s.match_id === m.match_id) || null;
  const own = MENTEES.find((x) => x.match_id === m.match_id);
  return {
    match_id: m.match_id, program: m.program, status: m.status, started_at: m.started_at, ended_at: m.ended_at ?? null,
    week_no: weekNumber(m.started_at), days_active: daysSince(m.started_at),
    // Contact details only while the match is active.
    mentor: m.status === 'active' ? contact(MENTORS[mi], mi) : pub(MENTORS[mi]),
    // Done dates only (never the mentor's notes).
    checklist: Object.fromEntries(Object.entries(own?.checklist || {}).map(([k, v]) => [k, { done_at: v.done_at }])),
    pulse_this_week: pulse, pulses_count: PULSES.filter((p) => p.match_id === m.match_id).length, last_pulse_at: lastPulse?.created_at || null,
    review: MY_REVIEWS.find((r) => r.match_id === m.match_id) || null,
    review_eligible_at: eligibleAt, can_review: Date.now() >= Date.parse(eligibleAt),
    switch_request: sw, switch_available: !sw,
  };
}

/* ---- mentor side ----------------------------------------------------------- */
const checklist = (items) => Object.fromEntries(items.map(([k, d, note]) => [k, { done_at: ago(d), note: note || '' }]));
const MENTEES = [
  { match_id: uid(701), program: 'industrial-training', status: 'active', started_at: ago(16), ended_at: null,
    mentee: { user_id: USERS.student.id, full_name: 'Riya Sharma', first_name: 'Riya', whatsapp: '9876500101', email: USERS.student.email, city: 'jaipur' },
    checklist: checklist([['intro_sent', 16], ['first_call', 15], ['cv_reviewed', 12], ['resources_shared', 12]]),
    calls: [
      { id: uid(901), week_no: 2, called_on: ago(9).slice(0, 10), hunt_stage: 'applying', applications_count: 6, interviews_count: 0, notes: 'Shortlisted domains: risk advisory and IA. CV v2 done.', created_at: ago(9) },
      { id: uid(902), week_no: 1, called_on: ago(15).slice(0, 10), hunt_stage: 'preparing', applications_count: 0, interviews_count: 0, notes: 'Intro call. Nervous about interviews.', created_at: ago(15) },
    ] },
  { match_id: uid(702), program: 'industrial-training', status: 'active', started_at: ago(2), ended_at: null,
    mentee: { user_id: uid(104), full_name: 'Kabir Singh', first_name: 'Kabir', whatsapp: '9876500104', email: 'kabir.singh@example.com', city: 'chandigarh' },
    checklist: {}, calls: [] },
  { match_id: uid(703), program: 'industrial-training', status: 'active', started_at: ago(41), ended_at: null,
    mentee: { user_id: uid(105), full_name: 'Pooja Nair', first_name: 'Pooja', whatsapp: '9876500105', email: 'pooja.nair@example.com', city: 'kochi' },
    checklist: checklist([['intro_sent', 41], ['first_call', 40], ['cv_reviewed', 35], ['resources_shared', 38], ['mock_interview', 20]]),
    calls: [{ id: uid(903), week_no: 5, called_on: ago(9).slice(0, 10), hunt_stage: 'interviewing', applications_count: 4, interviews_count: 2, notes: 'Two interviews next week.', created_at: ago(9) }] },
];
function menteeView(x) {
  const last = x.calls[0];
  const active = x.status === 'active';
  const flags = [];
  // Same rules as SQL mentorship_mentee_card: no WhatsApp on file replaces the late-intro flag.
  if (active && !x.mentee?.whatsapp) flags.push('mentee_no_contact');
  else if (active && !x.checklist.intro_sent && daysSince(x.started_at) >= 1) flags.push('intro_late');
  if (active && (last ? daysSince(last.called_on) : daysSince(x.started_at)) >= 8) flags.push('no_call_8d');
  return { ...x,
    mentee: active ? x.mentee : { user_id: x.mentee.user_id, full_name: x.mentee.full_name, first_name: x.mentee.first_name },
    calls: x.calls.slice(0, 12), calls_total: x.calls.length,
    week_no: weekNumber(x.started_at), days_active: daysSince(x.started_at), last_call_on: last?.called_on || null,
    days_since_call: last ? daysSince(last.called_on) : null, latest_stage: last?.hunt_stage || null, latest_applications: last?.applications_count ?? null, flags };
}

const fullMentorRow = (overrides = {}) => ({
  ...MENTORS[0], email: USERS.mentor.email, mobile: '9876500010', whatsapp: '9876500010', linkedin_url: 'https://www.linkedin.com/in/example-ananya',
  icai_number: 'WRO0000000', scores: { foundation: { marks: 262, out_of: 400, attempts: 1 }, inter: { marks: 431, out_of: 800, attempts: 1 }, final: null, rank_note: '' },
  cv_path: `${uid(1)}/cv-1.pdf`, why_mentor: 'Someone helped me when I had five rejections in a row. I want to do that for the next batch.',
  scenario_answer: 'Hey, six rejections hurt, I have been there. Do not drop IT yet. Send me your CV and the list of places you applied tonight, we will fix both this week. Most openings come late. Call tomorrow at 8?',
  mentoring_experience: 'few_times', conflicts: ['none'], conflicts_note: '', heard_from: 'msc_student',
  consents: Object.fromEntries(REQUIRED_CONSENTS.map((k) => [k, ago(130)])), training: { lecture_at: ago(128), playbook_at: ago(128) },
  quiz_passed_at: ago(127), quiz_best_pct: 92, quiz_attempts: 1, quiz_last_at: ago(127),
  staff_note: '', senior_mentor_id: uid(950), submitted_at: ago(130), status_changed_at: ago(120), rejected_at: null, reject_reason: null, reapply_after: null,
  paused_at: null, pause_reason: null, created_at: ago(131), updated_at: ago(3), ...overrides,
});
const DRAFT = fullMentorRow({
  id: uid(21), user_id: USERS.applicant.id, status: 'draft', full_name: 'Vikram Rao', email: USERS.applicant.email, mobile: '', whatsapp: '', city: 'bengaluru',
  photo_path: '', stage: 'final_it_done', it_company: '', it_domain: null, it_duration_months: null, headline: '', bio: '', wish_i_knew: '', domains: [], cv_path: null,
  why_mentor: '', scenario_answer: '', consents: {}, training: {}, quiz_passed_at: null, quiz_best_pct: null, quiz_attempts: 0, quiz_last_at: null,
  linkedin_checked: false, topmate_checked: false, rating_avg: null, review_count: 0, mentees_total: 0, active_mentees: 0, approved_at: null, submitted_at: null,
  scores: {}, conflicts: [], mentoring_experience: null,
});
const TRAINEE = fullMentorRow({
  id: uid(22), user_id: USERS.trainee.id, status: 'submitted', full_name: 'Meera Joshi', email: USERS.trainee.email, training: {}, quiz_passed_at: null,
  quiz_best_pct: null, quiz_attempts: 0, quiz_last_at: null, rating_avg: null, review_count: 0, mentees_total: 0, active_mentees: 0, approved_at: null,
});
let OWN = role === 'mentor' ? fullMentorRow() : role === 'applicant' ? DRAFT : role === 'trainee' ? TRAINEE : null;

const MOCK_QUIZ = [
  { id: 'mock1', position: 1, prompt: '(Mock question) A new mentee is matched with you at 9 pm. What do you do?', options: [{ key: 'a', text: 'Wait for them to message first' }, { key: 'b', text: 'Send the intro message within 24 hours' }, { key: 'c', text: 'Email Team MSC' }, { key: 'd', text: 'Nothing until the weekly call' }] },
  { id: 'mock2', position: 2, prompt: '(Mock question) A mentee asks you to promise a placement. You:', options: [{ key: 'a', text: 'Promise it to motivate them' }, { key: 'b', text: 'Ignore the question' }, { key: 'c', text: 'Explain nobody can promise it, and you will stay with them every step' }, { key: 'd', text: 'Say "probably yes"' }] },
  { id: 'mock3', position: 3, prompt: '(Mock question) You do not know the answer to a technical question. You:', options: [{ key: 'a', text: 'Guess confidently' }, { key: 'b', text: 'Tell them to Google it' }, { key: 'c', text: 'Ignore it' }, { key: 'd', text: 'Check the resources and ask your senior mentor, then respond by a set time' }] },
];
const MOCK_KEY = { mock1: 'b', mock2: 'c', mock3: 'd' };

/*
 * Preview cases for states that the fixtures above do not show (localhost only):
 *   ?mock_case=no_whatsapp  the student has no WhatsApp yet (admin-assigned); the mentor's mentee Kabir too
 *   ?mock_case=completed    the student's mentorship is complete (no self-booking)
 *   ?mock_case=ended        Team MSC ended the student's mentorship early
 */
const MOCK_CASE = (() => { try { return new URLSearchParams(globalThis.location?.search || '').get('mock_case') || ''; } catch { return ''; } })();
if (MOCK_CASE === 'no_whatsapp') {
  STUDENTS[USERS.student.id].whatsapp = null;
  MENTEES[1].mentee = { ...MENTEES[1].mentee, whatsapp: null };
}
if (MOCK_CASE === 'completed' || MOCK_CASE === 'ended') {
  Object.assign(MATCHES[0], { status: MOCK_CASE, ended_at: ago(2) });
  MENTEES[0].status = MOCK_CASE;
}

/* ---- admin ----------------------------------------------------------------- */
const RED_FLAGS = [
  { kind: 'intro_late', severity: 'high', match_id: uid(702), mentor_id: uid(11), mentor_name: 'Ananya Iyer', mentee_user_id: uid(104), mentee_name: 'Kabir Singh', program: 'industrial-training', detail: 'Matched 2 days ago, intro not marked sent.', since: ago(1) },
  { kind: 'no_call_8d', severity: 'medium', match_id: uid(703), mentor_id: uid(11), mentor_name: 'Ananya Iyer', mentee_user_id: uid(105), mentee_name: 'Pooja Nair', program: 'industrial-training', detail: 'Last call logged 9 days ago (week 5).', since: ago(1) },
  { kind: 'low_rating', severity: 'high', match_id: uid(704), mentor_id: uid(12), mentor_name: 'Rohit Agarwal', mentee_user_id: uid(106), mentee_name: 'Ishaan Verma', program: 'industrial-training', detail: 'Pulse rating 2/5 this week: "Mentor responds after 2 days".', since: ago(2) },
  { kind: 'unmatched', severity: 'medium', match_id: null, mentor_id: null, mentor_name: null, mentee_user_id: USERS.unmatched.id, mentee_name: 'Aman Gupta', program: 'industrial-training', detail: 'Enrolled 5 days ago, no mentor yet.', since: ago(5) },
];
const adminMatch = (x, mentor) => ({
  match_id: x.match_id, program: x.program, status: x.status, started_at: x.started_at, ended_at: null, week_no: weekNumber(x.started_at), source: 'self',
  mentor: { id: mentor.id, full_name: mentor.full_name, whatsapp: '9876500010', email: `${mentor.full_name.split(' ')[0].toLowerCase()}@example.com` },
  mentee: x.mentee, checklist_done: Object.keys(x.checklist).length, checklist_total: CHECKLIST_ITEMS.length,
  last_call_on: x.calls[0]?.called_on || null, days_since_call: x.calls[0] ? daysSince(x.calls[0].called_on) : null, latest_stage: x.calls[0]?.hunt_stage || null,
  last_pulse: x.match_id === uid(701) ? { rating: 5, mentor_called: true, applications_count: 6, issue: '', created_at: ago(9) } : null,
  review: null, fee_inr: 500, payout_status: x.match_id === uid(703) ? 'due' : 'unpaid', paid_at: null, payout_ref: null,
});
let CONFIG_ROWS = [
  { key: 'mentor_fee_inr', value: 500, is_public: true, note: 'Rs per mentee per batch' },
  { key: 'lecture_video_url', value: '', is_public: true, note: 'Empty = "lecture coming soon"' },
  { key: 'padam_gpt_url', value: '', is_public: true, note: 'Empty = "coming soon"' },
  { key: 'links_url', value: 'https://www.mystudentclub.com/links', is_public: true, note: '' },
  { key: 'escalation_contact', value: { name: 'Team My Student Club', whatsapp: '', email: '' }, is_public: false, note: 'Fallback when no senior mentor is assigned' },
  { key: 'programs_enabled', value: ['industrial-training'], is_public: true, note: '' },
  { key: 'quiz_pass_pct', value: 80, is_public: true, note: '' },
  { key: 'quiz_cooldown_hours', value: 24, is_public: true, note: '' },
  { key: 'review_after_days', value: 28, is_public: true, note: '' },
  { key: 'max_mentees_cap', value: 10, is_public: true, note: '' },
  { key: 'min_reviews_for_rating', value: 3, is_public: true, note: '' },
  { key: 'switch_limit', value: 1, is_public: true, note: '' },
  { key: 'unmatched_after_days', value: 2, is_public: false, note: 'Red flag threshold' },
];
const configObj = () => Object.fromEntries(CONFIG_ROWS.filter((r) => r.is_public).map((r) => [r.key, r.value]));

/* ---- handlers -------------------------------------------------------------- */
const need = (cond, code) => { if (!cond) throw new MsError(code); };
const myMatches = () => MATCHES.filter((m) => m.mentee_user_id === me?.id);

registerMocks({
  __profile_prefill: () => (me ? { name: me.name, phone: role === 'guest' ? '' : '9876500199', city: 'Jaipur' } : {}),

  mentorship_get_config: () => configObj(),

  mentorship_whoami: () => {
    need(me, 'not_logged_in');
    return {
      user_id: me.id, email: me.email, name: me.name,
      staff_role: role === 'admin' ? 'admin' : null,
      mentor: OWN ? { id: OWN.id, status: OWN.status, tier: OWN.tier, full_name: OWN.full_name, photo_path: OWN.photo_path, quiz_passed_at: OWN.quiz_passed_at, accepting: OWN.accepting } : null,
      student: STUDENTS[me.id] || null,
      enrolled_programs: ['student', 'unmatched', 'admin'].includes(role) ? ['industrial-training'] : [],
      active_matches: myMatches().filter((m) => m.status === 'active').map((m) => ({ match_id: m.match_id, program: m.program, mentor_id: m.mentor_id })),
      closed_matches: myMatches().filter((m) => ['completed', 'ended'].includes(m.status) && !myMatches().some((x) => x.program === m.program && x.status === 'active'))
        .map((m) => ({ match_id: m.match_id, program: m.program, status: m.status, mentor_id: m.mentor_id })),
    };
  },

  /* student */
  mentorship_list_mentors: ({ p_program = 'industrial-training' }) => MENTORS.filter((m) => m.status === 'approved' && m.programs.includes(p_program)).map(pub),
  mentorship_mentor_public: ({ p_mentor_id }) => {
    const m = MENTORS.find((x) => x.id === p_mentor_id);
    need(m, 'not_found');
    const reviews = m.id === uid(11) ? REVIEWS : [];
    const tag_counts = {};
    reviews.forEach((r) => r.tags.forEach((t) => { tag_counts[t] = (tag_counts[t] || 0) + 1; }));
    return { mentor: pub(m), reviews, tag_counts };
  },
  mentorship_save_student: ({ p_full_name, p_whatsapp, p_city }) => {
    need(me, 'not_logged_in');
    need(String(p_whatsapp || '').replace(/\D/g, '').length >= 10, 'invalid_input');
    STUDENTS[me.id] = { full_name: p_full_name, whatsapp: p_whatsapp, city: p_city || null, email: me.email };
    return STUDENTS[me.id];
  },
  mentorship_book: ({ p_mentor_id, p_program }) => {
    need(me, 'not_logged_in');
    need(['student', 'unmatched', 'admin'].includes(role), 'not_enrolled');
    need(STUDENTS[me.id]?.whatsapp, 'student_profile_missing');
    need(!myMatches().some((m) => m.program === p_program && m.status === 'active'), 'already_matched');
    need(!myMatches().some((m) => m.program === p_program && m.status === 'completed'), 'mentorship_completed');
    need(!myMatches().some((m) => m.program === p_program && m.status === 'ended'), 'mentorship_ended');
    const m = MENTORS.find((x) => x.id === p_mentor_id);
    need(m && m.status === 'approved' && m.accepting, 'mentor_unavailable');
    need(m.active_mentees < m.max_mentees, 'mentor_full');
    m.active_mentees += 1;
    const row = { match_id: crypto.randomUUID(), program: p_program, status: 'active', mentor_id: m.id, mentee_user_id: me.id, started_at: new Date().toISOString(), fee_inr: 500, payout_status: 'unpaid' };
    MATCHES.push(row);
    return matchForStudent(row);
  },
  mentorship_my_match: ({ p_program = null }) => {
    need(me, 'not_logged_in');
    return { student: STUDENTS[me.id] || null, matches: myMatches().filter((m) => !p_program || m.program === p_program).map(matchForStudent) };
  },
  mentorship_submit_pulse: ({ p_match_id, p_applications, p_stage, p_mentor_called, p_rating, p_issue = null }) => {
    need(myMatches().some((m) => m.match_id === p_match_id && m.status === 'active'), 'match_not_active');
    need(p_rating >= 1 && p_rating <= 5 && p_applications >= 0, 'invalid_input');
    const week_start = istWeekStart();
    const existing = PULSES.find((p) => p.match_id === p_match_id && p.week_start === week_start);
    const row = { id: existing?.id || crypto.randomUUID(), match_id: p_match_id, week_start, applications_count: p_applications, hunt_stage: p_stage, mentor_called: !!p_mentor_called, rating: p_rating, issue: p_issue || '', created_at: new Date().toISOString() };
    if (existing) Object.assign(existing, row); else PULSES.push(row);
    return row;
  },
  mentorship_submit_review: ({ p_match_id, p_rating, p_tags = [], p_body = '', p_safety_flag = false, p_private_note = null }) => {
    const m = myMatches().find((x) => x.match_id === p_match_id);
    need(m, 'not_found');
    need(Date.now() - Date.parse(m.started_at) >= 28 * 86400000, 'review_too_early');
    const row = { id: crypto.randomUUID(), match_id: p_match_id, rating: p_rating, tags: p_tags, body: p_body, safety_flag: !!p_safety_flag, private_note: p_private_note, published: true, created_at: new Date().toISOString() };
    MY_REVIEWS = MY_REVIEWS.filter((r) => r.match_id !== p_match_id).concat(row);
    return row;
  },
  mentorship_request_switch: ({ p_match_id, p_reason }) => {
    need(myMatches().some((m) => m.match_id === p_match_id && m.status === 'active'), 'match_not_active');
    need(!SWITCHES.length, 'switch_used');
    const row = { id: crypto.randomUUID(), match_id: p_match_id, status: 'pending', reason: p_reason, created_at: new Date().toISOString(), resolution_note: null, resolved_at: null };
    SWITCHES.push(row);
    return row;
  },

  /* mentor */
  mentorship_my_mentor: () => {
    need(OWN, 'not_found');
    const rows = MENTEES.map((x) => ({ match_id: x.match_id, mentee_name: x.mentee.full_name, program: x.program, status: x.status, started_at: x.started_at, fee_inr: 500, payout_status: x.match_id === uid(703) ? 'due' : 'unpaid', paid_at: null, payout_ref: null }))
      .concat([{ match_id: uid(799), mentee_name: 'Harsh Kapoor', program: 'industrial-training', status: 'completed', started_at: ago(160), fee_inr: 500, payout_status: 'paid', paid_at: ago(60), payout_ref: 'UPI 6021' }]);
    const active = OWN.status === 'approved' ? MENTEES.length : 0;
    const sum = (s) => rows.filter((r) => r.payout_status === s).reduce((a, r) => a + r.fee_inr, 0);
    const lastFail = OWN.quiz_attempts && !OWN.quiz_passed_at ? OWN.quiz_last_at : null;
    return {
      mentor: OWN, active_count: active, slots_left: Math.max(0, OWN.max_mentees - active),
      earnings: { fee_inr: 500, active_count: active, active_value_inr: active * 500, unpaid_inr: sum('unpaid'), due_inr: sum('due'), paid_inr: sum('paid'), rows: OWN.status === 'approved' ? rows : [] },
      escalation: { name: 'Nikhil Bansal (senior mentor)', whatsapp: '9876500950', email: 'senior.mentor@example.com', role: 'senior_mentor' },
      quiz: { attempts: OWN.quiz_attempts, best_pct: OWN.quiz_best_pct, passed_at: OWN.quiz_passed_at, last_attempt_at: OWN.quiz_last_at, pass_pct: 80, cooldown_hours: 24,
        next_attempt_at: lastFail ? new Date(Date.parse(lastFail) + 24 * 3600000).toISOString() : null },
      consents_missing: REQUIRED_CONSENTS.filter((k) => !OWN.consents?.[k]),
    };
  },
  mentorship_save_mentor: ({ p_patch = {} }) => {
    need(me, 'not_logged_in');
    if (!OWN) { OWN = { ...DRAFT, id: crypto.randomUUID(), user_id: me.id, email: me.email, full_name: me.name }; }
    // Same rules as SQL mentorship_save_mentor: status-based allow-list, consents merged and
    // server-stamped, max_mentees never below the active count, a changed link loses its tick.
    const PROFILE = ['photo_path', 'cv_path', 'headline', 'bio', 'wish_i_knew', 'languages', 'city', 'mobile', 'whatsapp', 'linkedin_url', 'show_linkedin',
      'topmate_url', 'domains', 'companies_known', 'call_slots', 'weekly_hours', 'programs', 'accepting', 'max_mentees'];
    const locked = ['id', 'user_id', 'status', 'tier', 'email', 'quiz_passed_at', 'linkedin_checked', 'topmate_checked', 'rating_avg', 'review_count', 'approved_at'];
    const open = ['draft', 'rejected'].includes(OWN.status);
    const active = OWN.status === 'approved' ? MENTEES.filter((x) => x.status === 'active').length : 0;
    if ('max_mentees' in p_patch && p_patch.max_mentees !== null && Number(p_patch.max_mentees) < active) {
      throw new MsError('invalid_input', undefined, { hint: 'max_mentees_below_active' });
    }
    Object.entries(p_patch).forEach(([k, v]) => {
      if (locked.includes(k) || (!open && !PROFILE.includes(k))) return;
      if (k === 'consents') {
        OWN.consents = { ...(OWN.consents || {}) };
        Object.entries(v || {}).forEach(([ck, cv]) => { if (cv === true) OWN.consents[ck] ??= new Date().toISOString(); else delete OWN.consents[ck]; });
        return;
      }
      if (k === 'linkedin_url' && v !== OWN.linkedin_url) OWN.linkedin_checked = false;
      if (k === 'topmate_url' && v !== OWN.topmate_url) OWN.topmate_checked = false;
      OWN[k] = v;
    });
    OWN.updated_at = new Date().toISOString();
    return OWN;
  },
  mentorship_submit_application: () => {
    need(OWN, 'not_found');
    const missing = ['full_name', 'mobile', 'whatsapp', 'city', 'photo_path', 'linkedin_url', 'stage', 'headline', 'bio', 'cv_path', 'why_mentor', 'scenario_answer']
      .filter((k) => !OWN[k]).concat(!OWN.domains?.length ? ['domains'] : []).concat(REQUIRED_CONSENTS.filter((k) => !OWN.consents?.[k]).map((k) => `consents.${k}`));
    if (missing.length) return { ok: false, status: OWN.status, missing };
    if (['submitted', 'training_passed', 'approved', 'paused'].includes(OWN.status)) return { ok: true, status: OWN.status, missing: [] };
    OWN.status = OWN.quiz_passed_at ? 'training_passed' : 'submitted'; OWN.submitted_at = new Date().toISOString();
    return { ok: true, status: OWN.status, missing: [] };
  },
  mentorship_mark_training: ({ p_step }) => {
    need(OWN && OWN.status !== 'draft', 'quiz_locked');
    need(['lecture', 'playbook'].includes(p_step), 'invalid_input');
    OWN.training = { ...(OWN.training || {}), [`${p_step}_at`]: new Date().toISOString() };
    return { training: OWN.training };
  },
  mentorship_quiz_questions: () => {
    need(OWN && OWN.status !== 'draft', 'quiz_locked');
    const lastFail = OWN.quiz_attempts && !OWN.quiz_passed_at ? OWN.quiz_last_at : null;
    return { questions: MOCK_QUIZ, pass_pct: 80, cooldown_hours: 24, attempts: OWN.quiz_attempts, passed_at: OWN.quiz_passed_at,
      next_attempt_at: lastFail && Date.now() - Date.parse(lastFail) < 86400000 ? new Date(Date.parse(lastFail) + 86400000).toISOString() : null };
  },
  mentorship_submit_quiz: ({ p_answers = {} }) => {
    need(OWN && OWN.status !== 'draft', 'quiz_locked');
    need(!OWN.quiz_passed_at, 'already_passed');
    if (OWN.quiz_last_at && Date.now() - Date.parse(OWN.quiz_last_at) < 86400000) {
      throw new MsError('quiz_cooldown', undefined, { hint: new Date(Date.parse(OWN.quiz_last_at) + 86400000).toISOString() });
    }
    const total = MOCK_QUIZ.length;
    const wrong = MOCK_QUIZ.filter((q) => p_answers[q.id] !== MOCK_KEY[q.id]).map((q) => q.id);
    const correct = total - wrong.length;
    const score = Math.round((correct * 100) / total);
    const passed = correct * 100 >= 80 * total;
    OWN.quiz_attempts += 1; OWN.quiz_last_at = new Date().toISOString(); OWN.quiz_best_pct = Math.max(OWN.quiz_best_pct || 0, score);
    if (passed) { OWN.quiz_passed_at = OWN.quiz_last_at; if (OWN.status === 'submitted') OWN.status = 'training_passed'; }
    return { score_pct: score, correct, total, passed, wrong_ids: wrong,
      explanations: passed ? { mock1: 'Intro within 24 hours sets the tone.', mock2: 'Never promise placement.', mock3: 'Never guess; escalate.' } : {},
      next_attempt_at: passed ? null : new Date(Date.now() + 86400000).toISOString(), status: OWN.status };
  },
  mentorship_my_mentees: ({ p_include_closed = false }) => {
    need(OWN && ['approved', 'paused'].includes(OWN.status), 'forbidden');
    return MENTEES.filter((x) => p_include_closed || x.status === 'active').map(menteeView);
  },
  mentorship_set_checklist: ({ p_match_id, p_item, p_done, p_note = null }) => {
    const x = MENTEES.find((m) => m.match_id === p_match_id);
    need(x, 'not_found');
    need(CHECKLIST_ITEMS.some((c) => c.key === p_item), 'invalid_input');
    if (p_done) x.checklist[p_item] = { done_at: new Date().toISOString(), note: p_note || '' }; else delete x.checklist[p_item];
    return { match_id: p_match_id, checklist: x.checklist };
  },
  mentorship_log_call: ({ p_match_id, p_week_no, p_called_on, p_stage, p_applications, p_interviews = 0, p_notes = null }) => {
    const x = MENTEES.find((m) => m.match_id === p_match_id);
    need(x, 'not_found');
    need(p_week_no >= 1 && p_week_no <= 60 && p_applications >= 0, 'invalid_input');
    const row = { id: crypto.randomUUID(), match_id: p_match_id, week_no: p_week_no, called_on: p_called_on, hunt_stage: p_stage, applications_count: p_applications, interviews_count: p_interviews, notes: p_notes || '', created_at: new Date().toISOString() };
    x.calls = [row, ...x.calls.filter((c) => c.week_no !== p_week_no)].sort((a, b) => b.week_no - a.week_no);
    return row;
  },

  /* staff */
  mentorship_admin_overview: () => {
    need(role === 'admin', 'forbidden');
    return { counts: { mentors: { draft: 4, submitted: 3, training_passed: 2, approved: MENTORS.length, rejected: 1, paused: 0 }, active_matches: 17,
      matches_by_program: { 'industrial-training': 17 }, unmatched: 1, red_flags: { high: 2, medium: 2 }, switch_pending: SWITCHES.filter((s) => s.status === 'pending').length,
      payouts: { unpaid_inr: 7000, due_inr: 1500, paid_inr: 9500, due_count: 3 } }, generated_at: new Date().toISOString() };
  },
  mentorship_admin_red_flags: () => { need(role === 'admin', 'forbidden'); return RED_FLAGS; },
  mentorship_admin_mentors: ({ p_status = null }) => {
    need(role === 'admin', 'forbidden');
    const rows = [fullMentorRow(), DRAFT, TRAINEE, ...MENTORS.slice(1).map((m) => fullMentorRow({ ...m }))];
    return rows.filter((r) => !p_status || r.status === p_status).map((r) => ({ ...r, active_count: r.active_mentees || 0, senior_mentor_name: 'Nikhil Bansal' }));
  },
  mentorship_admin_mentor_detail: ({ p_mentor_id }) => {
    need(role === 'admin', 'forbidden');
    const m = [fullMentorRow(), DRAFT, TRAINEE].find((r) => r.id === p_mentor_id) || fullMentorRow({ ...MENTORS.find((x) => x.id === p_mentor_id) });
    return { mentor: m, active_count: m.active_mentees || 0,
      quiz_attempts: m.quiz_attempts ? [{ id: uid(601), score_pct: m.quiz_best_pct, correct: 11, total: 12, passed: !!m.quiz_passed_at, created_at: m.quiz_last_at }] : [],
      matches: m.id === uid(11) ? MENTEES.map((x) => adminMatch(x, m)) : [],
      reviews: m.id === uid(11) ? REVIEWS.map((r) => ({ ...r, mentor_id: m.id, mentor_name: m.full_name, mentee_name: r.author, safety_flag: false, private_note: '', published: true })) : [],
      events: [{ id: 1, kind: 'status_changed', actor_name: 'Team MSC Admin', detail: { from: 'training_passed', to: 'approved' }, created_at: m.approved_at || ago(1) }] };
  },
  mentorship_admin_matches: ({ p_status = 'active' }) => { need(role === 'admin', 'forbidden'); return MENTEES.filter((x) => !p_status || x.status === p_status).map((x) => adminMatch(x, MENTORS[0])); },
  mentorship_admin_unmatched: () => { need(role === 'admin', 'forbidden'); return [{ user_id: USERS.unmatched.id, email: USERS.unmatched.email, name: 'Aman Gupta', whatsapp: '9876500102', city: 'delhi_ncr', enrolled_at: ago(5), batch: 'Oct 2026', days_waiting: 5, has_student_row: true }]; },
  mentorship_admin_switch_requests: () => { need(role === 'admin', 'forbidden'); return [{ id: uid(651), match_id: uid(704), program: 'industrial-training', status: 'pending', reason: 'Mentor responds after 2 days and missed two weekly calls.', created_at: ago(1), mentee: { user_id: uid(106), full_name: 'Ishaan Verma', whatsapp: '9876500106' }, mentor: { id: uid(12), full_name: 'Rohit Agarwal' }, resolution_note: null, resolved_at: null }]; },
  mentorship_admin_reviews: () => { need(role === 'admin', 'forbidden'); return REVIEWS.map((r) => ({ ...r, match_id: uid(799), mentor_id: uid(11), mentor_name: 'Ananya Iyer', mentee_name: r.author, safety_flag: false, private_note: '', published: true })); },
  mentorship_admin_staff: () => { need(role === 'admin', 'forbidden'); return [{ user_id: uid(900), email: USERS.admin.email, name: 'Team MSC Admin', role: 'admin', whatsapp: '', active: true, created_at: ago(30) }, { user_id: uid(950), email: 'senior.mentor@example.com', name: 'Nikhil Bansal', role: 'senior_mentor', whatsapp: '9876500950', active: true, created_at: ago(25) }]; },
  mentorship_admin_get_config: () => { need(role === 'admin', 'forbidden'); return CONFIG_ROWS.map((r) => ({ ...r, updated_at: ago(3) })); },
  mentorship_admin_set_config: ({ p_key, p_value }) => {
    need(role === 'admin', 'forbidden');
    const r = CONFIG_ROWS.find((x) => x.key === p_key);
    if (r) r.value = p_value; else CONFIG_ROWS.push({ key: p_key, value: p_value, is_public: false, note: '' });
    return { key: p_key, value: p_value };
  },
  mentorship_admin_set_status: ({ p_mentor_id, p_status, p_reason = null }) => { need(role === 'admin', 'forbidden'); return { ...fullMentorRow({ id: p_mentor_id }), status: p_status, reject_reason: p_status === 'rejected' ? p_reason : null, pause_reason: p_status === 'paused' ? p_reason : null }; },
  mentorship_admin_update_mentor: ({ p_mentor_id, p_patch = {} }) => { need(role === 'admin', 'forbidden'); return { ...fullMentorRow({ id: p_mentor_id }), ...p_patch }; },
  mentorship_admin_create_match: ({ p_mentee_user_id, p_mentor_id, p_program }) => {
    need(role === 'admin', 'forbidden');
    const mentor = MENTORS.find((m) => m.id === p_mentor_id) || MENTORS[0];
    return { ...adminMatch({ match_id: crypto.randomUUID(), program: p_program, status: 'active', started_at: new Date().toISOString(), checklist: {}, calls: [],
      mentee: { user_id: p_mentee_user_id, full_name: 'Aman Gupta', first_name: 'Aman', whatsapp: '9876500102', email: USERS.unmatched.email, city: 'delhi_ncr' } }, mentor), source: 'admin' };
  },
  mentorship_admin_reassign: ({ p_match_id, p_new_mentor_id }) => {
    need(role === 'admin', 'forbidden');
    const old = MENTEES.find((x) => x.match_id === p_match_id) || MENTEES[0];
    const mentor = MENTORS.find((m) => m.id === p_new_mentor_id) || MENTORS[1];
    return { ...adminMatch({ ...old, match_id: crypto.randomUUID(), started_at: new Date().toISOString(), checklist: {}, calls: [] }, mentor), source: 'switch' };
  },
  mentorship_admin_end_match: ({ p_match_id, p_status }) => {
    need(role === 'admin', 'forbidden');
    need(['completed', 'ended'].includes(p_status), 'invalid_input');
    const x = MENTEES.find((m) => m.match_id === p_match_id) || MENTEES[0];
    return { ...adminMatch(x, MENTORS[0]), status: p_status, ended_at: new Date().toISOString() };
  },
  mentorship_admin_resolve_switch: ({ p_request_id, p_approve, p_new_mentor_id = null, p_note = null }) => {
    need(role === 'admin', 'forbidden');
    need(!p_approve || p_new_mentor_id, 'invalid_input');
    return { id: p_request_id, match_id: uid(704), program: 'industrial-training', status: p_approve ? 'approved' : 'declined', reason: 'Mentor responds after 2 days and missed two weekly calls.',
      created_at: ago(1), resolution_note: p_note, resolved_at: new Date().toISOString(), new_match_id: p_approve ? crypto.randomUUID() : null };
  },
  mentorship_admin_set_payout: ({ p_match_ids = [] }) => { need(role === 'admin', 'forbidden'); return p_match_ids.length; },
  mentorship_admin_set_review: ({ p_review_id, p_published }) => { need(role === 'admin', 'forbidden'); return { id: p_review_id, published: !!p_published }; },
  mentorship_admin_upsert_staff: ({ p_email, p_role, p_name = null, p_whatsapp = null, p_active = true }) => { need(role === 'admin', 'forbidden'); return { user_id: crypto.randomUUID(), email: p_email, role: p_role, name: p_name, whatsapp: p_whatsapp, active: p_active, created_at: new Date().toISOString() }; },
});
