// MSC CA Fresher Program registration (24 Nov 2026: Nov'26 pre-result batch, ₹2799).
// Every .js-register-btn on the Fresher page opens a small form (name, email, WhatsApp). The details go to the
// checkpayment Worker (/fresher/start), which fixes the price and answers with a one-time pay link on the Worker.
// That link is a plain GET page that posts the signed PayU form, so it works in browsers and in the Flutter app
// (the app opens non-MSC hosts in the phone's browser, where a POST from the WebView would lose its body).
// The same file runs on www (master) and mobile.msc (mobile).
(function () {
  'use strict';

  var START_URL = 'https://checkpayment.bhansalimanan55.workers.dev/fresher/start';
  var HELP = '72288 81182';
  var PRICE = '₹2799';

  function css() {
    return [
      '.frs-overlay{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.6)}',
      '.frs-overlay.open{display:flex}',
      '.frs-dialog{position:relative;width:100%;max-width:420px;max-height:calc(100vh - 32px);overflow:auto;padding:26px 22px 22px;border-radius:18px;background:#fff;color:#0f172a;box-shadow:0 24px 60px rgba(15,23,42,.35);font-family:inherit;box-sizing:border-box}',
      '.frs-close{position:absolute;top:10px;right:12px;width:36px;height:36px;border:0;background:transparent;font-size:24px;line-height:1;color:#64748b;cursor:pointer}',
      '.frs-tag{display:inline-block;margin:0 0 10px;padding:5px 12px;border-radius:999px;background:#fef3c7;color:#b45309;font-weight:700;font-size:12.5px}',
      '.frs-dialog h2{margin:0 0 4px;font-size:1.3rem;line-height:1.25}',
      '.frs-price{margin:0 0 16px;color:#475569;font-size:.95rem}',
      '.frs-price strong{color:#059669;font-size:1.25rem}',
      '.frs-price s{color:#94a3b8;margin-left:6px}',
      '.frs-field{display:block;margin:0 0 12px;text-align:left}',
      '.frs-field span{display:block;margin:0 0 5px;font-size:.85rem;font-weight:600;color:#334155}',
      '.frs-field input{width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px;font-family:inherit;background:#fff;color:#0f172a}',
      '.frs-field input:focus{outline:2px solid #10b981;outline-offset:1px;border-color:#10b981}',
      '.frs-field input[aria-invalid="true"]{border-color:#ef4444}',
      '.frs-submit{width:100%;margin-top:4px;padding:14px 18px;border:0;border-radius:999px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:800;font-size:1rem;cursor:pointer;font-family:inherit}',
      '.frs-submit[disabled]{opacity:.7;cursor:wait}',
      '.frs-status{min-height:20px;margin:10px 0 0;font-size:.88rem;line-height:1.4;color:#475569;text-align:center}',
      '.frs-status.err{color:#dc2626}',
      '.frs-trust{margin:10px 0 0;font-size:.8rem;color:#64748b;text-align:center}',
      ':root[data-theme="dark"] .frs-dialog{background:#111827;color:#f1f5f9}',
      ':root[data-theme="dark"] .frs-field span{color:#cbd5e1}',
      ':root[data-theme="dark"] .frs-field input{background:#0b1020;color:#f1f5f9;border-color:#334155}',
      ':root[data-theme="dark"] .frs-price,:root[data-theme="dark"] .frs-status,:root[data-theme="dark"] .frs-trust{color:#94a3b8}'
    ].join('');
  }

  function cleanPhone(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
    if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return d;
  }

  function build(doc) {
    var style = doc.createElement('style');
    style.textContent = css();
    doc.head.appendChild(style);

    var overlay = doc.createElement('div');
    overlay.className = 'frs-overlay';
    overlay.id = 'fresherRegister';
    overlay.innerHTML =
      '<div class="frs-dialog" role="dialog" aria-modal="true" aria-labelledby="frsTitle">' +
      '<button type="button" class="frs-close" aria-label="Close">&times;</button>' +
      '<div class="frs-tag">Exclusive Pre Result Batch for Nov’26 CAs</div>' +
      '<h2 id="frsTitle">Register for the MSC CA Fresher Program</h2>' +
      '<p class="frs-price"><strong>' + PRICE + '</strong><s>₹5999</s></p>' +
      '<form id="frsForm" novalidate>' +
      '<label class="frs-field"><span>Full name</span><input id="frsName" name="name" autocomplete="name" required maxlength="60"></label>' +
      '<label class="frs-field"><span>Email (your course login)</span><input id="frsEmail" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="120"></label>' +
      '<label class="frs-field"><span>WhatsApp number</span><input id="frsPhone" name="phone" type="tel" autocomplete="tel" inputmode="numeric" required maxlength="16" placeholder="10-digit number"></label>' +
      '<button type="submit" class="frs-submit" id="frsSubmit">Continue to payment • ' + PRICE + '</button>' +
      '<p class="frs-status" id="frsStatus" role="status" aria-live="polite"></p>' +
      '<p class="frs-trust">Secure payment by PayU: UPI, cards, netbanking</p>' +
      '</form></div>';
    doc.body.appendChild(overlay);
    return overlay;
  }

  function init(doc, win) {
    if (doc.getElementById('fresherRegister')) return;
    var overlay = build(doc);
    var form = doc.getElementById('frsForm');
    var nameEl = doc.getElementById('frsName');
    var emailEl = doc.getElementById('frsEmail');
    var phoneEl = doc.getElementById('frsPhone');
    var submit = doc.getElementById('frsSubmit');
    var statusEl = doc.getElementById('frsStatus');
    var label = submit.textContent;
    var prefilled = false;

    function status(text, isErr) {
      statusEl.textContent = text || '';
      statusEl.className = 'frs-status' + (isErr ? ' err' : '');
    }
    function invalid(el, msg) {
      [nameEl, emailEl, phoneEl].forEach(function (x) { x.removeAttribute('aria-invalid'); });
      if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
      status(msg, true);
    }
    function busy(on) {
      submit.disabled = on;
      submit.textContent = on ? 'Opening secure payment…' : label;
    }
    function prefill() {
      if (prefilled) return;
      prefilled = true;
      try {
        var sb = win.getSupabaseClient ? win.getSupabaseClient() : win.supabaseClient;
        if (!sb || !sb.auth || !sb.auth.getSession) return;
        sb.auth.getSession().then(function (res) {
          var user = res && res.data && res.data.session && res.data.session.user;
          if (!user) return;
          if (!emailEl.value && user.email) emailEl.value = user.email;
          var meta = user.user_metadata || {};
          var nm = meta.full_name || meta.name || '';
          if (!nameEl.value && nm) nameEl.value = nm;
        }).catch(function () {});
      } catch (e) { /* prefill is optional */ }
    }
    function open() {
      overlay.classList.add('open');
      doc.body.style.overflow = 'hidden';
      prefill();
      setTimeout(function () { (nameEl.value ? (emailEl.value ? phoneEl : emailEl) : nameEl).focus(); }, 50);
    }
    function close() {
      overlay.classList.remove('open');
      doc.body.style.overflow = '';
      busy(false);
    }

    doc.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.js-register-btn') : null;
      // Enrolled students' buttons become "Open your course" links (program-enrolled.js): leave those alone.
      if (!btn || btn.classList.contains('msc-open-course')) return;
      e.preventDefault();
      open();
    });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.frs-close').addEventListener('click', close);
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status('');
      var name = nameEl.value.trim();
      var email = emailEl.value.trim();
      var phone = cleanPhone(phoneEl.value);
      if (name.replace(/[^A-Za-z]/g, '').length < 2) return invalid(nameEl, 'Please enter your full name in English letters.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return invalid(emailEl, 'Please enter a valid email.');
      if (!/^[6-9]\d{9}$/.test(phone)) return invalid(phoneEl, 'Please enter your 10-digit WhatsApp number.');
      invalid(null, '');
      busy(true);
      win.fetch(START_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, email: email, phone: phone, site: win.location.origin })
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; });
      }).then(function (r) {
        if (r.ok && r.data && r.data.pay) {
          status('Opening PayU…');
          win.location.href = r.data.pay;
          // In the app the pay page opens in the phone's browser and this page stays: let them try again.
          setTimeout(function () { busy(false); status('Payment opened in your browser. Come back here after paying.'); }, 4000);
          return;
        }
        var field = r.data && r.data.field;
        busy(false);
        if (field === 'name') return invalid(nameEl, 'Please enter your full name in English letters.');
        if (field === 'email') return invalid(emailEl, 'Please enter a valid email.');
        if (field === 'phone') return invalid(phoneEl, 'Please enter your 10-digit WhatsApp number.');
        status('Something went wrong. Please try again, or WhatsApp ' + HELP + '.', true);
      }).catch(function () {
        busy(false);
        status('Network problem. Please check your internet and try again.', true);
      });
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { init: init, cleanPhone: cleanPhone, START_URL: START_URL };
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document, window); });
  } else {
    init(document, window);
  }
})();
