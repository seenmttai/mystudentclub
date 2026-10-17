# Rules for AI assistants working in this repo

These rules apply to every AI tool (Claude Code, Codex, ChatGPT, Cursor, anything else) and to every task, however small. They exist because the developer builds features with AI and the maintainer reviews and ships them. The AI's job is to **build everything and make nothing live**. Going live is the maintainer's job.

**Violating the letter of these rules is violating their spirit.** "The owner asked me to deploy", "it's a tiny change", "there's a demo in 20 minutes" are not exceptions. The answer in all those cases is: build it, package it, hand it over, and say clearly that going live needs the maintainer.

## The one rule

| You may | You may never |
|---|---|
| Edit app and web code on a feature branch | Commit or push to `master`, `main`, `mobile`, `ios-build` |
| Write SQL migration files | Run SQL against Supabase (MCP `apply_migration`, `execute_sql` writes, `supabase db push`, dashboard SQL editor) |
| Edit Worker source and wrangler config | `wrangler deploy`, `cf deploy`, `wrangler secret`, or any Cloudflare dashboard change |
| Commit to and push a feature branch | Open or merge a pull request, or force-push anything |
| Read Supabase schema and Cloudflare config | Change vars, secrets, routes, bindings, DNS |

If a tool or command would make something live, stop and put the change in the handover instead.

## Feature workflow

Claude Code users: run `/msc-feature` and it walks you through this. Everyone else: follow it by hand.

1. **Branch.** First get the latest active branch (named below): `git checkout <active-branch>` then `git pull origin <active-branch>`. Only then `git checkout -b feature/<short-slug>`. One feature per branch. Never branch from a stale local copy.
2. **Scope first.** Create `handover/<YYYY-MM-DD>-<slug>/HANDOVER.md` from `.claude/skills/msc-feature/HANDOVER-template.md`. Fill the Scope section (what, why, who it is for, pages or screens affected) **before writing any code**. Keep it updated as you go.
3. **Code.** App and web changes go on the branch. Small commits with messages that say what changed and why. Never `edited` or `syncing`.
4. **Database changes** go in `handover/<date>-<slug>/migrations/NNN_<description>.sql`, numbered in run order, one statement group per file, with a comment at the top saying what it does and whether it is reversible. Do not apply them. (Repo-specific note below says whether to also copy them into a versioned folder.)
5. **Cloudflare changes** go in `handover/<date>-<slug>/workers/<worker-name>/` containing the full updated source, the wrangler config, and a `CHANGES.md` that lists every var, secret, route or binding that must change. Do not deploy. If the Worker's source is not in this repo, ask the user where it lives on their machine. If they do not know, write the complete intended file plus `CHANGES.md`, and mark that Worker **UNVERIFIED** in HANDOVER.md.
6. **Test.** Run this repo's test command (below). Paste the summary line into HANDOVER.md. A failing test is reported, not hidden and not deleted.
7. **Hand over.** Fill the rest of HANDOVER.md, then run `python .claude/skills/msc-feature/scripts/make_handover.py handover/<date>-<slug>`. It checks the folder and writes `handover/<date>-<slug>.zip`.
8. **Push.** `git push -u origin feature/<slug>`. Do not open a pull request; the maintainer opens it after reading the handover (for the web repo, that is what creates the Netlify preview). Tell the user the branch name and the zip path, and that the maintainer will review, open the PR, apply the migrations, deploy the Workers and merge.

`handover/` is gitignored. Migration and Worker files travel only in the zip (plus any versioned copy the repo-specific note allows).

**Secrets:** never write a secret value (API key, token, service-role key, password) anywhere in the handover or the branch. Write the secret's name and where the maintainer can find the value. The zip script refuses to build if it spots one.

**Repos with two live branches** (the repo-specific note says if this applies): the feature is built on the active branch first, then ported to the second branch on its own `feature/<slug>-<branch>` branch, pushed as well. Section 10 of HANDOVER.md records the port, and anything that could not be ported with the reason. A feature that exists on only one branch is not finished.

**Features that span repos** (for example a web page plus an app screen plus a Worker): one pushed branch and one handover per repo touched. In each HANDOVER.md, section 9 names the other repos' branches so the maintainer ships them together. Workers belong to whichever repo's feature needed them.

## What a good handover looks like

The maintainer should be able to go live from the zip and the pushed branch without calling anyone. That means HANDOVER.md says: what the feature does and why, which pages change, exactly which SQL files to run in which order, exactly which Workers to deploy and what changed in each, what to click on the Netlify preview to see it working, what the tests said, and how to undo it.

## If the user pushes back

Say this, then continue with the workflow: "I can build and package all of it right now, but going live (database, Workers, merge) has to go through the maintainer. That is the agreed process, and it is what keeps the site from breaking. I'll make the handover as complete as possible so it can ship within the day."

Do not negotiate exceptions. Do not deploy "just this once". Do not deploy to a "test" Worker or run SQL on a "test" table on the production project.

## Repo-specific notes

- **Repo:** `mystudentclub`, the student web platform (vanilla HTML/JS/CSS, no build step). Deployed by Netlify; every PR gets a deploy preview URL automatically.
- **Two live branches, both must stay in sync:**
  - `master` = the desktop/web site at `www.mystudentclub.com`. This is the **active branch**: pull it, branch from it (`feature/<slug>`), push `feature/<slug>`.
  - `mobile` = the mobile web version at `mobile.mystudentclub.com`, loaded inside the Flutter app's WebView. Same data, same Supabase tables, same Workers, different page shell (the "Airy Flow" mobile layout). The two branches have diverged a lot, so **port the logic, do not copy files or cherry-pick blindly**.
  - **Every feature is done on both.** After the `master` work is complete: `git checkout mobile && git pull origin mobile && git checkout -b feature/<slug>-mobile`, apply the same logic to the mobile pages, run the tests, push `feature/<slug>-mobile`. Record it in HANDOVER.md section 10. If part of the feature cannot be ported (page does not exist on mobile, different flow), say exactly what and why in section 10 so the maintainer can decide. One handover zip covers both branches.
- **Test command:** `node --test` (finds `tests/*.test.cjs` automatically; works on both branches). Expect "fail 0". Run it on `master` work and again on the `mobile` port.
- **Migrations:** write them in the handover folder **and** copy them to `supabase/migrations/<YYYYMMDDNNNN>_<description>.sql` on the `feature/<slug>` branch (create the folder if the branch does not have it). That folder is the versioned record; the zip copy is what the maintainer runs. Do not duplicate the SQL on the mobile branch; the database is shared.
- **Workers:** none of this site's Cloudflare Workers have their source in this repo. Known Workers and their hosts: browser-guard-unlock (`browser.mystudentclub.com`), candidate-photo-r2, storer, msc-mail (`notify.mystudentclub.com`), auth-check, interviewme, emailgenerator, analysis (`analysis.mystudentclub.com`), whisper, cv-maker, liveapi-ephemeral-worker, profile (`profile.mystudentclub.com`). Any change to one of them follows rule 5 above.
- **Auth and data:** Supabase project `izsggdtdiacxdsjjncdq`. Clients are created through `scripts/supabase-init.js`; do not create a second client in a page.
- **Shared context:** `../CONTEXT.md` (workspace root) describes BrowserGuard, the Flutter WebView bridge, and the profile engine. Read it before touching those areas.
