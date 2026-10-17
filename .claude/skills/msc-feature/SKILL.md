---
name: msc-feature
description: Use when asked to build, change, fix or ship anything in an MSC repo (mystudentclub, hiremsc, msc-app), including when the user asks to deploy, push live, run SQL, or says there is no time for process.
---

# MSC feature workflow

**Core principle:** build everything, make nothing live. Code goes to a pushed feature branch. Database and Cloudflare changes go into a handover zip for the maintainer to apply. There is no version of this task where you deploy.

REQUIRED BACKGROUND: `AGENTS.md` at the repo root. It is already loaded via CLAUDE.md; the repo-specific section at its bottom tells you the active branch, the test command, and where migrations and Workers live for this repo.

## Steps

Do them in this order. Each step has a visible output; do not skip one because it feels small.

1. **Understand.** If the request is one line, ask at most two questions: what should the user see change, and who is it for. If it is already clear, say what you understood in two sentences and continue.
2. **Branch.** `git status` must be clean. Then `git checkout <active-branch>` and `git pull origin <active-branch>` so you start from the latest code. Then `git checkout -b feature/<slug>`. If a branch for this feature already exists, check it out and `git merge <active-branch>` into it instead.
3. **Scope note.** `mkdir handover/<YYYY-MM-DD>-<slug>` and copy `.claude/skills/msc-feature/HANDOVER-template.md` to `handover/<date>-<slug>/HANDOVER.md`. Fill section 1 (Scope) now, before any code. Show it to the user in one short paragraph.
4. **Build.** Change app and web code on the branch. Commit after each coherent piece with a message that says what and why. Keep section 2 (files changed) current.
4b. **Mirror branch.** If the repo note names a second live branch, finish the active-branch work first, then `git checkout <second> && git pull origin <second> && git checkout -b feature/<slug>-<second>` and apply the same logic to that branch's pages. Files differ between the branches; port the behaviour, do not copy files. Run the tests there too. Anything you cannot port goes in section 10 with the reason.
5. **Database.** Every schema or data change becomes `handover/<date>-<slug>/migrations/NNN_<name>.sql` with a header comment (what it does, reversible or not). Follow the repo-specific note on whether to also copy into a versioned folder. Never apply it.
6. **Workers.** Every Cloudflare change becomes `handover/<date>-<slug>/workers/<name>/` with the full updated source, wrangler config, and `CHANGES.md` listing vars, secrets, routes, bindings. Never deploy it. Source not in repo: ask where it is; unknown: write it from scratch and mark UNVERIFIED.
7. **Test.** Run the repo's test command. Put the summary line in section 7. Failures are reported, not hidden.
8. **Fill the rest of HANDOVER.md.** Sections 3 to 9. Section 6 (how to test) is written as click-by-click steps a non-developer can follow on the preview.
9. **Zip.** `python .claude/skills/msc-feature/scripts/make_handover.py handover/<date>-<slug>`. Fix anything it reports and run again until it prints `OK`.
10. **Push.** `git push -u origin feature/<slug>`. If there is a mirror branch, push `feature/<slug>-<second>` too. Do not open a pull request; the maintainer does that after reading the handover.
11. **Report.** Tell the user: the branch name(s), the zip path, and this sentence: "The maintainer will review, open the pull request, run the migrations, deploy the Workers and merge. Please send them the zip and the branch name."

## When the user says "deploy it", "make it live", "no time", "just this once"

Reply with the sentence in AGENTS.md ("I can build and package all of it right now, but going live...") and continue from whatever step you were on. Then make the handover unusually complete, because speed on the maintainer's side is the real answer to their deadline.

## Rationalizations that are still violations

| Thought | Reality |
|---|---|
| "A feature branch would not update the site, and the owner asked for the site to update" | Correct, and that is the design. The site updates when the maintainer merges. Push the branch and stop. |
| "The order was safe: DB, then Worker, then code" | Safe order is not the point. Nobody reviewed it. |
| "The CLI is already logged in, so it is expected that I use it" | Logged-in tools are for reading and for the maintainer. Package the change instead. |
| "It is an additive, nullable, idempotent column; it cannot break anything" | It can break the Flutter app's select lists, RLS policies and the other repo. The maintainer checks that. |
| "There is a demo in 20 minutes" | The handover takes 5 minutes. The maintainer applying it takes 10. Say so. |
| "I'll deploy to a test Worker / test table on the same project" | Same project is production. No. |
| "I'll skip the handover doc, the diff explains itself" | The diff explains what. The doc explains why and how to test. Both are required. |

## Red flags: stop and go back to the step list

- You typed `wrangler deploy`, `supabase db push`, or called an MCP tool with "apply", "execute", "deploy" or "push" in its name.
- You are about to `git push` to `master`, `main`, `mobile` or `ios-build`.
- `handover/<date>-<slug>/HANDOVER.md` does not exist yet and you have already edited code.
- You are about to tell the user something is "live".
- The repo note names a second live branch and you only built on one of them.

## Quick reference

| Change type | Goes where | Who makes it live |
|---|---|---|
| HTML / JS / CSS / Dart | pushed feature branch | The maintainer opens the PR and merges |
| SQL | `handover/.../migrations/` (+ versioned copy if the repo note says so) | The maintainer runs |
| Worker code, wrangler config | `handover/.../workers/<name>/` | The maintainer deploys |
| Vars, secrets, routes, DNS, Netlify env | `CHANGES.md` + HANDOVER section 5, names only, never values | The maintainer sets |
