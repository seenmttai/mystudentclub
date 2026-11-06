// remove-exclusive-jobs.js
// Exclusive vacancies (is_exclusive = true) are for enrolled MSC students only, so they must have no public page.
// The Astro build no longer generates them; this removes pages generated before that (and any vacancy ticked
// exclusive after its page was built). Run after: expire-old-jobs.js, before generate-sitemap.js.
// Reads with SUPABASE_URL / SUPABASE_KEY like the build (falls back to the public anon key).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const JOBS_DIR = path.join(__dirname, '..', '..', 'jobs');

export const CATEGORY_TABLES = {
    industrial: 'Industrial Training Job Portal',
    fresher: 'Fresher Jobs',
    'semi-qualified': 'Semi Qualified Jobs',
    articleship: 'Articleship Jobs',
};

// Semi Qualified Jobs ids are UUIDs; the other tables use numbers. Slugs end in the id either way.
const PAGE_ID = /(?:^|-)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)\.html$/i;

/** Page file → vacancy id: "acme-audit-mumbai-1234.html", "1234.html", "…-<uuid>.html"; anything else → null. */
export function idFromPageName(fileName) {
    const match = String(fileName).match(PAGE_ID);
    return match ? match[1].toLowerCase() : null;
}

/** Which page files in a folder belong to the given exclusive ids. */
export function pagesToRemove(fileNames, exclusiveIds) {
    const ids = new Set([...exclusiveIds].map((id) => String(id).toLowerCase()));
    return fileNames.filter((name) => {
        const id = idFromPageName(name);
        return id !== null && ids.has(id);
    });
}

async function exclusiveIds(supabase, table) {
    const ids = [];
    const pageSize = 1000;
    for (let from = 0; from < 100000; from += pageSize) {
        const { data, error } = await supabase.from(table).select('id').eq('is_exclusive', true).range(from, from + pageSize - 1);
        if (error) {
            if (String(error.message || '').includes('is_exclusive')) return null; // column not added yet
            throw error;
        }
        ids.push(...(data || []).map((row) => String(row.id)));
        if (!data || data.length < pageSize) break;
    }
    return ids;
}

async function main() {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || 'https://auth.mystudentclub.com';
    const key = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
    const supabase = createClient(url, key);
    let removed = 0;
    for (const [category, table] of Object.entries(CATEGORY_TABLES)) {
        const folder = path.join(JOBS_DIR, category);
        if (!fs.existsSync(folder)) continue;
        let ids;
        try {
            ids = await exclusiveIds(supabase, table);
        } catch (error) {
            // Never stop the 3-hourly job-page run over this step; say so loudly in the Actions log instead.
            console.log(`::warning::remove-exclusive-jobs could not read ${table}: ${error.message || error}`);
            continue;
        }
        if (ids === null) {
            console.log(`${table}: no is_exclusive column yet, nothing to remove.`);
            continue;
        }
        const files = fs.readdirSync(folder).filter((name) => name.endsWith('.html'));
        const doomed = pagesToRemove(files, ids);
        for (const name of doomed) fs.unlinkSync(path.join(folder, name));
        removed += doomed.length;
        console.log(`${table}: ${ids.length} exclusive vacancies, removed ${doomed.length} public pages.`);
    }
    console.log(`Done. Removed ${removed} exclusive vacancy pages.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch((error) => {
        console.log(`::warning::remove-exclusive-jobs failed: ${error.message || error}`);
    });
}
