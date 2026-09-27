# CV export Worker

Recovered from the deployed `cv-pdf-worker` on 2026-09-27. `runtime.mjs` preserves the existing bundled Cloudflare Puppeteer implementation; `index.mjs` contains the editable application code.

Deploy as ES modules with `index.mjs` as main module, compatibility date `2024-09-23`, `nodejs_compat`, the existing `BROWSER` browser binding, and the existing `FREECONVERT_API_KEY` secret retained. Never replace or print that secret. Deploy after the matching frontend that sends `{template, data, filename}`.

Both PDF and DOCX require a server-verified eligible enrollment for all templates other than Bold Modern, Inset Frame and Clean Rule. Canonical template HTML is selected by the server; caller HTML is never rendered. The existing PDF-to-DOCX conversion provider remains unchanged. Browser print and screenshots of visible previews cannot be prevented by an export endpoint.

## Coordinated production release

`deploy.mjs --prepare --evidence-dir /absolute/work/directory` performs read-only API calls, saves the current Worker modules/settings, and records hashes. `--deploy` requires that preparation and refuses to upload if the production Worker changed or the exact matching CV Builder script has not been published.

The deployment uses Cloudflare's [content-only update endpoint](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/content/methods/update/), which preserves configuration and bindings. It verifies module hashes, unchanged runtime settings/secret binding names and the health release marker afterwards. OAuth credentials come from the existing Wrangler login and are never logged or copied into artifacts.

After release, `verify-production.mjs --evidence-dir /absolute/work/directory [--include-docx]` checks anonymous premium denial on both formats, forged flags, invalid tokens, traversal and legacy HTML rejection, then downloads all three free PDFs and verifies their actual text. Optional DOCX verification checks the Office ZIP contents. Test payloads are synthetic and create no account, enrollment or marketing data. Production positive paid-user behavior remains distinct from mocked unit coverage unless tested with an authorized enrolled account.
