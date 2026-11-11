const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

const portalPages = [
    'index.html',
    'ca-articleship-opportunities.html',
    'ca-fresher-jobs.html',
    'semi-qualified-ca-jobs.html',
    'experienced-ca-jobs.html'
];

function careerResourceLinks(page) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const start = html.indexOf('<h3>Career Resources</h3>');
    assert.notEqual(start, -1, `${page} has a Career Resources card`);
    const card = html.slice(start, html.indexOf('</div>', start));
    const links = [];
    const anchor = /<a href="([^"]+)" class="dv2-rail-link">([\s\S]*?)<\/a>/g;
    let match;
    while ((match = anchor.exec(card))) {
        const label = match[2].match(/dv2-rail-link-text">([^<]+)</);
        links.push({ href: match[1], label: label ? label[1].trim() : '' });
    }
    return links;
}

function pageFor(href) {
    const clean = href.replace(/^\//, '').replace(/\.html$/, '');
    return `${clean}.html`;
}

for (const page of portalPages) {
    test(`${page}: every Career Resources link opens a resources page that exists`, () => {
        const links = careerResourceLinks(page);
        assert.ok(links.length >= 3, 'card lists the resource pages');
        for (const { href, label } of links) {
            assert.match(label, /Resources$/, `"${label}" is a resources link`);
            assert.match(href, /resources(\.html)?$/, `"${label}" must open a resources page, not ${href}`);
            assert.ok(fs.existsSync(path.join(root, pageFor(href))), `${href} exists in the repo`);
        }
    });

    test(`${page}: Articleship Resources opens the Articleship resources page`, () => {
        const link = careerResourceLinks(page).find(item => item.label === 'Articleship Resources');
        assert.ok(link, 'card has an Articleship Resources link');
        assert.equal(pageFor(link.href), 'articleship-resources.html');
    });
}
