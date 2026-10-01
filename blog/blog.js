// Blog posts: reading progress bar, header shadow on scroll, and the Share button
// (the phone's share sheet where there is one, else copy the link).
(function () {
  'use strict';

  var bar = document.getElementById('reading-progress');
  var header = document.querySelector('.floating-header');

  function onScroll() {
    var doc = document.documentElement;
    var top = window.scrollY || doc.scrollTop;
    var height = doc.scrollHeight - doc.clientHeight;
    if (bar) bar.style.width = (height > 0 ? Math.min(100, (top / height) * 100) : 0) + '%';
    if (header) header.classList.toggle('scrolled', top > 10);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var button = document.getElementById('shareButton');
  var tooltip = document.getElementById('copiedTooltip');
  if (!button) return;

  function flash(text) {
    if (!tooltip) return;
    tooltip.textContent = text;
    tooltip.classList.add('show');
    setTimeout(function () { tooltip.classList.remove('show'); }, 2000);
  }

  function copyFallback(url) {
    var area = document.createElement('textarea');
    area.value = url;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }

  button.addEventListener('click', function () {
    var canonical = document.querySelector('link[rel="canonical"]');
    var url = canonical ? canonical.href : window.location.href;
    if (navigator.share) {
      navigator.share({ title: document.title, url: url }).catch(function () { /* closed the share sheet */ });
      return;
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(function () { flash('Link copied'); }, function () { flash(copyFallback(url) ? 'Link copied' : url); });
      return;
    }
    flash(copyFallback(url) ? 'Link copied' : url);
  });
})();
