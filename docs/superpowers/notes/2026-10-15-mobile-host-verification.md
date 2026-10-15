# mobile.mystudentclub.com source verification (Task 1)

Date of probes: 2026-10-15 (live Date header 2026-10-14 20:18-20:31 GMT). Read-only `curl` only; no deploy, no Cloudflare account access.

## Finding

**The live mobile host serves `upstream/mobile` at `9748fdd08` ("Size the logo properly and keep it readable in dark mode", 2026-10-01, Padam Bhansali), NOT `mobile-bugs` (`04ccbd5a9`) and NOT `origin/mobile-patch` (`ebec6733b`).**

Evidence: byte-for-byte hash comparison of live responses against each ref's file (md5, first 12 hex).

| Live path | live | upstream/mobile 9748fdd08 | mobile-bugs 04ccbd5a9 | origin/mobile-patch |
| --- | --- | --- | --- | --- |
| `/learning-management-system/` | 173eef814ce6 | **173eef814ce6** | 6cf7b3d9dbdd | 6cf7b3d9dbdd |
| `/cv-builder/` | 8e62781df899 | **8e62781df899** | a1158bdf01bc | 8e62781df899 |
| `/ai-interview.html` | 6d9e373f6dda | **6d9e373f6dda** | 6d9e373f6dda | 6d9e373f6dda |
| `/articleship-firm-reviews.html` | 2a3e69a5f243 | **2a3e69a5f243** | ff8ac0b0e8b1 | beb0b1563061 |
| `/ca-fresher-training-resources.html` | 0fca32aa76b6 | **0fca32aa76b6** | 2260832fb0de | 2260832fb0de |
| `/ca-industrial-training-resources.html` | b6b8f1c52ca0 | **b6b8f1c52ca0** | b19f605c6223 | b19f605c6223 |
| `/ca-industrial-training-program/` | 466ba545a71e | **466ba545a71e** | a48eddc822ca | a48eddc822ca |
| `/articleship-program/` | f6d3ff6d0f50 | **f6d3ff6d0f50** | fbab65230eae | 93b8a73d2aff |
| `/msc-ca-fresher-program/` | 7a53ac708351 | **7a53ac708351** | 7054403f021c | 7054403f021c |
| `/contact.html`, `/profile.html` | differ from upstream/mobile only by Cloudflare email-obfuscation rewriting (`/cdn-cgi/l/email-protection`, `__cf_email__`) | same otherwise | differ | differ |
| `/scripts/portal-style.css` | 8d75121dbe | **8d75121dbe** | 28675bf35b | 28675bf35b |
| `/assets/logo.png` | c2d71ba670 | **c2d71ba670** | 4cbaf22779 | 4cbaf22779 |
| `/assets/logo-dark.png` | 8fa80aee5c | **8fa80aee5c** | (absent) | (absent) |
| `/ca-resource/script.js` | 5fea8a755c | **5fea8a755c** | 9b04a8e90b | 5fea8a755c |
| `/ca-resource/style.css` | 6a5dda269d | **6a5dda269d** | e86415ad57 | a5a2e96607 |

Cloudflare headers: `Server: cloudflare`, `Cache-Control: public, max-age=0, must-revalidate`, `Access-Control-Allow-Origin: *`, `cf-cache-status: DYNAMIC`. This is Cloudflare Pages behaviour (clean-URL 308: `/contact.html` -> `/contact`). No `_headers`, `_routes.json`, `wrangler.toml` or `404.html` in the repo, so Pages serves `index.html` (HTTP 200) for any unmatched path. The Cloudflare Pages project name, deploy ID and rollback target are NOT discoverable from the outside and still must be taken from the Cloudflare dashboard before release.

### Relationship of refs
- `upstream/mobile` = merge-base `9a04d9d7c` + 3 logo commits (`79eafc01c`, `436610c52`, `9748fdd08`). It has the new logo on mobile pages (inline new mark, `assets/logo-dark.png`, `.brand-logo`/`onboarding-brand-logo` rules in `scripts/portal-style.css`).
- `mobile-bugs` = same merge-base + `04ccbd5a9` (CV reviewer/builder modules, CA resources, firm filters; includes ca-resource viewer touch-pan/back/blob-download fixes). `git rev-list --left-right --count mobile-bugs...upstream/mobile` = `1 3`.
- Consequence: the two branches have diverged. The live host does **not** contain `04ccbd5a9` (e.g. its `ca-resource/script.js` lacks the pan/touch/back-button changes) and this working tree (based on `mobile-bugs`) does not contain the three logo commits. Deploying a build made from `mobile-bugs` would silently drop the three live logo commits unless they are reconciled; deploying from `upstream/mobile` would drop `04ccbd5a9`. A release owner must decide the base (recommended: branch from live `9748fdd08`, then bring `04ccbd5a9` and this port in) before any deploy. This working tree was edited on `mobile-bugs` as instructed; nothing was merged.
- Note: `upstream/master` currently resolves to `ef572dab0` locally, not the pinned `129251eab`; all work used the pinned SHAs.

## Route responses on 2026-10-15

| Route | HTTP | Result |
| --- | --- | --- |
| `/` | 200 | root home page `34d79aceb3f1` (47,476 bytes), title "My Student Club - Find CA Jobs" |
| `/learning-management-system/` | 200 | distinct ("My Courses") |
| `/cv-builder/` | 200 | distinct ("CV Builder") |
| `/ai-interview.html`, `/articleship-firm-reviews.html`, `/contact.html`, `/profile.html`, `/ca-fresher-training-resources.html`, `/ca-industrial-training-resources.html` | 308 -> extensionless, then 200 | distinct pages |
| `/ca-industrial-training-program/`, `/articleship-program/`, `/msc-ca-fresher-program/` | 200 | distinct, each with its own title |
| `/articleship-resources.html`, `/semi-qualified-ca-resources.html`, `/domain-wise-hiring-companies.html`, `/sessions/`, `/blog/` | 200 | **byte-identical to `/` (`34d79aceb3f1`) = root-index fallback = not a working page** |

Implication for tests: `.html` URLs are 308-redirected to extensionless on the host; the deployed smoke (`MOBILE_SITE_ORIGIN`) follows redirects and asserts title + body hash != `/`.

## Other probes relevant to release gates
- Supabase PostgREST (`auth.mystudentclub.com`, anon, read-only POST of public RPCs): `get_public_resource_catalog_v2` -> **404 PGRST202 (function not in schema cache; hint suggests `get_public_resource_catalog`)**; `get_public_resource_catalog` -> **200**, names/metadata only (`resource_key, program_type, title, category, sort_order`, no file URLs). So v2 SQL is not deployed; `resource-library.js` falls back to v1 on PGRST202 (verified in code). `submit_career_intake` was NOT probed (it is a write); OpenAPI schema is not readable with the anon key (401), so `career_intakes`, `resource_access_logs`, RLS and the storage bucket remain unverified.
- Notify Worker (`https://notify.mystudentclub.com/placed/start`): unauthenticated POST -> 401 (route exists). CORS preflight with `Origin: https://www.mystudentclub.com` -> 204 with `Access-Control-Allow-Origin: https://www.mystudentclub.com`; **preflight with `Origin: https://mobile.mystudentclub.com` -> 403**. The hosted Got Placed card on the mobile origin will therefore fail in a browser/WebView until the Worker (external repo) allow-lists the mobile origin. Release blocker for Task 8.

## Not verified here
Deploy ID/project name/rollback target, iPhone/WKWebView behaviour, light/dark screenshots, authenticated flows, Storage/RLS, Worker upload, any deployment.
