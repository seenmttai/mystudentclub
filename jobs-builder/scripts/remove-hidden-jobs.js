// remove-hidden-jobs.js
// Deletes generated job pages of vacancies hidden in the admin panel (third-party reposts and the like).
// Run after: expire-old-jobs.js, before generate-sitemap.js. Needs SUPABASE_URL and SUPABASE_KEY.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_JOBS_DIR = path.join(__dirname, '..', '..', 'jobs');

const TABLE_MAP = {
    'Industrial Training Job Portal': 'industrial',
    'Fresher Jobs': 'fresher',
    'Semi Qualified Jobs': 'semi-qualified',
    'Articleship Jobs': 'articleship'
};

// Page files are named "<id>.html" (older pages) or "<slug>-<id>.html".
export function jobIdFromFileName(fileName) {
    const match = fileName.match(/(?:^|-)(\d+)\.html$/);
    return match ? Number(match[1]) : null;
}

export function pagesToRemove(fileNames, hiddenIds) {
    return fileNames.filter(name => hiddenIds.has(jobIdFromFileName(name)));
}

async function main() {
    const { SUPABASE_URL, SUPABASE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.log('SUPABASE_URL or SUPABASE_KEY not set, skipping hidden job removal.');
        return;
    }
    // Imported here so the helpers above load without the package (tests).
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    console.log('Removing pages of hidden jobs...');
    let totalRemoved = 0;

    for (const [tableName, category] of Object.entries(TABLE_MAP)) {
        const folderPath = path.join(DIST_JOBS_DIR, category);
        if (!fs.existsSync(folderPath)) continue;

        const { data, error } = await supabase.from(tableName).select('id').eq('hidden', true);
        if (error) {
            // Before the hidden column exists this fails; nothing is hidden yet.
            console.log(`  ${tableName}: could not read hidden jobs (${error.message}), skipping.`);
            continue;
        }

        const hiddenIds = new Set((data || []).map(row => Number(row.id)));
        const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.html'));
        const toRemove = pagesToRemove(files, hiddenIds);

        for (const file of toRemove) {
            fs.unlinkSync(path.join(folderPath, file));
            console.log(`  Deleted ${category}/${file}`);
        }
        console.log(`  ✅ ${category}: ${hiddenIds.size} hidden, ${toRemove.length} pages removed`);
        totalRemoved += toRemove.length;
    }

    console.log(`\n✅ Hidden job removal complete! Total removed: ${totalRemoved}`);
}

if (process.argv[1] === __filename) {
    main().catch(err => {
        console.error('Hidden job removal failed:', err.message);
    });
}
