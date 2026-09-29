// expire-old-jobs.js
// Deletes generated job pages older than 15 days.
// Run after: cleanup-folders.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPIRATION_DAYS = 15;
const DIST_JOBS_DIR = path.join(__dirname, '..', '..', 'jobs');

const CATEGORIES = ['industrial', 'fresher', 'semi-qualified', 'articleship'];

console.log('Starting job expiration process...');
console.log(`Expiration threshold: ${EXPIRATION_DAYS} days\n`);

// Calculate cutoff date
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - EXPIRATION_DAYS);
console.log(`Cutoff date: ${cutoffDate.toISOString().split('T')[0]}`);
console.log(`Jobs posted before this timestamp will be deleted.\n`);

let totalDeleted = 0;

for (const category of CATEGORIES) {
    const folderPath = path.join(DIST_JOBS_DIR, category);
    
    if (!fs.existsSync(folderPath)) {
        console.log(`Folder ${category} does not exist, skipping.`);
        continue;
    }

    const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.html'));
    let deletedCount = 0;
    
    console.log(`Processing ${category}: ${files.length} files`);
    
    for (const file of files) {
        const filePath = path.join(folderPath, file);
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const dateMatch = content.match(/"datePosted":\s*"([^"]+)"/);
            const parsedDate = dateMatch ? new Date(dateMatch[1]) : fs.statSync(filePath).mtime;

            // Use a strict comparison: exactly 15 days old is retained; older is deleted.
            if (Number.isFinite(parsedDate.getTime()) && parsedDate < cutoffDate) {
                fs.unlinkSync(filePath);
                deletedCount++;
                console.log(`  Deleted ${file} (created ${parsedDate.toISOString()})`);
            }
        } catch (err) {
            console.error(`  Error processing ${file}:`, err.message);
        }
    }
    
    console.log(`  ✅ Deleted ${deletedCount} jobs in ${category}`);
    totalDeleted += deletedCount;
}

console.log(`\n✅ Job deletion complete! Total deleted: ${totalDeleted}`);
