// Idempotent shared navigation installer; also runs after generated job builds.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const excluded = new Set(['.git','node_modules','work','scratch','tests','dist','.astro']);
const internalPages = new Set(['admin.html','hirer-dashboard.html','mentor-dashboard.html','auth-test.html','browser-guard-test.html','moonshine-test.html','payment-test.html','speak-test.html','testing.html','turnstile-test.html']);
const assets = '<link rel="stylesheet" href="/scripts/site-navigation.css?v=20260927.5"><script src="/scripts/site-navigation.js?v=20260927.5" defer></script>';
let count = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    if (excluded.has(entry.name)) continue;
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()) { walk(file); continue; }
    if(!/\.(html|astro)$/.test(file) || internalPages.has(entry.name)) continue;
    if (path.dirname(file) === path.join(root, 'cv-builder') && entry.name !== 'index.html') continue;
    // CV template iframes deliberately suppress navigation at runtime and in print.
    let text=fs.readFileSync(file,'utf8');
    if(text.includes('/scripts/site-navigation.js')) continue;
    if(!text.includes('</head>')) continue;
    text=text.replace('</head>',assets+'\n</head>');
    fs.writeFileSync(file,text);count++;
  }
}
walk(root);
console.log(`Installed shared navigation in ${count} pages.`);
