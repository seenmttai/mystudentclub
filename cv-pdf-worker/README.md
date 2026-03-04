# CV PDF Worker

Cloudflare Worker that generates ATS-friendly PDFs from HTML using headless Chromium.

**Why:** The previous html2pdf.js approach produced image-based PDFs where text wasn't selectable, links weren't clickable, and ATS systems couldn't parse content. This Worker uses Chromium's real PDF engine to produce proper PDFs.

## Requirements

- Cloudflare Workers **Paid Plan** ($5/month) — needed for Browser Rendering
- Node.js (v18+)

---

## Option A: Deploy as Separate Worker (Recommended)

Deploy this project as a standalone Worker:

```bash
cd cv-pdf-worker
npm install
npx wrangler login
npx wrangler deploy
```

After deploy, share the Worker URL with the team to update `WORKER_PDF_URL` in `cv-builder/cv-script.js` (line ~56).

---

## Option B: Add to Existing `cv-maker` Worker

If you'd prefer to keep everything in one Worker, add the `/pdf` route to the existing `cv-maker` project:

### 1. Add Browser Rendering binding to `cv-maker`'s `wrangler.toml`:
```toml
[browser]
binding = "BROWSER"
```

### 2. Install Puppeteer in the `cv-maker` project:
```bash
cd cv-maker
npm install @cloudflare/puppeteer
```

### 3. Add the PDF route handler to the existing Worker's fetch handler:
```javascript
// Add this import at the top
import puppeteer from "@cloudflare/puppeteer";

// Inside your existing fetch handler, add this route:
if (url.pathname === "/pdf") {
    return handlePdfGeneration(request, env);
}
```

The full `handlePdfGeneration` function can be copied from `cv-pdf-worker/src/index.js`.

### 4. Update client-side:
In `cv-builder/cv-script.js`, change the PDF fetch to use the existing Worker URL:
```javascript
// Change this:
const res = await fetch(`${WORKER_PDF_URL}/pdf`, { ... });
// To this:
const res = await fetch(`${WORKER_URL}/pdf`, { ... });
```

Then redeploy:
```bash
npx wrangler deploy
```

---

## How It Works

1. Client POSTs full CV HTML to `POST /pdf`
2. Worker launches headless Chromium via `@cloudflare/puppeteer`
3. Chromium renders the HTML and calls `page.pdf()` (real text, clickable links)
4. Worker returns PDF binary for download

## API

**`POST /pdf`**

```json
{
  "html": "<!DOCTYPE html><html>...</html>",
  "filename": "John_Doe.pdf"
}
```

Returns: `application/pdf` binary (Content-Disposition: attachment)

## Local Dev

```bash
# Browser Rendering requires remote mode
npx wrangler dev --remote
```

## Troubleshooting

| Issue | Fix |
|---|---|
| `Browser Rendering is not enabled` | Enable in CF Dashboard → Workers & Pages → Browser Rendering |
| CORS errors | Worker handles CORS — verify deployment is live |
| Fonts look wrong | `networkidle0` wait should handle this — retry |
| Timeout | Check Worker logs: `npx wrangler tail` |
