// Keeps the job-portal lane pages in step with scripts/courses/courses.js.
//
// The five CA lane pages (index.html, ca-*.html, semi-qualified-ca-jobs.html,
// experienced-ca-jobs.html) are hand-written. This script owns only marked
// regions inside them:
//   <!-- msc:importmap -->       versions every module the page imports
//   <!-- msc:lanes -->           the CA | CS | CMA switcher and the lane tabs
//   <!-- msc:lane-note -->       a rule note on CS/CMA training lanes
//   <!-- msc:rail-programs -->   right-rail card (CA programmes on CA pages)
//   <!-- msc:rail-resources -->  right-rail card (CA resources on CA pages)
// plus the <body data-*> attributes and ?v= content hashes on local assets.
// Content inside the two rail regions of CA pages is left as written.
//
// Each CS / CMA lane page is a copy of the CA page that reads the same table,
// with its own title and meta tags and its own regions, so it looks and
// behaves exactly like the CA page. The SQL migration (cs-cma-portal.sql) is
// generated from the same patterns, and the other pages that load the course
// modules (MODULE_PAGES) get the same import map and asset hashes.
//
//   node scripts/courses/build-pages.js          write everything
//   node scripts/courses/build-pages.js --check  exit 1 if anything is stale

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANES, QUALIFICATIONS, QUALIFICATION_ORDER, SITE, lanesFor, equivalentLane } from './courses.js';
import { CONTENT, AS_OF } from './content.js';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');

const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const hashOf = text => createHash('sha1').update(text).digest('hex').slice(0, 10);
const read = file => readFileSync(join(ROOT, file), 'utf8');

export const REGIONS = ['importmap', 'lanes', 'lane-note', 'rail-programs', 'rail-resources'];

// ------------------------------------------------------------------ assets

// Import specifiers in a module or inline script: static imports, re-exports
// and dynamic import('...'), relative or site-absolute, without any ?query.
const SPECIFIER_PATTERNS = [
    /^\s*import\s[^'"]*?from\s*['"]([^'"]+)['"]/gm,
    /^\s*import\s*['"]([^'"]+)['"]/gm,
    /^\s*export\s[^'"]*?from\s*['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g
];

function specifiersIn(source) {
    return SPECIFIER_PATTERNS.flatMap(pattern => [...source.matchAll(pattern)].map(match => match[1].split('?')[0]))
        .filter(spec => spec.startsWith('/') || spec.startsWith('./') || spec.startsWith('../'));
}

const fileFor = (spec, fromFile) => (spec.startsWith('/') ? join(ROOT, spec) : resolve(dirname(fromFile), spec));

// Every local module reachable from the entry files.
function moduleGraph(entries) {
    const seen = new Map();
    const visit = file => {
        if (seen.has(file) || !existsSync(file)) return;
        const source = readFileSync(file, 'utf8');
        seen.set(file, source);
        for (const spec of specifiersIn(source)) visit(fileFor(spec, file));
    };
    entries.forEach(visit);
    return seen;
}

const siteUrl = file => `/${relative(ROOT, file).split(sep).join('/')}`;

// Module entry points of a page: module <script src> tags and the specifiers
// its inline scripts import.
function pageModuleEntries(html, pageFile) {
    const entries = [...html.matchAll(/<script\b[^>]*type="module"[^>]*src="([^"?#]+)[^"]*"/g)].map(match => match[1]);
    for (const [, body] of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) entries.push(...specifiersIn(body));
    return entries
        .filter(spec => !/^https?:/.test(spec) && spec.endsWith('.js'))
        .map(spec => fileFor(spec.startsWith('/') || spec.startsWith('.') ? spec : `/${spec}`, join(ROOT, pageFile)));
}

function assetVersions(html, pageFile) {
    const imports = {};
    for (const [file, source] of moduleGraph(pageModuleEntries(html, pageFile))) {
        const url = siteUrl(file);
        imports[url] = `${url}?v=${hashOf(source)}`;
    }
    return { importMap: JSON.stringify({ imports: Object.fromEntries(Object.entries(imports).sort()) }), imports };
}

// Local /scripts/ assets get ?v=<content hash>, so a release can never mix a
// new page with files cached from the last one. Modules in the import map use
// the same URL as the map, so a module is never loaded twice.
function versionAssets(html, imports) {
    return html.replace(/((?:src|href)=")(\/?scripts\/[^"?#]+\.(?:js|css))(?:\?v=[^"]*)?"/g, (whole, attr, rawUrl) => {
        const url = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
        if (imports[url]) return `${attr}${imports[url]}"`;
        const file = join(ROOT, url);
        return existsSync(file) ? `${attr}${url}?v=${hashOf(readFileSync(file, 'utf8'))}"` : whole;
    });
}

// ------------------------------------------------------------------ regions

const TAB_ICONS = {
    industrial: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>',
    articleship: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>',
    semi: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 14l9-5-9-5-9 5 9 5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>',
    fresher: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>',
    experienced: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>'
};

const indentLines = (lines, indent) => lines.map(line => (line ? indent + line : line)).join('\n');

function lanesRegion(lane, indent) {
    const chips = QUALIFICATION_ORDER.map(key => {
        const target = equivalentLane(lane, key);
        const current = key === lane.qualification ? ' aria-current="true"' : '';
        return `    <a href="${target.path}" class="course-chip" data-qualification="${key}" title="${esc(QUALIFICATIONS[key].name)} jobs"${current}>${QUALIFICATIONS[key].label}</a>`;
    });
    const tabs = lanesFor(lane.qualification).map(tab => [
        `    <a href="${tab.path}" class="footer-tab${tab.id === lane.id ? ' active' : ''}"${tab.id === lane.id ? ' aria-current="page"' : ''}>`,
        `        <svg class="tab-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">${TAB_ICONS[tab.slot]}</svg>`,
        `        <span>${esc(tab.navLabel)}</span>`,
        '    </a>'
    ]).flat();
    return indentLines([
        '<nav class="portal-course-switch" aria-label="Choose your course">',
        '    <span class="portal-course-switch-label">Jobs for</span>',
        ...chips,
        '</nav>',
        `<nav class="portal-nav-bar" aria-label="${esc(QUALIFICATIONS[lane.qualification].label)} job sections">`,
        ...tabs,
        '</nav>'
    ], indent);
}

function laneNoteRegion(lane, indent) {
    if (!lane.note) return '';
    const also = (lane.note.links || []).map(link => `<a href="${esc(link.href)}">${esc(link.label)}</a>`);
    const alsoText = also.length ? ` See ${also.join(' and ')} instead.` : '';
    return indentLines([
        '<aside class="lane-note" role="note">',
        '    <i class="fas fa-circle-info lane-note-icon" aria-hidden="true"></i>',
        `    <p><strong>${esc(lane.note.title)}:</strong> ${esc(lane.note.body)}${alsoText} <a class="lane-note-rule" href="${esc(lane.note.source)}" target="_blank" rel="noopener">Read the rule</a></p>`,
        '</aside>'
    ], indent);
}

function railRulesRegion(lane, indent) {
    const content = CONTENT[lane.qualification];
    const source = content.rulesSources[0];
    return indentLines([
        '<div class="dv2-rail-card dv2-rail-rules">',
        `    <h3>${esc(content.rulesTitle)}</h3>`,
        '    <ul class="dv2-rail-rules-list">',
        ...content.rules.slice(0, 4).map(rule => `        <li>${esc(rule)}</li>`),
        '    </ul>',
        `    <p class="dv2-rail-sub">Summary as of ${esc(AS_OF)}. Source: <a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label)}</a>.</p>`,
        '</div>'
    ], indent);
}

// ------------------------------------------------------------------ markers

const open = name => `<!-- msc:${name} -->`;
const close = name => `<!-- /msc:${name} -->`;

function lineIndent(html, index) {
    const start = html.lastIndexOf('\n', index) + 1;
    return html.slice(start, index).match(/^[ \t]*/)[0];
}

function wrapOnce(html, name, pattern, file) {
    if (html.includes(open(name))) return html;
    const match = html.match(pattern);
    if (!match) throw new Error(`${file}: cannot place region ${name}`);
    const indent = lineIndent(html, match.index);
    return `${html.slice(0, match.index)}${open(name)}\n${indent}${match[0]}\n${indent}${close(name)}${html.slice(match.index + match[0].length)}`;
}

// Adds the region markers to a hand-written CA page (idempotent).
export function ensureMarkers(html, file) {
    let out = html;
    if (!out.includes(open('importmap'))) {
        out = out.replace(/(\n)([ \t]*)<\/head>/, (_, nl, indent) => `${nl}${indent}${open('importmap')}\n${indent}${close('importmap')}\n${indent}</head>`);
    }
    out = wrapOnce(out, 'lanes', /<nav class="portal-nav-bar"[^>]*>[\s\S]*?<\/nav>/, file);
    if (!out.includes(open('lane-note'))) {
        const end = out.indexOf(close('lanes'));
        const indent = lineIndent(out, end);
        const at = end + close('lanes').length;
        out = `${out.slice(0, at)}\n${indent}${open('lane-note')}\n${indent}${close('lane-note')}${out.slice(at)}`;
    }
    out = wrapOnce(out, 'rail-programs', /<div class="dv2-rail-card">\s*<h3>Career Programs<\/h3>[\s\S]*?<\/div>/, file);
    out = wrapOnce(out, 'rail-resources', /<div class="dv2-rail-card">\s*<h3>Career Resources<\/h3>[\s\S]*?<\/div>/, file);
    for (const name of REGIONS) {
        if (out.split(open(name)).length !== 2 || out.split(close(name)).length !== 2) throw new Error(`${file}: region ${name} must appear once`);
    }
    return out;
}

export function regionContent(html, name) {
    const start = html.indexOf(open(name));
    const end = html.indexOf(close(name));
    if (start < 0 || end < start) return null;
    return html.slice(start + open(name).length, end);
}

function setRegion(html, name, body) {
    const start = html.indexOf(open(name));
    const end = html.indexOf(close(name));
    const indent = lineIndent(html, start);
    const inner = body ? `\n${body}\n${indent}` : `\n${indent}`;
    return `${html.slice(0, start + open(name).length)}${inner}${html.slice(end)}`;
}

function setBody(html, lane) {
    const tags = html.match(/<body\b[^>]*>/g) || [];
    if (tags.length !== 1) throw new Error(`${lane.file}: expected one <body> tag`);
    return html.replace(/<body\b[^>]*>/, `<body data-qualification="${lane.qualification}" data-lane="${lane.id}">`);
}

// Replaces one attribute value on the single tag a pattern matches.
function setTag(html, file, label, pattern, value) {
    const matches = html.match(new RegExp(pattern.source, 'g')) || [];
    if (matches.length !== 1) throw new Error(`${file}: expected one ${label}, found ${matches.length}`);
    return html.replace(pattern, (_, before, _old, after) => `${before}${esc(value)}${after}`);
}

function setHead(html, lane) {
    const url = `${SITE}${lane.path}`;
    const image = `${SITE}/assets/og-image.png`;
    let out = html;
    out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(lane.title)}</title>`);
    const meta = (attr, name) => new RegExp(`(<meta\\s+${attr}="${name.replace(/[:]/g, '\\:')}"\\s+content=")([^"]*)("\\s*\\/?>)`);
    const tags = [
        ['name', 'description', lane.description],
        ['property', 'og:url', url],
        ['property', 'og:title', lane.title],
        ['property', 'og:description', lane.description],
        ['property', 'og:image', image],
        ['property', 'og:image:secure_url', image],
        ['property', 'og:image:alt', lane.title],
        ['name', 'twitter:title', lane.title],
        ['name', 'twitter:description', lane.description],
        ['name', 'twitter:image', image],
        ['name', 'keywords', lane.keywords],
        ['name', 'robots', lane.noindex ? 'noindex, follow' : 'index, follow']
    ];
    for (const [attr, name, value] of tags) out = setTag(out, lane.file, name, meta(attr, name), value);
    out = setTag(out, lane.file, 'canonical', /(<link\s+rel="canonical"\s+href=")([^"]*)("\s*\/?>)/, url);
    return out;
}

// ------------------------------------------------------------------ pages

function setImportMap(html, assets) {
    return setRegion(html, 'importmap', `${lineIndent(html, html.indexOf(open('importmap')))}<script type="importmap">${assets.importMap}</script>`);
}

function buildLanePage(sourceHtml, lane, { keepRails }) {
    let html = sourceHtml;
    if (lane.qualification !== 'ca') html = setHead(html, lane);
    html = setBody(html, lane);
    html = setRegion(html, 'lanes', lanesRegion(lane, lineIndent(html, html.indexOf(open('lanes')))));
    html = setRegion(html, 'lane-note', laneNoteRegion(lane, lineIndent(html, html.indexOf(open('lane-note')))));
    if (!keepRails) {
        html = setRegion(html, 'rail-programs', railRulesRegion(lane, lineIndent(html, html.indexOf(open('rail-programs')))));
        html = setRegion(html, 'rail-resources', '');
    }
    const assets = assetVersions(html, lane.file);
    return versionAssets(setImportMap(html, assets), assets.imports);
}

// Other pages that load the course modules get the same treatment: one
// import map (replacing any hand-written one) and hashed local assets.
export const MODULE_PAGES = ['profile.html', 'history.html', 'post-a-job.html', 'hirer-dashboard.html', 'job.html'];

function ensureImportMapRegion(html, file) {
    if (html.includes(open('importmap'))) return html;
    let out = html.replace(/\n?[ \t]*<script type="importmap">[\s\S]*?<\/script>/g, '');
    out = out.replace(/(\n)([ \t]*)<\/head>/, (_, nl, indent) => `${nl}${indent}${open('importmap')}\n${indent}${close('importmap')}\n${indent}</head>`);
    if (!out.includes(open('importmap'))) throw new Error(`${file}: no </head> for the import map`);
    return out;
}

function buildModulePage(file) {
    const html = ensureImportMapRegion(read(file), file);
    const assets = assetVersions(html, file);
    return versionAssets(setImportMap(html, assets), assets.imports);
}

const JOB_TABLES = ['Industrial Training Job Portal', 'Articleship Jobs', 'Semi Qualified Jobs', 'Fresher Jobs'];

function migrationSql() {
    const { cs, cma } = QUALIFICATIONS;
    const q = pattern => `$re$${pattern}$re$`;
    const perTable = fn => JOB_TABLES.map(fn).join('\n');
    return `-- ==============================================================================
-- My Student Club - CA / CS / CMA: course eligibility tags on job tables
-- ==============================================================================
-- GENERATED by scripts/courses/build-pages.js from scripts/courses/courses.js.
-- Do not edit by hand; change courses.js and run: npm run build:pages
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
-- Until this runs, the CS and CMA lanes still work: they match the same
-- patterns against Description on the fly. Afterwards every lane switches to
-- the indexed column automatically (faster, and admins can correct tags);
-- CA lanes then show rows tagged CA, which every row is unless an admin
-- marks it CS- or CMA-only.
--
-- Before running: step 4 UPDATEs recent rows. If these tables have UPDATE
-- triggers or webhooks (for example push notifications), check they ignore
-- changes to eligible_courses.
--
-- Posting a CS- or CMA-only vacancy later: insert it with
--   eligible_courses = '{CS}' (or '{CMA}') and eligible_courses_manual = true.
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
SET search_path = pg_catalog, public
AS $fn$
    SELECT array_remove(ARRAY[
        'CA',
        CASE WHEN coalesce(description, '') ~* ${q(cs.match.pre)}
              AND coalesce(description, '') ~* ${q(cs.match.pos)}
              AND coalesce(description, '') !~* ${q(cs.match.neg)}
             THEN 'CS' END,
        CASE WHEN coalesce(description, '') ~* ${q(cma.match.pre)}
              AND coalesce(description, '') ~* ${q(cma.match.pos)}
              AND coalesce(description, '') !~* ${q(cma.match.neg)}
             THEN 'CMA' END
    ], NULL);
$fn$;

-- 3. Auto-tag trigger ------------------------------------------------------------------
-- SECURITY DEFINER so the trigger can call the detector even though website
-- roles may not (see the REVOKE below), whoever inserts the row.
CREATE OR REPLACE FUNCTION public.msc_tag_eligible_courses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
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

-- Keep both functions out of the public API (/rest/v1/rpc).
REVOKE EXECUTE ON FUNCTION public.msc_detect_courses(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.msc_tag_eligible_courses() FROM PUBLIC, anon, authenticated;

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

// Returns [{ file, html, lane? }] for every page this script owns.
export function buildAll() {
    const outputs = [];
    const marked = new Map();
    for (const lane of LANES.filter(l => l.qualification === 'ca')) {
        const html = ensureMarkers(read(lane.file), lane.file);
        marked.set(lane.file, html);
        outputs.push({ file: lane.file, lane, html: buildLanePage(html, lane, { keepRails: true }) });
    }
    for (const lane of LANES.filter(l => l.qualification !== 'ca')) {
        const source = marked.get(lane.source);
        if (!source) throw new Error(`${lane.id}: unknown source page ${lane.source}`);
        outputs.push({ file: lane.file, lane, html: buildLanePage(source, lane, { keepRails: false }) });
    }
    for (const file of MODULE_PAGES) outputs.push({ file, html: buildModulePage(file) });
    outputs.push({ file: 'cs-cma-portal.sql', html: migrationSql() });
    return outputs;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    const check = process.argv.includes('--check');
    let stale = 0;
    for (const page of buildAll()) {
        const target = join(ROOT, page.file);
        const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
        if (current === page.html) continue;
        if (check) {
            stale += 1;
            console.error(`stale: ${page.file}`);
        } else {
            writeFileSync(target, page.html);
            console.log(`wrote ${page.file}`);
        }
    }
    if (stale) {
        console.error(`${stale} file(s) out of date. Run: npm run build:pages`);
        process.exit(1);
    }
}
