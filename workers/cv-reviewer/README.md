# CV Reviewer access boundary

The initial source was recovered read-only from the deployed `cv-reviewer` Worker on 2026-09-27. `processCV` is unchanged: same prompts, model ordering, provider payloads and existing AI/secret bindings. The wrapper now validates Supabase bearer identity and the caller's RLS-protected `enrollment` rows before deciding report access. Caller flags and editable auth metadata do not grant premium access.

An existing eligible enrollment is the purchase record used by the LMS, including retained alumni rows. Explicit legacy aliases match the LMS. No separate purchase/expiry schema is invented.

Free responses contain only the existing free sections: score, recruiter tips, measurable results, education and articleship. Unknown or malformed sections fail closed. Successful responses include `access: {premium, partial, version}`. The browser records `partial` in saved review metadata and sends the session bearer token; it no longer sends `isPremium`.

The previous deployed wrapper referenced rate limiter bindings that were absent. The fallback uses the already-bound `RATE_LIMITS` KV and existing `MAX_REQUESTS_PER_IP=50` / `RATE_LIMIT_WINDOW=3600`. KV is eventually consistent; this is a best-effort IP quota, not a strictly atomic or lifetime account quota. The frontend lifetime trial policy is unchanged.

## Coordinated release

Only use the content-only deployment helper after the matching website is published. It verifies an exact frontend hash, guards against source/settings changes since preparation, preserves runtime settings and bindings, retrieves and hashes the deployed source, and checks health. It reads the existing Wrangler OAuth session from `~/.wrangler/config/default.toml`; no secret values are sent or printed.

```
node workers/cv-reviewer/deploy.mjs --prepare --evidence-dir /absolute/work/reviewer-release
node workers/cv-reviewer/deploy.mjs --deploy --evidence-dir /absolute/work/reviewer-release
node workers/cv-reviewer/verify-production.mjs --evidence-dir /absolute/work/reviewer-checks
```

Add `--image /absolute/path/to/synthetic-resume.png` for one actual anonymous review, carrying a forged premium flag, to verify only partial content leaves the server. It consumes one configured Worker request but does not create users, enrollments, or database review rows.

Prior full reports already delivered to users or saved in database rows are not retroactively revoked. The browser invalidates the legacy active-report cache and isolates current report/history by account. Database row access remains governed by existing RLS; no historical records are mutated by this change.

## Models, budget and cache (23 Nov 2026)

- **Paid students:** Claude Opus 5.5 (`effort: medium`). **Free users:** Claude Haiku 5.5 (`effort: high`). Gemini 3.1 Flash Lite, then Workers AI Gemma, only if Claude fails. OpenAI was removed (account out of credits). Key: Worker secret `ANTHROPIC_API_KEY` (currently the MSC desk key).
- Why these settings: a blind test of 7 CVs graded by Opus 5.5 and Gemini 3.1 Pro scored Opus medium 8.8/10, Opus high 8.8 (18% dearer, 16 s slower), Sonnet 5.5 8.3, Haiku 6.3, Gemini Flash Lite 3.5. Haiku at high effort is the only Haiku setting that returned every free section. Kit: `~/development/msc-cv-reviewer-eval`.
- **Daily cap:** 10 Opus reviews per paid student per India day; more that day use Sonnet 5.5.
- **No monthly guard (26 Nov 2026, Padam: "Paid Students pls do at opus, free students haiku only"):** paid students always get Opus and free users always get Haiku. Spend is still tracked in the `RATE_LIMITS` KV (`cv-review-spend:v1:YYYY-MM`, micro-dollars) for watching; the only step down is Sonnet for a paid student past 10 reviews in one India day.
- **Cache:** the same CV (same page images, prompt version and role) returns the stored review for 30 days (`cv-review-cache:v2:<sha256>:premium|free`), so a re-upload costs nothing and keeps the same score. Only complete Claude reviews are cached. A free user re-uploading a CV a paid student already reviewed gets the partial view of that review.
- The prompt is written so a student can rebuild the CV from the review alone: every issue carries the exact fix, rewrites never invent numbers (placeholders instead), no invented nitpicks, fixed score bands. In the test, applying one review's fixes lifted CVs from 38.5/55.5/63.5/81.5 to 81–88.
