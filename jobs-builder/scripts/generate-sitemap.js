// generate-sitemap.js
// Writes jobs-sitemap.xml: every live job page (one per job posted in the last 15 days),
// at its canonical extensionless URL, with lastmod = the date the job was posted.
// Redirect pages (old URLs) are left out. Run after: sync-job-pages.js

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const jobSeo = createRequire(import.meta.url)('../../scripts/job-seo.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOMAIN = jobSeo.DOMAIN;
const LIVE_JOBS_DIR = path.join(__dirname, '..', '..', 'jobs');
const SITEMAP_PATH = path.join(__dirname, '..', '..', 'jobs-sitemap.xml');
const CATEGORIES = Object.values(jobSeo.TABLE_TO_CATEGORY);
const V2_MARKER = '<meta name="msc-page" content="job-v2">';

export function buildJobsSitemap(liveDir, now = new Date()) {
    const entries = [];
    for (const category of CATEGORIES) {
        const folderPath = path.join(liveDir, category);
        if (!fs.existsSync(folderPath)) continue;
        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith('.html'))) {
            const content = fs.readFileSync(path.join(folderPath, file), 'utf8');
            if (!content.includes(V2_MARKER)) continue;
            const posted = /"datePosted":\s*"([^"]+)"/.exec(content);
            const validThrough = /"validThrough":\s*"([^"]+)"/.exec(content);
            if (validThrough && new Date(validThrough[1]) < now) continue;
            entries.push({
                loc: `${DOMAIN}/jobs/${category}/${file.replace(/\.html$/, '')}`,
                lastmod: posted ? posted[1].slice(0, 10) : now.toISOString().slice(0, 10)
            });
        }
    }
    entries.sort((a, b) => b.lastmod.localeCompare(a.lastmod) || a.loc.localeCompare(b.loc));
    const body = entries.map(entry => `   <url>
      <loc>${entry.loc.replace(/&/g, '&amp;')}</loc>
      <lastmod>${entry.lastmod}</lastmod>
   </url>
`).join('');
    return {
        xml: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}</urlset>
`,
        count: entries.length
    };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
    const { xml, count } = buildJobsSitemap(LIVE_JOBS_DIR);
    fs.writeFileSync(SITEMAP_PATH, xml);
    console.log(`✅ jobs-sitemap.xml written: ${count} live job URLs`);
}
