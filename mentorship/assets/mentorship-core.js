/* =============================================================================
   MSC Mentorship core (ES module). Owner: architect. Builders import, never edit.

   Import with this EXACT specifier on every page (a different ?v= would load a
   second copy of the module with separate state):
     import { initPage, rpc, toast, html } from '/mentorship/assets/mentorship-core.js?v=1';

   The page must load the site's classic scripts first, in <head>:
     <script src="/scripts/supabase.js"></script>
     <script src="/scripts/supabase-init.js"></script>

   Sections: 1 config/constants · 2 client+auth · 3 context/config/enrollment ·
   4 rpc+errors · 5 storage · 6 text/format helpers · 7 UI helpers · 8 shell ·
   9 mock mode (localhost only)
   ========================================================================== */

export const CORE_VERSION = '1';
export const SITE_ORIGIN = 'https://www.mystudentclub.com';
export const SUPABASE_URL = 'https://auth.mystudentclub.com';
const AUTH_STORAGE_KEY = 'sb-izsggdtdiacxdsjjncdq-auth-token';
const TZ = 'Asia/Kolkata';

export const PATHS = Object.freeze({
  hub: '/mentorship/',
  apply: '/mentorship/apply/',
  training: '/mentorship/training/',
  mentor: '/mentorship/mentor/',
  find: '/mentorship/find/',
  myMentor: '/mentorship/my-mentor/',
  admin: '/mentorship/admin/',
  login: '/login.html',
  profile: '/profile.html',
  contact: '/contact.html',
  links: '/links/',
});

/* ---------------------------------------------------------------------------
   1. CONSTANTS (mirror these keys exactly in SQL check constraints)
   ------------------------------------------------------------------------ */

/** Programs. `enabled` state comes from config.programs_enabled, not from here. */
export const PROGRAMS = Object.freeze({
  'industrial-training': {
    key: 'industrial-training', label: 'Industrial Training', name: 'MSC Industrial Training Program', short: 'IT',
    priceInr: 2499, page: '/ca-industrial-training-program/',
    courses: ['industrial-training-mastery', 'industrial-training', 'ca-industrial-training', 'msc-industrial-training-program', 'industrial-training-program', 'msc-ca-industrial-training'],
  },
  articleship: {
    key: 'articleship', label: 'Articleship', name: 'MSC Articleship Program', short: 'Articleship',
    priceInr: 1999, page: '/articleship-program/',
    courses: ['msc-articleship-program', 'articleship-excellence'],
  },
  'ca-fresher': {
    key: 'ca-fresher', label: 'CA Freshers', name: 'MSC CA Freshers Program', short: 'Freshers',
    priceInr: 2999, page: '/msc-ca-fresher-program/',
    courses: ['msc-ca-freshers-program', 'ca-freshers', 'freshers', 'ca-freshers-program', 'msc-ca-freshers'],
  },
});
export const PROGRAM_KEYS = Object.freeze(['industrial-training', 'articleship', 'ca-fresher']);

/**
 * Program-specific copy, so pages and templates read right when Articleship or CA Freshers is
 * switched on. openings: "Most {openings} come late"; hunt: "your {hunt}"; findLead: the find
 * page lead; applyHero: the apply page title when only this program is open.
 */
export const PROGRAM_COPY = Object.freeze({
  'industrial-training': {
    openings: 'IT openings', hunt: 'industrial training hunt',
    findLead: 'Seniors who have done industrial training where you want to go.',
    applyHero: 'Help the next batch through their IT hunt',
  },
  articleship: {
    openings: 'articleship openings', hunt: 'articleship hunt',
    findLead: 'Seniors who have done articleship at the kind of firm you want.',
    applyHero: 'Help the next batch find the right articleship',
  },
  'ca-fresher': {
    openings: 'fresher openings', hunt: 'first job hunt',
    findLead: 'Qualified seniors who have been through the CA fresher job hunt.',
    applyHero: 'Help newly qualified CAs through their first job hunt',
  },
});
/** PROGRAM_COPY for a program key (Industrial Training copy for an unknown key). */
export function programCopy(key) { return PROGRAM_COPY[key] || PROGRAM_COPY['industrial-training']; }

/** enrollment.course slug -> program key (same aliases as the LMS course-script.js). */
export const COURSE_TO_PROGRAM = Object.freeze(Object.fromEntries(
  PROGRAM_KEYS.flatMap((p) => PROGRAMS[p].courses.map((c) => [c, p]))
));

/** Mentor's current CA stage. `tier` is derived server-side from the stage. */
export const STAGES = Object.freeze([
  { key: 'final_in_it', label: 'CA Final student, doing industrial training now', short: 'Doing industrial training', tier: 'peer_mentor' },
  { key: 'final_it_done', label: 'CA Final student, completed industrial training', short: 'Completed industrial training', tier: 'peer_mentor' },
  { key: 'final_articleship_done', label: 'CA Final student, completed articleship (no industrial training)', short: 'Completed articleship', tier: 'peer_mentor' },
  { key: 'in_articleship', label: 'CA student, still in articleship', short: 'In articleship', tier: 'peer_mentor' },
  { key: 'qualified_fresher', label: 'Qualified CA, fresher (up to 1 year)', short: 'Qualified CA fresher', tier: 'ca_mentor' },
  { key: 'qualified_experienced', label: 'Qualified CA, 1+ years of experience', short: 'Qualified CA', tier: 'ca_mentor' },
]);
export const TIERS = Object.freeze([
  { key: 'peer_mentor', label: 'Peer Mentor', tone: 'purple' },
  { key: 'ca_mentor', label: 'CA Mentor', tone: 'blue' },
]);

/**
 * Fields the application needs per stage (the apply page shows them; the SQL submit
 * check enforces the same list). Qualified stages also need it_company, it_domain and
 * it_duration_months when did_it = true.
 */
export const STAGE_REQUIRED = Object.freeze({
  final_in_it: ['final_attempt', 'it_company', 'it_domain', 'it_duration_months', 'it_start', 'articleship_firm', 'articleship_firm_type', 'articleship_domain'],
  final_it_done: ['final_attempt', 'it_company', 'it_domain', 'it_duration_months', 'it_start', 'articleship_firm', 'articleship_firm_type', 'articleship_domain'],
  final_articleship_done: ['final_attempt', 'articleship_firm', 'articleship_firm_type', 'articleship_domain'],
  in_articleship: ['articleship_firm', 'articleship_firm_type', 'articleship_domain', 'articleship_year'],
  qualified_fresher: ['qualified_on', 'employer', 'role_title', 'articleship_firm', 'articleship_firm_type', 'articleship_domain'],
  qualified_experienced: ['qualified_on', 'employer', 'role_title', 'experience_years', 'articleship_firm', 'articleship_firm_type', 'articleship_domain'],
});

/** Domains (aligned with the MSC interview booklets). */
export const DOMAINS = Object.freeze([
  { key: 'statutory_audit', label: 'Statutory audit' },
  { key: 'internal_audit', label: 'Internal audit' },
  { key: 'risk_advisory', label: 'Risk advisory & controls' },
  { key: 'direct_tax', label: 'Direct tax' },
  { key: 'indirect_tax', label: 'Indirect tax / GST' },
  { key: 'transfer_pricing', label: 'Transfer pricing' },
  { key: 'financial_reporting', label: 'Financial reporting (Ind AS / IFRS)' },
  { key: 'fpa', label: 'FP&A / controllership' },
  { key: 'investment_banking', label: 'Investment banking' },
  { key: 'equity_research', label: 'Equity research / PE / VC' },
  { key: 'consulting', label: 'Consulting / advisory' },
  { key: 'deals', label: 'M&A / transaction advisory' },
  { key: 'forensic', label: 'Forensic' },
  { key: 'treasury', label: 'Treasury' },
  { key: 'banking_credit', label: 'Banking / NBFC / credit' },
  { key: 'accounts_ops', label: 'Accounts & finance operations' },
]);

export const FIRM_TYPES = Object.freeze([
  { key: 'big4', label: 'Big 4' },
  { key: 'network', label: 'Big 6 / network firm' },
  { key: 'mid_size', label: 'Mid-size firm' },
  { key: 'small', label: 'Small firm' },
]);

export const LANGUAGES = Object.freeze([
  { key: 'english', label: 'English' }, { key: 'hindi', label: 'Hindi' }, { key: 'marathi', label: 'Marathi' },
  { key: 'gujarati', label: 'Gujarati' }, { key: 'bengali', label: 'Bengali' }, { key: 'tamil', label: 'Tamil' },
  { key: 'telugu', label: 'Telugu' }, { key: 'kannada', label: 'Kannada' }, { key: 'malayalam', label: 'Malayalam' },
  { key: 'punjabi', label: 'Punjabi' }, { key: 'odia', label: 'Odia' }, { key: 'urdu', label: 'Urdu' },
]);

/** City: store the key, or free text (<= 40 chars) when the person picks "Other". */
export const CITIES = Object.freeze([
  { key: 'mumbai', label: 'Mumbai' }, { key: 'delhi_ncr', label: 'Delhi NCR' }, { key: 'bengaluru', label: 'Bengaluru' },
  { key: 'pune', label: 'Pune' }, { key: 'hyderabad', label: 'Hyderabad' }, { key: 'chennai', label: 'Chennai' },
  { key: 'kolkata', label: 'Kolkata' }, { key: 'ahmedabad', label: 'Ahmedabad' }, { key: 'jaipur', label: 'Jaipur' },
  { key: 'indore', label: 'Indore' }, { key: 'surat', label: 'Surat' }, { key: 'lucknow', label: 'Lucknow' },
  { key: 'chandigarh', label: 'Chandigarh' }, { key: 'nagpur', label: 'Nagpur' }, { key: 'kochi', label: 'Kochi' },
  { key: 'other', label: 'Other' },
]);

export const CALL_SLOTS = Object.freeze([
  { key: 'weekday_morning', label: 'Weekday mornings (7-10 am)' },
  { key: 'weekday_lunch', label: 'Weekday lunch (1-2 pm)' },
  { key: 'weekday_evening', label: 'Weekday evenings (7-10 pm)' },
  { key: 'weekday_late', label: 'Weekday late (after 10 pm)' },
  { key: 'saturday', label: 'Saturdays' },
  { key: 'sunday', label: 'Sundays' },
]);
export const WEEKLY_HOURS = Object.freeze([
  { key: '2-3', label: '2-3 hours' }, { key: '4-6', label: '4-6 hours' }, { key: '7-10', label: '7-10 hours' }, { key: '10+', label: '10+ hours' },
]);
export const EXPERIENCE_YEARS = Object.freeze([
  { key: '1-2', label: '1-2 years' }, { key: '2-3', label: '2-3 years' }, { key: '3-5', label: '3-5 years' }, { key: '5+', label: '5+ years' },
]);
export const MENTORING_EXPERIENCE = Object.freeze([
  { key: 'regularly', label: 'Yes, regularly' }, { key: 'few_times', label: 'A few times' }, { key: 'not_yet', label: 'Not yet' },
]);
export const CONFLICTS = Object.freeze([
  { key: 'coaching_business', label: 'I run or teach at a coaching / course business' },
  { key: 'student_group', label: 'I run a student group or community (paid or free)' },
  { key: 'hiring', label: 'I hire or refer candidates for my organisation' },
  { key: 'practising_ca', label: 'I am a practising CA' },
  { key: 'none', label: 'None of these' },
]);
export const HEARD_FROM = Object.freeze([
  { key: 'msc_student', label: 'I was an MSC student' }, { key: 'whatsapp_group', label: 'MSC WhatsApp group' },
  { key: 'linkedin', label: 'LinkedIn' }, { key: 'instagram', label: 'Instagram' }, { key: 'youtube', label: 'YouTube' },
  { key: 'friend', label: 'A friend' }, { key: 'other', label: 'Other' },
]);
export const MENTEE_CAPACITY = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
export const IT_DURATIONS = Object.freeze([6, 7, 8, 9, 10, 11, 12]);

/** Mentee's job-hunt stage (weekly call log + pulse). */
export const HUNT_STAGES = Object.freeze([
  { key: 'not_started', label: 'Not started yet' },
  { key: 'preparing', label: 'Preparing CV and basics' },
  { key: 'applying', label: 'Applying' },
  { key: 'shortlisted', label: 'Shortlisted / tests' },
  { key: 'interviewing', label: 'Interviewing' },
  { key: 'offer', label: 'Offer received' },
  { key: 'joined', label: 'Joined' },
  { key: 'on_hold', label: 'On hold (exams or personal)' },
]);

/** Per-mentee checklist. dueDays = days after match start (red flag / "late" styling). */
export const CHECKLIST_ITEMS = Object.freeze([
  { key: 'intro_sent', label: 'Intro WhatsApp sent', hint: 'Within 24 hours of the match, using the intro template.', dueDays: 1 },
  { key: 'first_call', label: 'First call done', hint: 'Stage, target domains, where they have applied so far.', dueDays: 3 },
  { key: 'cv_reviewed', label: 'CV reviewed', hint: 'Use the CV checklist in the playbook, then re-check the new version.', dueDays: 7 },
  { key: 'resources_shared', label: 'MSC resources shared', hint: 'Walk them through mystudentclub.com/links.', dueDays: 7 },
  { key: 'mock_interview', label: 'Mock interview done', hint: 'At least one full mock before real interviews.', dueDays: 21 },
  { key: 'offer_received', label: 'Offer received', hint: 'Celebrate, then help them compare and accept.' },
  { key: 'joining_formalities', label: 'Joining formalities helped', hint: 'Offer letter, documents and ICAI paperwork.' },
  { key: 'joined', label: 'Joined', hint: 'They have started.' },
  { key: 'joining_post', label: 'Joining post tagged', hint: 'LinkedIn post tags Padam Bhansali, My Student Club, you and their parents.' },
]);

/** Mentor duties. Each one is a separate consent checkbox (key stored in mentorship_mentor.consents). */
export const DUTIES = Object.freeze([
  { key: 'reply_within_5h', title: 'I will respond to every mentee WhatsApp within 4-5 hours.', detail: 'Even a quick "Seen it, will call you at 7" counts. A mentee should never feel ignored.' },
  { key: 'no_unread_eod', title: 'I will never leave a message unread at the end of the day.', detail: '24 hours is the absolute maximum, on any day.' },
  { key: 'urgent_calls', title: 'I will pick up the rare urgent call when I can.', detail: 'Interview in an hour, offer deadline today: if I miss it, I call back as soon as I am free.' },
  { key: 'weekly_call', title: 'I will do one call every week with every mentee.', detail: 'How the hunt is going: stage, applications, interviews, next steps. I log it on my dashboard the same day.' },
  { key: 'cv_review', title: 'I will review every mentee’s CV.', detail: 'Specific, line-by-line feedback using the MSC CV checklist, and a re-check of the new version.' },
  { key: 'mock_interview', title: 'I will take at least one mock interview with every mentee.', detail: 'Before their real interviews, with honest feedback.' },
  { key: 'keep_them_applying', title: 'I will keep them applying and never let them give up.', detail: 'Most openings come late: "sate hai, wo last last mein hi aate hai". Hojayega.' },
  { key: 'know_resources', title: 'I will know every MSC resource and share it at the right time.', detail: 'Everything is on one page: mystudentclub.com/links.' },
  { key: 'joining_help', title: 'I will help with joining formalities after an offer.', detail: 'Offer letter, documents, ICAI paperwork and first-week doubts.' },
  { key: 'joining_post', title: 'I will make sure the joining LinkedIn post tags everyone.', detail: 'Padam Bhansali, My Student Club, me as the mentor, and their parents.' },
  { key: 'elder_sibling', title: 'I will act like an elder brother or sister.', detail: 'Patient, honest and on their side, especially on bad days.' },
  { key: 'use_padam_gpt', title: 'I will use Padam GPT for interview-prep questions once it is live.', detail: 'It is trained on Padam’s answers, so every mentee gets the same reliable guidance.' },
  { key: 'log_on_dashboard', title: 'I will keep my dashboard updated.', detail: 'Checklist and weekly call log, so Team MSC can step in early if someone is stuck.' },
  { key: 'no_selling', title: 'I will never sell my own courses, groups or services to mentees.', detail: 'No paid groups, no referral fees, no money from mentees, ever.' },
  { key: 'no_poaching', title: 'I will never move mentees to other groups or communities.', detail: 'Mentees stay in MSC groups. No outside WhatsApp or Telegram groups.' },
  { key: 'no_guessing', title: 'I will never guess. If I am not sure, I ask my senior mentor.', detail: 'A correct answer tomorrow beats a wrong answer today.' },
  { key: 'no_placement_promise', title: 'I will never promise a job, a referral or a placement.', detail: 'We help students prepare and keep going. Nobody can guarantee an outcome.' },
  { key: 'privacy', title: 'I will keep everything mentees share private.', detail: 'No screenshots, no sharing their CV or marks, and no personal details pasted into AI tools.' },
]);
/** Policy consents shown after the duties. {fee} is filled from config.mentor_fee_inr. */
export const POLICY_CONSENTS = Object.freeze([
  { key: 'code_of_conduct', title: 'I agree to the MSC mentor code of conduct.', detail: 'Respectful always, honest about what I know, no money or favours from mentees, a factual profile, and Team MSC may pause my profile if these are not kept.' },
  { key: 'payout_terms', title: 'I understand the mentor fee.', detail: 'Rs {fee} per mentee, paid by Team MSC. My dashboard shows the status of every payout. The fee can change for future batches.' },
  { key: 'data_consent', title: 'I agree to how MSC uses my details.', detail: 'My public profile (photo, name, stage, companies, domains, languages, city and Topmate link) is shown to MSC students. My WhatsApp and email go only to mentees matched with me. My mobile number, CV, marks and screening answers are seen only by Team MSC.' },
]);
export const REQUIRED_CONSENTS = Object.freeze([...DUTIES, ...POLICY_CONSENTS].map((d) => d.key));

export const CODE_OF_CONDUCT = Object.freeze([
  'Treat every mentee with respect. No pressure, no personal favours, no contact beyond mentoring.',
  'Never ask a mentee for money, gifts or paid services, and never accept them.',
  'Share only what you know. Say "let me check" and ask your senior mentor when unsure.',
  'Keep your profile factual: your own journey, not promotion of a firm or practice.',
  'Keep mentee information private, including inside other student groups.',
  'Use AI tools carefully: never paste a mentee’s personal details into them.',
  'Team MSC may pause or remove a mentor who breaks these rules, and reassign their mentees.',
]);

/** Private screening scenario shown on the application (answer stored in scenario_answer). */
export const SCENARIO_QUESTION = 'A mentee messages you at 9 pm: "I’ve been rejected in 6 industrial training interviews. Everyone in my batch has an offer. Should I just drop IT and finish articleship?" Write the WhatsApp message you would send back (4-6 lines).';

/** Shown to a student before booking. All must be ticked. */
export const STUDENT_COMMITMENTS = Object.freeze([
  { key: 'respond', title: 'I will respond to my mentor and join the weekly call.' },
  { key: 'keep_applying', title: 'I will keep applying and share honest updates.' },
  { key: 'pulse', title: 'I will fill the 30-second weekly check-in.' },
  { key: 'respect', title: 'I will respect my mentor’s time. They are seniors helping alongside their own work.' },
  { key: 'no_promise', title: 'I understand nobody can promise a job or referral, and nobody should ask me for money.' },
  { key: 'share_contact', title: 'I agree to share my name, WhatsApp number and email with my mentor.' },
]);

export const REVIEW_TAGS = Object.freeze([
  { key: 'always_reachable', label: 'Always reachable' },
  { key: 'practical_advice', label: 'Practical advice' },
  { key: 'great_cv_help', label: 'Great CV help' },
  { key: 'great_mock', label: 'Great mock interviews' },
  { key: 'kept_me_going', label: 'Kept me going' },
  { key: 'clear_next_steps', label: 'Clear next steps' },
  { key: 'elder_sibling', label: 'Like an elder sibling' },
]);

export const MENTOR_STATUS = Object.freeze({
  draft: { label: 'Draft', tone: 'gray', help: 'Finish your application and submit it.' },
  submitted: { label: 'Training pending', tone: 'blue', help: 'Watch the lecture, read the playbook and pass the quiz.' },
  training_passed: { label: 'In review', tone: 'purple', help: 'Team MSC is reviewing your application.' },
  approved: { label: 'Approved', tone: 'green', help: 'You are live and can receive mentees.' },
  rejected: { label: 'Not approved', tone: 'red', help: 'See the note from Team MSC.' },
  paused: { label: 'Paused', tone: 'amber', help: 'You will not get new mentees while paused.' },
});
export const MATCH_STATUS = Object.freeze({
  active: { label: 'Active', tone: 'green' },
  completed: { label: 'Completed', tone: 'blue' },
  switched: { label: 'Switched', tone: 'gray' },
  ended: { label: 'Ended', tone: 'gray' },
});
export const PAYOUT_STATUS = Object.freeze({
  unpaid: { label: 'Not due yet', tone: 'gray' },
  due: { label: 'Due', tone: 'amber' },
  paid: { label: 'Paid', tone: 'green' },
  void: { label: 'Not payable', tone: 'gray' },
});
export const SWITCH_STATUS = Object.freeze({
  pending: { label: 'Pending', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  declined: { label: 'Declined', tone: 'red' },
  withdrawn: { label: 'Withdrawn', tone: 'gray' },
});
/** Red flags computed by mentorship_admin_red_flags(). */
export const RED_FLAGS = Object.freeze({
  no_call_8d: { label: 'No weekly call in 8+ days', icon: 'fa-phone-slash' },
  mentor_not_calling: { label: 'Mentee says mentor did not call', icon: 'fa-user-xmark' },
  low_rating: { label: 'Pulse rating below 4', icon: 'fa-face-frown' },
  no_applications_2w: { label: 'No applications in 2 weeks', icon: 'fa-hourglass-half' },
  intro_late: { label: 'Intro not sent within 24h', icon: 'fa-comment-slash' },
  unmatched: { label: 'Enrolled but no mentor', icon: 'fa-user-clock' },
  pulse_issue: { label: 'Mentee reported an issue', icon: 'fa-triangle-exclamation' },
  safety_flag: { label: 'Review safety flag', icon: 'fa-shield-halved' },
  switch_pending: { label: 'Switch request waiting', icon: 'fa-right-left' },
  mentee_no_contact: { label: 'Mentee has no WhatsApp yet', icon: 'fa-address-card' },
});

/** Resources mentors share (absolute URLs so they work inside WhatsApp). */
export const RESOURCES = Object.freeze([
  { key: 'links', label: 'All MSC resources, one link', url: `${SITE_ORIGIN}/links`, icon: 'fa-link', desc: 'Share this first. Everything lives here.' },
  { key: 'jobs', label: 'Industrial training openings', url: `${SITE_ORIGIN}/`, icon: 'fa-briefcase', desc: 'Fresh openings, updated through the day.' },
  { key: 'lms', label: 'MSC course dashboard', url: `${SITE_ORIGIN}/learning-management-system/`, icon: 'fa-circle-play', desc: 'Recorded program lectures.' },
  { key: 'cv_reviewer', label: 'AI CV reviewer', url: `${SITE_ORIGIN}/cv-reviewer/`, icon: 'fa-file-circle-check', desc: 'Instant CV feedback before your review.' },
  { key: 'cv_builder', label: 'CV builder', url: `${SITE_ORIGIN}/cv-builder/`, icon: 'fa-file-pen', desc: 'Clean one-page CA CV templates.' },
  { key: 'it_guidebook', label: 'Industrial training guidebook', url: `${SITE_ORIGIN}/msc-industrial-guidebook/`, icon: 'fa-book-open', desc: 'The full IT hunt, step by step.' },
  { key: 'booklet_direct_tax', label: 'Direct tax interview booklet', url: `${SITE_ORIGIN}/direct-tax-interview-booklet/`, icon: 'fa-book', desc: '' },
  { key: 'booklet_indirect_tax', label: 'Indirect tax interview booklet', url: `${SITE_ORIGIN}/indirect-tax-interview-booklet/`, icon: 'fa-book', desc: '' },
  { key: 'booklet_finance', label: 'Finance interview booklet', url: `${SITE_ORIGIN}/finance-interview-booklet/`, icon: 'fa-book', desc: '' },
  { key: 'booklet_fpa', label: 'FP&A interview booklet', url: `${SITE_ORIGIN}/fpa-interview-booklet/`, icon: 'fa-book', desc: '' },
  { key: 'booklet_internal_audit', label: 'Internal audit interview booklet', url: `${SITE_ORIGIN}/internal-audit-interview-booklet/`, icon: 'fa-book', desc: '' },
  { key: 'booklet_ib', label: 'Investment banking interview booklet', url: `${SITE_ORIGIN}/investment-banking-interview-booklet/`, icon: 'fa-book', desc: '' },
  { key: 'it_free', label: 'Free industrial training resources', url: `${SITE_ORIGIN}/ca-industrial-training-resources.html`, icon: 'fa-gift', desc: '' },
]);

/**
 * WhatsApp templates the mentor sends (fill with fillTemplate). Placeholders:
 * {mentee_first} {mentor_first} {mentor_name} {program} {mentor_line} {slot} {links_url} {openings}
 */
export const FIRST_MESSAGES = Object.freeze([
  {
    key: 'intro', title: 'Intro message', when: 'Within 24 hours of the match',
    text: 'Hi {mentee_first}! This is {mentor_first}, your mentor from My Student Club for the {program} program.\n\nA little about me: {mentor_line}. I have been exactly where you are, so think of me as your elder brother/sister for this hunt.\n\nMessage me here anytime. I usually respond within a few hours.\n\nTo start, please send me:\n1. Your latest CV (PDF)\n2. The domains you are interested in\n3. Where you have applied so far\n\nShall we do a quick 15-minute call {slot}? Hojayega!',
  },
  {
    key: 'weekly', title: 'Weekly check-in', when: 'Every week, before the call',
    text: 'Hi {mentee_first}, time for our weekly check-in! Are you free for a 15-minute call {slot}? Keep this week’s numbers handy: applications sent, shortlists and interviews.',
  },
  {
    key: 'resources', title: 'Sharing MSC resources', when: 'First week',
    text: 'Hi {mentee_first}, everything MSC has for you is on one page: {links_url}\n\nStart with the IT guidebook and the interview booklet for your domain. Tell me which domain you pick and I will tell you what to focus on first.',
  },
  {
    key: 'keep_going', title: 'When they feel low', when: 'Whenever the hunt feels slow',
    text: 'Hey {mentee_first}, I know it feels slow right now, and that is normal. Most {openings} come late: sate hai, wo last last mein hi aate hai.\n\nLet us set a small target for this week: 10 good applications. Send me the list on Sunday and we will review it together. Hojayega!',
  },
  {
    key: 'offer', title: 'Offer received', when: 'The day they get an offer',
    text: 'Congratulations {mentee_first}! So proud of you. Send me the offer letter and we will go through it together before you accept. Then we will sort out the joining formalities step by step.',
  },
  {
    key: 'joining_post', title: 'Joining post reminder', when: 'First week after joining',
    text: 'Hi {mentee_first}, time for your joining post on LinkedIn! Please tag Padam Bhansali, My Student Club, me ({mentor_name}) and your parents. They have earned it too. Send me the link once it is up!',
  },
]);

/** Fallbacks when mentorship_get_config() is unavailable. Keys match mentorship_config. */
export const DEFAULT_CONFIG = Object.freeze({
  mentor_fee_inr: 500,
  lecture_video_url: '',
  padam_gpt_url: '',
  links_url: `${SITE_ORIGIN}/links`,
  programs_enabled: ['industrial-training'],
  quiz_pass_pct: 80,
  quiz_cooldown_hours: 24,
  review_after_days: 28,
  max_mentees_cap: 10,
  min_reviews_for_rating: 3,
  switch_limit: 1,
});
/** The escalation contact is a private config key (staff details): mentors get it from mentorship_my_mentor(). */
export const DEFAULT_ESCALATION_CONTACT = Object.freeze({ name: 'Team My Student Club', whatsapp: '', email: '' });

export const LIMITS = Object.freeze({
  full_name: 80, headline: 90, bio: [120, 800], wish_i_knew: 200, why_mentor: [80, 800], scenario_answer: [120, 900],
  companies_known: 15, domains: 6, notes: 1000, issue: 1000, review_body: 600, review_tags: 3, switch_reason: [20, 600],
  photo_bytes: 2 * 1024 * 1024, cv_bytes: 5 * 1024 * 1024,
});

/* ---------------------------------------------------------------------------
   2. SUPABASE CLIENT + AUTH (site convention: /login.html?redirect=<path>)
   ------------------------------------------------------------------------ */

/** The site's shared client created by /scripts/supabase-init.js (never create a second one). */
export function getClient() {
  const c = window.supabaseClient || (typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null);
  if (!c) throw new Error('Supabase client missing: load /scripts/supabase.js and /scripts/supabase-init.js before this module.');
  return c;
}

function hasStoredToken() {
  try { return !!localStorage.getItem(AUTH_STORAGE_KEY); } catch { return false; }
}

/**
 * Current session or null. Mirrors the LMS: getSession(); if a stored token exists but
 * no session yet (refresh in flight, in-app webviews), wait briefly for auth to settle.
 */
export async function getSession({ wait = 2500 } = {}) {
  if (MOCK) return mockSession();
  const sb = getClient();
  let session = null;
  try { session = (await sb.auth.getSession())?.data?.session || null; } catch { /* fall through */ }
  if (session?.user) return session;
  if (!hasStoredToken()) return null;
  session = await new Promise((resolve) => {
    let sub = null;
    const timer = setTimeout(() => { sub?.unsubscribe(); resolve(null); }, wait);
    try {
      sub = sb.auth.onAuthStateChange((_event, s) => {
        if (s?.user) { clearTimeout(timer); sub?.unsubscribe(); resolve(s); }
      })?.data?.subscription || null;
    } catch { clearTimeout(timer); resolve(null); }
  });
  if (session?.user) return session;
  try {
    const user = (await sb.auth.getUser())?.data?.user;
    if (user) return { user };
  } catch { /* no user */ }
  return null;
}

export async function getUser() {
  return (await getSession())?.user || null;
}

/** Login URL that returns here. `redirect` must be a same-origin PATH (Google OAuth breaks on full URLs). */
export function loginUrl(path = location.pathname + location.search) {
  const safe = typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : PATHS.hub;
  return `${PATHS.login}?redirect=${encodeURIComponent(safe)}`;
}

/** Resolve with the session, or send the visitor to login and never resolve. */
export async function requireLogin() {
  const session = await getSession();
  if (session) return session;
  location.href = loginUrl();
  return new Promise(() => {});
}

/** Same cleanup as the portal's logout (portal3.js handleLogout). */
export async function logout() {
  try { await getClient().auth.signOut(); } catch { /* ignore */ }
  try {
    ['userJobPreference', 'userProfileData', 'userCVFileName', 'userCVText', 'userCVImages', 'subscribedTopics', 'newUserSignup', 'newUserEmail']
      .forEach((k) => localStorage.removeItem(k));
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      // Also the mentorship backups: unsaved application answers and quiz answers (shared computers).
      if (k && (k.startsWith('sb-') || k.includes('supabase') || k.startsWith('ms_apply_draft_') || k.startsWith('ms_quiz_'))) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
  location.href = '/';
}

/** Best display name from auth metadata. */
export function nameFromUser(user) {
  const m = user?.user_metadata || {};
  return (m.full_name || m.name || [m.first_name, m.last_name].filter(Boolean).join(' ') || (user?.email || '').split('@')[0] || '').trim();
}

/* ---------------------------------------------------------------------------
   3. CONTEXT, CONFIG, ENROLLMENT
   ------------------------------------------------------------------------ */

let _configPromise = null;
/** Public config merged over DEFAULT_CONFIG. Never throws. */
export function getConfig({ force = false } = {}) {
  if (!_configPromise || force) {
    _configPromise = rpc('mentorship_get_config')
      .then((data) => ({ ...DEFAULT_CONFIG, ...(data && typeof data === 'object' ? data : {}), _loaded: true }))
      .catch(() => ({ ...DEFAULT_CONFIG, _loaded: false }));
  }
  return _configPromise;
}

/** Program keys switched on in config, in canonical order. */
export function enabledPrograms(config = DEFAULT_CONFIG) {
  const on = Array.isArray(config?.programs_enabled) ? config.programs_enabled : DEFAULT_CONFIG.programs_enabled;
  return PROGRAM_KEYS.filter((k) => on.includes(k));
}
export function isProgramEnabled(config, key) { return enabledPrograms(config).includes(key); }
export function programLabel(key, { long = false } = {}) {
  const p = PROGRAMS[key];
  return p ? (long ? p.name : p.label) : prettifyKey(key);
}

/** enrollment.course -> program key, or null. */
export function courseToProgram(course) {
  return COURSE_TO_PROGRAM[String(course || '').trim().toLowerCase()] || null;
}

let _enrolledPromise = null;
/**
 * Set of program keys the signed-in user is enrolled in. This is the LMS logic: read
 * public.enrollment (RLS: own rows) and map aliases. For UI only; RPCs re-check server-side.
 */
export function getEnrolledPrograms({ force = false } = {}) {
  if (!_enrolledPromise || force) {
    _enrolledPromise = (async () => {
      if (MOCK) {
        const w = await rpc('mentorship_whoami').catch(() => null);
        return new Set(w?.enrolled_programs || []);
      }
      const user = await getUser();
      if (!user) return new Set();
      const { data, error } = await getClient().from('enrollment').select('course').eq('uuid', user.id);
      if (error) throw toMsError(error);
      return new Set((data || []).map((r) => courseToProgram(r.course)).filter(Boolean));
    })().catch((e) => { _enrolledPromise = null; throw e; });
  }
  return _enrolledPromise;
}
export async function isEnrolled(program = 'industrial-training') {
  try { return (await getEnrolledPrograms()).has(program); } catch { return false; }
}

let _ctxPromise = null;
/**
 * Everything a page needs to route the visitor, from one RPC (mentorship_whoami):
 * {
 *   session, user, email, name,
 *   staffRole: 'admin'|'senior_mentor'|null, isStaff, isAdmin,
 *   mentor:  null | { id, status, tier, full_name, photo_path, quiz_passed_at, accepting },
 *   student: null | { full_name, whatsapp, city },
 *   enrolledPrograms: ['industrial-training', ...],
 *   activeMatches: [{ match_id, program, mentor_id }],
 *   closedMatches: [{ match_id, program, status: 'completed'|'ended', mentor_id }], // no self-booking there
 *   config,                       // getConfig()
 *   backendReady: boolean,        // false until the SQL migration is applied
 *   error: MsError | null         // whoami failed for another reason (network etc.)
 * }
 */
export function getContext({ force = false } = {}) {
  if (!_ctxPromise || force) {
    if (force) _enrolledPromise = null;
    _ctxPromise = loadContext();
  }
  return _ctxPromise;
}

async function loadContext() {
  const [session, config] = await Promise.all([getSession(), getConfig()]);
  const user = session?.user || null;
  const ctx = {
    session, user, email: user?.email || '', name: nameFromUser(user),
    staffRole: null, isStaff: false, isAdmin: false, mentor: null, student: null,
    enrolledPrograms: [], activeMatches: [], closedMatches: [], config, backendReady: true, error: null,
  };
  if (!user) return ctx;
  try {
    const w = (await rpc('mentorship_whoami')) || {};
    ctx.staffRole = w.staff_role || null;
    ctx.mentor = w.mentor || null;
    ctx.student = w.student || null;
    ctx.enrolledPrograms = Array.isArray(w.enrolled_programs) ? w.enrolled_programs : [];
    ctx.activeMatches = Array.isArray(w.active_matches) ? w.active_matches : [];
    ctx.closedMatches = Array.isArray(w.closed_matches) ? w.closed_matches : [];
    if (w.name) ctx.name = w.name;
  } catch (e) {
    if (e.code === 'backend_missing') ctx.backendReady = false;
    else ctx.error = e;
    try { ctx.enrolledPrograms = [...(await getEnrolledPrograms())]; } catch { /* leave empty */ }
  }
  ctx.isStaff = !!ctx.staffRole;
  ctx.isAdmin = ctx.staffRole === 'admin';
  return ctx;
}

/** Prefill for forms: name, email, phone, city from public.profiles + auth metadata. Never throws. */
export async function getProfilePrefill() {
  const user = await getUser();
  if (!user) return { name: '', email: '', phone: '', city: '' };
  let p = {};
  if (MOCK) p = (await mockCall('__profile_prefill', {}).catch(() => null)) || {};
  else {
    try {
      const { data } = await getClient().from('profiles').select('profile').eq('uuid', user.id).maybeSingle();
      p = data?.profile || {};
    } catch { /* ignore */ }
  }
  const m = user.user_metadata || {};
  return {
    name: String(p.name || nameFromUser(user) || '').trim(),
    email: user.email || p.email || '',
    phone: String(p.contact_number || p.phone || p.phone_number || p.mobile || m.phone || '').trim(),
    city: String(p.city || p.location || '').trim(),
  };
}

/* ---------------------------------------------------------------------------
   4. RPC + ERRORS
   SQL raises `raise exception '<code>' using errcode = 'P0001', hint = '<detail>'`.
   rpc() turns any failure into MsError { code, message (friendly), hint, raw }.
   ------------------------------------------------------------------------ */

export const ERROR_COPY = Object.freeze({
  not_logged_in: 'Please log in to continue.',
  session_expired: 'Your login has expired. Please log in again.',
  forbidden: 'You do not have access to this.',
  not_found: 'We could not find that. It may have been removed.',
  invalid_input: 'Some details look off. Please check and try again.',
  program_closed: 'Mentorship for this program is not open yet.',
  not_enrolled: 'Mentors are part of the MSC program. Enrol to get your mentor.',
  student_profile_missing: 'Add your WhatsApp number so your mentor can reach you.',
  already_matched: 'You already have a mentor for this program.',
  mentor_unavailable: 'This mentor is not taking mentees right now. Please pick another mentor.',
  mentor_full: 'This mentor just got full. Please pick another mentor.',
  cannot_book_self: 'You cannot book yourself as a mentor.',
  switch_used: 'You have already used your mentor switch. Write to Team MSC from the contact page if something is wrong.',
  switch_pending: 'Your switch request is already with Team MSC.',
  not_editable: 'This can no longer be edited.',
  incomplete: 'A few required details are missing.',
  quiz_locked: 'Submit your application first, then take the quiz.',
  quiz_cooldown: 'You can retake the quiz once the cooldown ends.',
  already_passed: 'You have already passed the quiz.',
  review_too_early: 'You can review your mentor after 4 weeks together.',
  match_not_active: 'This mentorship is no longer active.',
  invalid_transition: 'That status change is not allowed.',
  quiz_not_passed: 'This mentor has not passed the training quiz yet.',
  reapply_later: 'You can apply again after the date shown.',
  mentorship_completed: 'Your mentorship for this program is complete. Congratulations!',
  mentorship_ended: 'Your last mentorship was closed by Team MSC. Contact us and we will set up your next mentor with you.',
  file_type: 'That file type is not supported.',
  file_too_large: 'That file is too large.',
  backend_missing: 'Mentorship is being set up. Please check back soon.',
  network: 'Network issue. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
});

export class MsError extends Error {
  constructor(code, message, { hint = null, raw = null } = {}) {
    super(message || ERROR_COPY[code] || ERROR_COPY.unknown);
    this.name = 'MsError';
    this.code = code;
    this.hint = hint;
    this.raw = raw;
  }
}

/** True when the mentorship SQL is not applied yet (function or table missing). */
export function isMissingBackend(err) {
  const e = err?.raw || err || {};
  return e.code === 'PGRST202' || e.code === '42883' || e.code === '42P01' || e.code === 'PGRST205'
    || /could not find the function|does not exist/i.test(e.message || '');
}

function toMsError(error) {
  if (error instanceof MsError) return error;
  const msg = String(error?.message || '');
  let code = 'unknown';
  if (ERROR_COPY[msg] && msg !== 'unknown') code = msg;
  else if (isMissingBackend(error)) code = 'backend_missing';
  else if (error?.code === 'PGRST301' || /jwt (expired|invalid)/i.test(msg) || error?.status === 401) code = 'session_expired';
  else if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) code = 'network';
  else if (error?.code === '42501') code = 'forbidden';
  else if (error?.code === '23505') code = 'invalid_input';
  return new MsError(code, ERROR_COPY[code], { hint: error?.hint || null, raw: error });
}

/** Friendly copy for any error or code. */
export function friendlyError(errOrCode) {
  if (typeof errOrCode === 'string') return ERROR_COPY[errOrCode] || ERROR_COPY.unknown;
  return toMsError(errOrCode).message;
}

/** Call a Postgres function. Returns `data`; throws MsError. */
export async function rpc(fn, args = {}) {
  if (MOCK) return mockCall(fn, args);
  let res;
  try { res = await getClient().rpc(fn, args); } catch (e) { throw toMsError(e); }
  if (res.error) throw toMsError(res.error);
  return res.data;
}

/** Show an error as a toast (and log the raw error). Returns the MsError. */
export function showError(err, fallback) {
  const e = toMsError(err);
  console.warn('[mentorship]', e.code, e.raw || e);
  toast(e.code === 'unknown' && fallback ? fallback : e.message, { type: 'error' });
  return e;
}

/* ---------------------------------------------------------------------------
   5. STORAGE (buckets: mentorship-photos public, mentorship-cv private)
   Paths are always `<auth uid>/<kind>-<timestamp>.<ext>`; storage policies check the folder.
   ------------------------------------------------------------------------ */

export const STORAGE = Object.freeze({ photos: 'mentorship-photos', cv: 'mentorship-cv' });
export const UPLOAD_RULES = Object.freeze({
  photo: { bucket: STORAGE.photos, maxBytes: LIMITS.photo_bytes, types: ['image/jpeg', 'image/png', 'image/webp'], accept: 'image/jpeg,image/png,image/webp', label: 'JPG, PNG or WebP up to 2 MB' },
  cv: { bucket: STORAGE.cv, maxBytes: LIMITS.cv_bytes, types: ['application/pdf'], accept: 'application/pdf', label: 'PDF up to 5 MB' },
});

/** Public URL of a photo path (or '' if none). Accepts full URLs unchanged. */
export function photoUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (MOCK && path.startsWith('mock/')) return '';
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE.photos}/${String(path).split('/').map(encodeURIComponent).join('/')}`;
}

/** Downscale a phone photo to <= max px JPEG before upload (keeps uploads small). */
async function downscaleImage(file, max = 800) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
    if (blob && (blob.size < file.size || scale < 1)) return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  } catch { /* keep original */ }
  return file;
}

/**
 * Upload the signed-in user's photo or CV. kind: 'photo' | 'cv'. Returns the storage path
 * to save via mentorship_save_mentor({ photo_path } / { cv_path }).
 */
export async function uploadFile(kind, file) {
  const rule = UPLOAD_RULES[kind];
  if (!rule || !file) throw new MsError('invalid_input');
  if (!rule.types.includes(file.type)) throw new MsError('file_type', `Please upload a ${rule.label.split(' up to')[0]} file.`);
  let f = kind === 'photo' ? await downscaleImage(file) : file;
  if (f.size > rule.maxBytes) throw new MsError('file_too_large', `Please keep it under ${Math.round(rule.maxBytes / 1048576)} MB.`);
  const user = await getUser();
  if (!user) throw new MsError('not_logged_in');
  const ext = kind === 'cv' ? 'pdf' : (f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg');
  const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
  if (MOCK) return `mock/${path}`;
  const { error } = await getClient().storage.from(rule.bucket).upload(path, f, { cacheControl: '3600', upsert: false, contentType: f.type });
  if (error) throw toMsError(error);
  return path;
}

/**
 * Delete one of the signed-in user's own uploads (a replaced photo or CV), so old files do not
 * stay readable. Call it only after the new path is saved. Never throws; false when not removed.
 */
export async function removeFile(kind, path) {
  const rule = UPLOAD_RULES[kind];
  if (!rule || !path || MOCK) return false;
  try {
    const user = await getUser();
    if (!user || !String(path).startsWith(`${user.id}/`)) return false;
    const { error } = await getClient().storage.from(rule.bucket).remove([String(path)]);
    return !error;
  } catch { return false; }
}

/** Short-lived URL for a private file (CV). Staff and the owner only (storage policy). */
export async function signedUrl(bucket, path, seconds = 300) {
  if (!path) return '';
  if (MOCK) return '#mock-signed-url';
  const { data, error } = await getClient().storage.from(bucket).createSignedUrl(path, seconds);
  if (error) throw toMsError(error);
  return data?.signedUrl || '';
}

/* ---------------------------------------------------------------------------
   6. TEXT, LINKS, FORMATTING
   ------------------------------------------------------------------------ */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export function escapeHtml(v) { return String(v ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]); }

/** Marks a string as trusted HTML for html``. Only for markup you built, never user data. */
class RawHtml { constructor(s) { this.s = String(s); } toString() { return this.s; } }
export const raw = (s) => new RawHtml(s);
function renderVal(v) {
  if (v instanceof RawHtml) return v.s;
  if (Array.isArray(v)) return v.map(renderVal).join('');
  if (v === null || v === undefined || v === false) return '';
  return escapeHtml(v);
}
/**
 * Auto-escaping template tag: el.innerHTML = html`<b>${userText}</b>`.
 * Interpolated values are escaped; nested html`` results and raw() pass through; arrays are joined.
 * Put URLs through safeUrl() before interpolating them into href/src.
 */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < vals.length ? renderVal(vals[i]) : ''); });
  return new RawHtml(out);
}

/** http(s)/mailto/tel URL or same-origin path, else '' (blocks javascript: etc.). */
export function safeUrl(u, { allowRelative = true } = {}) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  if (allowRelative && s.startsWith('/') && !s.startsWith('//')) return s;
  try {
    const p = new URL(s);
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(p.protocol) ? p.href : '';
  } catch { return ''; }
}
/** User-typed link -> https URL ('linkedin.com/in/x' -> 'https://linkedin.com/in/x'), or ''. */
export function normalizeUrl(u) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  return safeUrl(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`, { allowRelative: false });
}
export function isLinkedInUrl(u) { return /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#]+/i.test(normalizeUrl(u)); }

/** Mentoring sites with public reviews that topmate_url may point to (SQL vocab 'review_hosts'). */
export const REVIEW_HOSTS = Object.freeze(['topmate.io', 'adplist.org', 'mentorcruise.com', 'superpeer.com', 'unstop.com', 'preplaced.in']);
/** https link to a profile on a REVIEW_HOSTS site (or a subdomain), no port or user part. Same rule as SQL mentorship_review_url. */
export function isReviewProfileUrl(u) {
  const s = normalizeUrl(u);
  const m = /^https:\/\/([^/?#:@]+)([/?#]|$)/i.exec(s);
  if (!m) return false;
  const host = m[1].toLowerCase();
  return REVIEW_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * True when text carries contact details (same rule as SQL mentorship_has_contact): a 10-digit
 * number, also split by spaces, dots, brackets or dashes; an @; a link (http:, www., wa.me, t.me,
 * chat.whatsapp, bit.ly, a domain with a path); or the word telegram.
 */
export function hasContactDetails(text) {
  const s = String(text ?? '');
  if (!s) return false;
  if (/\d{10}/.test(s.replace(/(\d)[ .()-]+(?=\d)/g, '$1'))) return true;
  return /@|https?:|www\.|\bwa\.me\b|\bt\.me\b|chat\.whatsapp|telegram|bit\.ly|\b[a-z0-9-]{2,}\.(com|in|io|me|ly|ee|co|org|net|link|app|gg|to|xyz)\//i.test(s);
}

/**
 * A person's name (same rule as SQL mentorship_name_ok): letters, spaces and . ' - only, up to 80
 * characters. Letters from any script work; digits, @, /, :, brackets and links do not.
 */
export function isValidPersonName(name) {
  const s = String(name ?? '').trim();
  if (!s || s.length > 80) return false;
  if (!/^[A-Za-z .'\u0080-\u0965\u0970-\ud7ff\ue000-\ufeff-]+$/.test(s)) return false;
  if (!/[A-Za-z\u0080-\u0965\u0970-\ud7ff\ue000-\ufeff]/.test(s)) return false;
  return !/www\.|\.(com|in|ly|me|io|co|org|net)\b/i.test(s);
}

/** Digits with country code: '098765 43210' -> '919876543210'. */
export function normalizePhone(p) {
  let d = String(p ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d;
}
export function isValidIndianMobile(p) { return /^91[6-9]\d{9}$/.test(normalizePhone(p)); }
/** '+91 98765 43210' for display. */
export function formatPhone(p) {
  const d = normalizePhone(p);
  return /^91\d{10}$/.test(d) ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : (d ? `+${d}` : '');
}
/** WhatsApp click-to-chat link, optional prefilled text. '' when no number. */
export function waLink(phone, text = '') {
  const d = normalizePhone(phone);
  if (!d) return '';
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
export function telLink(phone) { const d = normalizePhone(phone); return d ? `tel:+${d}` : ''; }
export function mailtoLink(email, subject = '') {
  const e = String(email || '').trim();
  return e ? `mailto:${e}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}` : '';
}

/** Replace {placeholders} that have a non-empty value; unknown ones stay visible for editing. */
export function fillTemplate(tpl, vars = {}) {
  return String(tpl || '').replace(/\{([a-z_]+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null && vars[k] !== '' ? String(vars[k]) : m));
}

export function firstName(name) {
  const w = String(name || '').trim().split(/\s+/)[0] || '';
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : '';
}
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}
export function plural(n, one, many = `${one}s`) { return `${n} ${Number(n) === 1 ? one : many}`; }
export function prettifyKey(k) { const s = String(k || '').replace(/[_-]+/g, ' ').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

/** Label for a key in a constants list (or map). Unknown keys are shown as typed (free-text city etc.). */
export function labelOf(list, key) {
  if (key === null || key === undefined || key === '') return '';
  const item = Array.isArray(list) ? list.find((x) => x.key === key) : list?.[key];
  return item ? (item.label ?? String(key)) : (/^[a-z0-9_]+$/.test(String(key)) ? prettifyKey(key) : String(key));
}
export function labelsOf(list, keys) { return (Array.isArray(keys) ? keys : []).map((k) => labelOf(list, k)).filter(Boolean); }
export function stageLabel(key, { short = false } = {}) {
  const s = STAGES.find((x) => x.key === key);
  return s ? (short ? s.short : s.label) : '';
}
export function tierOf(stageKey) { return STAGES.find((x) => x.key === stageKey)?.tier || 'peer_mentor'; }

const toDate = (v) => (v instanceof Date ? v : v ? new Date(v) : null);
/** '2 Oct 2026' (IST). */
export function formatDate(v, opts = {}) {
  const d = toDate(v);
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ, ...opts }).format(d);
}
/** '2 Oct 2026, 7:30 pm' (IST). */
export function formatDateTime(v) {
  const d = toDate(v);
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).format(d);
}
/** 'just now', '5 min ago', '3 h ago', '2 days ago', else a date. */
export function timeAgo(v) {
  const d = toDate(v);
  if (!d) return '';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 0) return formatDateTime(d);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 14) return plural(Math.floor(s / 86400), 'day') + ' ago';
  return formatDate(d);
}
/** 'YYYY-MM-DD' of a moment in IST. */
export function istDateKey(v = new Date()) {
  const d = toDate(v);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
/** Whole IST calendar days between two moments (b defaults to now). */
export function daysBetween(a, b = new Date()) {
  if (!a) return null;
  return Math.round((Date.parse(istDateKey(b)) - Date.parse(istDateKey(a))) / 86400000);
}
export function daysSince(v) { return daysBetween(v, new Date()); }
/** Week number of a match: week 1 = the first 7 IST days from started_at. Same rule as SQL. */
export function weekNumber(startedAt, at = new Date()) {
  const n = daysBetween(startedAt, at);
  return n === null ? null : Math.max(1, Math.floor(n / 7) + 1);
}
/** Monday (IST) of the week containing v, as 'YYYY-MM-DD'. Pulse rows are keyed by this. */
export function istWeekStart(v = new Date()) {
  const key = istDateKey(v);
  const d = new Date(`${key}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
/** '2027-05' -> 'May 2027'. */
export function monthYearLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if (!m) return String(ym || '');
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, 1)));
}
/** Options for CA Final attempt selects: [{key:'2027-05', label:'May 2027'}] (Jan/May/Sep/Nov). */
export function attemptOptions({ from = new Date().getFullYear() - 1, to = new Date().getFullYear() + 3 } = {}) {
  const out = [];
  for (let y = from; y <= to; y++) for (const mm of ['01', '05', '09', '11']) out.push({ key: `${y}-${mm}`, label: monthYearLabel(`${y}-${mm}`) });
  return out;
}
/** 'Rs 1,500' (site copy uses "Rs 500 per mentee"). */
export function formatINR(n) {
  const v = Number(n || 0);
  return `Rs ${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/**
 * Journey lines for a mentor (find, my-mentor, admin, hub) from the public mentor shape:
 * [{ icon, label, text }]. Use with html`` (text is escaped there).
 */
export function journeyLines(m = {}) {
  const lines = [];
  if (m.it_company) {
    const bits = [m.it_company, labelOf(DOMAINS, m.it_domain), m.it_duration_months ? `${m.it_duration_months} months` : ''].filter(Boolean);
    lines.push({ icon: 'fa-building', label: m.stage === 'final_in_it' ? 'Industrial training (now)' : 'Industrial training', text: bits.join(' · ') });
  }
  if (m.articleship_firm || m.articleship_firm_type) {
    const bits = [m.articleship_firm, m.articleship_firm_type ? labelOf(FIRM_TYPES, m.articleship_firm_type) : '', labelOf(DOMAINS, m.articleship_domain)].filter(Boolean);
    lines.push({ icon: 'fa-briefcase', label: m.stage === 'in_articleship' ? 'Articleship (now)' : 'Articleship', text: bits.join(' · ') });
  }
  if (m.employer) lines.push({ icon: 'fa-user-tie', label: 'Now', text: [m.role_title, m.employer].filter(Boolean).join(', ') });
  if (m.qualified_on) lines.push({ icon: 'fa-award', label: 'Qualified', text: `CA since ${monthYearLabel(m.qualified_on)}` });
  else if (m.final_attempt) lines.push({ icon: 'fa-graduation-cap', label: 'CA Final', text: `Attempt ${monthYearLabel(m.final_attempt)}` });
  return lines;
}

/* ---------------------------------------------------------------------------
   7. UI HELPERS
   ------------------------------------------------------------------------ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function qs(name) { return new URLSearchParams(location.search).get(name); }
export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
/** Put html``/raw() markup, a Node, or plain text (escaped) into an element. */
export function setContent(el, content) {
  if (!el) return;
  if (content instanceof Node) { el.replaceChildren(content); return; }
  el.innerHTML = content instanceof RawHtml ? content.s : escapeHtml(content ?? '');
}
/** Button spinner: setBusy(btn, true) ... setBusy(btn, false). */
export function setBusy(btn, busy = true) {
  if (!btn) return;
  btn.classList.toggle('is-loading', !!busy);
  btn.disabled = !!busy;
  btn.setAttribute('aria-busy', busy ? 'true' : 'false');
}

let _toastHost = null;
/** toast('Saved', { type: 'success'|'error'|'warn'|'info', timeout }) */
export function toast(message, { type = 'info', timeout = 4000 } = {}) {
  if (!_toastHost || !document.body.contains(_toastHost)) {
    _toastHost = document.createElement('div');
    _toastHost.className = 'ms-toasts';
    _toastHost.setAttribute('role', 'status');
    _toastHost.setAttribute('aria-live', 'polite');
    document.body.appendChild(_toastHost);
  }
  const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', warn: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const el = document.createElement('div');
  el.className = `ms-toast ms-toast--${type}`;
  el.innerHTML = `<i class="fas ${icons[type] || icons.info}" aria-hidden="true"></i><span></span>`;
  el.querySelector('span').textContent = String(message ?? '');
  _toastHost.appendChild(el);
  const remove = () => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 200); };
  setTimeout(remove, timeout);
  el.addEventListener('click', remove);
  return el;
}

let _modalSeq = 0;
/**
 * openModal({ title, body, actions, wide, dismissible, onClose }) -> { el, body, close, buttons }
 * body: Node | html`` | plain text. actions: [{ label, variant: 'primary'|'secondary'|'danger'|...,
 * onClick: async (modal) => {...}, close: boolean (default true when no onClick) }].
 * Renders as a bottom sheet on phones, a centred dialog from 640px.
 */
export function openModal({ title = '', body = '', actions = [], wide = false, dismissible = true, onClose } = {}) {
  const id = `ms-modal-${++_modalSeq}`;
  const prevFocus = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'ms-modal-backdrop';
  backdrop.innerHTML = `
    <div class="ms-modal${wide ? ' ms-modal--wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}-t">
      <div class="ms-modal__head">
        <h2 class="ms-modal__title" id="${id}-t"></h2>
        ${dismissible ? '<button type="button" class="ms-icon-btn" data-ms-close aria-label="Close"><i class="fas fa-xmark"></i></button>' : ''}
      </div>
      <div class="ms-modal__body"></div>
      ${actions.length ? '<div class="ms-modal__foot"></div>' : ''}
    </div>`;
  const el = backdrop.querySelector('.ms-modal');
  el.querySelector('.ms-modal__title').textContent = title;
  const bodyEl = el.querySelector('.ms-modal__body');
  setContent(bodyEl, body);
  let closed = false;
  const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(); };
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    if (!document.querySelector('.ms-modal-backdrop')) document.body.classList.remove('ms-modal-open');
    try { prevFocus?.focus?.(); } catch { /* ignore */ }
    onClose?.();
  }
  const modal = { el, body: bodyEl, close, buttons: [] };
  const foot = el.querySelector('.ms-modal__foot');
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ms-btn ms-btn--${a.variant || 'secondary'}`;
    b.textContent = a.label;
    b.addEventListener('click', async () => {
      if (!a.onClick) { close(); return; }
      try {
        setBusy(b, true);
        const keepOpen = await a.onClick(modal);
        if (a.close !== false && keepOpen !== false) close();
      } catch (e) { showError(e); } finally { setBusy(b, false); }
    });
    foot.appendChild(b);
    modal.buttons.push(b);
  });
  if (dismissible) {
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
    el.querySelector('[data-ms-close]')?.addEventListener('click', close);
  }
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  document.body.classList.add('ms-modal-open');
  (el.querySelector('[autofocus]') || el.querySelector('input, select, textarea, button:not([data-ms-close])') || el).focus?.();
  return modal;
}

/** await confirmDialog({ title, message, confirmText, danger }) -> true/false */
export function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    openModal({
      title, body: message, onClose: () => resolve(result),
      actions: [
        { label: cancelText, variant: 'ghost' },
        { label: confirmText, variant: danger ? 'danger' : 'primary', onClick: () => { result = true; } },
      ],
    });
  });
}

/** Empty state markup. action: { label, href } or { label, id } for a button. */
export function emptyState({ icon = 'fa-seedling', title = '', text = '', action = null } = {}) {
  const act = action
    ? (action.href ? html`<a class="ms-btn ms-btn--primary" href="${safeUrl(action.href)}">${action.label}</a>`
      : html`<button type="button" class="ms-btn ms-btn--primary" id="${action.id || ''}">${action.label}</button>`)
    : '';
  return html`<div class="ms-empty"><div class="ms-empty__icon"><i class="fas ${icon}" aria-hidden="true"></i></div>
    <div class="ms-empty__title">${title}</div>${text ? html`<p class="ms-empty__text">${text}</p>` : ''}${act}</div>`;
}
/** Skeleton placeholders: skeleton('cards', 3) | skeleton('list', 4) | skeleton('page'). */
export function skeleton(kind = 'cards', n = 3) {
  const card = '<div class="ms-card"><div class="ms-row ms-row--nowrap" style="--ms-gap:12px"><div class="ms-skel ms-skel--circle"></div><div class="ms-stack ms-grow" style="--ms-gap:8px"><div class="ms-skel ms-skel--title"></div><div class="ms-skel ms-skel--line" style="width:80%"></div></div></div><div class="ms-stack ms-mt-16" style="--ms-gap:8px"><div class="ms-skel ms-skel--line"></div><div class="ms-skel ms-skel--line" style="width:70%"></div></div></div>';
  if (kind === 'list') return raw(`<div class="ms-stack">${'<div class="ms-skel ms-skel--block" style="height:72px"></div>'.repeat(n)}</div>`);
  if (kind === 'page') return raw('<div class="ms-stack" style="--ms-gap:16px"><div class="ms-skel ms-skel--title" style="width:40%;height:28px"></div><div class="ms-skel ms-skel--line" style="width:70%"></div><div class="ms-skel ms-skel--block"></div><div class="ms-skel ms-skel--block"></div></div>');
  return raw(`<div class="ms-grid ms-grid--auto">${card.repeat(n)}</div>`);
}
export function loadingBlock(text = 'Loading...') {
  return html`<div class="ms-loading"><span class="ms-spinner" aria-hidden="true"></span><span>${text}</span></div>`;
}

/** Status badge for 'mentor' | 'match' | 'payout' | 'switch'. */
export function statusBadge(kind, key) {
  const map = { mentor: MENTOR_STATUS, match: MATCH_STATUS, payout: PAYOUT_STATUS, switch: SWITCH_STATUS }[kind] || {};
  const s = map[key] || { label: prettifyKey(key), tone: 'gray' };
  return html`<span class="ms-badge ms-tone-${s.tone}">${s.label}</span>`;
}
export function tierChip(tierKey) {
  const t = TIERS.find((x) => x.key === tierKey) || TIERS[0];
  return html`<span class="ms-chip ms-tone-${t.tone}">${t.label}</span>`;
}
/** Avatar with photo or initials. size: 'xs'|'sm'|''|'lg'|'xl'. verified adds a tick with a tooltip. */
export function avatarHtml({ name = '', photo_path = '', size = '', verified = false, verifiedTitle = 'Profile checked by Team MSC' } = {}) {
  const url = photoUrl(photo_path);
  const cls = `ms-avatar${size ? ` ms-avatar--${size}` : ''}`;
  const inner = url ? html`<img src="${url}" alt="${name}" loading="lazy" decoding="async">` : html`<span aria-hidden="true">${initials(name)}</span>`;
  const tick = verified ? html`<span class="ms-avatar__tick" title="${verifiedTitle}"><i class="fas fa-check"></i></span>` : '';
  return html`<span class="${cls}">${inner}${tick}</span>`;
}
/** ★ 4.8 (12), or a "New mentor" chip below the review threshold. */
export function ratingHtml(avg, count, minReviews = DEFAULT_CONFIG.min_reviews_for_rating) {
  if (!count || count < minReviews) return html`<span class="ms-chip ms-tone-blue"><i class="fas fa-seedling"></i>New mentor</span>`;
  return html`<span class="ms-rating"><i class="fas fa-star" aria-hidden="true"></i>${Number(avg || 0).toFixed(1)} <span>(${count})</span></span>`;
}
export function starsHtml(rating) {
  const r = Math.round(Number(rating || 0));
  return html`<span class="ms-stars" aria-label="${r} out of 5">${[1, 2, 3, 4, 5].map((i) => html`<i class="fas fa-star${i <= r ? '' : ' is-off'}"></i>`)}</span>`;
}

/** Copy to clipboard with a toast. */
export async function copyText(text, okMsg = 'Copied') {
  try { await navigator.clipboard.writeText(String(text ?? '')); toast(okMsg, { type: 'success' }); return true; } catch {
    const ta = document.createElement('textarea');
    ta.value = String(text ?? ''); ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    toast(ok ? okMsg : 'Could not copy. Please copy it manually.', { type: ok ? 'success' : 'error' });
    return ok;
  }
}

/** CSV text from rows. columns: [{ key, label, value?: (row) => any }]. Guards against formula injection. */
export function toCsv(rows, columns) {
  const cell = (v) => {
    let s = Array.isArray(v) ? v.join('; ') : v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => cell(c.label || c.key)).join(',');
  const body = (rows || []).map((r) => columns.map((c) => cell(c.value ? c.value(r) : r[c.key])).join(','));
  return [head, ...body].join('\r\n');
}
export function downloadCsv(filename, rows, columns) {
  const blob = new Blob(['﻿' + toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Video URL -> { kind: 'iframe'|'file'|'link', src } or null when empty. YouTube uses the nocookie host. */
export function embedVideo(url) {
  const u = safeUrl(url, { allowRelative: false });
  if (!u) return null;
  let m;
  if ((m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i.exec(u))) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&modestbranding=1` };
  if ((m = /vimeo\.com\/(?:video\/)?(\d+)/i.exec(u))) return { kind: 'iframe', src: `https://player.vimeo.com/video/${m[1]}` };
  if ((m = /loom\.com\/(?:share|embed)\/([\w-]+)/i.exec(u))) return { kind: 'iframe', src: `https://www.loom.com/embed/${m[1]}` };
  if ((m = /drive\.google\.com\/file\/d\/([\w-]+)/i.exec(u))) return { kind: 'iframe', src: `https://drive.google.com/file/d/${m[1]}/preview` };
  if (/\.(mp4|webm|m3u8)(\?|$)/i.test(u)) return { kind: 'file', src: u };
  return { kind: 'link', src: u };
}

/** Google Analytics event (no-op without gtag). Never send personal data. */
export function track(event, params = {}) {
  try { if (typeof window.gtag === 'function') window.gtag('event', event, { event_category: 'mentorship', ...params }); } catch { /* ignore */ }
}

/* ---------------------------------------------------------------------------
   8. SHELL: site header + drawer, mentorship sub-nav, footer
   Pages call initPage({ active }) (or mountShell) first thing; the page HTML has only
   <main id="ms-main" class="ms-main">. `active` is one of SUBNAV keys below.
   ------------------------------------------------------------------------ */

const SUBNAV = {
  hub: { href: PATHS.hub, icon: 'fa-compass', label: 'Overview' },
  find: { href: PATHS.find, icon: 'fa-magnifying-glass', label: 'Find a mentor' },
  'my-mentor': { href: PATHS.myMentor, icon: 'fa-user-group', label: 'My mentor' },
  apply: { href: PATHS.apply, icon: 'fa-hand-holding-heart', label: 'Become a mentor' },
  training: { href: PATHS.training, icon: 'fa-graduation-cap', label: 'Mentor training' },
  mentor: { href: PATHS.mentor, icon: 'fa-gauge', label: 'Mentor dashboard' },
  admin: { href: PATHS.admin, icon: 'fa-shield-halved', label: 'Admin' },
};

/** Which sub-nav links a visitor sees. */
export function subnavKeys(ctx) {
  const keys = ['hub', 'find', 'my-mentor'];
  const st = ctx?.mentor?.status;
  if (!st) keys.push('apply');
  else if (st === 'draft' || st === 'rejected') keys.push('apply');
  else if (st === 'submitted' || st === 'training_passed') keys.push('training', 'apply');
  else keys.push('mentor', 'training');
  if (ctx?.isStaff) keys.push('admin');
  return keys;
}

function headerHtml() {
  return `
<header class="site-header">
  <div class="header-container">
    <a href="/" class="brand-link"><img src="/assets/logo.png" alt="My Student Club" class="brand-logo"></a>
    <nav class="dv2-header-nav" aria-label="Primary">
      <a href="/" class="dv2-nav-link">Jobs</a>
      <a href="/history.html" class="dv2-nav-link">Applications</a>
      <div class="dv2-nav-dropdown">
        <a href="#" class="dv2-nav-link dv2-dropdown-trigger" data-ms-noop>Programs <i class="fas fa-chevron-down" style="font-size:.75rem;margin-left:.25rem;"></i></a>
        <div class="dv2-dropdown-menu">
          <a href="/ca-industrial-training-program/" class="dv2-dropdown-item">MSC Industrial Training Program</a>
          <a href="/articleship-program/" class="dv2-dropdown-item">MSC Articleship Program</a>
          <a href="/msc-ca-fresher-program/" class="dv2-dropdown-item">MSC CA Freshers Program</a>
        </div>
      </div>
      <a href="/learning-management-system/" class="dv2-nav-link">My Courses</a>
      <a href="/mentorship/" class="dv2-nav-link active">Mentorship</a>
      <a href="/contact.html" class="dv2-nav-link">Contact</a>
    </nav>
    <div class="nav-actions">
      <div class="auth-buttons-container"></div>
      <button class="icon-button menu-toggle-btn" id="menuButton" aria-label="Open menu" aria-controls="expandedMenu" aria-expanded="false">
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
    </div>
  </div>
</header>
<div class="expanded-menu" id="expandedMenu" aria-label="Menu">
  <button class="icon-button menu-close-btn" id="menuCloseBtn" aria-label="Close menu">
    <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
  </button>
  <div class="menu-items-container">
    <div class="ms-menu-label">Mentorship</div>
    <div id="ms-drawer-mentorship"></div>
    <div class="ms-menu-sep"></div>
    <a href="/learning-management-system/" class="menu-item" id="lms-nav-link" style="display:none;">My Courses</a>
    <a href="/" class="menu-item">Jobs</a>
    <a href="/ca-industrial-training-program/" class="menu-item">MSC Industrial Training Program</a>
    <a href="/articleship-program/" class="menu-item">MSC Articleship Program</a>
    <a href="/msc-ca-fresher-program/" class="menu-item">MSC CA Freshers Program</a>
    <div class="menu-item-dropdown">
      <button class="menu-item" id="resourcesDropdownBtn" aria-expanded="false">Free Resources
        <svg class="dropdown-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg></button>
      <div class="dropdown-content" id="resourcesDropdown">
        <a href="/ca-fresher-training-resources.html" class="dropdown-item">CA Fresher</a>
        <a href="/ca-industrial-training-resources.html" class="dropdown-item">Industrial Training</a>
        <a href="/ca-articleship-opportunities" class="dropdown-item">Articleship</a>
      </div>
    </div>
    <a href="/contact.html" class="menu-item">Contact Us</a>
  </div>
</div>`;
}

function footerHtml() {
  const year = new Date().getFullYear();
  return `
<footer class="ms-footer">
  <div class="ms-footer__inner">
    <div class="ms-footer__brand">
      <a href="/"><img src="/assets/logo-dark.png" alt="My Student Club"></a>
      <p>Mentors who have been through it, for CA students going through it. Hojayega.</p>
      <div class="ms-footer__social">
        <a href="https://www.linkedin.com/company/mystudentclub" target="_blank" rel="noopener" aria-label="LinkedIn"><i class="fab fa-linkedin-in"></i></a>
        <a href="https://www.instagram.com/my_student_club/" target="_blank" rel="noopener" aria-label="Instagram"><i class="fab fa-instagram"></i></a>
        <a href="https://www.youtube.com/@capadambhansali" target="_blank" rel="noopener" aria-label="YouTube"><i class="fab fa-youtube"></i></a>
      </div>
    </div>
    <div><h5>Mentorship</h5><ul>
      <li><a href="${PATHS.hub}">How it works</a></li>
      <li><a href="${PATHS.find}">Find a mentor</a></li>
      <li><a href="${PATHS.myMentor}">My mentor</a></li>
      <li><a href="${PATHS.apply}">Become a mentor</a></li>
    </ul></div>
    <div><h5>My Student Club</h5><ul>
      <li><a href="/">Jobs</a></li>
      <li><a href="/ca-industrial-training-program/">Industrial Training Program</a></li>
      <li><a href="/learning-management-system/">My Courses</a></li>
      <li><a href="/links/">All resources</a></li>
    </ul></div>
    <div><h5>Support</h5><ul>
      <li><a href="/contact.html">Contact us</a></li>
      <li><a href="/privacy-policy">Privacy policy</a></li>
      <li><a href="/ca-industrial-training-program/terms-and-conditions">Terms</a></li>
    </ul></div>
  </div>
  <div class="ms-footer__bottom"><p>&copy; ${year} My Student Club. Mentors share their own experience; nobody on MSC can promise a job, referral or placement, and no one should ask you for money.</p></div>
</footer>`;
}

function renderSubnav(active, ctx) {
  const keys = subnavKeys(ctx);
  if (active && SUBNAV[active] && !keys.includes(active)) keys.push(active);
  const links = keys.map((k) => {
    const s = k === 'apply' && ctx?.mentor ? { ...SUBNAV.apply, label: 'My application', icon: 'fa-file-lines' } : SUBNAV[k];
    return `<a href="${s.href}" class="${k === active ? 'is-active' : ''}"${k === active ? ' aria-current="page"' : ''}><i class="fas ${s.icon}" aria-hidden="true"></i>${s.label}</a>`;
  }).join('');
  const mock = MOCK ? `<a href="#" class="is-active" data-ms-mock title="Mock data (localhost only)"><i class="fas fa-flask"></i>Mock: ${escapeHtml(mockRole())}</a>` : '';
  const sub = document.getElementById('ms-subnav-inner');
  if (sub) sub.innerHTML = links + mock;
  const drawer = document.getElementById('ms-drawer-mentorship');
  if (drawer) drawer.innerHTML = keys.map((k) => `<a href="${SUBNAV[k].href}" class="menu-item${k === active ? ' is-active' : ''}">${k === 'apply' && ctx?.mentor ? 'My application' : SUBNAV[k].label}</a>`).join('');
}

function renderAuth(ctx) {
  const box = document.querySelector('.auth-buttons-container');
  if (!box) return;
  if (!ctx?.user) {
    box.innerHTML = `<a href="${escapeHtml(loginUrl())}" class="auth-icon-btn" aria-label="Log in"><i class="fas fa-sign-in-alt"></i></a>`;
    return;
  }
  const name = ctx.name || ctx.email || 'You';
  box.innerHTML = `
    <div class="user-profile-container"><div class="user-icon-wrapper">
      <div class="user-icon" role="button" tabindex="0" aria-label="Account menu">${escapeHtml(initials(name).charAt(0))}</div>
      <div class="user-hover-card"><div class="user-hover-content">
        <p class="user-email">${escapeHtml(name)}</p>
        <a href="/profile.html" class="profile-link-btn">Edit Profile</a>
        <button type="button" class="logout-btn" data-ms-logout>Logout</button>
      </div></div>
    </div></div>`;
  const wrap = box.querySelector('.user-icon-wrapper');
  const card = box.querySelector('.user-hover-card');
  const toggle = (e) => { e.stopPropagation(); card.classList.toggle('show'); };
  wrap.querySelector('.user-icon').addEventListener('click', toggle);
  wrap.querySelector('.user-icon').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') toggle(e); });
  box.querySelector('[data-ms-logout]').addEventListener('click', logout);
  const lms = document.getElementById('lms-nav-link');
  if (lms && ctx.enrolledPrograms?.length) lms.style.display = 'flex';
}

let _shellActive = '';
/**
 * Inject the site header, drawer, mentorship sub-nav and footer, and wire the menu.
 * Safe to call once per page. Auth avatar and role-aware links fill in when the context loads.
 */
export function mountShell({ active = '', subnav = true, footer = true } = {}) {
  if (document.body.dataset.msShell) return;
  document.body.dataset.msShell = '1';
  _shellActive = active;
  document.body.classList.add('ms-body');
  const top = (document.querySelector('.site-header') ? '' : headerHtml())
    + (subnav ? '<nav class="ms-subnav" aria-label="Mentorship"><div class="ms-subnav__inner" id="ms-subnav-inner"></div></nav>' : '');
  document.body.insertAdjacentHTML('afterbegin', top);
  if (footer && !document.querySelector('.ms-footer')) {
    const main = document.querySelector('main');
    (main || document.body).insertAdjacentHTML(main ? 'afterend' : 'beforeend', footerHtml());
  }
  renderSubnav(active, null);

  const menu = document.getElementById('expandedMenu');
  const openBtn = document.getElementById('menuButton');
  const setMenu = (open) => { menu?.classList.toggle('active', open); openBtn?.setAttribute('aria-expanded', open ? 'true' : 'false'); };
  openBtn?.addEventListener('click', (e) => { e.stopPropagation(); setMenu(true); });
  document.getElementById('menuCloseBtn')?.addEventListener('click', () => setMenu(false));
  const resBtn = document.getElementById('resourcesDropdownBtn');
  resBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = document.getElementById('resourcesDropdown')?.classList.toggle('active');
    resBtn.querySelector('.dropdown-icon')?.classList.toggle('open', !!open);
    resBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.querySelectorAll('[data-ms-noop]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));
  document.addEventListener('click', (e) => {
    if (menu?.classList.contains('active') && !menu.contains(e.target)) setMenu(false);
    document.querySelectorAll('.user-hover-card.show').forEach((c) => { if (!c.parentElement.contains(e.target)) c.classList.remove('show'); });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  document.querySelector('[data-ms-mock]')?.addEventListener('click', (e) => e.preventDefault());

  getContext().then((ctx) => { renderAuth(ctx); renderSubnav(_shellActive, ctx); bindMockSwitcher(); })
    .catch(() => renderAuth(null));
}

/**
 * Standard page start:
 *   const ctx = await initPage({ active: 'find', auth: true });
 * auth: true sends logged-out visitors to /login.html?redirect=<this page>.
 */
export async function initPage({ active = '', auth = false, subnav = true, footer = true } = {}) {
  mountShell({ active, subnav, footer });
  if (auth) await requireLogin();
  return getContext();
}

/* ---------------------------------------------------------------------------
   9. MOCK MODE (UI development without a backend). Only on localhost / *.localhost /
   *.test. Turn on with ?mock=1 (persists), off with ?mock=0. Pick the persona with
   ?as=student|unmatched|guest|applicant|trainee|mentor|admin|logout.
   Fixtures + handlers: /mentorship/assets/mock-data.js (contract examples of every RPC).
   Pages can add their own: registerMocks({ mentorship_x: (args) => data }).
   A handler throws `new MsError('mentor_full')` to simulate an error.
   ------------------------------------------------------------------------ */

const MOCK = (() => {
  try {
    const h = location.hostname;
    const local = h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost') || h.endsWith('.test');
    if (!local) return false;
    const p = new URLSearchParams(location.search);
    if (p.has('mock')) localStorage.setItem('ms_mock', p.get('mock') === '0' ? '0' : '1');
    if (p.has('as')) localStorage.setItem('ms_mock_as', p.get('as'));
    return localStorage.getItem('ms_mock') === '1';
  } catch { return false; }
})();
export function isMockMode() { return MOCK; }
export function mockRole() { try { return localStorage.getItem('ms_mock_as') || 'student'; } catch { return 'student'; } }

const _mocks = new Map();
let _mockSession = null;
export function registerMocks(map) { Object.entries(map || {}).forEach(([k, v]) => _mocks.set(k, v)); }
export function setMockSession(session) { _mockSession = session; }

const _mockReady = MOCK ? import('/mentorship/assets/mock-data.js?v=1').catch((e) => console.warn('[mentorship] mock data failed to load', e)) : Promise.resolve();

async function mockSession() {
  await _mockReady;
  return _mockSession;
}
async function mockCall(fn, args) {
  await _mockReady;
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 250));
  const h = _mocks.get(fn);
  if (!h) throw new MsError('backend_missing', `${ERROR_COPY.backend_missing} (no mock for ${fn})`);
  try {
    const out = await h(args || {});
    return out === undefined ? null : JSON.parse(JSON.stringify(out));
  } catch (e) { throw e instanceof MsError ? e : new MsError('unknown', String(e?.message || e)); }
}

function bindMockSwitcher() {
  const a = document.querySelector('[data-ms-mock]');
  if (!a) return;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const roles = ['student', 'unmatched', 'guest', 'applicant', 'trainee', 'mentor', 'admin', 'logout'];
    openModal({
      title: 'Mock persona (localhost only)',
      body: html`<div class="ms-stack">${roles.map((r) => html`<a class="ms-btn ms-btn--outline ms-btn--block" href="?as=${r}">${r}</a>`)}
        <a class="ms-btn ms-btn--ghost ms-btn--block" href="?mock=0">Turn mock mode off</a></div>`,
    });
  });
}
