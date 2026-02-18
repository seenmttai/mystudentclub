// update-sync-state.js
// Updates sync-state.json after a successful Astro build
// Reads the generated HTML files to find the newest datePosted per category

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYNC_STATE_FILE = path.join(__dirname, 'sync-state.json');
const DIST_JOBS_DIR = path.join(__dirname, '..', 'dist', 'jobs');

const CATEGORY_TO_TABLE = {
    'industrial': 'Industrial Training Job Portal',
    'fresher': 'Fresher Jobs',
    'semi-qualified': 'Semi Qualified Jobs',
    'articleship': 'Articleship Jobs'
};

console.log('Updating sync state...\n');

// Read existing sync state (if any)
let syncState = {};
if (fs.existsSync(SYNC_STATE_FILE)) {
    syncState = JSON.parse(fs.readFileSync(SYNC_STATE_FILE, 'utf8'));
    console.log('Existing sync state found:');
    for (const [table, ts] of Object.entries(syncState)) {
        console.log(`  ${table}: ${ts}`);
    }
    console.log('');
}

// Scan newly built files to find the newest datePosted per category
for (const [category, tableName] of Object.entries(CATEGORY_TO_TABLE)) {
    const folderPath = path.join(DIST_JOBS_DIR, category);
    
    if (!fs.existsSync(folderPath)) {
        console.log(`No dist folder for ${category}, skipping.`);
        continue;
    }

    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.html'));
    
    if (files.length === 0) {
        console.log(`No files in ${category}, skipping.`);
        continue;
    }

    let newestDate = syncState[tableName] ? new Date(syncState[tableName]) : new Date(0);
    let updated = false;

    for (const file of files) {
        const filePath = path.join(folderPath, file);
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const dateMatch = content.match(/"datePosted":\s*"([^"]+)"/);
            
            if (dateMatch && dateMatch[1]) {
                const jobDate = new Date(dateMatch[1]);
                if (jobDate > newestDate) {
                    newestDate = jobDate;
                    updated = true;
                }
            }
        } catch (err) {
            // Skip files that can't be read
        }
    }

    if (updated) {
        syncState[tableName] = newestDate.toISOString();
        console.log(`✅ ${category}: Updated to ${newestDate.toISOString()} (${files.length} new files)`);
    } else {
        console.log(`  ${category}: No newer jobs found (${files.length} files)`);
    }
}

// Write updated sync state
fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(syncState, null, 2));
console.log(`\n✅ Sync state saved to ${SYNC_STATE_FILE}`);
