# CS / CMA job portal

Job and training portal for Company Secretary (ICSI) and Cost & Management
Accountant (ICMAI) students. It reuses the CA job tables, so every vacancy that
says CS or CMA candidates can apply shows up here without extra data entry.

| Course | Hub | Training at firms | Training in companies | Semi-qualified | Freshers | Experienced |
| --- | --- | --- | --- | --- | --- | --- |
| CS | `/cs-jobs` | `/cs-articleship` | `/cs-training-in-companies` | `/semi-qualified-cs-jobs` | `/cs-fresher-jobs` | `/experienced-cs-jobs` |
| CMA | `/cma-jobs` | `/cma-articleship` | `/cma-industrial-training` | `/cma-inter-jobs` | `/cma-fresher-jobs` | `/experienced-cma-jobs` |

Each section reads one table: training at firms from `Articleship Jobs`,
training in companies from `Industrial Training Job Portal`, semi-qualified
from `Semi Qualified Jobs`, freshers and experienced from `Fresher Jobs`
(split on `Experience`).

## Files

- `config.js`: courses, sections, eligibility patterns, work-area filters, cities.
- `content.js`: rule summaries and FAQs shown on the pages (with sources).
- `core.js`: pure helpers, unit-tested in `tests/pro-portal-core.test.cjs`.
- `portal.js`: the browser engine. `portal.css`: styles.
- `build-pages.js`: writes the 12 pages at the repo root and `cs-cma-portal.sql`.

The pages are generated. Edit `config.js` or `content.js`, then run the
commands below. Rebuild after changing `portal.js`, `portal.css`, `core.js`,
`scripts/browser-guard.js` or `scripts/profile-completion.js` too: the pages
carry a content hash for each, so browsers never mix old and new files.

```sh
npm run build:pro-portal   # regenerate pages + SQL
npm run test:pro-portal    # unit + page checks (also fail if pages are stale)
```

## How a listing is chosen

Each course has three PostgreSQL regexes in `config.js`:

1. `pre`: a cheap gate (any CS / CMA-like word).
2. `pos`: the course is named as an accepted qualification ("CA/CMA", "CS
   Executive passed", "ICWA", "Company Secretary trainee").
3. `neg`: the listing turns the course away ("CMA not eligible"), wants it
   only on top of a mandatory CA, or means US CMA. "CMA data" (a bank loan
   report) never matches `pos`.

They were checked by hand on 2026-10-17 against every CS match and a sample of
CMA matches from the previous 60 days, and were about 99% precise. The detail
view quotes the sentence that matched, so a student can judge borderline cases.

Before the migration, the site applies the three patterns to `Description` on
every request, in that order, which keeps each query well under the 3-second
anon timeout. After the migration it filters on the indexed `eligible_courses`
column instead. It detects which mode to use automatically.

## Database migration

Run `cs-cma-portal.sql` in the Supabase SQL editor. It is safe to re-run. It:

- adds `eligible_courses text[]` (default `{CA}`) and `eligible_courses_manual`
  to the four job tables;
- adds `msc_detect_courses()` and a trigger that tags new and edited vacancies;
- backfills the last 90 days, adds GIN indexes, and grants the website read
  access to the new column.

To post a CS- or CMA-only vacancy, insert it with `eligible_courses = '{CS}'`
and `eligible_courses_manual = true`. **Before doing that**, make the CA portal
(`scripts/portal3.js`) filter on `eligible_courses` containing `CA`, or CA
students will see it too.

## Applying

- Ordinary listings: the student logs in, taps Apply, and the BrowserGuard
  worker returns the recruiter's email or link (same as the CA portal). The
  application is recorded in `job_applications` with the source table name,
  so it appears on `/history.html`.
- Recruiter-posted listings (`posted_by` / `hirer_email`): Easy Apply on the
  page. The student ticks the DPDP consent (same text and `consentform` row as
  the CA portal), needs a 100% complete profile, and the application goes to
  the hirer dashboard. These are not locked behind a CA programme.
