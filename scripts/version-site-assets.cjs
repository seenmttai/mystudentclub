// Give returning visitors the current shared forms, navigation and tools.
// Bump this release value whenever these browser assets change.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const release = '20260927.9';
const assetReleases = new Map([['scripts/site-navigation.js', '20260927.10'], ['scripts/site-navigation.css', '20260927.10'], ['scripts/resource-library.css', '20260927.10'], ['scripts/portal3.js', '20260927.10'], ['scripts/profile.js', '20260927.10']]);
const assets = new Set([
  'scripts/site-navigation.js', 'scripts/site-navigation.css',
  'scripts/career-profile.js', 'scripts/career-profile.css',
  'scripts/resource-form-collector.js', 'scripts/resource-library.js', 'scripts/resource-library.css',
  'scripts/program-access.js', 'scripts/supabase-init.js', 'scripts/portal3.js', 'scripts/profile.js',
  'cv-builder/cv-script.js', 'cv-builder/cv-styles.css', 'cv-reviewer/cv-reviewer.js',
  'learning-management-system/course-script.js',
  'scripts/portal-email.js', 'articleship-program/app.js', 'articleship-review-wizard.js',
  'ca-industrial-training-program/app.js', 'msc-ca-fresher-program/script.js', 'skill-check/render.js', 'skill-check/app.js'
]);
const excluded = new Set(['.git', 'node_modules', 'work', 'scratch', 'tests', 'dist', '.astro', 'workers', '.wrangler', 'logs']);
const checkOnly = process.argv.includes('--check');
let changed = 0;
function version(value, file) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return value;
  const [withoutHash, hash] = value.split('#', 2);
  const [pathname, query = ''] = withoutHash.split('?', 2);
  const target = pathname.startsWith('/') ? path.resolve(root, '.' + pathname) : path.resolve(path.dirname(file), pathname);
  if (!assets.has(path.relative(root, target))) return value;
  const params = new URLSearchParams(query);
  params.set('v', assetReleases.get(path.relative(root, target)) || release);
  return pathname + '?' + params.toString() + (hash === undefined ? '' : '#' + hash);
}
function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (excluded.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (file === __filename || !/\.(?:html|astro|js|cjs)$/.test(file)) continue;
    const before = fs.readFileSync(file, 'utf8');
    // Limit changes to asset attributes/assignments and our script loader calls.
    // Do not change source-code includes(), filesystem paths or API parameters.
    const after = before.replace(/(\b(?:src|href)\s*=\s*|\bloadScript\(\s*)(["'])([^"'\r\n]+)\2/g,
      (whole, prefix, quote, value) => prefix + quote + version(value, file) + quote);
    if (before !== after) {
      changed++;
      if (!checkOnly) fs.writeFileSync(file, after);
    }
  }
}
walk(root);
console.log(checkOnly ? `${changed} files need asset version updates.` : `Updated asset versions in ${changed} files.`);
if (checkOnly && changed) process.exitCode = 1;
