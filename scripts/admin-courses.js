/*
 * Courses & payments admin (/admin-courses.html), 20 Nov 2026.
 *
 * Super admins only. Every read and write goes through the admin_* database functions in
 * supabase/migrations/202611200001_payments_course_admin.sql; each one checks is_super_admin()
 * on the server, so hiding this page is not the security boundary.
 *
 * Student data is always written with textContent (the h() helper), never as HTML.
 */
(function () {
  'use strict';

  var COURSES = [
    { id: 'industrial-training-mastery', label: 'Industrial Training', price: 2499 },
    { id: 'msc-ca-freshers-program', label: 'CA Freshers', price: 2999 },
    { id: 'msc-articleship-program', label: 'Articleship', price: 1499 }
  ];
  var STATUS = {
    paid: { label: 'Paid, no access yet', tone: 'warn' },
    enrolled: { label: 'Has access', tone: 'ok' },
    needs_review: { label: 'Needs review', tone: 'warn' },
    duplicate: { label: 'Paid twice?', tone: 'info' },
    refunded: { label: 'Refunded', tone: 'muted' },
    ignored: { label: 'Ignored', tone: 'muted' },
    revoked: { label: 'Access removed', tone: 'bad' }
  };
  var SOURCE = { 'return': 'PayU return', reconcile: 'PayU check', admin: 'Added here' };
  var REG_STATUS = {
    paid: { label: 'Paid', tone: 'ok' },
    free: { label: 'Free (coupon)', tone: 'ok' },
    pending: { label: 'Pending', tone: 'muted' },
    failed: { label: 'Failed', tone: 'bad' }
  };
  var LOG_ACTIONS = {
    grant: 'Gave a course',
    revoke: 'Removed a course',
    payment_retry: 'Retried a payment',
    payment_give_access: 'Gave access from a payment',
    payment_set_email: 'Corrected the email',
    payment_refunded: 'Marked refunded',
    payment_ignored: 'Ignored a payment',
    payment_resend_mail: 'Asked for the welcome mail again',
    payment_note: 'Edited a note',
    payment_add: 'Added a payment or access'
  };
  var PAGE = 50;
  var REFUND_MARKER = 'refunded-payu-txn';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var db = null;
  var loaded = {};

  // ---------------------------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------------------------

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /** h('td', { class: 'x', text: 'y' }, child, ...). Text is always set as textContent. */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') el.textContent = String(v);
      else if (k === 'class') el.className = v;
      else if (k === 'on') Object.keys(v).forEach(function (ev) { el.addEventListener(ev, v[ev]); });
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.append(x); });
      else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  var istFmt = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
  });
  function ist(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : istFmt.format(d);
  }
  function money(n) {
    var v = Number(n || 0);
    return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
  function courseLabel(id) {
    var c = COURSES.find(function (x) { return x.id === id; });
    return c ? c.label : (id || 'Not set');
  }
  function badge(map, key) {
    var s = map[key] || { label: key || '–', tone: 'muted' };
    return h('span', { class: 'badge badge-' + s.tone, text: s.label });
  }
  function courseOptions(select, opts) {
    var o = opts || {};
    if (o.blank) select.append(h('option', { value: '', text: o.blank }));
    COURSES.forEach(function (c) {
      if (o.exclude && o.exclude.indexOf(c.id) !== -1) return;
      select.append(h('option', { value: c.id, text: c.label }));
    });
    return select;
  }
  function howLabel(batch, paymentStatus) {
    if (!batch) return 'Given by hand (old)';
    if (batch === 'manual') return 'Given by hand';
    return 'Payment ' + batch + (paymentStatus ? ' · ' + (STATUS[paymentStatus] || { label: paymentStatus }).label : '');
  }

  async function rpc(name, args) {
    var res = await db.rpc(name, args || {});
    if (res.error) {
      var msg = res.error.message || 'Request failed';
      if (/Could not find the function|does not exist|schema cache/i.test(msg)) $('#setup-banner').hidden = false;
      throw new Error(msg);
    }
    return res.data;
  }

  var toastTimer = null;
  function toast(msg, bad) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (bad ? ' toast-bad' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, bad ? 7000 : 4000);
  }

  function setBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = !!busy;
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  // ---------------------------------------------------------------------------------------------
  // Dialog
  // ---------------------------------------------------------------------------------------------

  var modalState = null;

  /**
   * openDialog({ title, intro, fields: [{ name, label, type, value, options, required, placeholder, hint }],
   *              ok, danger, run: async (values) => message })
   */
  function openDialog(cfg) {
    var body = $('#modal-body');
    body.replaceChildren();
    if (cfg.intro) body.append(h('p', { class: 'modal-intro', text: cfg.intro }));
    (cfg.fields || []).forEach(function (f) {
      var id = 'm-' + f.name;
      var input;
      if (f.type === 'select') {
        input = h('select', { id: id, name: f.name, required: f.required || null });
        (f.options || []).forEach(function (o) {
          input.append(h('option', { value: o.value, text: o.label, selected: o.value === f.value || null }));
        });
      } else if (f.type === 'textarea') {
        input = h('textarea', { id: id, name: f.name, rows: 3, placeholder: f.placeholder || null, required: f.required || null, maxlength: 500 });
        input.value = f.value || '';
      } else {
        input = h('input', {
          id: id, name: f.name, type: f.type || 'text', placeholder: f.placeholder || null, required: f.required || null,
          autocomplete: 'off', inputmode: f.inputmode || null, min: f.min, step: f.step
        });
        input.value = f.value === undefined || f.value === null ? '' : String(f.value);
      }
      body.append(h('label', { class: 'field', for: id },
        h('span', { text: f.label + (f.required ? '' : ' (optional)') }),
        input,
        f.hint ? h('small', { class: 'hint', text: f.hint }) : null));
    });
    $('#modal-title').textContent = cfg.title;
    var ok = $('#modal-ok');
    ok.textContent = cfg.ok || 'Save';
    ok.className = 'btn ' + (cfg.danger ? 'btn-danger' : 'btn-primary');
    $('#modal-error').hidden = true;
    modalState = { cfg: cfg, opener: document.activeElement };
    $('#modal').hidden = false;
    document.body.classList.add('modal-open');
    var first = body.querySelector('input, select, textarea') || ok;
    first.focus();
  }

  function closeDialog() {
    $('#modal').hidden = true;
    document.body.classList.remove('modal-open');
    var opener = modalState && modalState.opener;
    modalState = null;
    if (opener && opener.focus && document.contains(opener)) opener.focus();
  }

  async function submitDialog(ev) {
    ev.preventDefault();
    if (!modalState) return;
    var cfg = modalState.cfg;
    var values = {};
    var missing = null;
    (cfg.fields || []).forEach(function (f) {
      var el = $('#m-' + f.name);
      var v = el.value.trim();
      values[f.name] = v;
      if (f.required && !v && !missing) missing = f;
    });
    var errBox = $('#modal-error');
    if (missing) {
      errBox.textContent = 'Fill in: ' + missing.label;
      errBox.hidden = false;
      $('#m-' + missing.name).focus();
      return;
    }
    if (cfg.validate) {
      var problem = cfg.validate(values);
      if (problem) {
        errBox.textContent = problem;
        errBox.hidden = false;
        return;
      }
    }
    var ok = $('#modal-ok');
    setBusy(ok, true);
    try {
      var msg = await cfg.run(values);
      closeDialog();
      if (msg) toast(msg);
    } catch (e) {
      errBox.textContent = e.message || String(e);
      errBox.hidden = false;
    } finally {
      setBusy(ok, false);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------------------------

  async function loadSummary() {
    try {
      var s = await rpc('admin_course_summary');
      $all('[data-stat]').forEach(function (el) {
        var v = s[el.dataset.stat];
        el.textContent = v === undefined || v === null ? '0' : String(v);
      });
      $all('[data-student]').forEach(function (el) {
        el.textContent = String((s.students || {})[el.dataset.student] || 0);
      });
      var att = $('#stat-attention');
      att.classList.toggle('stat-alert', Number(s.attention) > 0);
    } catch (e) {
      toast('Summary: ' + e.message, true);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Payments
  // ---------------------------------------------------------------------------------------------

  var pay = { offset: 0, total: 0 };

  async function loadPayments(reset) {
    var tbody = $('#pay-rows');
    var more = $('#pay-more');
    if (reset !== false) { pay.offset = 0; pay.total = 0; tbody.replaceChildren(); }
    setBusy(more, true);
    try {
      var rows = await rpc('admin_payments_list', {
        p_filter: $('#pay-filter').value,
        p_course: $('#pay-course').value || null,
        p_search: $('#pay-search').value.trim() || null,
        p_limit: PAGE,
        p_offset: pay.offset
      }) || [];
      if (rows.length) pay.total = Number(rows[0].total) || rows.length;
      rows.forEach(function (r) { tbody.append(paymentRow(r)); });
      pay.offset += rows.length;
      listFooter('pay', pay.offset, pay.total, 'payment', 'No payments match.');
    } catch (e) {
      listFooter('pay', 0, 0, 'payment', 'Could not load payments: ' + e.message);
    } finally {
      setBusy(more, false);
    }
  }

  function listFooter(prefix, shown, total, noun, emptyText) {
    $('#' + prefix + '-count').textContent = total ? ('Showing ' + shown + ' of ' + total + ' ' + noun + (total === 1 ? '' : 's')) : '';
    var empty = $('#' + prefix + '-empty');
    empty.hidden = shown > 0;
    empty.textContent = emptyText;
    $('#' + prefix + '-more').hidden = !(shown > 0 && shown < total);
  }

  function paymentRow(r) {
    var student = h('td', { class: 'cell-student' },
      h('div', { class: 'strong', text: r.email }),
      r.firstname || r.phone ? h('div', { class: 'muted', text: [r.firstname, r.phone].filter(Boolean).join(' · ') }) : null,
      r.account_email && r.account_email.toLowerCase() !== String(r.email).toLowerCase()
        ? h('div', { class: 'muted', text: 'Account: ' + r.account_email }) : null);
    var status = h('td', {},
      badge(STATUS, r.status),
      h('div', { class: 'muted small', text: SOURCE[r.source] || r.source }),
      r.welcome_mail_at ? h('div', { class: 'muted small', text: 'Welcome mail sent' }) : null,
      r.whatsapp_at ? h('div', { class: 'muted small', text: 'WhatsApp sent' }) : null,
      r.resend_mail ? h('div', { class: 'muted small', text: 'Mail again: waiting for the Worker' }) : null);
    var info = h('td', { class: 'cell-info' },
      r.attempts ? h('div', { class: 'muted small', text: r.attempts + (r.attempts === 1 ? ' try' : ' tries') + (r.last_attempt_at ? ', last ' + ist(r.last_attempt_at) : '') }) : null,
      r.last_error ? h('div', { class: 'error-text', text: r.last_error }) : null,
      r.note ? h('div', { class: 'note-text', text: r.note }) : null);
    return h('tr', { dataset: { txnid: r.txnid } },
      h('td', { class: 'nowrap' }, h('div', { text: ist(r.paid_at || r.created_at) }), h('div', { class: 'muted small mono', text: r.txnid })),
      student,
      h('td', { text: courseLabel(r.course) }),
      h('td', { class: 'nowrap', text: money(r.amount) }),
      status,
      info,
      h('td', { class: 'cell-actions' }, paymentActions(r)));
  }

  function actionButton(label, onClick, tone) {
    return h('button', { type: 'button', class: 'btn btn-small' + (tone ? ' btn-' + tone : ''), text: label, on: { click: onClick } });
  }

  function paymentActions(r) {
    var wrap = h('div', { class: 'actions' });
    var open = ['paid', 'needs_review', 'duplicate', 'ignored'].indexOf(r.status) !== -1;
    if ((r.status === 'paid' || r.status === 'ignored') && r.course) {
      wrap.append(actionButton('Retry now', function () { payAction(r, 'retry'); }, 'primary'));
    }
    if (r.status === 'needs_review' || (r.status === 'ignored' && !r.course)) {
      wrap.append(actionButton('Give access', function () { payAction(r, 'give_access'); }, 'primary'));
    }
    if (['paid', 'needs_review', 'duplicate', 'ignored'].indexOf(r.status) !== -1) {
      wrap.append(actionButton('Fix email', function () { payAction(r, 'set_email'); }));
    }
    if (r.status === 'enrolled') {
      wrap.append(actionButton('Send welcome mail again', function () { payAction(r, 'resend_mail'); }));
    }
    if (r.status !== 'refunded') {
      wrap.append(actionButton('Mark refunded', function () { payAction(r, 'refunded'); }, 'danger-ghost'));
    }
    if (open && r.status !== 'ignored') {
      wrap.append(actionButton('Ignore', function () { payAction(r, 'ignored'); }));
    }
    wrap.append(actionButton('Note', function () { payAction(r, 'note'); }));
    return wrap;
  }

  var NOTE_FIELD = { name: 'note', label: 'Note', type: 'textarea', placeholder: 'Why (kept with the payment and in the log)' };

  function payAction(r, action) {
    var who = r.email + ' · ' + money(r.amount) + ' · ' + r.txnid;
    var cfg = { fields: [NOTE_FIELD], run: null };
    var after = 'Saved.';
    if (action === 'retry') {
      cfg.title = 'Retry this payment now';
      cfg.intro = who + '. The Worker tries again within 10 minutes and gives ' + courseLabel(r.course) + ' access.';
      cfg.ok = 'Retry';
      after = 'Queued. The Worker tries again within 10 minutes.';
    } else if (action === 'give_access') {
      cfg.title = 'Give access for this payment';
      cfg.intro = who + (r.note ? '. ' + r.note : '') + '. Check the payment was not refunded first.';
      cfg.fields = [{ name: 'value', label: 'Course', type: 'select', required: true, value: r.course || '',
        options: [{ value: '', label: 'Choose a course' }].concat(COURSES.map(function (c) { return { value: c.id, label: c.label }; })) }, NOTE_FIELD];
      cfg.ok = 'Give access';
      after = 'Queued. The Worker gives access within 10 minutes.';
    } else if (action === 'set_email') {
      cfg.title = 'Correct the email';
      cfg.intro = 'PayU has ' + r.email + '. Access goes to the account with the email you type here (a new account is made if none exists).';
      cfg.fields = [{ name: 'value', label: 'Correct email', type: 'email', required: true, value: r.email }, NOTE_FIELD];
      cfg.validate = function (v) { return EMAIL_RE.test(v.value) ? null : 'Enter a valid email'; };
      cfg.ok = 'Save email';
      after = r.status === 'paid' ? 'Saved. The Worker retries with the new email within 10 minutes.' : 'Email saved.';
    } else if (action === 'refunded') {
      cfg.title = 'Mark as refunded';
      cfg.intro = who + '. Do this after the money is returned on PayU.' + (r.status === 'enrolled' ? ' This also removes the course access this payment gave.' : ' The Worker will not try it again.');
      cfg.ok = 'Mark refunded';
      cfg.danger = true;
    } else if (action === 'ignored') {
      cfg.title = 'Ignore this payment';
      cfg.intro = who + '. Use this for test payments or payments for something else. The Worker will not try it again.';
      cfg.ok = 'Ignore';
    } else if (action === 'resend_mail') {
      cfg.title = 'Send the welcome mail again';
      cfg.intro = 'To ' + r.email + '. If the student never logged in, the mail has a new set-password link. It goes out within 10 minutes.';
      cfg.ok = 'Send again';
      after = 'Queued. The mail goes out within 10 minutes.';
    } else if (action === 'note') {
      cfg.title = 'Note';
      cfg.intro = who;
      cfg.fields = [{ name: 'note', label: 'Note', type: 'textarea', value: r.note || '' }];
    }
    cfg.run = async function (v) {
      await rpc('admin_payment_action', { p_txnid: r.txnid, p_action: action, p_value: v.value || null, p_note: v.note || null });
      refreshAfterChange();
      return after;
    };
    openDialog(cfg);
  }

  function addPaymentDialog(prefill) {
    var p = prefill || {};
    openDialog({
      title: 'Add a payment or give access',
      intro: 'For a payment PayU\'s list did not show (another link, or older than 2 days), or access for someone with no account yet. The Worker gives access within 10 minutes; a new email gets an account and a set-password mail.',
      fields: [
        { name: 'email', label: 'Student email', type: 'email', required: true, value: p.email || '' },
        { name: 'course', label: 'Course', type: 'select', required: true, value: p.course || '',
          options: [{ value: '', label: 'Choose a course' }].concat(COURSES.map(function (c) { return { value: c.id, label: c.label }; })) },
        { name: 'amount', label: 'Amount paid (₹)', type: 'number', inputmode: 'decimal', min: 0, step: '0.01', value: p.amount !== undefined ? p.amount : '', hint: 'Use 0 for free access.' },
        { name: 'txnid', label: 'PayU transaction ID', placeholder: 'Leave empty to make one', hint: 'From the PayU receipt mail ("Transaction ID").' },
        { name: 'name', label: 'Name' },
        { name: 'phone', label: 'Phone', type: 'tel' },
        NOTE_FIELD
      ],
      ok: 'Add',
      validate: function (v) {
        if (!EMAIL_RE.test(v.email)) return 'Enter a valid email';
        if (v.amount !== '' && !(Number(v.amount) >= 0)) return 'Enter an amount of 0 or more';
        return null;
      },
      run: async function (v) {
        var row = await rpc('admin_payment_add', {
          p_email: v.email, p_course: v.course, p_amount: v.amount === '' ? 0 : Number(v.amount),
          p_txnid: v.txnid || null, p_name: v.name || '', p_phone: v.phone || '', p_note: v.note || null
        });
        refreshAfterChange();
        return 'Added (' + row.txnid + '). The Worker gives access within 10 minutes.';
      }
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Students & access
  // ---------------------------------------------------------------------------------------------

  var lastStudentQuery = '';

  async function findStudents(q) {
    var box = $('#stu-results');
    var query = (q === undefined ? $('#stu-search').value : q).trim();
    if (query.length < 3) {
      box.replaceChildren(h('p', { class: 'empty', text: 'Type at least 3 letters of the email.' }));
      return;
    }
    lastStudentQuery = query;
    box.replaceChildren(h('p', { class: 'muted', text: 'Searching…' }));
    try {
      var res = await rpc('admin_find_students', { p_query: query });
      renderStudents(query, res || {});
    } catch (e) {
      box.replaceChildren(h('p', { class: 'empty', text: 'Could not search: ' + e.message }));
    }
  }

  function renderStudents(query, res) {
    var box = $('#stu-results');
    var accounts = res.accounts || [];
    var payments = res.payments || [];
    var regs = res.registrations || [];
    var out = [];

    if (!accounts.length) {
      var noAcc = h('div', { class: 'card card-soft' },
        h('h3', { text: 'No account matches "' + query + '"' }));
      if (EMAIL_RE.test(query)) {
        noAcc.append(
          h('p', { text: 'Give access anyway: the Worker makes the account and mails a set-password link.' }),
          actionButton('Make the account and give access', function () { addPaymentDialog({ email: query.toLowerCase(), amount: 0 }); }, 'primary'));
      }
      out.push(noAcc);
    }

    accounts.forEach(function (a) { out.push(accountCard(a)); });

    if (payments.length) {
      var tbody = h('tbody', {});
      payments.forEach(function (p) { tbody.append(paymentRow(p)); });
      out.push(h('div', { class: 'card' },
        h('h3', { text: 'Payments' }),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ['Paid', 'Student', 'Course', 'Amount', 'Status', 'Tries, error, note', ''].map(function (t) { return h('th', { text: t }); }))),
          tbody))));
    }

    if (regs.length) {
      var rb = h('tbody', {});
      regs.forEach(function (r) { rb.append(registrationRow(r)); });
      out.push(h('div', { class: 'card' },
        h('h3', { text: 'Articleship registrations' }),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ['Date', 'Student', 'Amount', 'Status', 'Transaction', 'Confirmation mail'].map(function (t) { return h('th', { text: t }); }))),
          rb))));
    }

    if (accounts.length && !payments.length && !regs.length) {
      out.push(h('p', { class: 'muted', text: 'No payments or registrations with this email.' }));
    }
    box.replaceChildren.apply(box, out);
  }

  function accountCard(a) {
    var all = a.enrollments || [];
    // 'refunded-payu-txn' is how a refund is marked: the row keeps the txnid but gives no access.
    var enrollments = all.filter(function (e) { return e.course !== REFUND_MARKER; });
    var refunds = all.filter(function (e) { return e.course === REFUND_MARKER; });
    var held = enrollments.map(function (e) { return e.course; });
    var list = h('ul', { class: 'course-list' });
    if (!enrollments.length) list.append(h('li', { class: 'muted', text: 'No courses.' }));
    refunds.forEach(function (e) {
      list.append(h('li', { class: 'course-item' },
        h('div', {},
          h('div', { class: 'muted', text: 'Refunded payment ' + (e.batch || '') }),
          h('div', { class: 'muted small', text: 'No access · since ' + (ist(e.created_at) || '–') })),
        badge(STATUS, 'refunded')));
    });
    enrollments.forEach(function (e) {
      list.append(h('li', { class: 'course-item' },
        h('div', {},
          h('div', { class: 'strong', text: courseLabel(e.course) }),
          h('div', { class: 'muted small', text: 'Since ' + (ist(e.created_at) || '–') + ' · ' + howLabel(e.batch, e.payment_status) })),
        actionButton('Remove', function () { revokeDialog(a, e.course); }, 'danger-ghost')));
    });

    var grant = null;
    var missing = COURSES.filter(function (c) { return held.indexOf(c.id) === -1; });
    if (missing.length) {
      var sel = courseOptions(h('select', { 'aria-label': 'Course to give' }), { exclude: held });
      grant = h('div', { class: 'grant-row' }, sel,
        actionButton('Give course', function () { grantDialog(a, sel.value); }, 'primary'));
    }

    return h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', {},
          h('h3', { text: a.email }),
          h('div', { class: 'muted small', text:
            'Account since ' + (ist(a.created_at) || '–') + ' · ' +
            (a.last_sign_in_at ? 'last login ' + ist(a.last_sign_in_at) : 'never logged in') +
            (a.email_confirmed_at ? '' : ' · email not confirmed') })),
        a.exact ? h('span', { class: 'badge badge-info', text: 'Exact match' }) : null),
      list,
      grant);
  }

  function grantDialog(account, course) {
    openDialog({
      title: 'Give ' + courseLabel(course),
      intro: account.email + ' gets ' + courseLabel(course) + ' access now. No mail is sent.',
      fields: [NOTE_FIELD],
      ok: 'Give course',
      run: async function (v) {
        await rpc('admin_course_grant', { p_user_id: account.id, p_course: course, p_note: v.note || null });
        refreshAfterChange();
        return courseLabel(course) + ' given to ' + account.email + '.';
      }
    });
  }

  function revokeDialog(account, course) {
    var email = account.email || account.user_id;
    openDialog({
      title: 'Remove ' + courseLabel(course),
      intro: email + ' loses ' + courseLabel(course) + ' access now. A payment waiting for this access is stopped too.',
      fields: [{ name: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'For example: refunded on PayU' }],
      ok: 'Remove access',
      danger: true,
      validate: function (v) { return v.reason.length >= 3 ? null : 'Write a reason (at least 3 letters)'; },
      run: async function (v) {
        await rpc('admin_course_revoke', { p_user_id: account.id || account.user_id, p_course: course, p_reason: v.reason });
        refreshAfterChange();
        return courseLabel(course) + ' removed from ' + email + '.';
      }
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Course lists
  // ---------------------------------------------------------------------------------------------

  var crs = { offset: 0, total: 0 };

  async function loadCourse(reset) {
    var tbody = $('#crs-rows');
    if (reset !== false) { crs.offset = 0; crs.total = 0; tbody.replaceChildren(); }
    var more = $('#crs-more');
    setBusy(more, true);
    try {
      var rows = await rpc('admin_course_students', {
        p_course: $('#crs-course').value,
        p_search: $('#crs-search').value.trim() || null,
        p_limit: PAGE,
        p_offset: crs.offset
      }) || [];
      if (rows.length) crs.total = Number(rows[0].total) || rows.length;
      rows.forEach(function (r) { tbody.append(courseRow(r)); });
      crs.offset += rows.length;
      listFooter('crs', crs.offset, crs.total, 'student', 'No students match.');
    } catch (e) {
      listFooter('crs', 0, 0, 'student', 'Could not load the list: ' + e.message);
    } finally {
      setBusy(more, false);
    }
  }

  function courseRow(r) {
    return h('tr', {},
      h('td', { class: 'strong', text: r.email || r.user_id }),
      h('td', { class: 'nowrap', text: ist(r.created_at) || '–' }),
      h('td', { text: howLabel(r.batch, r.payment_status) + (r.payment_amount ? ' · ' + money(r.payment_amount) : '') }),
      h('td', { class: 'nowrap', text: r.last_sign_in_at ? ist(r.last_sign_in_at) : 'Never' }),
      h('td', { class: 'cell-actions' },
        actionButton('Remove', function () { revokeDialog({ id: r.user_id, email: r.email }, r.course); }, 'danger-ghost')));
  }

  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // no formulas when opened in Excel or Sheets
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  async function downloadCourseCsv() {
    var btn = $('#crs-csv');
    setBusy(btn, true);
    try {
      var course = $('#crs-course').value;
      var search = $('#crs-search').value.trim() || null;
      var all = [];
      for (var offset = 0; offset < 100000; offset += 1000) {
        var rows = await rpc('admin_course_students', { p_course: course, p_search: search, p_limit: 1000, p_offset: offset }) || [];
        all = all.concat(rows);
        if (rows.length < 1000) break;
      }
      var lines = [['email', 'course', 'since_ist', 'how', 'payment_status', 'payment_amount', 'last_login_ist'].join(',')];
      all.forEach(function (r) {
        lines.push([r.email, courseLabel(r.course), ist(r.created_at), r.batch || '', r.payment_status || '', r.payment_amount || '', ist(r.last_sign_in_at)].map(csvCell).join(','));
      });
      var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var a = h('a', { href: URL.createObjectURL(blob), download: course + '-students-' + new Date().toISOString().slice(0, 10) + '.csv' });
      document.body.append(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('Downloaded ' + all.length + ' students.');
    } catch (e) {
      toast('CSV: ' + e.message, true);
    } finally {
      setBusy(btn, false);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Articleship registrations
  // ---------------------------------------------------------------------------------------------

  var reg = { offset: 0, total: 0 };

  async function loadRegistrations(reset) {
    var tbody = $('#reg-rows');
    if (reset !== false) { reg.offset = 0; reg.total = 0; tbody.replaceChildren(); }
    var more = $('#reg-more');
    setBusy(more, true);
    try {
      var res = await rpc('admin_program_registrations', {
        p_status: $('#reg-status').value || null,
        p_search: $('#reg-search').value.trim() || null,
        p_limit: PAGE,
        p_offset: reg.offset
      }) || {};
      if (res.available === false) {
        listFooter('reg', 0, 0, 'registration', 'The registrations table does not exist in this database.');
        return;
      }
      var rows = res.rows || [];
      reg.total = Number(res.total) || 0;
      rows.forEach(function (r) { tbody.append(registrationRow(r)); });
      reg.offset += rows.length;
      listFooter('reg', reg.offset, reg.total, 'registration', 'No registrations match.');
    } catch (e) {
      listFooter('reg', 0, 0, 'registration', 'Could not load registrations: ' + e.message);
    } finally {
      setBusy(more, false);
    }
  }

  function registrationRow(r) {
    return h('tr', {},
      h('td', { class: 'nowrap', text: ist(r.paid_at || r.created_at) }),
      h('td', { class: 'cell-student' },
        h('div', { class: 'strong', text: r.name || '–' }),
        h('div', { class: 'muted', text: [r.email, r.phone].filter(Boolean).join(' · ') })),
      h('td', { class: 'nowrap', text: money(r.amount) + (r.coupon ? ' · ' + r.coupon : '') }),
      h('td', {}, badge(REG_STATUS, r.status)),
      h('td', { class: 'mono small', text: r.txnid || '' }),
      h('td', { class: 'nowrap', text: r.confirmation_sent_at ? ist(r.confirmation_sent_at) : (r.status === 'paid' || r.status === 'free' ? 'Not sent' : '–') }));
  }

  // ---------------------------------------------------------------------------------------------
  // Activity log
  // ---------------------------------------------------------------------------------------------

  var log = { offset: 0, total: 0 };

  async function loadLog(reset) {
    var tbody = $('#log-rows');
    if (reset !== false) { log.offset = 0; log.total = 0; tbody.replaceChildren(); }
    var more = $('#log-more');
    setBusy(more, true);
    try {
      var rows = await rpc('admin_access_log', {
        p_search: $('#log-search').value.trim() || null,
        p_limit: PAGE,
        p_offset: log.offset
      }) || [];
      if (rows.length) log.total = Number(rows[0].total) || rows.length;
      rows.forEach(function (r) {
        tbody.append(h('tr', {},
          h('td', { class: 'nowrap', text: ist(r.at) }),
          h('td', { text: r.actor_email || 'Worker' }),
          h('td', { text: LOG_ACTIONS[r.action] || r.action }),
          h('td', { text: r.email || '' }),
          h('td', { text: r.course ? courseLabel(r.course) : '' }),
          h('td', { class: 'cell-info' },
            r.txnid ? h('div', { class: 'mono small', text: r.txnid }) : null,
            r.detail ? h('div', { class: 'note-text', text: r.detail }) : null)));
      });
      log.offset += rows.length;
      listFooter('log', log.offset, log.total, 'entry', 'Nothing logged yet.');
    } catch (e) {
      listFooter('log', 0, 0, 'entry', 'Could not load the log: ' + e.message);
    } finally {
      setBusy(more, false);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Tabs and wiring
  // ---------------------------------------------------------------------------------------------

  var LOADERS = {
    payments: function () { return loadPayments(); },
    students: function () { if (lastStudentQuery) return findStudents(lastStudentQuery); },
    courses: function () { return loadCourse(); },
    registrations: function () { return loadRegistrations(); },
    log: function () { return loadLog(); }
  };

  function currentTab() {
    var t = $('[role="tab"][aria-selected="true"]');
    return t ? t.dataset.tab : 'payments';
  }

  function showTab(name, focus) {
    $all('[role="tab"]').forEach(function (t) {
      var on = t.dataset.tab === name;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    $all('[role="tabpanel"]').forEach(function (p) { p.hidden = p.id !== 'panel-' + name; });
    if (!loaded[name]) {
      loaded[name] = true;
      LOADERS[name]();
    }
  }

  /** After any change: numbers, the open tab, and mark the others for a fresh load. */
  function refreshAfterChange() {
    loadSummary();
    var tab = currentTab();
    Object.keys(loaded).forEach(function (k) { if (k !== tab) loaded[k] = false; });
    LOADERS[tab]();
  }

  function bind() {
    courseOptions($('#pay-course'));
    courseOptions($('#crs-course'));

    $all('[role="tab"]').forEach(function (t, i, tabs) {
      t.addEventListener('click', function () { showTab(t.dataset.tab); });
      t.addEventListener('keydown', function (ev) {
        var d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        ev.preventDefault();
        showTab(tabs[(i + d + tabs.length) % tabs.length].dataset.tab, true);
      });
    });

    $('#pay-form').addEventListener('submit', function (ev) { ev.preventDefault(); loadPayments(); });
    $('#pay-filter').addEventListener('change', function () { loadPayments(); });
    $('#pay-course').addEventListener('change', function () { loadPayments(); });
    $('#pay-more').addEventListener('click', function () { loadPayments(false); });
    $('#pay-add').addEventListener('click', function () { addPaymentDialog(); });

    $('#stu-form').addEventListener('submit', function (ev) { ev.preventDefault(); findStudents(); });

    $('#crs-form').addEventListener('submit', function (ev) { ev.preventDefault(); loadCourse(); });
    $('#crs-course').addEventListener('change', function () { loadCourse(); });
    $('#crs-more').addEventListener('click', function () { loadCourse(false); });
    $('#crs-csv').addEventListener('click', downloadCourseCsv);

    $('#reg-form').addEventListener('submit', function (ev) { ev.preventDefault(); loadRegistrations(); });
    $('#reg-status').addEventListener('change', function () { loadRegistrations(); });
    $('#reg-more').addEventListener('click', function () { loadRegistrations(false); });

    $('#log-form').addEventListener('submit', function (ev) { ev.preventDefault(); loadLog(); });
    $('#log-more').addEventListener('click', function () { loadLog(false); });

    $('#stat-attention').addEventListener('click', function () {
      $('#pay-filter').value = 'attention';
      $('#pay-course').value = '';
      $('#pay-search').value = '';
      loaded.payments = false;
      showTab('payments');
    });
    $('#refresh-all').addEventListener('click', function () {
      loaded = {};
      loadSummary();
      showTab(currentTab());
    });

    $('#modal-form').addEventListener('submit', submitDialog);
    $all('[data-close]').forEach(function (el) { el.addEventListener('click', closeDialog); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !$('#modal').hidden) closeDialog();
    });
  }

  function gate(title, text, action) {
    $('#gate-title').textContent = title;
    $('#gate-text').textContent = text;
    var a = $('#gate-action');
    if (action) {
      a.textContent = action.label;
      a.href = action.href;
      a.hidden = false;
    } else {
      a.hidden = true;
    }
  }

  async function start() {
    db = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : window.supabaseClient;
    if (!db) {
      gate('Could not load', 'The login library did not load. Refresh the page.');
      return;
    }
    var sessionRes = await db.auth.getSession();
    var session = sessionRes && sessionRes.data && sessionRes.data.session;
    if (!session) {
      gate('Please log in', 'This page is for MSC super admins.', { label: 'Log in', href: '/login.html?redirect=%2Fadmin-courses.html' });
      return;
    }
    var check = await db.rpc('is_super_admin');
    if (check.error) {
      gate('Could not check your access', 'Try again in a moment.', { label: 'Try again', href: '/admin-courses.html' });
      return;
    }
    if (!check.data) {
      gate('Super admins only', 'Your account (' + (session.user && session.user.email) + ') cannot open this page.', { label: 'Back to home', href: '/' });
      return;
    }
    $('#who').textContent = session.user && session.user.email ? session.user.email : '';
    $('#gate').hidden = true;
    $('#app').hidden = false;
    bind();
    loadSummary();
    showTab('payments');
  }

  window.MSCCourseAdmin = { start: start };
  if (!window.__MSC_COURSE_ADMIN_NO_AUTOSTART) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})();
