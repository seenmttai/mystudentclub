// MSC Articleship Program registration (9 Nov 2026).
// Sends name/email/WhatsApp (+ optional coupon) to the checkpayment Worker, which
// fixes the price and returns a signed PayU form; this script then posts that
// form to PayU. A ₹0 coupon comes back as a redirect to the confirmation page.
(function () {
  'use strict';

  var START_URL = 'https://checkpayment.bhansalimanan55.workers.dev/articleship/start';
  var HELP = '72288 81182';

  var form = document.getElementById('registerForm');
  if (!form) return;

  var nameEl = document.getElementById('regName');
  var emailEl = document.getElementById('regEmail');
  var phoneEl = document.getElementById('regPhone');
  var couponEl = document.getElementById('regCoupon');
  var couponField = document.getElementById('regCouponField');
  var couponToggle = document.getElementById('regCouponToggle');
  var submitBtn = document.getElementById('registerSubmit');
  var submitText = submitBtn.querySelector('.register-submit-text');
  var statusEl = document.getElementById('registerStatus');
  var defaultLabel = submitText.innerHTML;

  function setStatus(text, kind) {
    statusEl.textContent = text || '';
    statusEl.className = 'notify-status register-status' + (kind ? ' is-' + kind : '');
  }

  function markInvalid(el, message) {
    [nameEl, emailEl, phoneEl, couponEl].forEach(function (x) { x.removeAttribute('aria-invalid'); });
    if (el) {
      el.setAttribute('aria-invalid', 'true');
      el.focus();
    }
    setStatus(message, 'error');
  }

  function busy(on) {
    submitBtn.disabled = on;
    submitText.innerHTML = on ? 'Opening secure payment&hellip;' : defaultLabel;
  }

  function cleanPhone(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
    if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return d;
  }

  couponToggle.addEventListener('click', function () {
    var open = couponField.hidden;
    couponField.hidden = !open;
    couponToggle.setAttribute('aria-expanded', String(open));
    if (open) couponEl.focus();
  });

  // Back from PayU without paying, or a payment we could not confirm.
  try {
    var reason = new URLSearchParams(window.location.search).get('payment');
    if (reason === 'failed') {
      setStatus("Your payment didn't go through. Please try again.", 'error');
    } else if (reason === 'verify') {
      setStatus("We couldn't confirm your payment. If money was deducted, WhatsApp us at " + HELP + ' with the screenshot and we will sort it out.', 'error');
    }
    if (reason) {
      var section = document.getElementById('register');
      if (section) setTimeout(function () { section.scrollIntoView({ block: 'start' }); }, 300);
    }
  } catch (e) { /* old browsers: no banner */ }

  // Logged-in students: fill what we already know.
  try {
    var sb = window.getSupabaseClient ? window.getSupabaseClient() : window.supabaseClient;
    if (sb && sb.auth && sb.auth.getSession) {
      sb.auth.getSession().then(function (res) {
        var user = res && res.data && res.data.session && res.data.session.user;
        if (!user) return;
        if (!emailEl.value && user.email) emailEl.value = user.email;
        var meta = user.user_metadata || {};
        var nm = meta.full_name || meta.name || '';
        if (!nameEl.value && nm) nameEl.value = nm;
      }).catch(function () {});
    }
  } catch (e) { /* prefill is optional */ }

  function postToPayU(action, fields) {
    var f = document.createElement('form');
    f.method = 'POST';
    f.action = action;
    f.style.display = 'none';
    Object.keys(fields).forEach(function (k) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = k;
      input.value = fields[k];
      f.appendChild(input);
    });
    document.body.appendChild(f);
    f.submit();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setStatus('');

    var name = nameEl.value.trim();
    var email = emailEl.value.trim();
    var phone = cleanPhone(phoneEl.value);
    var coupon = couponField.hidden ? '' : couponEl.value.trim();

    if (name.replace(/[^A-Za-z]/g, '').length < 2) return markInvalid(nameEl, 'Please enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return markInvalid(emailEl, 'Please enter a valid email.');
    if (!/^[6-9]\d{9}$/.test(phone)) return markInvalid(phoneEl, 'Please enter your 10-digit WhatsApp number.');
    markInvalid(null, '');

    busy(true);
    try { if (typeof gtag === 'function') gtag('event', 'begin_checkout', { currency: 'INR', value: 1499, items: [{ item_name: 'MSC Articleship Program' }] }); } catch (err) {}

    fetch(START_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, email: email, phone: phone, coupon: coupon, site: window.location.origin })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (r) {
        var d = r.data || {};
        if (r.ok && d.redirect) {
          window.location.href = d.redirect;
          return;
        }
        if (r.ok && d.action && d.fields) {
          postToPayU(d.action, d.fields);
          return;
        }
        busy(false);
        if (d.error === 'invalid_coupon') return markInvalid(couponEl, "That coupon code isn't valid.");
        if (d.field === 'name') return markInvalid(nameEl, 'Please enter your full name.');
        if (d.field === 'email') return markInvalid(emailEl, 'Please enter a valid email.');
        if (d.field === 'phone') return markInvalid(phoneEl, 'Please enter your 10-digit WhatsApp number.');
        setStatus('Something went wrong. Please try again, or WhatsApp us at ' + HELP + '.', 'error');
      })
      .catch(function () {
        busy(false);
        setStatus('Could not reach the payment page. Check your internet and try again.', 'error');
      });
  });

  // Coming back with the browser's Back button from PayU restores the page from cache.
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) busy(false);
  });
})();
