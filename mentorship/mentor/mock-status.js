/* Localhost-only helper for previewing every mentor status in mock mode.
   Imported only when isMockMode() is true. Usage: add &mockstatus=<status> to a mock URL,
   e.g. /mentorship/mentor/?mock=1&as=mentor&mockstatus=paused
   Statuses: draft | submitted | training_passed | approved | rejected | rejected_open | paused.
   It snapshots the architect's mock responses and overrides only the mentor status fields. */
import { rpc, registerMocks, qs } from '/mentorship/assets/mentorship-core.js?v=1';

const want = qs('mockstatus');
if (want) {
  const status = want === 'rejected_open' ? 'rejected' : want;
  const day = 86400000;
  const extra = {
    rejected: { reject_reason: 'Please add a clearer photo and LinkedIn.', rejected_at: new Date(Date.now() - 3 * day).toISOString(), reapply_after: new Date(Date.now() + 27 * day).toISOString().slice(0, 10) },
    rejected_open: { reject_reason: 'We already have enough mentors for your profile this batch.', rejected_at: new Date(Date.now() - 40 * day).toISOString(), reapply_after: new Date(Date.now() - 10 * day).toISOString().slice(0, 10) },
    paused: { pause_reason: 'Two mentees said they could not reach you last week.', paused_at: new Date(Date.now() - 2 * day).toISOString() },
    training_passed: { quiz_passed_at: new Date(Date.now() - day).toISOString(), quiz_best_pct: 92, training: { lecture_at: new Date(Date.now() - 2 * day).toISOString(), playbook_at: new Date(Date.now() - 2 * day).toISOString() } },
  }[want] || {};
  const who = await rpc('mentorship_whoami').catch(() => null);
  const mine = await rpc('mentorship_my_mentor').catch(() => null);
  if (who?.mentor) registerMocks({ mentorship_whoami: () => ({ ...who, mentor: { ...who.mentor, status, ...('quiz_passed_at' in extra ? { quiz_passed_at: extra.quiz_passed_at } : {}) } }) });
  if (mine?.mentor) {
    registerMocks({
      mentorship_my_mentor: () => ({ ...mine, mentor: { ...mine.mentor, status, ...extra },
        quiz: { ...mine.quiz, ...('quiz_passed_at' in extra ? { passed_at: extra.quiz_passed_at, best_pct: 92, attempts: 1 } : {}) } }),
    });
  }
}
