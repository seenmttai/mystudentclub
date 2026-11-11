// AI Powered Apply CV gate (scripts/ai-helper.js ensureCvAvailable): a CV saved in the student's account
// must count even when this browser's cache is empty, and the "CV not found" wording must be on every page.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'ai-helper.js'), 'utf8')
  .replaceAll('export async function ', 'async function ')
  .replaceAll('export function ', 'function ');

function load(storage = {}) {
  const localStorage = {
    getItem: key => Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null,
    setItem: (key, value) => { storage[key] = String(value); },
  };
  const context = { Array, JSON, String, console, localStorage };
  context.globalThis = context;
  vm.runInNewContext(`${source}\nthis.helper = { ensureCvAvailable };`, context);
  return { helper: context.helper, storage };
}

function fakeSupabase(result) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            eq(column, value) {
              calls.push(['eq', column, value]);
              return { single: async () => { if (result instanceof Error) throw result; return result; } };
            },
          };
        },
      };
    },
  };
  return client;
}

const user = { id: 'user-1' };

test('a CV cached in this browser passes without asking the server', async () => {
  const { helper } = load({ userCVText: 'resume text' });
  const client = fakeSupabase({ data: null });

  assert.equal(await helper.ensureCvAvailable(client, user), true);
  assert.equal(client.calls.length, 0);
});

test('cached CV page images also pass', async () => {
  const { helper } = load({ userCVImages: JSON.stringify(['data:image/png;base64,AAAA']) });

  assert.equal(await helper.ensureCvAvailable(fakeSupabase({ data: null }), user), true);
});

test('empty cache falls back to the CV saved in the account and caches it', async () => {
  const { helper, storage } = load({});
  const client = fakeSupabase({ data: { ocr_cv: 'resume from another device' } });

  assert.equal(await helper.ensureCvAvailable(client, user), true);
  assert.equal(storage.userCVText, 'resume from another device');
  assert.deepEqual(JSON.parse(JSON.stringify(client.calls)), [
    ['from', 'profiles'],
    ['select', 'ocr_cv'],
    ['eq', 'uuid', 'user-1'],
  ]);
});

test('no CV in cache or account is reported missing', async () => {
  for (const result of [{ data: null }, { data: { ocr_cv: '' } }, { data: { ocr_cv: '   ' } }]) {
    const { helper, storage } = load({});
    assert.equal(await helper.ensureCvAvailable(fakeSupabase(result), user), false);
    assert.equal(storage.userCVText, undefined);
  }
});

test('a failed account lookup is reported missing instead of throwing', async () => {
  const { helper } = load({});

  assert.equal(await helper.ensureCvAvailable(fakeSupabase(new Error('offline')), user), false);
});

test('without a signed-in user nothing is looked up', async () => {
  const { helper } = load({});
  const client = fakeSupabase({ data: { ocr_cv: 'x' } });

  assert.equal(await helper.ensureCvAvailable(client, null), false);
  assert.equal(client.calls.length, 0);
});

test('every portal page and script uses the "CV not found" wording and the account-aware gate', () => {
  const pages = [
    'index.html', 'ca-articleship-jobs.html', 'ca-fresher-jobs.html', 'semi-qualified-ca-jobs.html',
    'experienced-ca-jobs.html', 'experienced-ca.html', 'jobs-by-email.html', 'semi-qualified.html',
  ];
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /CV not found<\/h3>/, `${file} title`);
    assert.match(html, /We couldn't find a CV on your account/, `${file} body`);
    assert.doesNotMatch(html, /Please upload your CV (as|to) PDF/, `${file} old wording`);
  }

  for (const file of ['portal3.js', 'portal-email.js', 'job-details.js']) {
    const script = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
    assert.match(script, /await ensureCvAvailable\(supabaseClient,/, `${file} gate`);
    assert.doesNotMatch(script, /isProfileComplete\(\)|showCvUploadPopup|CV Upload Required/, `${file} old gate`);
  }
});
