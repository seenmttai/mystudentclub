/* =============================================================================
   /mentorship/training/ : mentor lecture, written playbook and the quiz.
   Owner: mentor builder. SPEC §8. The quiz key never reaches the client:
   questions come from mentorship_quiz_questions() and grading is server-side.
   ========================================================================== */
import {
  initPage, rpc, html, setContent, showError, skeleton, toast, setBusy, isMockMode, getContext,
  embedVideo, safeUrl, FIRST_MESSAGES, DUTIES, RESOURCES, PATHS, formatDate, formatDateTime, formatINR,
  fillTemplate, copyText, track, statusBadge,
} from '/mentorship/assets/mentorship-core.js?v=1';
import {
  backendNotReady, loadError, bindRetry, statusScreen, loggedOutScreen, templateVars, escalationLink, padamGptUrl, scrollToEl, local,
} from '/mentorship/mentor/mentor-common.js?v=1';

if (isMockMode()) await import('/mentorship/mentor/mock-status.js?v=1');

const main = document.getElementById('ms-main');
setContent(main, html`<div class="ms-container ms-section">${skeleton('page')}</div>`);
const ctx = await initPage({ active: 'training' });
const config = ctx.config;
const FEE = Number(config.mentor_fee_inr ?? 500);
const VIDEO = embedVideo(config.lecture_video_url);
const GPT = padamGptUrl(config);

let mm = null;          // mentorship_my_mentor()
let quiz = null;        // mentorship_quiz_questions()
let answers = {};
let lastResult = null;
const answersKey = () => `ms_quiz_answers_${ctx.user?.id || 'anon'}`;
const lastKey = () => `ms_quiz_last_${ctx.user?.id || 'anon'}`;

const training = () => mm?.mentor?.training || {};
const quizPassedAt = () => mm?.quiz?.passed_at || mm?.mentor?.quiz_passed_at || quiz?.passed_at || null;
const lectureDone = () => !!training().lecture_at;
const playbookDone = () => !!training().playbook_at;
const quizReady = () => playbookDone() && (!VIDEO || lectureDone());
const passPct = () => Number(quiz?.pass_pct ?? mm?.quiz?.pass_pct ?? config.quiz_pass_pct ?? 80);
const cooldownHours = () => Number(quiz?.cooldown_hours ?? mm?.quiz?.cooldown_hours ?? config.quiz_cooldown_hours ?? 24);
const nextAttemptAt = () => {
  const t = quiz?.next_attempt_at ?? mm?.quiz?.next_attempt_at ?? lastResult?.next_attempt_at ?? null;
  return t && Date.parse(t) > Date.now() ? t : null;
};

/* ---------------------------------------------------------------------------
   Header + progress
   ------------------------------------------------------------------------ */
function partState() {
  return [
    { id: 'lecture', n: 1, title: 'Lecture', done: lectureDone(), soon: !VIDEO, at: training().lecture_at },
    { id: 'playbook', n: 2, title: 'Playbook', done: playbookDone(), at: training().playbook_at },
    { id: 'quiz', n: 3, title: 'Quiz', done: !!quizPassedAt(), at: quizPassedAt(), locked: !quizReady() && !quizPassedAt() },
  ];
}
function progressHtml() {
  return html`<ol class="ms-training-progress">${partState().map((p) => html`
    <li class="${p.done ? 'is-done' : p.locked ? 'is-locked' : ''}"><a href="#${p.id}" data-jump="${p.id}">
      <span class="ms-training-progress__dot">${p.done ? html`<i class="fas fa-check" aria-hidden="true"></i>` : p.locked ? html`<i class="fas fa-lock" aria-hidden="true"></i>` : p.n}</span>
      <span class="ms-training-progress__text"><strong>${p.title}</strong>
        <small>${p.done ? (p.at ? `Done ${formatDate(p.at, { year: undefined })}` : 'Done') : p.soon ? 'Coming soon' : p.locked ? 'Locked' : 'To do'}</small></span>
    </a></li>`)}</ol>`;
}
function refreshProgress() {
  main.querySelectorAll('[data-progress]').forEach((el) => setContent(el, progressHtml()));
}

/* ---------------------------------------------------------------------------
   1. Lecture
   ------------------------------------------------------------------------ */
function lectureHtml() {
  let media;
  if (!VIDEO) {
    media = html`<div class="ms-coming-soon"><span class="ms-coming-soon__icon"><i class="fas fa-play" aria-hidden="true"></i></span>
      <span class="ms-coming-soon__title">Padam's mentor lecture is coming soon</span>
      <span class="ms-coming-soon__text">It will appear right here. Read the playbook and take the quiz meanwhile.</span></div>`;
  } else if (VIDEO.kind === 'iframe') {
    media = html`<div class="ms-video"><iframe src="${VIDEO.src}" title="MSC mentor lecture" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  } else if (VIDEO.kind === 'file') {
    media = html`<div class="ms-video"><video controls playsinline preload="metadata" src="${VIDEO.src}"></video></div>`;
  } else {
    media = html`<div class="ms-coming-soon"><span class="ms-coming-soon__icon"><i class="fas fa-up-right-from-square" aria-hidden="true"></i></span>
      <span class="ms-coming-soon__title">Padam's mentor lecture</span>
      <a class="ms-btn ms-btn--gradient" href="${VIDEO.src}" target="_blank" rel="noopener"><i class="fas fa-play" aria-hidden="true"></i><span>Open the lecture</span></a></div>`;
  }
  const foot = !VIDEO
    ? html`<span class="ms-small ms-muted"><i class="fas fa-circle-info" aria-hidden="true"></i> The quiz is open without it. We will add the lecture here.</span>`
    : lectureDone()
      ? html`<span class="ms-training-done"><i class="fas fa-circle-check" aria-hidden="true"></i>Watched ${formatDate(training().lecture_at)}</span>`
      : html`<button type="button" class="ms-btn ms-btn--primary" data-mark="lecture"><i class="fas fa-check" aria-hidden="true"></i><span>I have watched the lecture</span></button>`;
  return html`${partHead(1, "Padam's mentor lecture", 'How to be the senior you wish you had: the duties, the weekly rhythm, and what students need most.', lectureDone() ? 'done' : !VIDEO ? 'soon' : 'todo')}
    ${media}
    <div class="ms-training-part__foot">${foot}</div>`;
}

function partHead(n, title, sub, state) {
  const badge = { done: html`<span class="ms-badge ms-tone-green"><i class="fas fa-check" aria-hidden="true"></i>Done</span>`,
    soon: html`<span class="ms-soon-pill">Coming soon</span>`, locked: html`<span class="ms-badge ms-tone-gray"><i class="fas fa-lock" aria-hidden="true"></i>Locked</span>`,
    todo: html`<span class="ms-badge ms-tone-blue">To do</span>`, retry: html`<span class="ms-badge ms-tone-amber"><i class="fas fa-clock" aria-hidden="true"></i>Retry soon</span>` }[state] || '';
  return html`<header class="ms-training-part__head">
    <span class="ms-training-part__num">${n}</span>
    <div class="ms-grow"><div class="ms-training-part__title"><h2 class="ms-h3">${title}</h2>${badge}</div><p class="ms-small ms-text-2">${sub}</p></div>
  </header>`;
}

/* ---------------------------------------------------------------------------
   2. Playbook
   ------------------------------------------------------------------------ */
const DUTY_GROUPS = [
  { title: 'Responding', keys: ['reply_within_5h', 'no_unread_eod', 'urgent_calls'] },
  { title: 'Weekly rhythm', keys: ['weekly_call', 'log_on_dashboard'] },
  { title: 'Hunt support', keys: ['cv_review', 'mock_interview', 'keep_them_applying', 'know_resources', 'use_padam_gpt', 'elder_sibling'] },
  { title: 'Joining', keys: ['joining_help', 'joining_post'] },
  { title: 'Never', keys: ['no_selling', 'no_poaching', 'no_guessing', 'no_placement_promise', 'privacy'] },
];
const RESOURCE_WHEN = {
  links: 'Day 1, with your intro. Everything lives here.',
  jobs: 'Every week. Go through fresh openings that fit their domain.',
  lms: 'Week 1, so they finish the recorded program lectures early.',
  cv_reviewer: 'Before your CV review, so your call goes on the big fixes.',
  cv_builder: 'When their CV needs a clean one-page format.',
  it_guidebook: 'Week 1. The full IT hunt, step by step.',
  it_free: 'Anytime they want extra free material.',
};
const resourceWhen = (r) => RESOURCE_WHEN[r.key] || (r.key.startsWith('booklet_') ? 'Once they pick a domain, before mock interviews.' : r.desc || '');

function templateBlock(t, vars, i) {
  const text = fillTemplate(t.text, vars);
  return html`<div class="ms-training-tpl">
    <div class="ms-row ms-between"><div><div class="ms-strong ms-small">${t.title}</div><div class="ms-xs ms-muted">${t.when}</div></div>
      <button type="button" class="ms-btn ms-btn--soft ms-btn--sm" data-copy-tpl="${i}"><i class="fas fa-copy" aria-hidden="true"></i><span>Copy</span></button></div>
    <span class="ms-template">${text}</span>
  </div>`;
}

function acc(id, n, title, body, open = false) {
  return html`<details class="ms-acc ms-training-acc" id="pb-${id}" ${open ? 'open' : ''} data-acc="${id}">
    <summary><span class="ms-training-acc__title"><span class="ms-training-acc__n">${n}</span>${title}</span></summary>
    <div class="ms-acc__body ms-prose">${body}</div>
  </details>`;
}

const PLAYBOOK_TOC = [
  ['role', 'Your role'], ['duties', 'The duties'], ['first24', 'Your first 24 hours'], ['weekly', 'Weekly call script'],
  ['cv', 'CV review checklist'], ['mock', 'Mock interview guide'], ['applying', 'Keep them applying'], ['resources', 'MSC resources'],
  ['gpt', 'Padam GPT'], ['offer', 'After the offer'], ['escalation', 'Escalation'], ['dos', "Dos and don'ts"], ['payouts', 'Payouts'],
];

function playbookHtml() {
  const mentor = mm?.mentor || {};
  const vars = { ...templateVars({ mentor, menteeName: '', program: (mentor.programs || [])[0] || 'industrial-training', config }), mentee_first: '[mentee name]' };
  const byKey = Object.fromEntries(DUTIES.map((d) => [d.key, d]));
  const esc = mm?.escalation || {};
  const escLink = escalationLink(esc, mentor);
  const linksUrl = config.links_url || 'https://www.mystudentclub.com/links';
  const sec = Object.fromEntries(PLAYBOOK_TOC);

  const body = [
    acc('role', 1, sec.role, html`
      <p>You are an elder brother or sister for one student's hunt, from week 1 until their joining post goes up. You are not a teacher or a placement agent. You are the senior who has been there, who picks up, who tells the truth kindly, and who keeps them going on bad weeks.</p>
      <h3>What great mentoring looks like</h3>
      <ul><li>Responds within a few hours, every time.</li><li>One call every week, logged on the dashboard.</li><li>CV fixed in the first week or two.</li><li>At least one full mock interview before real interviews.</li><li>Celebrates the offer, then helps them join.</li></ul>
      <div class="ms-hojayega">Most students do not need a genius. They need someone who checks in every week and believes them when they say it is hard. That is you.</div>`, true),
    acc('duties', 2, sec.duties, html`<p>These are the promises you ticked one by one on your application. Students count on every one of them.</p>
      ${DUTY_GROUPS.map((g) => html`<h3>${g.title}</h3><ul class="ms-training-duties">${g.keys.map((k) => html`<li><strong>${byKey[k].title}</strong><span>${byKey[k].detail}</span></li>`)}</ul>`)}`),
    acc('first24', 3, sec.first24, html`
      <ol><li><strong>Send the intro message within 24 hours</strong> of the match. Your dashboard fills in their name and opens WhatsApp for you.</li>
        <li><strong>Ask for three things:</strong> their latest CV, the domains they want, and where they have applied so far.</li>
        <li><strong>Fix the first call:</strong> 15 minutes, at a time that suits them.</li>
        <li><strong>Tick "Intro WhatsApp sent"</strong> on your dashboard, so Team MSC knows you have started.</li></ol>
      <h3>Message templates</h3>
      <p class="ms-small ms-muted">Filled in with your details. On your dashboard, each one also fills in the mentee's name.</p>
      <div class="ms-stack" style="--ms-gap:12px">${FIRST_MESSAGES.map((t, i) => templateBlock(t, vars, i))}</div>`),
    acc('weekly', 4, sec.weekly, html`
      <ol class="ms-training-script">
        <li><span class="ms-training-script__t">0 to 2 min</span><strong>Opening.</strong> "How was your week?" Listen first.</li>
        <li><span class="ms-training-script__t">2 to 6 min</span><strong>Numbers.</strong> Applications sent, shortlists, interviews, and where they are now.</li>
        <li><span class="ms-training-script__t">6 to 10 min</span><strong>Blockers.</strong> What is stuck: the CV, the domain choice, confidence, exams, family pressure?</li>
        <li><span class="ms-training-script__t">10 to 13 min</span><strong>One focus for next week.</strong> For example 10 good applications, two CV fixes, or revising one domain.</li>
        <li><span class="ms-training-script__t">13 to 15 min</span><strong>Close.</strong> Fix the date and time of the next call.</li>
      </ol>
      <p><strong>Afterwards:</strong> log it on your dashboard right after the call (week, stage, applications, notes). It takes 30 seconds, and it is how Team MSC knows to step in early if someone is stuck.</p>`),
    acc('cv', 5, sec.cv, html`
      <ul class="ms-training-checks">
        <li>One page.</li><li>Contact details and LinkedIn at the top.</li>
        <li>Articleship work first, with specifics: clients by industry (not names), audits handled, tools used.</li>
        <li>Skills that match the target domain.</li><li>Scores and attempts stated honestly.</li>
        <li>No photo and no long objective.</li><li>Consistent dates, saved as a PDF, with a sensible file name (Firstname_Lastname_CV.pdf).</li>
        <li>Re-check the revised version. Most CVs need two rounds.</li>
      </ul>
      <p>Before your review, ask them to run it through the <a href="${RESOURCES.find((r) => r.key === 'cv_reviewer')?.url}" target="_blank" rel="noopener">AI CV reviewer</a>. If the format is messy, the <a href="${RESOURCES.find((r) => r.key === 'cv_builder')?.url}" target="_blank" rel="noopener">CV builder</a> gives a clean one-page layout.</p>`),
    acc('mock', 6, sec.mock, html`
      <p>30 to 45 minutes, on a video or voice call, before their real interviews. Treat it like the real thing.</p>
      <ol><li>"Tell me about yourself" in 60 to 90 seconds.</li><li>Why this domain, and why this firm.</li><li>An articleship deep-dive: what they did, what they learnt, one problem they solved.</li>
        <li>5 to 8 technical questions from their domain. Use the MSC interview booklets.</li><li>One situational question ("Your senior asks you to ...").</li><li>Their questions for the interviewer.</li></ol>
      <p><strong>Feedback:</strong> 3 strengths and 3 fixes, said plainly. Then repeat the weakest answers until they sound natural. Tick "Mock interview done" on your dashboard.</p>`),
    acc('applying', 7, sec.applying, html`
      <ul><li>Set a weekly target together, for example 10 good applications.</li>
        <li>Openings mostly come late: "sate hai, wo last last mein hi aate hai". Say it often, especially in slow weeks.</li>
        <li>Rejections are normal. Look for the pattern, fix one thing, keep going.</li>
        <li>Never let them quit early. If they talk about dropping IT, slow down, ask why, and talk to your senior mentor if you are worried.</li>
        <li>No promises. Say "we will prepare well and keep applying", never "you will get it".</li></ul>
      <div class="ms-hojayega">Slow weeks are part of every hunt. Your job is to make sure they keep showing up.</div>`),
    acc('resources', 8, sec.resources, html`
      <p>Everything is on one page: <a href="${safeUrl(linksUrl)}" target="_blank" rel="noopener">${linksUrl.replace(/^https?:\/\/(www\.)?/, '')}</a>. Know these well and share the right one at the right time.</p>
      <ul class="ms-training-res">${RESOURCES.map((r) => html`<li>
        <span class="ms-training-res__icon"><i class="fas ${r.icon}" aria-hidden="true"></i></span>
        <span class="ms-grow"><a href="${safeUrl(r.url)}" target="_blank" rel="noopener" class="ms-strong">${r.label}</a><small>${resourceWhen(r)}</small></span>
        <button type="button" class="ms-icon-btn" data-copy-url="${r.url}" aria-label="Copy link to ${r.label}"><i class="fas fa-copy" aria-hidden="true"></i></button>
      </li>`)}</ul>`),
    acc('gpt', 9, sec.gpt, html`
      <p>Padam GPT is an AI trained on Padam's answers to student questions. Use it for interview-prep questions (domain basics, technical topics, a first draft of "tell me about yourself"), then add your own experience on top.</p>
      <p>Never paste a mentee's personal details, CV or marks into it, or into any AI tool.</p>
      <p>${GPT ? html`<a class="ms-btn ms-btn--gradient ms-btn--sm" href="${GPT}" target="_blank" rel="noopener"><i class="fas fa-robot" aria-hidden="true"></i><span>Open Padam GPT</span></a>`
        : html`<span class="ms-soon-pill"><i class="fas fa-robot" aria-hidden="true"></i>Coming soon</span> Until it is live, use the interview booklets and ask your senior mentor.`}</p>`),
    acc('offer', 10, sec.offer, html`
      <ol><li><strong>Read the offer letter together:</strong> stipend, duration, start date, location and any terms.</li>
        <li><strong>Joining formalities:</strong> documents and the ICAI paperwork for industrial training. Check the latest ICAI requirements together, and ask your senior mentor if anything is unclear.</li>
        <li><strong>First-week doubts:</strong> stay reachable in their first week at work.</li>
        <li><strong>The joining LinkedIn post</strong> tags <strong>Padam Bhansali, My Student Club, you (the mentor) and their parents</strong>. The "Joining post reminder" template is ready on your dashboard.</li>
        <li><strong>Tick</strong> Offer received, Joining formalities helped, Joined and Joining post tagged.</li></ol>`),
    acc('escalation', 11, sec.escalation, html`
      <p>Message your senior mentor on WhatsApp (there is a button on your dashboard) when:</p>
      <ul><li>You are not sure of an answer. Never guess.</li><li>A mentee has been silent for 8 days.</li>
        <li>You are worried about a mentee's wellbeing. Do this the same day.</li><li>Anything about money, payments or behaviour.</li></ul>
      <p>If a mentee says they might hurt themselves, or you think they are in danger, tell your senior mentor right away and share Tele-MANAS, the free national mental health helpline: <strong>14416</strong> (24x7).</p>
      <p><a class="ms-btn ms-btn--${escLink.kind === 'whatsapp' ? 'whatsapp' : 'outline'} ms-btn--sm" href="${safeUrl(escLink.href)}" ${escLink.kind === 'contact' ? '' : html`target="_blank" rel="noopener"`}>
        <i class="${escLink.kind === 'whatsapp' ? 'fab fa-whatsapp' : 'fas fa-envelope'}" aria-hidden="true"></i><span>Contact ${escLink.label}</span></a></p>`),
    acc('dos', 12, sec.dos, html`
      <div class="ms-training-dos">
        <div><h3><i class="fas fa-circle-check" aria-hidden="true"></i>Do</h3><ul><li>Respond within 4 to 5 hours.</li><li>Be honest, even when it is not what they want to hear.</li><li>Log every call.</li><li>Keep everything they share private.</li></ul></div>
        <div><h3><i class="fas fa-circle-xmark" aria-hidden="true"></i>Don't</h3><ul><li>Sell courses, groups or services.</li><li>Move mentees to other groups.</li><li>Take money or favours.</li><li>Promise a job, a referral or a placement.</li><li>Paste personal details into AI tools.</li><li>Log calls that did not happen.</li></ul></div>
      </div>`),
    acc('payouts', 13, sec.payouts, html`
      <p><strong>${formatINR(FEE)} per mentee</strong>, paid by Team MSC. Your dashboard shows the status of every payout: Not due yet, Due and Paid.</p>
      <p>No money ever comes from mentees. If a mentee offers money or a gift, say no kindly and tell your senior mentor.</p>`),
  ];

  const foot = playbookDone()
    ? html`<span class="ms-training-done"><i class="fas fa-circle-check" aria-hidden="true"></i>Read ${formatDate(training().playbook_at)}</span>
        ${quizPassedAt() ? '' : html`<a class="ms-btn ms-btn--primary ms-btn--sm" href="#quiz" data-jump="quiz"><span>Go to the quiz</span><i class="fas fa-arrow-down" aria-hidden="true"></i></a>`}`
    : html`<span class="ms-small ms-muted">Read every section once. You can come back anytime.</span>
        <button type="button" class="ms-btn ms-btn--primary" data-mark="playbook"><i class="fas fa-check" aria-hidden="true"></i><span>I have read the playbook</span></button>`;
  return html`${partHead(2, 'The mentor playbook', 'Everything from your first 24 hours to the joining post. Open each section; the templates have copy buttons.', playbookDone() ? 'done' : 'todo')}
    <div class="ms-training-acclist">${body}</div>
    <div class="ms-training-part__foot">${foot}</div>`;
}

/* ---------------------------------------------------------------------------
   3. Quiz
   ------------------------------------------------------------------------ */
function quizIntro() {
  const total = quiz?.questions?.length || 12;
  const need = Math.ceil((passPct() * total) / 100);
  return `${total} scenario questions. You need ${passPct()}% (${need} of ${total}) to pass. If you miss it, you can try again after ${cooldownHours()} hours.`;
}

function quizHtml() {
  const passed = quizPassedAt();
  const state = passed ? 'done' : !quizReady() ? 'locked' : (lastResult || nextAttemptAt()) ? 'retry' : 'todo';
  const head = partHead(3, 'The mentor quiz', quizIntro(), state);
  if (passed) return html`${head}${passedHtml(lastResult?.passed ? lastResult : null)}`;
  if (!quizReady()) {
    const need = !playbookDone() && VIDEO && !lectureDone() ? 'Watch the lecture and read the playbook first.' : !playbookDone() ? 'Read the playbook first.' : 'Watch the lecture first.';
    return html`${head}<div class="ms-training-locked"><i class="fas fa-lock" aria-hidden="true"></i><div><strong>${need}</strong>
      <span class="ms-small ms-text-2">Then tap "I have read the playbook" at the end of it, and the quiz opens here.</span></div>
      <a class="ms-btn ms-btn--secondary ms-btn--sm" href="#${!playbookDone() ? 'playbook' : 'lecture'}" data-jump="${!playbookDone() ? 'playbook' : 'lecture'}"><span>${!playbookDone() ? 'Open the playbook' : 'Open the lecture'}</span></a></div>`;
  }
  if (lastResult) return html`${head}${resultHtml(lastResult)}`;
  const next = nextAttemptAt();
  if (next) return html`${head}${cooldownHtml(next)}`;
  if (!quiz) return html`${head}<div data-quiz-body>${skeletonQuiz()}</div>`;
  return html`${head}${questionsHtml()}`;
}
const skeletonQuiz = () => html`<div class="ms-stack"><div class="ms-skel ms-skel--block" style="height:150px"></div><div class="ms-skel ms-skel--block" style="height:150px"></div></div>`;

function questionsHtml() {
  const qs = quiz.questions || [];
  if (!qs.length) return html`<div class="ms-callout ms-callout--gray"><i class="fas fa-hourglass-half" aria-hidden="true"></i><div>The quiz is being set up. Please check back soon.</div></div>`;
  const answered = qs.filter((q) => answers[q.id]).length;
  return html`<form class="ms-training-quiz" data-quiz novalidate>
    ${quiz.attempts ? html`<div class="ms-callout ms-mb-16"><i class="fas fa-rotate-right" aria-hidden="true"></i><div>Attempt ${quiz.attempts + 1}. Take your time; the playbook has every answer.</div></div>` : ''}
    <ol class="ms-training-questions">${qs.map((q, i) => html`
      <li class="ms-training-q" data-q="${q.id}">
        <fieldset class="ms-fieldset">
          <legend class="ms-training-q__prompt"><span class="ms-training-q__num">Q${i + 1}</span>${q.prompt}</legend>
          <div class="ms-options">${(q.options || []).map((o) => html`
            <label class="ms-option"><input type="radio" name="q-${q.id}" value="${o.key}" ${answers[q.id] === o.key ? 'checked' : ''}>
              <span class="ms-option__mark"></span><span class="ms-option__body"><span class="ms-option__desc ms-training-q__opt">${o.text}</span></span></label>`)}
          </div>
        </fieldset>
      </li>`)}</ol>
    <div class="ms-sticky-actions ms-training-quizbar">
      <div class="ms-grow ms-stack" style="--ms-gap:4px">
        <span class="ms-small ms-strong" data-answered>${answered} of ${qs.length} answered</span>
        <div class="ms-progress"><div class="ms-progress__bar" data-answered-bar style="width:${Math.round((answered * 100) / qs.length)}%"></div></div>
      </div>
      <button type="submit" class="ms-btn ms-btn--primary" data-submit-quiz ${answered < qs.length ? 'disabled' : ''}><span>Submit answers</span></button>
    </div>
  </form>`;
}

function scoreRing(pct, passed) {
  return html`<div class="ms-score${passed ? '' : ' ms-score--fail'}" style="--pct:${Math.max(0, Math.min(100, Number(pct) || 0))}" role="img" aria-label="Score ${pct} percent"><span>${pct}%</span></div>`;
}
function qNumber(id) {
  const i = (quiz?.questions || []).findIndex((q) => q.id === id);
  return i >= 0 ? i + 1 : null;
}

function resultHtml(r) {
  if (r.passed) return passedHtml(r);
  const wrong = (r.wrong_ids || []).map((id) => ({ id, n: qNumber(id), prompt: (quiz?.questions || []).find((q) => q.id === id)?.prompt || '' })).sort((a, b) => (a.n || 0) - (b.n || 0));
  const next = r.next_attempt_at;
  return html`<div class="ms-training-result">
      ${scoreRing(r.score_pct, false)}
      <div class="ms-stack" style="--ms-gap:4px"><h3 class="ms-h3">Almost there</h3>
        <p class="ms-text-2 ms-small">${r.correct} of ${r.total} correct. The pass mark is ${passPct()}%.</p></div>
    </div>
    ${wrong.length ? html`<div class="ms-callout ms-callout--warn ms-mt-16"><i class="fas fa-book-open" aria-hidden="true"></i><div>
      <span class="ms-callout__title">${wrong.length === 1 ? 'Question' : 'Questions'} ${wrong.map((w) => w.n).filter(Boolean).join(', ')} need${wrong.length === 1 ? 's' : ''} another look</span>
      <ul class="ms-training-wrong">${wrong.map((w) => html`<li><strong>Q${w.n}.</strong> ${w.prompt}</li>`)}</ul></div></div>` : ''}
    <div class="ms-training-part__foot">
      <span class="ms-small ms-text-2"><i class="fas fa-clock" aria-hidden="true"></i> ${next ? html`You can try again from <strong>${formatDateTime(next)}</strong>.` : 'You can try again soon.'}</span>
      <a class="ms-btn ms-btn--secondary ms-btn--sm" href="#playbook" data-jump="playbook"><i class="fas fa-book-open" aria-hidden="true"></i><span>Reread the playbook</span></a>
    </div>`;
}

function cooldownHtml(next) {
  const last = local.get(lastKey());
  const best = mm?.quiz?.best_pct ?? quiz?.best_pct ?? last?.score ?? null;
  return html`<div class="ms-training-result">
      ${best !== null ? scoreRing(best, false) : html`<div class="ms-training-clock"><i class="fas fa-hourglass-half" aria-hidden="true"></i></div>`}
      <div class="ms-stack" style="--ms-gap:4px"><h3 class="ms-h3">Next try opens soon</h3>
        <p class="ms-text-2 ms-small">You can retake the quiz from <strong>${formatDateTime(next)}</strong>. Use the time to reread the playbook.</p></div>
    </div>
    ${last?.wrong?.length ? html`<div class="ms-callout ms-callout--warn ms-mt-16"><i class="fas fa-book-open" aria-hidden="true"></i><div>
      <span class="ms-callout__title">Questions to look at again</span>
      <ul class="ms-training-wrong">${last.wrong.map((w) => html`<li><strong>Q${w.n}.</strong> ${w.prompt}</li>`)}</ul></div></div>` : ''}
    <div class="ms-training-part__foot"><a class="ms-btn ms-btn--secondary ms-btn--sm" href="#playbook" data-jump="playbook"><i class="fas fa-book-open" aria-hidden="true"></i><span>Reread the playbook</span></a></div>`;
}

function passedHtml(r = null) {
  const status = mm?.mentor?.status;
  const pct = r?.score_pct ?? mm?.quiz?.best_pct ?? mm?.mentor?.quiz_best_pct ?? null;
  const exp = r?.explanations || {};
  const expList = Object.keys(exp).map((id) => ({ id, n: qNumber(id), prompt: (quiz?.questions || []).find((q) => q.id === id)?.prompt || '', text: exp[id] }))
    .sort((a, b) => (a.n || 99) - (b.n || 99));
  const live = status === 'approved' || status === 'paused';
  return html`<div class="ms-training-result">
      ${pct !== null ? scoreRing(pct, true) : html`<div class="ms-training-clock is-good"><i class="fas fa-check" aria-hidden="true"></i></div>`}
      <div class="ms-stack" style="--ms-gap:4px"><h3 class="ms-h3">${r ? 'You passed!' : 'Quiz passed'}</h3>
        <p class="ms-text-2 ms-small">${r ? `${r.correct} of ${r.total} correct.` : ''} Passed ${formatDate(quizPassedAt() || Date.now())}.</p></div>
    </div>
    ${expList.length ? html`<details class="ms-acc ms-mt-16" open><summary>Why each answer is right</summary><div class="ms-acc__body">
      <ol class="ms-training-explain">${expList.map((e) => html`<li><strong>${e.n ? `Q${e.n}. ` : ''}${e.prompt}</strong><span>${e.text}</span></li>`)}</ol></div></details>` : ''}
    ${live
      ? html`<div class="ms-callout ms-callout--success ms-mt-16"><i class="fas fa-circle-check" aria-hidden="true"></i><div><span class="ms-callout__title">You are an approved MSC mentor</span>Your mentees, checklists and calls are on your dashboard.
          <div class="ms-mt-8"><a class="ms-btn ms-btn--primary ms-btn--sm" href="${PATHS.mentor}"><i class="fas fa-gauge" aria-hidden="true"></i><span>Open your dashboard</span></a></div></div></div>`
      : html`<div class="ms-hojayega ms-mt-16">You're in review. Team MSC reviews every application within 7 days, and we will email you the decision.</div>`}`;
}

/* ---------------------------------------------------------------------------
   Render
   ------------------------------------------------------------------------ */
function render() {
  const mentor = mm?.mentor || {};
  setContent(main, html`
    <section class="ms-hero ms-training-hero"><div class="ms-container"><div class="ms-hero__inner">
      <div class="ms-row" style="--ms-gap:8px"><span class="ms-eyebrow"><i class="fas fa-graduation-cap" aria-hidden="true"></i>Mentor training</span>${statusBadge('mentor', mentor.status)}</div>
      <h1 class="ms-h1">${['approved', 'paused'].includes(mentor.status) ? 'Mentor playbook' : html`Get ready to mentor${mentor.full_name ? html`, ${mentor.full_name.split(' ')[0]}` : ''}`}</h1>
      <p class="ms-lead">${['approved', 'paused'].includes(mentor.status) ? 'Your refresher: the lecture, the playbook and its templates. Come back whenever a mentee situation needs a second look.'
        : "Three parts: Padam's mentor lecture, the written playbook and a short quiz. Then Team MSC reviews your profile."}</p>
      <div data-progress>${progressHtml()}</div>
    </div></div></section>
    <section class="ms-container ms-section">
      <div class="ms-layout">
        <aside class="ms-layout__aside ms-training-aside">
          <nav class="ms-card ms-card--flat" aria-label="Playbook sections">
            <div class="ms-xs ms-muted ms-strong ms-training-aside__label">PLAYBOOK</div>
            <ol class="ms-training-toc">${PLAYBOOK_TOC.map(([id, t], i) => html`<li><a href="#pb-${id}" data-open="${id}"><span>${i + 1}</span>${t}</a></li>`)}</ol>
          </nav>
        </aside>
        <div class="ms-stack" style="--ms-gap:20px">
          <section class="ms-card ms-training-part" id="lecture" data-part="lecture">${lectureHtml()}</section>
          <section class="ms-card ms-training-part" id="playbook" data-part="playbook">${playbookHtml()}</section>
          <section class="ms-card ms-training-part" id="quiz" data-part="quiz">${quizHtml()}</section>
        </div>
      </div>
    </section>`);
  bind();
  const hash = location.hash.replace('#', '');
  if (hash) setTimeout(() => jump(hash, false), 80);
}
function renderPart(id) {
  const el = main.querySelector(`[data-part="${id}"]`);
  if (!el) return;
  setContent(el, id === 'lecture' ? lectureHtml() : id === 'playbook' ? playbookHtml() : quizHtml());
  refreshProgress();
}

function jump(id, smooth = true) {
  if (id.startsWith('pb-')) {
    const d = main.querySelector(`#${CSS.escape(id)}`);
    if (d) { d.open = true; scrollToEl(d, { smooth }); }
    return;
  }
  const el = main.querySelector(`#${CSS.escape(id)}`);
  if (el) scrollToEl(el, { smooth });
}

let bound = false;
function bind() {
  if (bound) return;
  bound = true;
  main.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-jump], [data-open], [data-mark], [data-copy-tpl], [data-copy-url], [data-ms-retry]');
    if (!a) return;
    if (a.dataset.jump) { e.preventDefault(); history.replaceState(null, '', `#${a.dataset.jump}`); jump(a.dataset.jump); return; }
    if (a.dataset.open) { e.preventDefault(); history.replaceState(null, '', `#pb-${a.dataset.open}`); jump(`pb-${a.dataset.open}`); return; }
    if (a.dataset.mark) { await mark(a.dataset.mark, a); return; }
    if (a.dataset.copyTpl !== undefined) {
      const t = FIRST_MESSAGES[Number(a.dataset.copyTpl)];
      const vars = { ...templateVars({ mentor: mm?.mentor || {}, program: (mm?.mentor?.programs || [])[0], config }), mentee_first: '[mentee name]' };
      copyText(fillTemplate(t.text, vars), 'Template copied');
      return;
    }
    if (a.dataset.copyUrl) { copyText(a.dataset.copyUrl, 'Link copied'); }
  });
  main.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.matches('.ms-training-quiz input[type=radio]')) return;
    answers[t.name.replace(/^q-/, '')] = t.value;
    local.set(answersKey(), answers);
    updateAnswered();
  });
  main.addEventListener('submit', async (e) => {
    if (!e.target.matches('[data-quiz]')) return;
    e.preventDefault();
    await submitQuiz(e.target.querySelector('[data-submit-quiz]'));
  });
}

function updateAnswered() {
  const total = quiz?.questions?.length || 0;
  const n = (quiz?.questions || []).filter((q) => answers[q.id]).length;
  const el = main.querySelector('[data-answered]');
  if (el) el.textContent = `${n} of ${total} answered`;
  const bar = main.querySelector('[data-answered-bar]');
  if (bar) bar.style.width = `${total ? Math.round((n * 100) / total) : 0}%`;
  const btn = main.querySelector('[data-submit-quiz]');
  if (btn) btn.disabled = n < total;
}

async function mark(step, btn) {
  setBusy(btn, true);
  try {
    const res = await rpc('mentorship_mark_training', { p_step: step });
    mm.mentor.training = res?.training || { ...training(), [`${step}_at`]: new Date().toISOString() };
    track('mentor_training_step', { step });
    toast(step === 'lecture' ? 'Lecture marked as watched.' : 'Playbook done. The quiz is open.', { type: 'success' });
    renderPart(step);
    renderPart('quiz');
    if (step === 'playbook' && quizReady()) { await loadQuiz(); jump('quiz'); }
  } catch (e) { showError(e); setBusy(btn, false); }
}

async function loadQuiz() {
  if (quizPassedAt() || !quizReady()) return;
  try {
    quiz = await rpc('mentorship_quiz_questions');
    const saved = local.get(answersKey()) || {};
    const ids = new Set((quiz.questions || []).map((q) => q.id));
    answers = Object.fromEntries(Object.entries(saved).filter(([k]) => ids.has(k)));
  } catch (e) {
    if (e.code === 'quiz_locked') quiz = { questions: [], locked: true };
    else { showError(e); quiz = { questions: [] }; }
  }
  renderPart('quiz');
}

async function submitQuiz(btn) {
  const qs = quiz?.questions || [];
  if (qs.some((q) => !answers[q.id])) { toast('Answer every question first.', { type: 'warn' }); return; }
  setBusy(btn, true);
  try {
    const r = await rpc('mentorship_submit_quiz', { p_answers: answers });
    lastResult = r;
    local.del(answersKey());
    answers = {};
    track('mentor_quiz_submitted', { passed: !!r.passed, score: r.score_pct });
    if (r.passed) {
      mm.mentor.quiz_passed_at = new Date().toISOString();
      mm.mentor.status = r.status || mm.mentor.status;
      mm.quiz = { ...(mm.quiz || {}), passed_at: mm.mentor.quiz_passed_at, best_pct: Math.max(Number(mm.quiz?.best_pct || 0), Number(r.score_pct || 0)) };
      local.del(lastKey());
      getContext({ force: true });
    } else {
      quiz = { ...quiz, next_attempt_at: r.next_attempt_at, attempts: (quiz.attempts || 0) + 1 };
      local.set(lastKey(), { at: Date.now(), score: r.score_pct, wrong: (r.wrong_ids || []).map((id) => ({ n: qNumber(id), prompt: qs.find((q) => q.id === id)?.prompt || '' })).sort((a, b) => a.n - b.n) });
    }
    if (r.passed) render(); else renderPart('quiz');
    setTimeout(() => jump('quiz', false), 30);
  } catch (e) {
    setBusy(btn, false);
    if (e.code === 'quiz_cooldown') {
      quiz = { ...quiz, next_attempt_at: e.hint };
      renderPart('quiz');
      toast(`You can try again from ${formatDateTime(e.hint)}.`, { type: 'warn' });
    } else if (e.code === 'already_passed') {
      mm.mentor.quiz_passed_at = mm.mentor.quiz_passed_at || new Date().toISOString();
      renderPart('quiz');
    } else showError(e);
  }
}

/* ---------------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------------ */
async function boot() {
  if (!ctx.user) {
    setContent(main, loggedOutScreen({ title: 'Mentor training', text: 'Log in with the account you applied with to open the lecture, the playbook and the quiz.', path: location.pathname + location.search,
      icon: 'fa-graduation-cap', extraActions: [{ label: 'Become a mentor', href: PATHS.apply, variant: 'ghost' }] }));
    return;
  }
  if (!ctx.backendReady) { setContent(main, backendNotReady()); return; }
  if (ctx.error) { setContent(main, loadError(ctx.error)); bindRetry(main); return; }
  const st = ctx.mentor?.status;
  if (!st) {
    setContent(main, statusScreen({ icon: 'fa-hand-holding-heart', title: 'Training opens after you apply', text: 'Apply to become an MSC mentor first. It takes about 10 minutes, and the training opens right after you submit.',
      actions: [{ label: 'Apply to mentor', href: PATHS.apply, icon: 'fa-file-pen' }] }));
    return;
  }
  if (st === 'draft') {
    setContent(main, statusScreen({ icon: 'fa-file-pen', tone: 'amber', title: 'Finish your application first', text: 'Your training opens as soon as you submit your application. Your draft is saved, so pick up where you left off.',
      actions: [{ label: 'Continue your application', href: PATHS.apply, icon: 'fa-arrow-right' }] }));
    return;
  }
  try { mm = await rpc('mentorship_my_mentor'); } catch (e) { setContent(main, loadError(e)); bindRetry(main); return; }
  if (mm?.mentor?.status === 'rejected') {
    setContent(main, statusScreen({ icon: 'fa-hourglass-half', tone: 'amber', title: 'Not approved this time',
      text: mm.mentor.reapply_after ? `You can apply again from ${formatDate(mm.mentor.reapply_after)}.` : 'See the note from Team MSC on your application.',
      actions: [{ label: 'See your application', href: PATHS.apply, variant: 'secondary' }] }));
    return;
  }
  render();
  if (quizReady() && !quizPassedAt() && !nextAttemptAt()) await loadQuiz();
}

await boot();
