'use strict';
// Targeted, idempotent corrections for historical job documents. Never fetches
// or regenerates descriptions or application contacts from the database.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { improveJobUi } = require('./job-ui.cjs');
const root = path.resolve(__dirname, '..', 'jobs');
const write = process.argv.includes('--write');
let inspected = 0;
let changed = 0;
for (const category of fs.readdirSync(root)) {
  const folder = path.join(root, category);
  if (!fs.statSync(folder).isDirectory()) continue;
  for (const filename of fs.readdirSync(folder).filter(name => name.endsWith('.html'))) {
    const file = path.join(folder, filename);
    const source = fs.readFileSync(file, 'utf8');
    const id = filename.match(/(?:^|-)([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\.html$/i)?.[1] || filename.match(/(?:^|-)(\d+)\.html$/)?.[1];
    const updated = improveJobUi(source, category, id);
    // These contain the actual listing data, and must remain byte-for-byte intact.
    for (const pattern of [/<h1\b[^>]*>[\s\S]*?<\/h1>/g, /<div class="description-content">[\s\S]*?<\/div>/g, /<script type="application\/ld\+json">[\s\S]*?<\/script>/g]) {
      assert.deepEqual(updated.match(pattern), source.match(pattern), `Listing data changed: ${file}`);
    }
    inspected++;
    if (source === updated) continue;
    changed++;
    if (write) {
      const stats = fs.statSync(file);
      fs.writeFileSync(file, updated);
      fs.utimesSync(file, stats.atime, stats.mtime);
    }
  }
}
console.log(JSON.stringify({ inspected, changed, listingDataPreserved: true, mode: write ? 'write' : 'check' }));
