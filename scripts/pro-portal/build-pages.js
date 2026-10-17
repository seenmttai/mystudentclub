// Generates the CS / CMA hub and lane pages from config.js + content.js.
//   node scripts/pro-portal/build-pages.js          (or: npm run build:pro-portal)
// Pages are written to the repository root so Cloudflare Pages serves
// /cs-fresher-jobs from cs-fresher-jobs.html. Re-run after editing config,
// content or the templates below; tests/pro-portal-pages.test.cjs checks the
// committed files are up to date.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COURSES, SITE } from './config.js';
import { CONTENT, AS_OF } from './content.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// JSON-LD inside <script>: escape "<" so no string can close the tag.
const jsonLd = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

// One version for every asset, derived from their contents, so a deploy
// always busts caches without anyone editing ?v= by hand.
const ASSET_VERSION = createHash('sha1')
    .update(['portal.css', 'portal.js', 'core.js', 'config.js'].map(file => readFileSync(join(here, file), 'utf8')).join('\n'))
    .digest('hex')
    .slice(0, 10);

const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    pin: '<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
    cursor: '<path d="m4 4 7 17 2.5-7.5L21 11 4 4z"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
    factory: '<path d="M3 21V10l6 4V10l6 4V6l6 3v12H3z"/><path d="M7 17h2M12 17h2M17 17h1"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
    sparkles: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    filter: '<path d="M4 5h16l-6 8v5l-4 2v-7L4 5z"/>',
    'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
};

const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${Object.entries(ICONS)
    .map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`).join('')}</svg>`;

const icon = (name, cls = '') => `<svg class="pp-icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

const fileFor = path => `${path.replace(/^\//, '')}.html`;

function head({ title, description, path, course, jsonLdBlocks }) {
    const url = `${SITE}${path}`;
    return `<!DOCTYPE html>
<html lang="en-IN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(url)}">
  <meta name="robots" content="index, follow">
  <meta name="theme-color" content="${esc(course.accent)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="My Student Club">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${SITE}/assets/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${SITE}/assets/og-image.png">
  <link rel="icon" href="/favicon.png" sizes="192x192" type="image/png">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/assets/icon-70x70.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://auth.mystudentclub.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&amp;display=swap">
  <link rel="stylesheet" href="/scripts/pro-portal/portal.css?v=${ASSET_VERSION}">
  ${jsonLdBlocks.map(jsonLd).join('\n  ')}
</head>`;
}

function header(course, activeLane) {
    const otherCourses = [
        { href: '/', label: 'CA jobs' },
        ...Object.values(COURSES).filter(c => c.key !== course.key).map(c => ({ href: c.hubPath, label: `${c.name} jobs` }))
    ];
    return `<a class="pp-skip" href="#ppMain">Skip to main content</a>
${sprite}
<header class="pp-header">
  <div class="pp-wrap pp-header-row">
    <a class="pp-logo" href="/"><img src="/assets/logo.png" alt="My Student Club" width="152" height="30"></a>
    <nav class="pp-nav" aria-label="Primary">
      <a href="${course.hubPath}"${activeLane === null ? ' aria-current="page"' : ' aria-current="true"'}>${esc(course.name)} jobs</a>
      <a href="/history.html">Applications</a>
      <a href="/cv-reviewer/">CV Reviewer</a>
      <a href="/blog/">Career guides</a>
      <a href="/contact.html">Contact</a>
    </nav>
    <div class="pp-header-actions">
      <div id="ppAuth"><a class="pp-btn pp-btn-ghost" href="/login.html">Log in</a></div>
      <button type="button" id="ppMenuToggle" class="pp-icon-btn pp-show-sm" aria-expanded="false" aria-controls="ppMenu" aria-label="Open menu">${icon('menu')}</button>
    </div>
  </div>
  <div id="ppMenu" class="pp-menu" hidden>
    <nav class="pp-wrap pp-menu-inner" aria-label="Menu">
      <p class="pp-menu-label">${esc(course.name)} sections</p>
      <a href="${course.hubPath}">All ${esc(course.name)} openings</a>
      ${course.lanes.map(lane => `<a href="${lane.path}"${activeLane && activeLane.key === lane.key ? ' aria-current="page"' : ''}>${esc(lane.tab)}</a>`).join('\n      ')}
      <p class="pp-menu-label">Other courses</p>
      ${otherCourses.map(c => `<a href="${c.href}">${esc(c.label)}</a>`).join('\n      ')}
      <p class="pp-menu-label">My account</p>
      <a href="/history.html">Applications &amp; saved</a>
      <a href="/profile.html">Profile &amp; CV</a>
      <p class="pp-menu-label">Resources</p>
      <a href="/cv-reviewer/">CV Reviewer</a>
      <a href="/blog/">Career guides</a>
      <a href="/sessions/">Events &amp; live sessions</a>
      <a href="/contact.html">Contact us</a>
    </nav>
  </div>
</header>`;
}

function courseBar(course, lane) {
    const crumbs = [
        { href: '/', label: 'Home' },
        { href: course.hubPath, label: `${course.name} jobs` },
        ...(lane ? [{ href: lane.path, label: lane.tab }] : [])
    ];
    return `<div class="pp-coursebar">
  <div class="pp-wrap">
    <nav class="pp-course-switch" aria-label="Choose your course">
      <a href="/">CA</a>
      ${Object.values(COURSES).map(c => `<a href="${c.hubPath}"${c.key === course.key ? ' aria-current="true"' : ''}>${esc(c.name)}</a>`).join('\n      ')}
    </nav>
    <nav class="pp-breadcrumb" aria-label="Breadcrumb">
      <ol>${crumbs.map((crumb, i) => `<li>${i === crumbs.length - 1 ? `<span aria-current="page">${esc(crumb.label)}</span>` : `<a href="${crumb.href}">${esc(crumb.label)}</a>`}</li>`).join('')}</ol>
    </nav>
  </div>
</div>`;
}

function laneTabs(course, activeLane) {
    return `<nav class="pp-lanes pp-wrap" aria-label="${esc(course.name)} sections">
    ${course.lanes.map(lane => `<a href="${lane.path}"${activeLane && activeLane.key === lane.key ? ' aria-current="page"' : ''}><span>${esc(lane.tab)}</span><span class="pp-count" data-lane-count="${lane.key}" hidden></span></a>`).join('\n    ')}
  </nav>`;
}

function callout(lane) {
    if (!lane.callout) return '';
    const { tone, title, summary, body, source } = lane.callout;
    // A <details> keeps phones focused on listings; portal.js opens it on wide screens.
    return `<div class="pp-wrap">
    <details class="pp-callout pp-callout-${tone}" data-callout>
      <summary>${icon(tone === 'warn' ? 'alert' : 'info')}<span><strong>${esc(title)}:</strong> ${esc(summary)}</span></summary>
      <p>${esc(body)}</p>
      ${source ? `<a href="${esc(source)}" target="_blank" rel="noopener">Read the rule</a>` : ''}
    </details>
  </div>`;
}

function footer(course) {
    return `<footer class="pp-footer">
  <div class="pp-wrap">
    <nav class="pp-footer-links" aria-label="Footer">
      <a href="/">CA jobs</a>
      ${Object.values(COURSES).map(c => `<a href="${c.hubPath}">${esc(c.name)} jobs</a>`).join('\n      ')}
      <a href="/post-a-job.html">Hiring ${esc(course.name)} talent? Post a job</a>
      <a href="/contact.html">Contact</a>
      <a href="/privacy-policy.html">Privacy policy</a>
    </nav>
    <p>Listings are collected from public posts and recruiters. Always check eligibility and never pay to apply. © My Student Club</p>
  </div>
</footer>
<div id="ppToast" class="pp-toast" role="status" aria-live="polite"></div>`;
}

function scripts() {
    return `<script defer src="/scripts/supabase.js"></script>
<script defer src="/scripts/supabase-init.js"></script>
<script defer src="/scripts/profile-state.js"></script>
<script type="module" src="/scripts/pro-portal/portal.js?v=${ASSET_VERSION}"></script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-1450NCVE65"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', 'G-1450NCVE65');
</script>`;
}

function bodyOpen(course, laneKey) {
    return `<body class="pp" data-course="${course.key}"${laneKey ? ` data-lane="${laneKey}"` : ''} style="--pp-course: ${course.accent}; --pp-course-soft: ${course.accentSoft};">`;
}

function breadcrumbLd(course, lane) {
    const items = [
        { name: 'Home', url: `${SITE}/` },
        { name: `${course.name} jobs`, url: `${SITE}${course.hubPath}` },
        ...(lane ? [{ name: lane.tab, url: `${SITE}${lane.path}` }] : [])
    ];
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: item.url }))
    };
}

function rulesBlock(course, content) {
    return `<div class="pp-prose">
        <h2>${esc(content.rulesTitle)}</h2>
        <ul>${content.rules.map(rule => `<li>${esc(rule)}</li>`).join('')}</ul>
        <p class="pp-source">Summary as of ${esc(AS_OF)}. Source: <a href="${esc(content.rulesSource.url)}" target="_blank" rel="noopener">${esc(content.rulesSource.label)}</a>. Rules change, so confirm on the <a href="${esc(course.instituteUrl)}" target="_blank" rel="noopener">${esc(course.institute)} website</a>.</p>
      </div>`;
}

function lanePage(course, lane) {
    const content = CONTENT[course.key];
    const isTraining = lane.key.endsWith('training');
    const placeholder = course.key === 'cs' ? 'Company, city or skill (e.g. SEBI)' : 'Company, city or skill (e.g. costing)';
    const sideBlock = isTraining
        ? rulesBlock(course, content)
        : `<div class="pp-prose">
        <h2>${esc(lane.tipsTitle)}</h2>
        <ul>${lane.tips.map(tip => `<li>${esc(tip)}</li>`).join('')}</ul>
        <p class="pp-source">Questions about ${esc(course.institute)} rules? Read the <a href="${course.hubPath}#faq">${esc(course.name)} FAQ</a>.</p>
      </div>`;
    return `${head({ title: lane.title, description: lane.description, path: lane.path, course, jsonLdBlocks: [breadcrumbLd(course, lane)] })}
${bodyOpen(course, lane.key)}
${header(course, lane)}
${courseBar(course, lane)}
<main id="ppMain">
  <section class="pp-hero pp-wrap">
    <p class="pp-eyebrow">${icon(lane.icon)}${esc(course.institute)} · ${esc(lane.stage)}</p>
    <h1>${esc(lane.h1)}</h1>
    <p class="pp-lede">${esc(lane.lede)}</p>
    <form id="ppSearchForm" class="pp-search" role="search" action="${lane.path}" method="get">
      <div class="pp-search-field">
        ${icon('search')}
        <label class="pp-sr" for="ppSearch">Search ${esc(lane.noun)}</label>
        <input id="ppSearch" name="q" type="search" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="search" maxlength="120">
      </div>
      <button class="pp-btn pp-btn-primary" type="submit">Search</button>
    </form>
  </section>
  ${laneTabs(course, lane)}
  ${callout(lane)}
  <div class="pp-layout pp-wrap">
    <div id="ppDrawer" class="pp-drawer">
      <div class="pp-drawer-panel">
        <div class="pp-drawer-head">
          <h2>Filters</h2>
          <button type="button" class="pp-icon-btn" data-close-drawer aria-label="Close filters">${icon('x')}</button>
        </div>
        <form id="ppFilters" aria-label="Filter listings"></form>
        <div class="pp-drawer-foot"><button type="button" class="pp-btn pp-btn-primary pp-btn-block" data-close-drawer>Show results</button></div>
      </div>
    </div>
    <section class="pp-results" aria-labelledby="ppResultsTitle">
      <div class="pp-toolbar">
        <h2 id="ppResultsTitle" class="pp-sr">${esc(lane.h1)}: listings</h2>
        <p id="ppSummary" class="pp-summary"></p>
        <div class="pp-toolbar-actions">
          <button type="button" id="ppOpenFilters" class="pp-btn pp-btn-ghost pp-filters-btn" aria-expanded="false" aria-controls="ppDrawer">${icon('filter')}Filters <span id="ppFilterBadge" class="pp-badge" hidden></span></button>
          <label class="pp-sort"><span class="pp-sr">Sort listings</span>
            <select id="ppSort">
              <option value="newest">Newest first</option>
              <option value="pay">Highest ${lane.pay === 'stipend' ? 'stipend' : 'salary'}</option>
            </select>
          </label>
        </div>
      </div>
      <div id="ppChips" class="pp-chips" hidden></div>
      <div id="ppList" class="pp-list" aria-busy="true">
        <noscript><div class="pp-empty"><h3>Turn on JavaScript to see live listings</h3><p>Listings load from our database when the page opens.</p></div></noscript>
      </div>
      <div id="ppSentinel" aria-hidden="true"></div>
      <button type="button" id="ppMore" class="pp-btn pp-btn-ghost pp-more" hidden>Show more listings</button>
      <p id="ppLive" class="pp-sr" aria-live="polite"></p>
    </section>
    <aside id="ppDetail" class="pp-detail" aria-label="Listing details" tabindex="-1"></aside>
  </div>
  <section class="pp-seo pp-wrap" aria-labelledby="ppAboutTitle">
    <div class="pp-seo-grid">
      <div class="pp-prose">
        <h2 id="ppAboutTitle">About this section</h2>
        <p>${esc(lane.lede)}</p>
        <h3>Who it is for</h3>
        <p>${esc(lane.stage)}.</p>
        <h3>How we pick these listings</h3>
        <p>${esc(content.howWeList)}</p>
      </div>
      ${sideBlock}
    </div>
  </section>
</main>
${footer(course)}
${scripts()}
</body>
</html>
`;
}

function hubPage(course) {
    const content = CONTENT[course.key];
    const faqLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: content.faq.map(item => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } }))
    };
    return `${head({ title: course.hub.title, description: course.hub.description, path: course.hubPath, course, jsonLdBlocks: [breadcrumbLd(course, null), faqLd] })}
${bodyOpen(course, null)}
${header(course, null)}
${courseBar(course, null)}
<main id="ppMain">
  <section class="pp-hero pp-wrap">
    <p class="pp-eyebrow">${esc(course.hub.eyebrow)}</p>
    <h1>${esc(course.hub.h1)}</h1>
    <p class="pp-lede">${esc(course.hub.lede)}</p>
  </section>
  <section class="pp-section pp-wrap" aria-labelledby="ppStagesTitle">
    <h2 id="ppStagesTitle">${esc(course.hub.stageTitle)}</h2>
    <p>Pick the section that matches your stage. Numbers show openings from the last 30 days.</p>
    <div class="pp-hub-lanes">
      ${course.lanes.map(lane => `<a class="pp-hub-lane" href="${lane.path}">
        <span class="pp-hub-lane-icon">${icon(lane.icon)}</span>
        <h3>${esc(lane.tab)}${lane.aka ? `<span class="pp-aka">${esc(lane.aka)}</span>` : ''}</h3>
        <p>${esc(lane.stage)}</p>
        <span class="pp-count" data-lane-count="${lane.key}" hidden></span>
      </a>`).join('\n      ')}
    </div>
  </section>
  <section class="pp-section pp-wrap" aria-labelledby="ppLatestTitle">
    <h2 id="ppLatestTitle">Latest ${esc(course.name)} openings</h2>
    <p>New in the last 15 days, across every section.</p>
    <div id="ppHubLatest" class="pp-list">
      <noscript><div class="pp-empty"><h3>Turn on JavaScript to see live listings</h3></div></noscript>
    </div>
  </section>
  <section class="pp-seo pp-wrap">
    <div class="pp-seo-grid">
      <div>
        ${rulesBlock(course, content)}
        <div class="pp-prose pp-gap">
          <h2>How we pick listings</h2>
          <p>${esc(content.howWeList)}</p>
        </div>
      </div>
      <div class="pp-prose pp-faq" id="faq">
        <h2>Frequently asked questions</h2>
        ${content.faq.map(item => `<details>
          <summary>${esc(item.q)}</summary>
          <p>${esc(item.a)} <a href="${esc(item.source)}" target="_blank" rel="noopener">Source</a></p>
        </details>`).join('\n        ')}
      </div>
    </div>
  </section>
</main>
${footer(course)}
${scripts()}
</body>
</html>
`;
}

const JOB_TABLES = ['Industrial Training Job Portal', 'Articleship Jobs', 'Semi Qualified Jobs', 'Fresher Jobs'];

// The migration carries the same patterns as config.js, so the database tags
// and the browser's fallback filter can never drift apart.
function migrationSql() {
    const { cs, cma } = COURSES;
    const q = pattern => `$re$${pattern}$re$`;
    const perTable = fn => JOB_TABLES.map(fn).join('\n');
    return `-- ==============================================================================
-- My Student Club - CS / CMA portal: course eligibility tags on job tables
-- ==============================================================================
-- GENERATED by scripts/pro-portal/build-pages.js from scripts/pro-portal/config.js.
-- Do not edit by hand; change config.js and run: npm run build:pro-portal
--
-- What it does (safe to re-run):
--   1. Adds eligible_courses text[] (default {CA}) and eligible_courses_manual
--      boolean to the four job tables.
--   2. Creates msc_detect_courses(description), which tags CS / CMA using the
--      same patterns the portal uses today.
--   3. Adds a trigger that tags new and edited vacancies automatically, unless
--      an admin has set eligible_courses by hand (eligible_courses_manual = true).
--   4. Backfills the last 90 days, adds GIN indexes and lets the website read
--      the new column.
--
-- Until this runs, /cs-* and /cma-* pages still work: they match the same
-- patterns against Description on the fly. Afterwards they switch to the
-- indexed column automatically (faster, and admins can correct tags).
--
-- Before running: step 4 UPDATEs recent rows. If these tables have UPDATE
-- triggers or webhooks (for example push notifications), check they ignore
-- changes to eligible_courses.
--
-- Posting a CS- or CMA-only vacancy later: insert it with
--   eligible_courses = '{CS}' (or '{CMA}') and eligible_courses_manual = true.
-- The CA portal (scripts/portal3.js) does not filter on this column yet, so
-- add .contains('eligible_courses', ['CA']) to its queries before doing that.
-- ==============================================================================

BEGIN;

-- 1. Columns ---------------------------------------------------------------------
${perTable(t => `ALTER TABLE IF EXISTS public."${t}"
    ADD COLUMN IF NOT EXISTS eligible_courses text[] NOT NULL DEFAULT '{CA}',
    ADD COLUMN IF NOT EXISTS eligible_courses_manual boolean NOT NULL DEFAULT false;`)}

-- 2. Classifier --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.msc_detect_courses(description text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT array_remove(ARRAY[
        'CA',
        CASE WHEN coalesce(description, '') ~* ${q(cs.pattern)}
              AND coalesce(description, '') !~* ${q(cs.excludePattern)}
             THEN 'CS' END,
        CASE WHEN coalesce(description, '') ~* ${q(cma.pattern)}
              AND coalesce(description, '') !~* ${q(cma.excludePattern)}
             THEN 'CMA' END
    ], NULL);
$fn$;

-- 3. Auto-tag trigger ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.msc_tag_eligible_courses()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    IF NOT coalesce(NEW.eligible_courses_manual, false) THEN
        NEW.eligible_courses := public.msc_detect_courses(NEW."Description");
    END IF;
    RETURN NEW;
END;
$fn$;

${perTable(t => `DROP TRIGGER IF EXISTS msc_tag_eligible_courses ON public."${t}";
CREATE TRIGGER msc_tag_eligible_courses
    BEFORE INSERT OR UPDATE OF "Description", eligible_courses_manual ON public."${t}"
    FOR EACH ROW EXECUTE FUNCTION public.msc_tag_eligible_courses();`)}

-- 4. Backfill recent rows, index, and allow the website to read the column ---------
${perTable(t => `UPDATE public."${t}"
    SET eligible_courses = public.msc_detect_courses("Description")
    WHERE NOT eligible_courses_manual
      AND "Created_At" >= now() - interval '90 days'
      AND eligible_courses IS DISTINCT FROM public.msc_detect_courses("Description");
CREATE INDEX IF NOT EXISTS "${t.toLowerCase().replace(/[^a-z]+/g, '_')}_eligible_courses_idx"
    ON public."${t}" USING gin (eligible_courses);
GRANT SELECT (eligible_courses) ON public."${t}" TO anon, authenticated;`)}

-- 5. Check the result before committing ----------------------------------------------
${JOB_TABLES.map(t => `SELECT '${t}' AS job_table,
       count(*) FILTER (WHERE 'CS' = ANY (eligible_courses)) AS cs_listings,
       count(*) FILTER (WHERE 'CMA' = ANY (eligible_courses)) AS cma_listings
FROM public."${t}"
WHERE "Created_At" >= now() - interval '30 days'`).join('\nUNION ALL\n')};

COMMIT;
`;
}

export function buildAll() {
    const pages = [];
    for (const course of Object.values(COURSES)) {
        pages.push({ file: fileFor(course.hubPath), html: hubPage(course), path: course.hubPath });
        for (const lane of course.lanes) pages.push({ file: fileFor(lane.path), html: lanePage(course, lane), path: lane.path });
    }
    pages.push({ file: 'cs-cma-portal.sql', html: migrationSql(), path: null });
    return pages;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const check = process.argv.includes('--check');
    let stale = 0;
    for (const page of buildAll()) {
        const target = join(root, page.file);
        if (check) {
            let current = '';
            try { current = readFileSync(target, 'utf8'); } catch (_) { /* missing */ }
            if (current !== page.html) {
                stale += 1;
                console.error(`stale: ${page.file}`);
            }
        } else {
            writeFileSync(target, page.html);
            console.log(`wrote ${page.file}`);
        }
    }
    if (stale) {
        console.error(`${stale} page(s) out of date. Run: npm run build:pro-portal`);
        process.exit(1);
    }
}
