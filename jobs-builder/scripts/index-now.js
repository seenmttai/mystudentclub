// index-now.js
// Google Indexing API notices for job pages. Runs after: sync-job-pages.js
//   1. URL_DELETED for jobs removed before their 15 days were up (dist/removed-job-urls.json)
//   2. URL_UPDATED for new job pages, newest first (dist/new-job-urls.json)
// Google allows 200 publish requests a day per project; URL_UPDATED and URL_DELETED share it and
// the day resets at midnight Pacific time. indexing-quota.json (committed by the workflow) keeps
// today's count, so all runs of a day together stay under DAILY_BUDGET. Whatever doesn't fit is
// left to jobs-sitemap.xml.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, '..', 'dist');
const QUOTA_FILE = path.join(__dirname, '..', 'indexing-quota.json');
const MAX_URLS_PER_RUN = 100;
// Google's default is 200; 10 stay spare in case a run's count never got committed.
export const DAILY_BUDGET = 190;

export function pacificDay(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now);
}

// What this run may send: removals first (a removed job must not stay listed as open), then new
// pages, within what is left of today's budget.
export function planNotices({ removed = [], added = [], quota = {}, now = new Date() }) {
    const day = pacificDay(now);
    const used = quota.day === day ? Math.max(0, Number(quota.used) || 0) : 0;
    const allowance = Math.max(0, Math.min(MAX_URLS_PER_RUN, DAILY_BUDGET - used));
    const queue = removed.map(url => ({ url, type: 'URL_DELETED' }))
        .concat(added.map(url => ({ url, type: 'URL_UPDATED' })))
        .slice(0, allowance);
    return { day, used, queue };
}

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {
        return fallback;
    }
}

function readCredentials() {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
        console.log('ℹ️  GOOGLE_SERVICE_ACCOUNT_JSON is not set; skipping Google Indexing API notices.');
        return null;
    }
    try {
        // Either the JSON itself or a path to the file.
        const credentials = JSON.parse(fs.existsSync(raw) ? fs.readFileSync(raw, 'utf8') : raw);
        if (credentials.client_email && credentials.private_key) return credentials;
        console.error('⚠️  GOOGLE_SERVICE_ACCOUNT_JSON has no client_email or private_key.');
    } catch (err) {
        console.error('⚠️  Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', err.message);
    }
    return null;
}

// Google OAuth2 access token from the service account (RS256 JWT).
async function getAccessToken(serviceAccount) {
    const now = Math.floor(Date.now() / 1000);
    const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const signatureInput = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/indexing',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    })}`;
    const signature = crypto.createSign('RSA-SHA256').update(signatureInput).sign(serviceAccount.private_key, 'base64url');

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: `${signatureInput}.${signature}`
        })
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
        throw new Error(`Token generation failed: ${JSON.stringify(tokenData)}`);
    }
    return tokenData.access_token;
}

async function publishUrl(accessToken, url, type) {
    const response = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ url, type })
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
}

async function main() {
    console.log('📡 Google Indexing API notices...\n');
    const removed = readJson(path.join(DIST_DIR, 'removed-job-urls.json'), []);
    const added = readJson(path.join(DIST_DIR, 'new-job-urls.json'), []);
    if (!removed.length && !added.length) {
        console.log('ℹ️  No new or removed job pages.');
        return;
    }

    const credentials = readCredentials();
    if (!credentials) return;

    const { day, used, queue } = planNotices({ removed, added, quota: readJson(QUOTA_FILE, {}) });
    const waiting = removed.length + added.length;
    if (!queue.length) {
        console.log(`ℹ️  Today's budget is used up (${used}/${DAILY_BUDGET}); ${waiting} URLs are left to the sitemap.`);
        return;
    }

    let accessToken;
    try {
        accessToken = await getAccessToken(credentials);
    } catch (err) {
        console.error('❌ Failed to authenticate with Google:', err.message);
        return;
    }

    console.log(`Sending ${queue.length} of ${waiting} notices (${used}/${DAILY_BUDGET} used today, Pacific day ${day}):`);
    let sent = 0;
    let succeeded = 0;
    let quotaHit = false;
    for (const { url, type } of queue) {
        sent++; // counted even if the request fails: Google may still have counted it
        try {
            const res = await publishUrl(accessToken, url, type);
            if (res.ok) {
                succeeded++;
                console.log(`  ✅ ${type} ${url}`);
            } else if (res.status === 429) {
                quotaHit = true;
                console.warn(`  ⛔ Google says today's quota is used up; stopping. ${JSON.stringify(res.data)}`);
                break;
            } else {
                console.warn(`  ⚠️  [${res.status}] ${type} ${url} - ${JSON.stringify(res.data)}`);
            }
        } catch (err) {
            console.error(`  ❌ ${type} ${url}:`, err.message);
        }
    }

    const usedNow = quotaHit ? DAILY_BUDGET : used + sent;
    fs.writeFileSync(QUOTA_FILE, JSON.stringify({ day, used: usedNow }, null, 2) + '\n');
    console.log(`\n🎉 ${succeeded} of ${sent} notices accepted; ${usedNow}/${DAILY_BUDGET} used today.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
    main().catch(err => {
        console.error('Unexpected error in index-now:', err);
    });
}
