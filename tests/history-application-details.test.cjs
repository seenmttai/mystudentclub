const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

// 6 Nov 2026: in the applications tracker, "View Details" on an applied job said "Open the job portal to
// unlock application details" and linked away. The tracker now runs the same BrowserGuard unlock the
// portal uses and shows the application link right in the popup.
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'history.js'), 'utf8');

function loadTracker({ unlock }) {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="modal" style="display:none"><div id="modal-body-content"></div></div>
    <button id="appliedToggleBtn"></button><button id="savedToggleBtn"></button>
  </body>`, { runScripts: 'outside-only', url: 'https://www.mystudentclub.com/history.html' });
  const { window } = dom;

  const calls = { unlock: [], inserts: [], opened: [] };
  const cache = new Map();
  window.__stubs = {
    getDaysAgo: () => '2 days ago',
    unlockJobDetails: async (job, table, session) => {
      calls.unlock.push({ id: job.id, table, user: session.user.id });
      const result = await unlock(job, table);
      cache.set(`${table}:${job.id}`, result);
      return result;
    },
    getCachedUnlockedJob: (id, table) => cache.get(`${table}:${id}`) || null,
  };
  window.supabase = {
    createClient: () => ({
      from: () => ({
        insert: async (row) => { calls.inserts.push(row); return { error: null }; },
      }),
    }),
  };
  window.open = (url) => {
    const tab = { closed: false, close() { this.closed = true; }, location: { href: url } };
    calls.opened.push(tab);
    return tab;
  };

  const body = source
    .replace("import { getDaysAgo } from './date-utils.js';", 'const { getDaysAgo } = window.__stubs;')
    .replace("import { unlockJobDetails, getCachedUnlockedJob } from './browser-guard.js';",
      'const { unlockJobDetails, getCachedUnlockedJob } = window.__stubs;')
    .replace("document.addEventListener('DOMContentLoaded', initializePage);", '');
  assert.doesNotMatch(body, /^import /m, 'every import should be stubbed');

  window.eval(`${body}
    initializeDOM();
    currentSession = { access_token: 't', user: { id: 'student-1' } };
    window.__tracker = { showJobModal, closeModal, getApplications: () => allApplications };
    updateCounts = () => {};
    filterAndSortApplications = () => {};
  `);
  return { window, calls, tracker: window.__tracker };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const appliedJob = {
  id: 55,
  job_id: 901,
  job_table: 'Industrial Training Job Portal',
  applied_at: '2026-11-04T10:00:00Z',
  job: { id: 901, Company: 'Acme Ltd', Location: 'Mumbai', Description: 'Mail [email protected]' },
};

test('applied job shows its application link inside the tracker, no trip to the portal', async () => {
  const { window, calls, tracker } = loadTracker({
    unlock: async () => ({ applicationId: 'https://acme.example/apply, hr@acme.example', description: 'Mail hr@acme.example' }),
  });

  tracker.showJobModal(appliedJob);
  const modal = window.document.getElementById('modal-body-content');
  assert.doesNotMatch(modal.innerHTML, /Open the job portal/);
  assert.doesNotMatch(modal.innerHTML, /\?id=901&amp;type=|\?id=901&type=/, 'no link back to the portal');
  assert.match(modal.textContent, /Loading your application details/);

  await flush();
  assert.deepEqual(calls.unlock, [{ id: 901, table: 'Industrial Training Job Portal', user: 'student-1' }]);
  const links = window.document.getElementById('historyAppLinks');
  assert.match(links.textContent, /https:\/\/acme\.example\/apply/);
  assert.match(links.textContent, /hr@acme\.example/);
  const hrefs = [...links.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, ['https://acme.example/apply', 'mailto:hr@acme.example']);
  assert.equal(links.querySelectorAll('.modal-copy-btn').length, 2);
  assert.match(window.document.getElementById('historyModalDescription').textContent, /hr@acme\.example/);
});

test('reopening the same job reuses the unlock instead of verifying again', async () => {
  const { window, calls, tracker } = loadTracker({ unlock: async () => ({ applicationId: 'https://acme.example/apply' }) });
  tracker.showJobModal(appliedJob);
  await flush();
  tracker.closeModal();
  tracker.showJobModal(appliedJob);
  assert.equal(calls.unlock.length, 1);
  assert.match(window.document.getElementById('historyAppLinks').textContent, /acme\.example\/apply/);
});

test('a failed check shows the reason and a Try again that works', async () => {
  let attempt = 0;
  const { window, calls, tracker } = loadTracker({
    unlock: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('Too many requests. Please wait a moment.');
      return { applicationId: 'https://acme.example/apply' };
    },
  });
  tracker.showJobModal(appliedJob);
  await flush();
  const links = window.document.getElementById('historyAppLinks');
  assert.match(links.textContent, /Too many requests/);
  links.querySelector('.history-unlock-retry').click();
  await flush();
  assert.equal(calls.unlock.length, 2);
  assert.match(links.textContent, /acme\.example\/apply/);
});

test('an unlock that finishes after the popup closed does not paint into the next job', async () => {
  let release;
  const { window, tracker } = loadTracker({
    unlock: (job) => (job.id === 901
      ? new Promise((resolve) => { release = () => resolve({ applicationId: 'https://slow.example' }); })
      : Promise.resolve({ applicationId: 'https://second.example' })),
  });
  tracker.showJobModal(appliedJob);
  tracker.closeModal();
  tracker.showJobModal({ ...appliedJob, id: 56, job_id: 902, job: { ...appliedJob.job, id: 902, Company: 'Beta' } });
  await flush();
  release();
  await flush();
  const text = window.document.getElementById('historyAppLinks').textContent;
  assert.match(text, /second\.example/);
  assert.doesNotMatch(text, /slow\.example/);
});

test('saved job: details reveal in place, and Apply Now records the application and opens the link', async () => {
  const { window, calls, tracker } = loadTracker({ unlock: async () => ({ applicationId: 'https://acme.example/apply' }) });
  window.localStorage.setItem('msc_saved_jobs', JSON.stringify([{ id: 901, table: 'Industrial Training Job Portal' }]));
  const saved = { ...appliedJob, id: undefined, isSaved: true };

  tracker.showJobModal(saved);
  const modal = window.document.getElementById('modal-body-content');
  assert.equal(calls.unlock.length, 0, 'saved jobs reveal only when asked');
  assert.equal(modal.querySelector('#modalApplyNowBtn').tagName, 'BUTTON', 'Apply Now no longer links to the portal');

  modal.querySelector('#modalApplyNowBtn').click();
  await flush();
  await flush();
  assert.equal(calls.unlock.length, 1);
  assert.deepEqual(calls.inserts.map((r) => [r.job_id, r.job_table]), [[901, 'Industrial Training Job Portal']]);
  assert.equal(calls.opened.length, 1);
  assert.equal(calls.opened[0].location.href, 'https://acme.example/apply');
  assert.equal(tracker.getApplications()[0].job_id, 901);
  assert.match(window.document.getElementById('historyAppLinks').textContent, /acme\.example\/apply/);
});

test('application text is escaped before it reaches the page', async () => {
  const { window, tracker } = loadTracker({ unlock: async () => ({ applicationId: '<img src=x onerror=alert(1)>' }) });
  tracker.showJobModal(appliedJob);
  await flush();
  const links = window.document.getElementById('historyAppLinks');
  assert.equal(links.querySelector('img'), null);
  assert.match(links.textContent, /<img src=x/);
});
