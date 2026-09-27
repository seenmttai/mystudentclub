'use strict';
// Static DOM name audit. Does not execute application code or call any service.
// Hidden dialogs are included because their controls become available when opened.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const skip = new Set(['.git', 'node_modules', 'jobs', 'scratch', 'work', 'tests', 'dist', '.astro']);
const internal = new Set(['admin.html', 'hirer-dashboard.html', 'mentor-dashboard.html', 'testing.html', 'test.html']);
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) { walk(file); continue; }
    if (!item.name.endsWith('.html') || internal.has(item.name) || item.name.endsWith('-test.html')) continue;
    if (path.basename(dir) === 'cv-builder' && item.name !== 'index.html') continue;
    files.push(file);
  }
}
walk(root);
const findings = [];
let controls = 0;
for (const file of files) {
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { virtualConsole: new VirtualConsole() });
  const document = dom.window.document;
  for (const node of document.querySelectorAll('input:not([type="hidden"]), select, textarea, button')) {
    controls++;
    const text = value => (value || '').replace(/\s+/g, ' ').trim();
    const labelled = text(node.getAttribute('aria-label')) ||
      text((node.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ')) ||
      text(Array.from(node.labels || []).map(label => label.textContent).join(' ')) ||
      text(node.getAttribute('title')) ||
      (node.tagName === 'BUTTON' ? text(node.textContent) : '') ||
      (node.tagName === 'INPUT' && ['submit', 'reset', 'button'].includes(node.type) ? text(node.value) : '');
    if (!labelled) findings.push({ page: path.relative(root, file), tag: node.tagName.toLowerCase(), id: node.id || null, type: node.getAttribute('type'), placeholder: node.getAttribute('placeholder'), snippet: node.outerHTML.slice(0, 280) });
  }
  dom.window.close();
}
const report = { method: 'Static DOM form names; JavaScript-created controls require browser verification. No scripts executed and no forms submitted.', documents: files.length, controls, unnamed: findings.length, findings };
const arg = process.argv.indexOf('--output');
if (arg >= 0 && process.argv[arg + 1]) fs.writeFileSync(path.resolve(process.argv[arg + 1]), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ documents: files.length, controls, unnamed: findings.length, findings }, null, 2));
