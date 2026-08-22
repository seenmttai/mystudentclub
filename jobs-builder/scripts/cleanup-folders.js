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

function getFileTimestamp(filePath, fileName) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const match = content.match(/"datePosted":\s*"([^"]+)"/);
        if (match && match[1]) {
            const ts = new Date(match[1]).getTime();
            if (!isNaN(ts)) return ts;
        }
    } catch (_) {}

    // Fallback to numeric ID if available (e.g. 29424.html)
    const idMatch = fileName.match(/^(\d+)\.html$/);
    if (idMatch) {
        return parseInt(idMatch[1], 10);
    }

    try {
        return fs.statSync(filePath).mtime.getTime();
    } catch (_) {
        return 0;
    }
}

for (const folderName of Object.values(TABLE_MAP)) {
    const folderPath = path.join(DIST_JOBS_DIR, folderName);
    
    if (!fs.existsSync(folderPath)) {
        console.log(`Folder ${folderName} does not exist, skipping.`);
        continue;
    }

    // Get all HTML files with their parsed timestamps
    let allFiles = fs.readdirSync(folderPath)
        .filter(file => file.endsWith('.html'))
        .map(file => {
            const filePath = path.join(folderPath, file);
            return {
                name: file,
                path: filePath,
                time: getFileTimestamp(filePath, file)
            };
        });

    // Sort by timestamp (newest first)
    allFiles.sort((a, b) => b.time - a.time);

    console.log(`${folderName}: ${allFiles.length} files found`);

    if (allFiles.length > FOLDER_LIMIT) {
        const filesToDelete = allFiles.slice(FOLDER_LIMIT);
        console.log(`⚠️  Folder limit exceeded (${allFiles.length} > ${FOLDER_LIMIT}). Deleting ${filesToDelete.length} oldest excess files...`);
        
        let deletedCount = 0;
        for (const file of filesToDelete) {
            try {
                fs.unlinkSync(file.path);
                deletedCount++;
            } catch (err) {
                console.error(`   Failed to delete ${file.name}:`, err.message);
            }
        }
        
        console.log(`✅ Cleanup complete. Deleted ${deletedCount} oldest files. Retained ${allFiles.length - deletedCount} newest files.`);
    } else {
        console.log(`✅ Folder check passed: ${allFiles.length} files (Limit: ${FOLDER_LIMIT})`);
    }
}

console.log('\nFolder cleanup complete!');
