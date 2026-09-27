// expire-old-jobs.js
// Soft-deletes jobs older than 3 days by removing JSON-LD and adding noindex meta
// Run after: cleanup-folders.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPIRATION_DAYS = 3;
const DIST_JOBS_DIR = path.join(__dirname, '..', '..', 'jobs');

const CATEGORIES = ['industrial', 'fresher', 'semi-qualified', 'articleship'];

console.log('Starting job expiration process...');
console.log(`Expiration threshold: ${EXPIRATION_DAYS} days\n`);

// Calculate cutoff date
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - EXPIRATION_DAYS);
console.log(`Cutoff date: ${cutoffDate.toISOString().split('T')[0]}`);
console.log(`Jobs posted before this date will be soft-deleted.\n`);

let totalExpired = 0;

for (const category of CATEGORIES) {
    const folderPath = path.join(DIST_JOBS_DIR, category);
    
    if (!fs.existsSync(folderPath)) {
        console.log(`Folder ${category} does not exist, skipping.`);
        continue;
    }

    const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.html'));
    let expiredCount = 0;
    
    console.log(`Processing ${category}: ${files.length} files`);
    
    for (const file of files) {
        const filePath = path.join(folderPath, file);
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Extract datePosted from JSON-LD
            const dateMatch = content.match(/"datePosted":\s*"(\d{4}-\d{2}-\d{2})/);
            
            if (dateMatch && dateMatch[1]) {
                const jobDate = new Date(dateMatch[1]);
                
                // Check if job is expired
                if (jobDate <= cutoffDate) {
                    // Check if already processed
                    const hasJsonLd = content.includes('<script type="application/ld+json">');
                    const hasNoindexMeta = content.includes('<meta name="robots" content="noindex');
                    
                    if (hasJsonLd || !hasNoindexMeta) {
                        // Get original file stats to preserve timestamps
                        const stats = fs.statSync(filePath);
                        const originalMtime = stats.mtime;
                        const originalAtime = stats.atime;
                        
                        let updatedContent = content;
                        
                        // Remove JSON-LD block
                        if (hasJsonLd) {
                            updatedContent = updatedContent.replace(
                                /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
                                ''
                            );
                        }
                        
                        // Inject noindex meta tag
                        if (!hasNoindexMeta) {
                            updatedContent = updatedContent.replace(
                                /(<meta name="viewport"[^>]*>)/,
                                '$1\n    <meta name="robots" content="noindex, follow">'
                            );
                        }
                        
                        // Write updated content
                        fs.writeFileSync(filePath, updatedContent);
                        
                        // Restore original timestamps
                        fs.utimesSync(filePath, originalAtime, originalMtime);
                        
                        expiredCount++;
                    }
                }
            }
        } catch (err) {
            console.error(`  Error processing ${file}:`, err.message);
        }
    }
    
    console.log(`  ✅ Expired ${expiredCount} jobs in ${category}`);
    totalExpired += expiredCount;
}

console.log(`\n✅ Job expiration complete! Total expired: ${totalExpired}`);
