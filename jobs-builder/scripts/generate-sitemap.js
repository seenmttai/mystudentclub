// generate-sitemap.js
// Generates jobs-sitemap.xml with only fresh jobs (last 3 days)
// Run after: expire-old-jobs.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOMAIN = 'https://www.mystudentclub.com';
const SITEMAP_DAYS = 3;
const DIST_JOBS_DIR = path.join(__dirname, '..', '..', 'jobs');
const SITEMAP_PATH = path.join(__dirname, '..', '..', 'jobs-sitemap.xml');

const CATEGORIES = ['industrial', 'fresher', 'semi-qualified', 'articleship'];

console.log('Generating jobs-sitemap.xml...');
console.log(`Only including jobs from last ${SITEMAP_DAYS} days\n`);

// Calculate cutoff date
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - SITEMAP_DAYS);
const today = new Date().toISOString().split('T')[0];

console.log(`Cutoff date: ${cutoffDate.toISOString().split('T')[0]}\n`);

let sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

let totalAdded = 0;

for (const category of CATEGORIES) {
    const folderPath = path.join(DIST_JOBS_DIR, category);
    
    if (!fs.existsSync(folderPath)) {
        console.log(`Folder ${category} does not exist, skipping.`);
        continue;
    }

    const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.html'));
    let addedCount = 0;
    
    console.log(`Processing ${category}: ${files.length} files`);
    
    for (const file of files) {
        const filePath = path.join(folderPath, file);
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Extract datePosted from JSON-LD
            const dateMatch = content.match(/"datePosted":\s*"(\d{4}-\d{2}-\d{2})/);
            
            if (dateMatch && dateMatch[1]) {
                const jobDate = new Date(dateMatch[1]);
                
                // Only include fresh jobs
                if (jobDate > cutoffDate) {
                    const url = `${DOMAIN}/jobs/${category}/${file}`;
                    sitemapContent += `   <url>
      <loc>${url}</loc>
      <lastmod>${today}</lastmod>
      <changefreq>daily</changefreq>
      <priority>0.7</priority>
   </url>
`;
                    addedCount++;
                }
            } else {
                // No JSON-LD found, check file modification time as fallback
                const stats = fs.statSync(filePath);
                if (stats.mtime > cutoffDate) {
                    const url = `${DOMAIN}/jobs/${category}/${file}`;
                    sitemapContent += `   <url>
      <loc>${url}</loc>
      <lastmod>${today}</lastmod>
      <changefreq>daily</changefreq>
      <priority>0.7</priority>
   </url>
`;
                    addedCount++;
                }
            }
        } catch (err) {
            console.error(`  Error processing ${file}:`, err.message);
        }
    }
    
    console.log(`  ✅ Added ${addedCount} jobs from ${category}`);
    totalAdded += addedCount;
}

sitemapContent += `</urlset>`;

// Write sitemap file
fs.writeFileSync(SITEMAP_PATH, sitemapContent);

console.log(`\n✅ Sitemap generated at ${SITEMAP_PATH}`);
console.log(`   Total URLs: ${totalAdded}`);
