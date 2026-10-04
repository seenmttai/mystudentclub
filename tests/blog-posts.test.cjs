const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const SITE = 'https://www.mystudentclub.com';
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const POSTS = [
  'industrial-training-roadmap-4-months',
  'cv-for-ca-students',
  'cold-emailing-hrs-for-industrial-training',
  'how-to-land-articleship',
  'icai-campus-placement-guide',
  'ca-inter-exams-over-what-next',
  'big4-vs-industry-industrial-training',
  'semi-qualified-ca-jobs-guide',
];

const attr = (html, re) => (html.match(re) || [])[1];
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** A site path resolves the way Cloudflare Pages serves it: the file, <path>.html or <path>/index.html. */
function resolvesOnSite(href) {
  const url = new URL(href, `${SITE}/blog/`);
  if (url.origin !== SITE) return true; // other sites are not checked here
  const p = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const candidates = p === '' ? ['index.html'] : p.endsWith('/') ? [`${p}index.html`] : [p, `${p}.html`, `${p}/index.html`];
  return candidates.some((c) => fs.existsSync(path.join(root, c)) && fs.statSync(path.join(root, c)).isFile());
}

test('each post has one title, a description, canonical /blog/<slug> and matching social tags', () => {
  for (const slug of POSTS) {
    const html = read(`blog/${slug}.html`);
    const canonical = `${SITE}/blog/${slug}`;
    assert.equal(attr(html, /<link rel="canonical" href="([^"]+)">/), canonical, slug);
    assert.equal(attr(html, /<meta property="og:url" content="([^"]+)">/), canonical, slug);
    assert.equal(attr(html, /<meta property="og:type" content="([^"]+)">/), 'article', slug);
    const title = decode(attr(html, /<title>([^<]+)<\/title>/));
    assert.match(title, / \| My Student Club$/, slug);
    assert.equal(decode(attr(html, /<meta property="og:title" content="([^"]+)">/)), title.replace(/ \| My Student Club$/, ''), slug);
    const description = decode(attr(html, /<meta name="description" content="([^"]+)">/));
    assert.ok(description.length >= 70 && description.length <= 200, `${slug}: description length ${description.length}`);
    assert.equal(decode(attr(html, /<meta property="og:description" content="([^"]+)">/)), description, slug);
    assert.equal(attr(html, /<meta property="og:image" content="([^"]+)">/), `${SITE}/assets/og-image.png`, slug);
    assert.equal(attr(html, /<meta name="twitter:card" content="([^"]+)">/), 'summary_large_image', slug);
    assert.equal(html.split('<h1').length - 1, 1, `${slug}: one h1`);
    assert.match(html, /<link rel="stylesheet" href="\/blog\/blog\.css">/, slug);
    assert.match(html, /<script src="\/blog\/blog\.js" defer><\/script>/, slug);

    const ld = JSON.parse(attr(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/));
    assert.equal(ld['@type'], 'BlogPosting', slug);
    assert.equal(ld.mainEntityOfPage['@id'], canonical, slug);
    assert.equal(ld.headline, title.replace(/ \| My Student Club$/, ''), slug);
    assert.equal(ld.author.name, 'CA Padam Bhansali', slug);
    assert.match(ld.datePublished, /^\d{4}-\d{2}-\d{2}T/, slug);
  }
});

test('no editor markers, comments or raw placeholders reach a published page', () => {
  for (const slug of POSTS) {
    const html = read(`blog/${slug}.html`);
    assert.ok(!/\[VERIFY/i.test(html), `${slug}: [VERIFY] marker`);
    assert.ok(!/\{\{|\}\}/.test(html), `${slug}: {{placeholder}}`);
    assert.ok(!/<!--(?! Open Graph| Twitter)/.test(html), `${slug}: HTML comment in the body`);
    assert.ok(!/<(month|name|firm|company|city|date|attempt|domain|team|phone|year)\b[^>]*>/i.test(html), `${slug}: unescaped template placeholder`);
    assert.ok(!/^---$/m.test(html.slice(0, 20)), `${slug}: front matter before the doctype`);
    assert.match(html, /^<!DOCTYPE html>/, slug);
  }
});

test('every link on a post goes to a page that exists on the site', () => {
  for (const slug of POSTS) {
    const html = read(`blog/${slug}.html`);
    const hrefs = [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => decode(m[1]));
    assert.ok(hrefs.length > 10, slug);
    for (const href of hrefs) {
      if (href.startsWith('#')) continue;
      assert.ok(/^(https:\/\/|\/)/.test(href), `${slug}: ${href} is neither https nor site-relative`);
      assert.ok(resolvesOnSite(href), `${slug}: ${href} has no page in the repo`);
    }
  }
});

test('each post ends with its two call-to-action links', () => {
  for (const slug of POSTS) {
    const html = read(`blog/${slug}.html`);
    const box = attr(html, /<aside class="cta-box"[^>]*>([\s\S]*?)<\/aside>/);
    assert.ok(box, `${slug}: CTA box`);
    const links = [...box.matchAll(/<a class="cta-btn cta-(free|program)" href="([^"]+)">/g)];
    assert.deepEqual(links.map((m) => m[1]), ['free', 'program'], slug);
    for (const [, , href] of links) assert.ok(resolvesOnSite(href), `${slug}: CTA ${href}`);
  }
});

test('blog-sitemap.xml lists every post once and keeps the existing entry', () => {
  const xml = read('blog-sitemap.xml');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<\/urlset>\s*$/);
  assert.equal(xml.split('<url>').length, xml.split('</url>').length);
  assert.ok(xml.includes(`<loc>${SITE}/blog/test.html</loc>`));
  for (const slug of POSTS) {
    assert.equal(xml.split(`<loc>${SITE}/blog/${slug}</loc>`).length - 1, 1, slug);
  }
});
