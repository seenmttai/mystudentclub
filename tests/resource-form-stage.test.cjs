const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'resource-form-collector.js'), 'utf8');

// Loads the collector on a fake resources page. `replies` are what successive inserts return.
function load({ pathname = '/ca-industrial-training-resources', stored = {}, replies = [{ error: null }] } = {}) {
  const inserts = [];
  const bodyHtml = [];
  const storage = { ...stored };
  const opened = [];
  const client = {
    from: (table) => ({
      insert: async (rows) => {
        inserts.push({ table, row: rows[0] });
        return replies[Math.min(inserts.length - 1, replies.length - 1)];
      },
    }),
  };
  const document = {
    readyState: 'complete',
    title: 'Resources',
    getElementById: () => null,
    addEventListener: () => {},
    querySelector: () => null,
    body: { insertAdjacentHTML: (_, html) => bodyHtml.push(html), style: {} },
    head: { insertAdjacentHTML: () => {} },
  };
  const window = { location: { pathname }, open: (url) => opened.push(url) };
  const context = {
    window,
    document,
    supabase: { createClient: () => client },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
    },
    FormData: class {
      constructor(form) { this.values = form.values; }
      get(k) { return Object.prototype.hasOwnProperty.call(this.values, k) ? this.values[k] : null; }
    },
    alert: () => {},
    console: { error: () => {}, warn: () => {}, log: () => {} },
    setTimeout,
    Date,
  };
  vm.runInNewContext(source, context);
  return { collector: window.resourceFormCollector, inserts, modalHtml: bodyHtml.join(''), storage, opened };
}

function submit(collector, values) {
  const form = {
    values: { name: 'Test Student', email: 'student@example.com', phone: '9000000000', program: 'CA Industrial Training', resource: 'Guide', ...values },
    dataset: { resourceUrl: 'https://www.mystudentclub.com/assets/guide.pdf', isDownload: 'false' },
    querySelector: () => ({ disabled: false, textContent: '' }),
  };
  return collector.handleSubmit({ preventDefault() {}, target: form });
}

const selectedOption = (html) => (html.match(/<option value="([^"]*)" selected>/) || [])[1];

test('the lead form asks for the stage, optional, with the six stage keys', () => {
  const { modalHtml } = load();
  const select = modalHtml.match(/<select id="studentStage" name="stage">([\s\S]*?)<\/select>/);
  assert.ok(select, 'stage select in the modal');
  assert.ok(!/<select[^>]*required/.test(modalHtml), 'the stage never gates the resource');
  const keys = [...select[1].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['', 'industrial-training', 'articleship', 'ca-fresher', 'semi-qualified', 'experienced-ca', 'other']);
  assert.ok(modalHtml.indexOf('id="studentPhone"') < modalHtml.indexOf('id="studentStage"'));
});

test('the preselected stage is the visitor\'s earlier choice, else the page\'s program', () => {
  assert.equal(selectedOption(load().modalHtml), 'industrial-training');
  assert.equal(selectedOption(load({ pathname: '/ca-fresher-training-resources' }).modalHtml), 'ca-fresher');
  assert.equal(selectedOption(load({ stored: { msc_audience: 'semi-qualified' } }).modalHtml), 'semi-qualified');
  assert.equal(selectedOption(load({ pathname: '/resource.html' }).modalHtml), '');
  assert.equal(selectedOption(load({ pathname: '/resource.html', stored: { msc_audience: 'bogus' } }).modalHtml), '');
});

test('a submitted stage is saved with the lead and remembered for next time', async () => {
  const { collector, inserts, storage, opened } = load();
  await submit(collector, { stage: 'articleship' });
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, 'resource_access_logs');
  assert.equal(inserts[0].row.stage, 'articleship');
  assert.equal(inserts[0].row.program_type, 'industrial-training');
  assert.equal(storage.msc_audience, 'articleship');
  assert.equal(opened.length, 1, 'the resource opens');
});

test('no stage, or an unknown value, saves the lead without one', async () => {
  for (const stage of ['', 'hacker', undefined]) {
    const { collector, inserts, storage } = load({ pathname: '/resource.html' });
    await submit(collector, stage === undefined ? {} : { stage });
    assert.equal(inserts.length, 1);
    assert.ok(!('stage' in inserts[0].row), JSON.stringify(stage));
    assert.equal(storage.msc_audience, undefined);
  }
});

test('before the stage column exists the lead is saved again without it; other errors are not retried', async () => {
  const missing = { error: { code: 'PGRST204', message: "Could not find the 'stage' column of 'resource_access_logs' in the schema cache" } };
  const a = load({ replies: [missing, { error: null }] });
  await submit(a.collector, { stage: 'ca-fresher' });
  assert.equal(a.inserts.length, 2);
  assert.equal(a.inserts[0].row.stage, 'ca-fresher');
  assert.ok(!('stage' in a.inserts[1].row));
  assert.equal(a.inserts[1].row.email, 'student@example.com');
  assert.equal(a.opened.length, 1);

  const other = load({ replies: [{ error: { code: '42501', message: 'permission denied for table resource_access_logs' } }] });
  await submit(other.collector, { stage: 'ca-fresher' });
  assert.equal(other.inserts.length, 1);
  assert.equal(other.opened.length, 1, 'the resource still opens');
});
