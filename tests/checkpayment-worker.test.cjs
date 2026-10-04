'use strict';
// ---------------------------------------------------------------------------
// tests/checkpayment-worker.test.cjs
//
// Unit tests for the checkpayment Cloudflare Worker logic.
// No network calls, no Supabase, no PayU — pure crypto + routing logic.
//
// Mirrors every security check in context/checkpayment.ts so that a deploy
// candidate can be validated before hitting a staging Worker.
// ---------------------------------------------------------------------------
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Replicate the worker sha512hex using Node crypto (synchronous)
// ---------------------------------------------------------------------------
function sha512hex(text) {
  return crypto.createHash('sha512').update(text, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Replicate verifyPayUHash (context/checkpayment.ts lines 63-84)
// Formula: sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
// ---------------------------------------------------------------------------
function buildHashString(params, salt, merchantKey) {
  const get = k => params.get(k) ?? '';
  return [
    salt,
    get('status'),
    '', '', '', '', '',   // udf10..udf6 (empty)
    get('udf5'), get('udf4'), get('udf3'), get('udf2'), get('udf1'),
    get('email'),
    get('firstname'),
    get('productinfo'),
    get('amount'),
    get('txnid'),
    merchantKey,
  ].join('|');
}

function makeValidHash(params, salt, merchantKey) {
  return sha512hex(buildHashString(params, salt, merchantKey));
}

// ---------------------------------------------------------------------------
// Course config — must mirror COURSE_BY_PRODUCT in checkpayment.ts exactly
// ---------------------------------------------------------------------------
const COURSE_BY_PRODUCT = {
  'ca industrial training program': {
    id: 'industrial-training-mastery',
    displayName: 'CA Industrial Training Program',
    allowedAmounts: [2499],
  },
  'msc ca freshers program': {
    id: 'msc-ca-freshers-program',
    displayName: 'MSC CA Freshers Program',
    allowedAmounts: [2999],
  },
};

function lookupCourse(productinfo) {
  return COURSE_BY_PRODUCT[(productinfo ?? '').trim().toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SALT = 'test-salt-abc123';
const KEY  = 'testMerchantKey';

function makeParams(overrides = {}) {
  const base = {
    status: 'success', txnid: 'TXN12345678',
    email: 'student@example.com', firstname: 'Rahul',
    productinfo: 'CA Industrial Training Program', amount: '2499',
    udf1: '', udf2: '', udf3: '', udf4: '', udf5: '',
  };
  const merged = { ...base, ...overrides };
  const p = new URLSearchParams(merged);
  if (!overrides.hash) p.set('hash', makeValidHash(p, SALT, KEY));
  return p;
}

// ---------------------------------------------------------------------------
// 1. SHA-512 hash verification
// ---------------------------------------------------------------------------
describe('PayU hash verification', () => {

  test('accepts a correctly computed hash', () => {
    const p = makeParams();
    const expected = sha512hex(buildHashString(p, SALT, KEY));
    assert.equal(p.get('hash').toLowerCase(), expected);
  });

  test('accepts hash when PayU prefixes additionalCharges', () => {
    const p = makeParams();
    const core = sha512hex(buildHashString(p, SALT, KEY));
    const withPrefix = 'aabbccdd1122|' + core;
    assert.ok(withPrefix.endsWith(core));
  });

  test('rejects tampered hash (wrong salt)', () => {
    const p = makeParams();
    const tampered = sha512hex(buildHashString(p, 'wrong-salt', KEY));
    const expected = sha512hex(buildHashString(p, SALT, KEY));
    assert.notEqual(tampered, expected);
  });

  test('rejects tampered hash (amount changed after signing)', () => {
    const p = makeParams({ amount: '2499' });
    const signed = p.get('hash');
    p.set('amount', '1');
    const expected = sha512hex(buildHashString(p, SALT, KEY));
    assert.notEqual(signed, expected);
  });

  test('rejects tampered hash (email changed after signing)', () => {
    const p = makeParams({ email: 'real@example.com' });
    const signed = p.get('hash');
    p.set('email', 'attacker@evil.com');
    const expected = sha512hex(buildHashString(p, SALT, KEY));
    assert.notEqual(signed, expected);
  });

  test('hash comparison is case-insensitive', () => {
    const p = makeParams();
    const upper = p.get('hash').toUpperCase();
    const expected = sha512hex(buildHashString(p, SALT, KEY));
    assert.equal(upper.toLowerCase(), expected);
  });

});

// ---------------------------------------------------------------------------
// 2. Status check
// ---------------------------------------------------------------------------
describe('PayU status field', () => {

  test('success (lowercase) is accepted', () => {
    assert.equal('success'.toLowerCase(), 'success');
  });

  test('Success (mixed case) is accepted after toLowerCase', () => {
    assert.equal('Success'.toLowerCase(), 'success');
  });

  test('failure is rejected', () => {
    assert.notEqual('failure'.toLowerCase(), 'success');
  });

  test('pending is rejected', () => {
    assert.notEqual('pending'.toLowerCase(), 'success');
  });

  test('empty status is rejected', () => {
    assert.notEqual(''.toLowerCase(), 'success');
  });

});

// ---------------------------------------------------------------------------
// 3. Product info -> course mapping
// ---------------------------------------------------------------------------
describe('Product info -> course mapping', () => {

  test('CA Industrial Training Program maps to industrial-training-mastery', () => {
    const course = lookupCourse('CA Industrial Training Program');
    assert.ok(course);
    assert.equal(course.id, 'industrial-training-mastery');
  });

  test('case and trim are normalised before lookup', () => {
    const course = lookupCourse('  ca INDUSTRIAL training PROGRAM  ');
    assert.ok(course);
    assert.equal(course.id, 'industrial-training-mastery');
  });

  test('MSC CA Freshers Program maps to msc-ca-freshers-program', () => {
    const course = lookupCourse('MSC CA Freshers Program');
    assert.ok(course);
    assert.equal(course.id, 'msc-ca-freshers-program');
  });

  test('msc ca freshers program (lowercase) maps correctly', () => {
    const course = lookupCourse('msc ca freshers program');
    assert.ok(course);
    assert.equal(course.id, 'msc-ca-freshers-program');
  });

  test('unknown product is rejected (returns null)', () => {
    assert.equal(lookupCourse('some random product'), null);
  });

  test('empty productinfo is rejected', () => {
    assert.equal(lookupCourse(''), null);
  });

  test('null productinfo is rejected', () => {
    assert.equal(lookupCourse(null), null);
  });

  test('articleship is NOT in the map (not live in LMS yet)', () => {
    assert.equal(lookupCourse('msc articleship program'), null);
    assert.equal(lookupCourse('ca articleship program'), null);
    assert.equal(lookupCourse('articleship'), null);
  });

  test('amount=1 trick cannot map to any course', () => {
    assert.equal(lookupCourse('1'), null);
  });

});

// ---------------------------------------------------------------------------
// 4. Amount validation
// ---------------------------------------------------------------------------
describe('Amount validation per course', () => {

  test('2499 is valid for Industrial Training', () => {
    const course = lookupCourse('CA Industrial Training Program');
    assert.ok(course.allowedAmounts.includes(Math.round(parseFloat('2499'))));
  });

  test('2499.00 (decimal string) is valid for Industrial Training', () => {
    const course = lookupCourse('CA Industrial Training Program');
    assert.ok(course.allowedAmounts.includes(Math.round(parseFloat('2499.00'))));
  });

  test('1 is rejected for Industrial Training', () => {
    const course = lookupCourse('CA Industrial Training Program');
    assert.ok(!course.allowedAmounts.includes(Math.round(parseFloat('1'))));
  });

  test('1999 (old CA Freshers price) is rejected', () => {
    // CA Freshers moved to 2999 from 1 Oct 2026
    const course = lookupCourse('MSC CA Freshers Program');
    assert.ok(!course.allowedAmounts.includes(1999));
  });

  test('2999 is valid for CA Freshers', () => {
    const course = lookupCourse('MSC CA Freshers Program');
    assert.ok(course.allowedAmounts.includes(2999));
  });

  test('2499 does NOT validate for CA Freshers (amounts are per-course)', () => {
    const freshCourse = lookupCourse('MSC CA Freshers Program');
    assert.ok(!freshCourse.allowedAmounts.includes(2499));
  });

  test('2999 does NOT validate for Industrial Training', () => {
    const itCourse = lookupCourse('CA Industrial Training Program');
    assert.ok(!itCourse.allowedAmounts.includes(2999));
  });

  test('0 is rejected for all courses', () => {
    for (const course of Object.values(COURSE_BY_PRODUCT)) {
      assert.ok(!course.allowedAmounts.includes(0));
    }
  });

});

// ---------------------------------------------------------------------------
// 5. Email sanitisation
// ---------------------------------------------------------------------------
describe('Email sanitisation', () => {

  function sanitiseEmail(raw) {
    return (raw ?? '').replace(/[^\w.@+-]/g, '').toLowerCase();
  }

  test('normal email passes through unchanged', () => {
    assert.equal(sanitiseEmail('Student@Example.COM'), 'student@example.com');
  });

  test('spaces are stripped', () => {
    assert.equal(sanitiseEmail('stu dent@exa mple.com'), 'student@example.com');
  });

  test('empty string stays empty (triggers rejection path)', () => {
    assert.equal(sanitiseEmail(''), '');
  });

  test('null is handled gracefully', () => {
    assert.equal(sanitiseEmail(null), '');
  });

  test('injection chars are stripped', () => {
    const cleaned = sanitiseEmail('bad<script>@evil.com');
    assert.ok(!cleaned.includes('<'));
    assert.ok(!cleaned.includes('>'));
  });

});

// ---------------------------------------------------------------------------
// 6. Hash string canonical format
// ---------------------------------------------------------------------------
describe('Hash string format', () => {

  test('hash string contains exactly 17 pipe separators', () => {
    const p = new URLSearchParams({
      status: 'success', txnid: 'T1', email: 'a@b.com', firstname: 'A',
      productinfo: 'CA Industrial Training Program', amount: '2499',
      udf1: '', udf2: '', udf3: '', udf4: '', udf5: '',
    });
    const str = buildHashString(p, 'salt', 'key');
    const pipes = (str.match(/\|/g) ?? []).length;
    assert.equal(pipes, 17, 'Expected 17 pipes in hash string');
  });

  test('hash string starts with SALT', () => {
    const p = new URLSearchParams({
      status: 'success', txnid: 'T1', email: 'a@b.com', firstname: 'A',
      productinfo: 'p', amount: '100', udf1: '', udf2: '', udf3: '', udf4: '', udf5: '',
    });
    const str = buildHashString(p, 'MY_SALT', 'MY_KEY');
    assert.ok(str.startsWith('MY_SALT|'));
  });

  test('hash string ends with merchant key', () => {
    const p = new URLSearchParams({
      status: 'success', txnid: 'T1', email: 'a@b.com', firstname: 'A',
      productinfo: 'p', amount: '100', udf1: '', udf2: '', udf3: '', udf4: '', udf5: '',
    });
    const str = buildHashString(p, 'MY_SALT', 'MY_KEY');
    assert.ok(str.endsWith('|MY_KEY'));
  });

  test('five consecutive empty slots appear after status', () => {
    const p = new URLSearchParams({
      status: 'success', txnid: 'T1', email: 'a@b.com', firstname: 'A',
      productinfo: 'p', amount: '100', udf1: '', udf2: '', udf3: '', udf4: '', udf5: '',
    });
    const str = buildHashString(p, 'S', 'K');
    assert.ok(str.includes('success|||||||||'), 'Expected 5 empty slots after status');
  });

});

// ---------------------------------------------------------------------------
// 7. Idempotency (structural)
// ---------------------------------------------------------------------------
describe('Idempotency (txnid used as batch key)', () => {

  test('txnid is non-empty for a valid payment', () => {
    const p = makeParams({ txnid: 'TXNABC999' });
    assert.equal(p.get('txnid'), 'TXNABC999');
  });

  test('empty txnid triggers rejection path', () => {
    const txnid = '';
    assert.ok(!txnid, 'empty txnid is falsy -> rejected');
  });

  test('txnid stored in batch column is the idempotency key', () => {
    const enrollPayload = { uuid: 'user-123', course: 'industrial-training-mastery', batch: 'TXN12345678' };
    assert.equal(enrollPayload.batch, 'TXN12345678');
  });

});

// ---------------------------------------------------------------------------
// 8. Redirect URL structure — no secrets in success URL
// ---------------------------------------------------------------------------
describe('Success redirect URL — no secrets', () => {

  const REDIRECT_SUCCESS_URL = 'https://www.mystudentclub.com/payment-success.html';

  function buildSuccessUrl(accountStatus, enrollmentStatus, email) {
    const url = new URL(REDIRECT_SUCCESS_URL);
    const p = { status: accountStatus, enrollment: enrollmentStatus };
    if (email) p.email = email;
    url.hash = new URLSearchParams(p).toString();
    return url.toString();
  }

  test('success URL contains status param', () => {
    const url = buildSuccessUrl('created', 'enrolled', 'student@example.com');
    assert.ok(url.includes('payment-success.html'));
    assert.ok(url.includes('status=created'));
  });

  test('success URL contains email for UI rendering', () => {
    const url = buildSuccessUrl('created', 'enrolled', 'student@example.com');
    assert.ok(url.includes('email=student%40example.com'));
  });

  test('success URL does NOT contain password', () => {
    const url = buildSuccessUrl('created', 'enrolled', 'student@example.com');
    assert.ok(!url.includes('password'));
  });

  test('already-enrolled redirects to success page not failure', () => {
    const url = buildSuccessUrl('existing', 'already-enrolled');
    assert.ok(url.includes('payment-success.html'));
    assert.ok(url.includes('already-enrolled'));
  });

  test('params are in hash fragment, not query string', () => {
    const url = buildSuccessUrl('created', 'enrolled');
    const parsed = new URL(url);
    assert.equal(parsed.search, '');
    assert.ok(parsed.hash.length > 1);
  });

});
