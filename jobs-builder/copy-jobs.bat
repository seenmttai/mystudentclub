@echo off
REM Copies the Astro build into ..\jobs: writes new pages, redirects old URLs of live jobs,
REM deletes pages of expired jobs (same as the GitHub workflow). Run after "npx astro build".
node scripts\sync-job-pages.js
node scripts\generate-sitemap.js
