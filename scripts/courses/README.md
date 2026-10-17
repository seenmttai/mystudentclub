# CA, CS and CMA in one portal

My Student Club serves Chartered Accountancy (ICAI), Company Secretary (ICSI)
and Cost & Management Accountant (ICMAI) students from the same pages. A
student picks their qualification in onboarding or on the profile page, and
the portal shows that qualification's lanes with the same header, lane bar,
cards, job window and apply flows.

| Qualification | Training at firms | Training in companies | Semi-qualified | Freshers | Experienced |
| --- | --- | --- | --- | --- | --- |
| CA | `/ca-articleship-opportunities` | `/` (Industrial Training) | `/semi-qualified-ca-jobs` | `/ca-fresher-jobs` | `/experienced-ca-jobs` |
| CS | `/cs-articleship` | `/cs-training-in-companies` | `/semi-qualified-cs-jobs` | `/cs-fresher-jobs` | `/experienced-cs-jobs` |
| CMA | `/cma-articleship` | `/cma-industrial-training` | `/cma-inter-jobs` | `/cma-fresher-jobs` | `/experienced-cma-jobs` |

Every lane reads one of the four job tables (`Industrial Training Job
Portal`, `Articleship Jobs`, `Semi Qualified Jobs`, `Fresher Jobs`, the last
split on `Experience`). CA lanes show the whole table. CS and CMA lanes show
the listings whose description says CS or CMA candidates can apply.
`/cs-jobs` and `/cma-jobs` redirect to the articleship lanes.

## Files

- `courses.js`: the registry. Qualifications, the 15 lanes (table, labels,
  email subjects, AI titles, share types, banner types, profile preference
  keys, programme gates), the CS/CMA eligibility patterns and the query
  scope `applyLaneScope`. Read by `scripts/portal3.js`, the profile pages
  and the generator.
- `match.js`: pure text helpers (safe search terms, city spellings, pattern
  matching, the matched-sentence quote, the CA-firm check).
- `profile-fields.js`: the CS/CMA profile keys and their labels.
- `content.js`: the rule summaries shown on CS/CMA pages, with sources.
- `build-pages.js`: keeps the lane pages in step with `courses.js`.

## Lane pages

The five CA lane pages are hand-written. `build-pages.js` owns only marked
regions inside them (`<!-- msc:lanes -->` etc.: the import map, the
CA | CS | CMA switcher and lane tabs, the lane note, two rail cards), the
`<body data-qualification data-lane>` attributes and the `?v=` content hashes
on local assets. Each CS/CMA page is a copy of the CA page that reads the same
table, with its own title, meta tags and regions.

```sh
npm run build:pages    # regenerate lane pages + cs-cma-portal.sql
npm run check:pages    # fail if anything is stale
npm run test:courses   # registry, patterns and page checks
```

Rebuild after editing a CA lane page, `courses.js`, `content.js`,
`scripts/portal-style.css`, `scripts/portal3.js` or any module it imports:
the pages carry a content hash for each, so browsers never mix old and new
files.

## How a CS/CMA listing is chosen

Each course has three PostgreSQL regexes in `courses.js`:

1. `pre`: a cheap gate (any CS / CMA-like word).
2. `pos`: the course is named as an accepted qualification ("CA/CMA", "CS
   Executive passed", "ICWA", "Company Secretary trainee").
3. `neg`: the listing turns the course away ("CMA not eligible"), wants it
   only on top of a mandatory CA, or means US CMA / CGMA. "CMA data" (a bank
   loan report) never matches `pos`.

They were checked by hand on 2026-10-17 against every CS match and a sample of
CMA matches from the previous 60 days, and were about 99% precise. The job
window quotes the sentence that matched, so a student can judge borderline
cases.

Before the migration, the portal applies the three patterns to `Description`
on the server, over the last 180 days, which keeps each query inside the anon
statement timeout. After the migration every lane filters on the indexed
`eligible_courses` column instead (CA lanes on `CA`, which every row carries
unless an admin marks it CS- or CMA-only). The portal detects which mode to
use automatically.

## Database migration

Run `cs-cma-portal.sql` in the Supabase SQL editor. It is safe to re-run. It
adds `eligible_courses text[]` (default `{CA}`) and `eligible_courses_manual`
to the four job tables, a trigger that tags new and edited vacancies, a
90-day backfill, GIN indexes and read access for the website.

To post a CS- or CMA-only vacancy, insert it with `eligible_courses = '{CS}'`
and `eligible_courses_manual = true`.

## Profiles

The course is `profile.qualification` (`ca`, `cs` or `cma`) in the profiles
jsonb; the stage is `profile.job_preference`, using the CA keys unchanged and
the same keys with a `cs_` / `cma_` prefix for CS and CMA. The `looking_for`
column keeps its CA values; CS/CMA values are written in a separate update so
a database constraint can never lose a profile save.
