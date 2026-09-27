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
