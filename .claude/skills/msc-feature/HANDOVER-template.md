# Handover: <feature name>

Date: <YYYY-MM-DD>
Repo: <repo name> · Branch: `feature/<slug>` (pushed; the maintainer opens the pull request)
Built by: <person> with <tool>

## 1. Scope

**What it does (2 to 4 sentences, plain language):**
<...>

**Why it is needed / who asked for it:**
<...>

**Who it is for:** <students / recruiters / admins / internal>

**Pages or screens affected:**
- <page or screen> — <what changes there>

**Out of scope (things deliberately not done):**
- <...>

## 2. Files changed on the branch

| File | Change |
|---|---|
| `<path>` | <one line> |

## 3. Database migrations to run (in this order)

Write "None" if there are none.

| # | File in `migrations/` | What it does | Reversible? |
|---|---|---|---|
| 1 | `001_<name>.sql` | <...> | yes / no, because <...> |

Also copied to `supabase/migrations/` on the branch: yes / no / not applicable.

## 4. Cloudflare Workers to deploy

Write "None" if there are none.

| Worker | Host (or "unchanged" if no route change) | Source in zip at | What changed | Verified? |
|---|---|---|---|---|
| `<name>` | `<host>` | `workers/<name>/` | <...> | verified against current source / **UNVERIFIED** (source not available, written from scratch) |

**Vars, secrets, routes or bindings that must change** (also listed in each Worker's `CHANGES.md`). Names only. Never write a secret value here.
- <worker>: <var or secret name> — <plain var value, or for secrets: where the maintainer gets the value>

## 5. Other things that must be done by hand

Dashboard settings, DNS, Netlify env vars, app store config, third-party keys. Write "None" if none.
- <...>

## 6. How to test on the preview

Step by step, as a person would click. Include a test login if one is needed.
1. Open the Netlify preview URL (the maintainer gets it when they open the pull request for the branch).
2. <...>
3. Expected result: <...>

## 7. Test results

Command run: `<command>`
Result: <paste the summary line, e.g. "153 passed" or "2 failed: <names>">
If anything failed, why, and what it means: <...>

## 8. Rollback

What to do if this breaks production after going live.
- Code: revert the merge commit of the pull request.
- Database: <reverse SQL, or "cannot be reversed; data in column X would be lost">
- Workers: redeploy the previous version from the Cloudflare Deployments tab.

## 9. Open questions for the maintainer

Things the builder was unsure about, or decisions that need a human.
- <...>

## 10. Mirror branch sync

Only for repos with two live branches (mystudentclub: `master` = web, `mobile` = app WebView). Otherwise write "Not applicable".

Mirror branch: `feature/<slug>-<branch>` (pushed)

| Behaviour on the active branch | Done on the mirror branch? | File(s) on the mirror branch | Note |
|---|---|---|---|
| <...> | yes / no / partly | `<path>` | <...> |

Tests on the mirror branch: `<command>` → <result>

Not ported, and why: <...>
