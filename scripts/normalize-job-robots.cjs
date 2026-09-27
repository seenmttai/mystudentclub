'use strict';
// --write only reconciles pages already explicitly marked noindex; active jobs
// are never expired by this utility. Default mode reports without changing files.
const fs = require('node:fs');
const path = require('node:path');
const { markJobNoindex, hasNoindex } = require('./job-robots.cjs');
const write = process.argv.includes('--write');
const root = path.resolve(__dirname, '..', 'jobs');
let inspected = 0;
let reconciled = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!entry.name.endsWith('.html')) continue;
    inspected++;
    const html = fs.readFileSync(file, 'utf8');
    if (!hasNoindex(html)) continue;
    const updated = markJobNoindex(html);
    if (html === updated) continue;
    reconciled++;
    if (write) {
      const stats = fs.statSync(file);
      fs.writeFileSync(file, updated);
      fs.utimesSync(file, stats.atime, stats.mtime);
    }
  }
}
walk(root);
console.log(JSON.stringify({ inspected, reconciled, mode: write ? 'write' : 'check' }));
