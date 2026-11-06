// Job page SEO: readable URLs, Google for Jobs data, the page sync, the sitemap and the 404 page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const seo = require('../scripts/job-seo.js');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const industrialJob = {
    id: 10651,
    Company: 'DBS',
    Location: 'Pune',
    Salary: 40000,
    Category: 'Finance',
    Created_At: '2026-11-06T01:19:46.179+00:00',
    Description: 'Stipend 40k. Mail cv to hr@dbs.com or call 9876543210, see https://dbs.com/jobs'
};

test('job URLs read like a search: company, "hiring", role, domain, city, then the id', () => {
    assert.equal(seo.jobPath(industrialJob, 'industrial'), '/jobs/industrial/dbs-hiring-ca-industrial-trainee-finance-pune-10651');
    assert.equal(
        seo.jobPath({ id: 10652, Company: 'Mahindra & Mahindra Financial Services Limited', Location: 'Mumbai (Head Office)', Category: 'Indirect Tax (GST)' }, 'industrial'),
        '/jobs/industrial/mahindra-mahindra-financial-services-hiring-ca-industrial-trainee-indirect-tax-gst-mumbai-10652'
    );
    // "Other" is not a useful keyword; "Navi Mumbai" is not "Mumbai"; "& Co." is dropped.
    assert.equal(
        seo.jobPath({ id: 17075, Company: 'Gaurav Gada & Co.', Location: 'Navi Mumbai, Maharashtra, India', Category: 'Other' }, 'articleship'),
        '/jobs/articleship/gaurav-gada-hiring-ca-articleship-trainee-navi-mumbai-17075'
    );
    // Semi-qualified ids are UUIDs: only the first 8 characters go in the URL.
    assert.equal(
        seo.jobPath({ id: '16e90dcc-ef9b-4d01-b8fb-763f9abedb6e', Company: 'Gratitude', Location: 'Bangalore', Category: 'FP&A' }, 'semi-qualified'),
        '/jobs/semi-qualified/gratitude-hiring-semi-qualified-ca-fp-a-bengaluru-16e90dcc'
    );
    assert.doesNotMatch(seo.jobUrl(industrialJob, 'industrial'), /\.html$/);
});

test('share links: readable URL once the page is built, job.html before that', () => {
    const job = { ...industrialJob, Created_At: '2026-11-06T01:00:00Z' };
    assert.equal(seo.shareUrl(job, 'industrial', '2026-11-06T09:00:00Z'),
        'https://www.mystudentclub.com/jobs/industrial/dbs-hiring-ca-industrial-trainee-finance-pune-10651');
    assert.equal(seo.shareUrl(job, 'industrial', '2026-11-06T03:00:00Z'),
        'https://www.mystudentclub.com/job.html?id=10651&type=industrial');
});

test('contacts written with spaces, dashes or www are masked too', () => {
    const masked = seo.maskContacts('Call 98765 43210 or +91-98765-43210 or 022 2345 6789, see www.dbs.com/careers. Stipend 25,000 - 30,000, batch 2026-2027.');
    assert.doesNotMatch(masked, /98765|2345 6789|www\.dbs/);
    assert.match(masked, /25,000 - 30,000/);
    assert.match(masked, /2026-2027/);
});

test('the 404 page can read the job back out of old and new URLs', () => {
    assert.deepEqual(seo.parseJobPath('/jobs/industrial/7524.html'), { category: 'industrial', id: '7524' });
    assert.deepEqual(seo.parseJobPath('/jobs/industrial/canon-india-business-finance-gurugram-10634.html'), { category: 'industrial', id: '10634' });
    assert.deepEqual(seo.parseJobPath(seo.jobPath(industrialJob, 'industrial')), { category: 'industrial', id: '10651' });
    assert.deepEqual(seo.parseJobPath('/jobs/semi-qualified/gratitude-hiring-semi-qualified-ca-fp-a-bengaluru-16e90dcc'), { category: 'semi-qualified', id: '16e90dcc' });
    assert.deepEqual(seo.parseJobPath('/jobs/semi-qualified/38ed1412-3e22-478b-8042-d68fdcae180a.html'), { category: 'semi-qualified', id: '38ed1412-3e22-478b-8042-d68fdcae180a' });
    assert.equal(seo.parseJobPath('/about'), null);
    assert.equal(seo.parseJobPath('/jobs/industrial/'), null);
});

test('Google for Jobs data is valid and never leaks recruiter contacts', () => {
    const ld = seo.jobPostingJsonLd(industrialJob, 'industrial');
    assert.equal(ld['@type'], 'JobPosting');
    assert.equal(ld.title, 'CA Industrial Trainee - Finance');
    assert.equal(ld.employmentType, 'INTERN');
    assert.equal(ld.url, 'https://www.mystudentclub.com/jobs/industrial/dbs-hiring-ca-industrial-trainee-finance-pune-10651');
    assert.equal(ld.datePosted, '2026-11-06T01:19:46.179Z');
    assert.equal(ld.validThrough, '2026-11-21T01:19:46.179Z');
    // The employer is the company, not My Student Club.
    assert.deepEqual(ld.hiringOrganization, { '@type': 'Organization', name: 'DBS' });
    assert.deepEqual(ld.jobLocation.address, { '@type': 'PostalAddress', addressCountry: 'IN', addressLocality: 'Pune', addressRegion: 'Maharashtra' });
    assert.deepEqual(ld.baseSalary.value, { '@type': 'QuantitativeValue', unitText: 'MONTH', value: 40000 });
    const json = JSON.stringify(ld);
    assert.doesNotMatch(json, /hr@dbs\.com|9876543210|https:\/\/dbs\.com/);
    assert.match(ld.description, /\[email protected\]/);
});

test('salary is left out rather than sent as 0 or garbage', () => {
    assert.equal(seo.jobPostingJsonLd({ id: 1, Company: 'X', Location: 'Delhi', Salary: null }, 'fresher').baseSalary, undefined);
    assert.equal(seo.parseSalary({ Salary: '5' }, 'industrial'), null);
    assert.deepEqual(seo.parseSalary({ Salary: '25,000 - 30,000' }, 'industrial').value,
        { '@type': 'QuantitativeValue', unitText: 'MONTH', minValue: 25000, maxValue: 30000 });
    assert.deepEqual(seo.parseSalary({ 'CTC Range': '8-10 LPA' }, 'fresher').value,
        { '@type': 'QuantitativeValue', unitText: 'YEAR', minValue: 800000, maxValue: 1000000 });
    assert.equal(seo.parseSalary({ Salary: 1200000 }, 'semi-qualified').value.unitText, 'YEAR');
    assert.deepEqual(seo.parseSalary({ Salary: '1.5 lakh per month' }, 'fresher').value,
        { '@type': 'QuantitativeValue', unitText: 'MONTH', value: 150000 });
    assert.equal(seo.parseSalary({ Salary: 'Rs 25000 pm + 5000 incentive' }, 'industrial'), null);
});

test('locations: several cities, pan-India, remote and abroad', () => {
    const multi = seo.jobPostingJsonLd({ id: 2, Company: 'Z', Location: 'Mumbai / Pune / Bangalore' }, 'fresher');
    assert.deepEqual(multi.jobLocation.map(p => p.address.addressLocality), ['Mumbai', 'Pune', 'Bengaluru']);
    const pan = seo.jobPostingJsonLd({ id: 3, Company: 'Z', Location: 'Pan India' }, 'fresher');
    assert.deepEqual(pan.jobLocation.address, { '@type': 'PostalAddress', addressCountry: 'IN' });
    const remote = seo.jobPostingJsonLd({ id: 4, Company: 'Z', Location: 'Remote' }, 'fresher');
    assert.equal(remote.jobLocationType, 'TELECOMMUTE');
    assert.equal(seo.jobPostingJsonLd({ id: 5, Company: 'Z', Location: 'Dubai, UAE' }, 'fresher').jobLocation.address.addressCountry, 'AE');
});

function writePage(dir, file, content) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
}

function v2Page(job, category) {
    return `<!DOCTYPE html><html><head><meta name="msc-page" content="job-v2"><script type="application/ld+json">${JSON.stringify(seo.jobPostingJsonLd(job, category))}</script></head><body></body></html>`;
}

test('page sync: new pages copied, old URLs of live jobs redirect, dead pages deleted, failed fetch untouched', async () => {
    const { syncJobPages } = await import('../jobs-builder/scripts/sync-job-pages.js');
    const { buildJobsSitemap } = await import('../jobs-builder/scripts/generate-sitemap.js');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'msc-jobs-'));
    const dist = path.join(tmp, 'dist');
    const live = path.join(tmp, 'live');
    const newFile = seo.jobPath(industrialJob, 'industrial').split('/').pop() + '.html';

    writePage(path.join(dist, 'jobs', 'industrial'), newFile, v2Page(industrialJob, 'industrial'));
    fs.writeFileSync(path.join(dist, 'jobs-manifest.json'), JSON.stringify({
        industrial: { ok: true, count: 1 },
        fresher: { ok: false, count: 0 }
    }));
    // Old-format page of the same live job, a numeric noindex leftover, and a fresher page.
    writePage(path.join(live, 'industrial'), 'dbs-finance-pune-10651.html',
        `<html><script type="application/ld+json">{"@context":"https://schema.org/","@type":"JobPosting","identifier":{"@type":"PropertyValue","name":"DBS","value":"10651"},"datePosted":"2026-11-06T01:19:46.179Z"}</script></html>`);
    writePage(path.join(live, 'industrial'), '7524.html', '<meta name="robots" content="noindex">');
    writePage(path.join(live, 'fresher'), 'keep-me-1.html', 'fresher page');

    const result = syncJobPages({ distDir: dist, liveDir: live, log: () => {} });

    const industrialFiles = fs.readdirSync(path.join(live, 'industrial')).sort();
    assert.deepEqual(industrialFiles, ['dbs-finance-pune-10651.html', newFile].sort());
    const stub = fs.readFileSync(path.join(live, 'industrial', 'dbs-finance-pune-10651.html'), 'utf8');
    assert.match(stub, /rel="canonical" href="https:\/\/www\.mystudentclub\.com\/jobs\/industrial\/dbs-hiring-ca-industrial-trainee-finance-pune-10651"/);
    assert.match(stub, /http-equiv="refresh" content="0; url=\/jobs\/industrial\/dbs-hiring-ca-industrial-trainee-finance-pune-10651"/);
    assert.ok(fs.existsSync(path.join(live, 'fresher', 'keep-me-1.html')), 'a failed fetch must not delete pages');
    assert.deepEqual(result.newUrls, ['https://www.mystudentclub.com/jobs/industrial/dbs-hiring-ca-industrial-trainee-finance-pune-10651']);

    // A quiet category (fetch worked, 0 jobs) only loses pages past their 15 days.
    fs.writeFileSync(path.join(dist, 'jobs-manifest.json'), JSON.stringify({ industrial: { ok: true, count: 1 }, fresher: { ok: true, count: 0 } }));
    writePage(path.join(live, 'fresher'), 'recent-2.html', `<script type="application/ld+json">{"datePosted":"${new Date().toISOString()}"}</script>`);
    syncJobPages({ distDir: dist, liveDir: live, log: () => {} });
    assert.deepEqual(fs.readdirSync(path.join(live, 'fresher')), ['recent-2.html']);

    // Second run: nothing new, nothing rewritten.
    const again = syncJobPages({ distDir: dist, liveDir: live, log: () => {} });
    assert.deepEqual(again.newUrls, []);
    assert.equal(again.summary.industrial.written, 0);

    // Sitemap: only the real page, extensionless, dated by datePosted. No redirects, no noindex.
    const { xml, count } = buildJobsSitemap(live, new Date('2026-11-07T00:00:00Z'));
    assert.equal(count, 1);
    assert.match(xml, /<loc>https:\/\/www\.mystudentclub\.com\/jobs\/industrial\/dbs-hiring-ca-industrial-trainee-finance-pune-10651<\/loc>\s*<lastmod>2026-11-06<\/lastmod>/);
    assert.doesNotMatch(xml, /\.html/);
    // After validThrough the job drops out of the sitemap.
    assert.equal(buildJobsSitemap(live, new Date('2026-12-01T00:00:00Z')).count, 0);
});

test('job page template: canonical without .html, full masked description, no "days ago" churn', () => {
    const page = read('jobs-builder/src/pages/jobs/[category]/[slug].astro');
    assert.match(page, /const canonicalUrl = `\$\{DOMAIN\}\/jobs\/\$\{categorySlug\}\/\$\{slug\}`;/);
    assert.doesNotMatch(page, /\$\{slug\}\.html/);
    assert.doesNotMatch(page, /getDaysAgo|isDescTruncated/);
    assert.match(page, /<meta name="msc-page" content="job-v2">/);
    assert.match(page, /jobSeo\.maskContacts\(job\.Description\)/);
    assert.match(page, /BreadcrumbList/);
});

test('portal links and share links use the readable job URL', () => {
    const portal = read('scripts/portal3.js');
    assert.match(portal, /import '\.\/job-seo\.js';/);
    assert.match(portal, /jobSeo\.jobPath\(job,/);
    assert.match(portal, /const jobUrl = jobSeo\.shareUrl\(job,/);
    assert.doesNotMatch(portal, /\$\{jobSlug\}\.html/);
    const emailPortal = read('scripts/portal-email.js');
    assert.match(emailPortal, /import '\.\/job-seo\.js';/);
    assert.match(emailPortal, /MSCJobSeo\.shareUrl\(job,/);
});

test('404 page is real (noindex) and sends job URLs to the portal', () => {
    const page = read('404.html');
    assert.match(page, /<meta name="robots" content="noindex">/);
    assert.match(page, /<script src="\/scripts\/job-seo\.js"><\/script>/);
    assert.match(page, /parseJobPath\(window\.location\.pathname\)/);
    assert.match(read('job.html'), /<meta name="robots" content="noindex">/);
});

test('jobs workflow runs the sync and no removed script', () => {
    const workflow = read('.github/workflows/generate-jobs.yml');
    assert.match(workflow, /npm run sync/);
    assert.doesNotMatch(workflow, /sync:update|npm run cleanup|npm run expire|sync-state\.json/);
    assert.match(workflow, /git add -A jobs\/ jobs-sitemap\.xml/);
    const pkg = JSON.parse(read('jobs-builder/package.json'));
    for (const script of Object.values(pkg.scripts)) {
        const match = /node (scripts\/\S+)/.exec(script);
        if (match) assert.ok(fs.existsSync(path.join(root, 'jobs-builder', match[1])), `${match[1]} exists`);
    }
});
