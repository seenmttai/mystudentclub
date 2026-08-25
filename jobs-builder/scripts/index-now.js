// index-now.js
// Google Indexing API submitter for freshly generated job pages
// Runs after: Astro build & copy steps

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOMAIN = 'https://www.mystudentclub.com';
const DIST_JOBS_DIR = path.join(__dirname, '..', 'dist', 'jobs');
const CATEGORIES = ['industrial', 'fresher', 'semi-qualified', 'articleship'];
const MAX_URLS_PER_RUN = 100;

console.log('📡 Google Indexing API automation...\n');

// 1. Check for Service Account credentials
const credentialsRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!credentialsRaw) {
    console.log('ℹ️  GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set.');
    console.log('   Skipping Google Indexing API notifications. (Add the secret in GitHub Settings to enable)\n');
    process.exit(0);
}

let credentials;
try {
    // Handle both raw JSON string and file path
    if (fs.existsSync(credentialsRaw)) {
        credentials = JSON.parse(fs.readFileSync(credentialsRaw, 'utf8'));
    } else {
        credentials = JSON.parse(credentialsRaw);
    }
} catch (err) {
    console.error('⚠️  Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', err.message);
    console.log('   Skipping Google Indexing API notifications.');
    process.exit(0);
}

if (!credentials.client_email || !credentials.private_key) {
    console.error('⚠️  Invalid credentials format: missing client_email or private_key.');
    process.exit(0);
}

// 2. Generate Google OAuth2 Access Token using RS256 JWT
async function getAccessToken(serviceAccount) {
    const now = Math.floor(Date.now() / 1000);
    const header = {
        alg: 'RS256',
        typ: 'JWT'
    };
    const claimSet = {
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/indexing',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };

    const base64UrlEncode = (obj) =>
        Buffer.from(JSON.stringify(obj))
            .toString('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');

    const encodedHeader = base64UrlEncode(header);
    const encodedClaimSet = base64UrlEncode(claimSet);
    const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureInput);
    const signature = signer
        .sign(serviceAccount.private_key, 'base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const jwt = `${signatureInput}.${signature}`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
        throw new Error(`Token generation failed: ${JSON.stringify(tokenData)}`);
    }

    return tokenData.access_token;
}

// 3. Submit URL to Indexing API
async function publishUrl(accessToken, url, type = 'URL_UPDATED') {
    const endpoint = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
            url: url,
            type: type
        })
    });

    const result = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data: result };
}

// 4. Main runner
async function main() {
    // Collect freshly built URLs
    const urlsToSubmit = [];

    for (const category of CATEGORIES) {
        const folderPath = path.join(DIST_JOBS_DIR, category);
        if (!fs.existsSync(folderPath)) continue;

        const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.html'));
        for (const file of files) {
            urlsToSubmit.push(`${DOMAIN}/jobs/${category}/${file}`);
            if (urlsToSubmit.length >= MAX_URLS_PER_RUN) break;
        }
        if (urlsToSubmit.length >= MAX_URLS_PER_RUN) break;
    }

    if (urlsToSubmit.length === 0) {
        console.log('ℹ️  No new job pages found to submit in dist/jobs.');
        return;
    }

    console.log(`🚀 Requesting OAuth2 token for ${credentials.client_email}...`);
    let accessToken;
    try {
        accessToken = await getAccessToken(credentials);
        console.log('✅ Access token obtained successfully.\n');
    } catch (err) {
        console.error('❌ Failed to authenticate with Google:', err.message);
        return;
    }

    console.log(`Submitting ${urlsToSubmit.length} URLs to Google Indexing API:`);
    let successCount = 0;
    let failedCount = 0;

    for (const url of urlsToSubmit) {
        try {
            const res = await publishUrl(accessToken, url, 'URL_UPDATED');
            if (res.ok) {
                console.log(`  ✅ [${res.status}] ${url}`);
                successCount++;
            } else {
                console.warn(`  ⚠️  [${res.status}] ${url} - ${JSON.stringify(res.data)}`);
                failedCount++;
            }
        } catch (err) {
            console.error(`  ❌ Error submitting ${url}:`, err.message);
            failedCount++;
        }
    }

    console.log(`\n🎉 Indexing API run complete: ${successCount} submitted, ${failedCount} failed.`);
}

main().catch(err => {
    console.error('Unexpected error in index-now:', err);
});
