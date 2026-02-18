// cleanup-folders.js
// Enforces folder limit of 3000 files per category
// Run after: npm run build

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FOLDER_LIMIT = 3000;
const DIST_JOBS_DIR = path.join(__dirname, '..', '..', 'jobs');

const TABLE_MAP = {
    'industrial': 'industrial',
    'fresher': 'fresher',
    'semi-qualified': 'semi-qualified',
    'articleship': 'articleship'
};

console.log('Starting folder cleanup...');

for (const folderName of Object.values(TABLE_MAP)) {
    const folderPath = path.join(DIST_JOBS_DIR, folderName);
    
    if (!fs.existsSync(folderPath)) {
        console.log(`Folder ${folderName} does not exist, skipping.`);
        continue;
    }

    // Get all HTML files with their modification times
    let allFiles = fs.readdirSync(folderPath)
        .filter(file => file.endsWith('.html'))
        .map(file => {
            const filePath = path.join(folderPath, file);
            return {
                name: file,
                path: filePath,
                mtime: fs.statSync(filePath).mtime
            };
        });

    // Sort by modification time (newest first)
    allFiles.sort((a, b) => b.mtime - a.mtime);

    console.log(`${folderName}: ${allFiles.length} files found`);

    if (allFiles.length > FOLDER_LIMIT) {
        console.log(`⚠️  Folder limit exceeded (${allFiles.length} > ${FOLDER_LIMIT}). Initiating bulk cleanup...`);
        
        // Find the oldest file (last in sorted array)
        const oldestFile = allFiles[allFiles.length - 1];
        const oldestDate = new Date(oldestFile.mtime);
        
        console.log(`   Oldest file: ${oldestFile.name} (${oldestDate.toISOString()})`);
        
        // Calculate purge cutoff (oldest date + 7 days)
        const purgeCutoff = new Date(oldestDate);
        purgeCutoff.setDate(purgeCutoff.getDate() + 7);
        
        console.log(`   Purging files older than: ${purgeCutoff.toISOString()} (7-day buffer)`);
        
        // Filter files to delete
        const filesToDelete = allFiles.filter(f => f.mtime <= purgeCutoff);
        
        console.log(`   Deleting ${filesToDelete.length} files...`);
        
        let deletedCount = 0;
        for (const file of filesToDelete) {
            try {
                fs.unlinkSync(file.path);
                deletedCount++;
            } catch (err) {
                console.error(`   Failed to delete ${file.name}:`, err.message);
            }
        }
        
        console.log(`✅ Bulk cleanup complete. Deleted ${deletedCount} files.`);
        console.log(`   Remaining files: ${allFiles.length - deletedCount}`);
    } else {
        console.log(`✅ Folder check passed: ${allFiles.length} files (Limit: ${FOLDER_LIMIT})`);
    }
}

console.log('\nFolder cleanup complete!');
