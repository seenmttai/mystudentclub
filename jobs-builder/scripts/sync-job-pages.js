// sync-job-pages.js
// Runs after `astro build`. Makes /jobs match the jobs that are live right now:
//   - copies every freshly built page (one per job posted in the last 15 days) into /jobs
//   - turns an old URL of a still-live job (numeric "7524.html", the old
//     "company-category-city-id.html" format, or a slug that changed because the job was
//     edited) into a tiny redirect page pointing at the job's current URL
//   - deletes pages and redirects of jobs that expired or were removed
//   - writes dist/new-job-urls.json (newest first) and dist/removed-job-urls.json (jobs removed
//     before their 15 days were up) for the Google Indexing API step; pages without JobPosting
//     markup (exclusive vacancies) are never sent to Google
// A category whose Supabase fetch failed (see dist/jobs-manifest.json) is left untouched.
// Replaces update-sync-state.js, the copy step, cleanup-folders.js and expire-old-jobs.js.

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const jobSeo = require('../../scripts/job-seo.js');

export const CATEGORIES = Object.values(jobSeo.TABLE_TO_CATEGORY);
const EXPIRY_MS = jobSeo.JOB_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;
const V2_MARKER = '<meta name="msc-page" content="job-v2">';
const REDIRECT_MARKER = 'name="msc-page" content="job-redirect"';

function escapeAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function readJobId(content, fileName, category) {
    const stub = /data-job-id="([^"]+)"/.exec(content);
    if (stub) return stub[1];
    const blocks = content.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
    for (const block of blocks) {
        try {
            const data = JSON.parse(block.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
            if (data && data['@type'] === 'JobPosting' && data.identifier && data.identifier.value) {
                return String(data.identifier.value);
            }
        } catch (_) { /* not JSON; fall back to the file name */ }
    }
    const parsed = jobSeo.parseJobPath(`/jobs/${category}/${fileName}`);
    return parsed ? parsed.id : null;
}

export function readDatePosted(content) {
    // Pages without JobPosting markup (exclusive vacancies) carry the date in <meta name="msc-job-posted">.
    const match = /"datePosted":\s*"([^"]+)"/.exec(content) || /<meta name="msc-job-posted" content="([^"]+)"/.exec(content);
    return match ? match[1] : null;
}

// Pages Google may list in its job search: they carry JobPosting markup.
export function hasJobPosting(content) {
    return /"@type":\s*"JobPosting"/.test(content);
}

// Google may still list the job as open until validThrough (or 15 days after posting on pages without it).
function listedAsOpen(content, now) {
    const validThrough = /"validThrough":\s*"([^"]+)"/.exec(content);
    const posted = readDatePosted(content);
    const until = validThrough ? new Date(validThrough[1]).getTime()
        : posted ? new Date(posted).getTime() + EXPIRY_MS : NaN;
    return Number.isFinite(until) && until > now.getTime();
}

export function redirectPage(jobId, targetPath) {
    const url = `${jobSeo.DOMAIN}${targetPath}`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>This job has moved | My Student Club</title>
<meta name="msc-page" content="job-redirect" data-job-id="${escapeAttr(jobId)}">
<link rel="canonical" href="${escapeAttr(url)}">
<meta http-equiv="refresh" content="0; url=${escapeAttr(targetPath)}">
<script>location.replace(${JSON.stringify(targetPath)} + location.search + location.hash);</script>
</head>
<body><p><a href="${escapeAttr(targetPath)}">This job has moved. Open it here.</a></p></body>
</html>
`;
}

export function syncJobPages({ distDir, liveDir, log = console.log, now = new Date() }) {
    const manifestPath = path.join(distDir, 'jobs-manifest.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`No ${manifestPath}: run astro build first.`);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const newUrls = [];
    const removedUrls = [];
    const summary = {};

    for (const category of CATEGORIES) {
        const status = manifest[category];
        if (!status || !status.ok) {
            log(`⚠️  ${category}: fetch failed; leaving /jobs/${category} as it is.`);
            continue;
        }
        // An empty answer could be a real quiet fortnight or a broken query: then only
        // pages whose 15 days are over are deleted, never pages of jobs that may be live.
        const emptyFetch = !status.count;
        if (emptyFetch) log(`⚠️  ${category}: no jobs in the last ${jobSeo.JOB_EXPIRATION_DAYS} days; deleting only pages past their expiry.`);

        const builtDir = path.join(distDir, 'jobs', category);
        fs.mkdirSync(builtDir, { recursive: true });
        const liveCategoryDir = path.join(liveDir, category);
        fs.mkdirSync(liveCategoryDir, { recursive: true });

        // Freshly built pages, by job id.
        const built = new Map(); // id -> { file, content, datePosted }
        for (const file of fs.readdirSync(builtDir).filter(f => f.endsWith('.html'))) {
            const content = fs.readFileSync(path.join(builtDir, file), 'utf8');
            const id = readJobId(content, file, category);
            if (id) built.set(String(id), { file, content, datePosted: readDatePosted(content) });
        }
        const builtFiles = new Set([...built.values()].map(page => page.file));

        let redirected = 0;
        let deleted = 0;
        const liveFilesBefore = new Set();

        for (const file of fs.readdirSync(liveCategoryDir).filter(f => f.endsWith('.html'))) {
            const filePath = path.join(liveCategoryDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const id = readJobId(content, file, category);
            if (content.includes(V2_MARKER)) liveFilesBefore.add(file);
            if (builtFiles.has(file)) continue; // overwritten below

            const current = id ? built.get(String(id)) : null;
            if (emptyFetch) {
                const posted = new Date(readDatePosted(content) || 0);
                if (Number.isFinite(posted.getTime()) && now.getTime() - posted.getTime() <= EXPIRY_MS) continue;
                fs.unlinkSync(filePath);
                deleted++;
            } else if (current) {
                const target = `/jobs/${category}/${current.file.replace(/\.html$/, '')}`;
                const stub = redirectPage(id, target);
                if (content !== stub) fs.writeFileSync(filePath, stub);
                redirected++;
            } else {
                // Filled, hidden or deleted before its 15 days were up: Google may still list it as
                // open, so the Indexing API step tells Google it is gone. Expired pages need no notice
                // (validThrough is already past and the page now returns 404).
                if (hasJobPosting(content) && listedAsOpen(content, now)) {
                    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(content);
                    removedUrls.push(canonical ? canonical[1] : `${jobSeo.DOMAIN}/jobs/${category}/${file.replace(/\.html$/, '')}`);
                }
                fs.unlinkSync(filePath);
                deleted++;
            }
        }

        let written = 0;
        for (const [id, page] of built) {
            const filePath = path.join(liveCategoryDir, page.file);
            const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
            if (existing !== page.content) {
                fs.writeFileSync(filePath, page.content);
                written++;
            }
            // New job, or a job whose URL changed because it was edited. Exclusive vacancies (no
            // JobPosting markup) are not sent to Google.
            if (!liveFilesBefore.has(page.file) && hasJobPosting(page.content)) {
                newUrls.push({
                    url: `${jobSeo.DOMAIN}/jobs/${category}/${page.file.replace(/\.html$/, '')}`,
                    datePosted: page.datePosted || ''
                });
            }
        }

        summary[category] = { live: built.size, written, redirected, deleted };
        log(`✅ ${category}: ${built.size} live jobs, ${written} pages written, ${redirected} old URLs redirected, ${deleted} pages deleted`);
    }

    newUrls.sort((a, b) => String(b.datePosted).localeCompare(String(a.datePosted)));
    fs.writeFileSync(path.join(distDir, 'new-job-urls.json'), JSON.stringify(newUrls.map(item => item.url), null, 2));
    fs.writeFileSync(path.join(distDir, 'removed-job-urls.json'), JSON.stringify(removedUrls, null, 2));
    log(`🆕 ${newUrls.length} new job URLs and 🗑️  ${removedUrls.length} removed before expiry, for the Indexing API`);
    return { summary, newUrls: newUrls.map(item => item.url), removedUrls };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    syncJobPages({
        distDir: path.join(__dirname, '..', 'dist'),
        liveDir: path.join(__dirname, '..', '..', 'jobs')
    });
}
