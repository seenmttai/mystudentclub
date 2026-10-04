// Blog posts: full-width reading progress, dynamic sticky companion sidebar
// (progress tracker, interactive TOC, author bio, live session promos, CA tools, share dock),
// and smooth scrollspy tracking to eliminate dead space.
(function () {
  'use strict';

  var bar = document.getElementById('reading-progress');
  var header = document.querySelector('.floating-header');
  var sidebarFill = null;
  var sidebarPercent = null;

  function onScroll() {
    var doc = document.documentElement;
    var top = window.scrollY || doc.scrollTop;
    var height = doc.scrollHeight - doc.clientHeight;
    var pct = height > 0 ? Math.min(100, Math.round((top / height) * 100)) : 0;

    if (bar) bar.style.width = pct + '%';
    if (header) header.classList.toggle('scrolled', top > 10);
    if (sidebarFill) sidebarFill.style.width = pct + '%';
    if (sidebarPercent) sidebarPercent.textContent = pct + '% completed';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Share Handlers ─────────────────────────────────────────────────── */
  function flash(tooltip, text) {
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

  function setupShare(btn, tooltip) {
    if (!btn) return;
    btn.addEventListener('click', function () {
      var canonical = document.querySelector('link[rel="canonical"]');
      var url = canonical ? canonical.href : window.location.href;
      if (navigator.share) {
        navigator.share({ title: document.title, url: url }).catch(function () {});
        return;
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(
          function () { flash(tooltip, 'Link copied'); },
          function () { flash(tooltip, copyFallback(url) ? 'Link copied' : url); }
        );
        return;
      }
      flash(tooltip, copyFallback(url) ? 'Link copied' : url);
    });
  }

  var mainShareBtn = document.getElementById('shareButton');
  var mainShareTip = document.getElementById('copiedTooltip');
  if (mainShareBtn) setupShare(mainShareBtn, mainShareTip);

  /* ── Dynamic Sidebar & Persistent Companion ───────────────────────── */
  var blogBody = document.querySelector('.blog-body');
  var prose = document.querySelector('.prose');

  if (blogBody && prose) {
    var headings = prose.querySelectorAll('h2');
    var existingSidebar = document.querySelector('.blog-sidebar');

    if (!existingSidebar && headings.length >= 2) {
      var sidebar = document.createElement('aside');
      sidebar.className = 'blog-sidebar';
      sidebar.setAttribute('aria-label', 'Article table of contents and reading companion');

      // 1. Reading Tracker Widget
      var trackerWidget = document.createElement('div');
      trackerWidget.className = 'sidebar-widget tracker-widget';
      var readTimeText = document.querySelector('.post-read') ? document.querySelector('.post-read').textContent.trim() : '5 min read';
      trackerWidget.innerHTML =
        '<div class="sidebar-widget-title">' +
        '  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>' +
        '  Reading Progress' +
        '</div>' +
        '<div class="sidebar-tracker-bar"><div class="sidebar-tracker-fill" id="sidebar-tracker-fill"></div></div>' +
        '<div class="sidebar-tracker-stats"><span id="sidebar-percent">0% completed</span><span>' + readTimeText + '</span></div>';

      sidebar.appendChild(trackerWidget);
      sidebarFill = trackerWidget.querySelector('#sidebar-tracker-fill');
      sidebarPercent = trackerWidget.querySelector('#sidebar-percent');

      // 2. Table of Contents Widget
      var tocWidget = document.createElement('div');
      tocWidget.className = 'sidebar-widget toc-widget';
      tocWidget.innerHTML =
        '<div class="sidebar-widget-title">' +
        '  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7"/></svg>' +
        '  Table of Contents' +
        '</div>' +
        '<ul class="toc-list" id="toc-list"></ul>';

      var tocList = tocWidget.querySelector('#toc-list');
      var headingElements = [];

      headings.forEach(function (h2, index) {
        if (!h2.id) {
          h2.id = 'sec-' + (index + 1);
        }
        headingElements.push(h2);

        var li = document.createElement('li');
        var a = document.createElement('a');
        a.className = 'toc-link';
        a.href = '#' + h2.id;
        a.textContent = h2.textContent.replace(/^[0-9]+\.\s*/, '');
        a.addEventListener('click', function (e) {
          e.preventDefault();
          h2.scrollIntoView({ behavior: 'smooth' });
          if (history.pushState) {
            history.pushState(null, null, '#' + h2.id);
          }
        });
        li.appendChild(a);
        tocList.appendChild(li);
      });

      sidebar.appendChild(tocWidget);

      // Create a bottom container for promo cards matching "More guides from MSC" layout
      var bottomCards = document.createElement('section');
      bottomCards.className = 'bottom-promo-cards';
      bottomCards.setAttribute('aria-label', 'Featured MSC Resources and Mentorship');

      // 1. Live Sessions & Masterclass Promo Card
      var sessionsCard = document.createElement('a');
      sessionsCard.className = 'more-card promo-more-card';
      sessionsCard.href = '/sessions/';
      sessionsCard.innerHTML =
        '<span class="more-tag">Live Masterclass</span>' +
        '<span class="more-title">Live CA Masterclasses</span>' +
        '<p class="promo-card-desc">Join CA Padam Bhansali\'s upcoming live sessions on Big 4 prep, industrial training roadmap, and placement readiness.</p>' +
        '<span class="promo-card-action">Explore Live Sessions &rarr;</span>';
      bottomCards.appendChild(sessionsCard);

      // 2. Author Bio Widget Card
      var authorCard = document.createElement('div');
      authorCard.className = 'more-card promo-more-card author-more-card';
      authorCard.innerHTML =
        '<span class="more-tag">Founder &amp; Mentor</span>' +
        '<div class="sidebar-author-top" style="margin: 0.15rem 0 0.25rem;">' +
        '  <img src="/assets/mentornew.png" alt="CA Padam Bhansali" class="sidebar-author-avatar">' +
        '  <div class="sidebar-author-info">' +
        '    <span class="more-title" style="font-size: 1.05rem; display: block;">CA Padam Bhansali</span>' +
        '    <p style="margin: 0; font-size: 0.8rem; color: var(--muted);">Founder, My Student Club</p>' +
        '  </div>' +
        '</div>' +
        '<p class="promo-card-desc">Chartered Accountant guiding India\'s CA students across articleship, industrial training, and campus placements.</p>' +
        '<a class="promo-card-action" href="https://www.linkedin.com/in/ca-padam-bhansali/" target="_blank" rel="noopener">' +
        '  Connect on LinkedIn &rarr;' +
        '</a>';
      bottomCards.appendChild(authorCard);

      // 3. Free CA Tools Widget Card
      var toolsCard = document.createElement('div');
      toolsCard.className = 'more-card promo-more-card tools-more-card';
      toolsCard.innerHTML =
        '<span class="more-tag">Free CA Tools</span>' +
        '<span class="more-title">Career &amp; Placement Tools</span>' +
        '<div class="promo-tools-list">' +
        '  <a href="/cv-reviewer/" class="promo-tool-item">' +
        '    <span>AI Resume Reviewer</span><span class="tool-arrow">&rarr;</span>' +
        '  </a>' +
        '  <a href="/articleship-firm-reviews.html" class="promo-tool-item">' +
        '    <span>Articleship Firm Reviews</span><span class="tool-arrow">&rarr;</span>' +
        '  </a>' +
        '  <a href="/links/" class="promo-tool-item">' +
        '    <span>Official WhatsApp Hub</span><span class="tool-arrow">&rarr;</span>' +
        '  </a>' +
        '</div>';
      bottomCards.appendChild(toolsCard);

      // Append sidebar inside blogBody; bottom cards go AFTER blogBody (not inside the 2-col grid)
      blogBody.appendChild(sidebar);
      blogBody.parentNode.insertBefore(bottomCards, blogBody.nextSibling);

      // ScrollSpy: highlight active TOC item as user scrolls
      var tocLinks = sidebar.querySelectorAll('.toc-link');
      if (tocLinks.length > 0 && 'IntersectionObserver' in window) {
        var activeObserver = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                var id = entry.target.id;
                tocLinks.forEach(function (link) {
                  var matches = link.getAttribute('href') === '#' + id;
                  link.classList.toggle('active', matches);
                  if (matches) {
                    link.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }
                });
              }
            });
          },
          { rootMargin: '-70px 0px -65% 0px' }
        );

        headingElements.forEach(function (el) {
          activeObserver.observe(el);
        });
      }
    }
  }

  /* ── Hero Enhancement: Left-Aligned Inner Wrapper & Breadcrumb ────── */
  var blogHeader = document.querySelector('.blog-header');
  var postTag = document.querySelector('.post-tag');
  if (blogHeader) {
    var existingInner = blogHeader.querySelector('.blog-header-inner');
    if (!existingInner) {
      var inner = document.createElement('div');
      inner.className = 'blog-header-inner';
      while (blogHeader.firstChild) {
        inner.appendChild(blogHeader.firstChild);
      }
      blogHeader.appendChild(inner);
    }
    var currentInner = blogHeader.querySelector('.blog-header-inner') || blogHeader;
    if (postTag && !currentInner.querySelector('.blog-breadcrumb')) {
      var category = postTag.textContent.trim();
      var breadcrumb = document.createElement('nav');
      breadcrumb.className = 'blog-breadcrumb';
      breadcrumb.setAttribute('aria-label', 'Breadcrumb');
      breadcrumb.innerHTML =
        '<a href="/">Home</a><span class="sep">/</span><a href="/links/">Guides</a><span class="sep">/</span><span>' +
        category +
        '</span>';
      currentInner.insertBefore(breadcrumb, currentInner.firstChild);
    }
  }
})();
