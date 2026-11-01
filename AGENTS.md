# Rules for AI assistants working in this repo

My Student Club's tech is run by two people: Padam (the founder) and Claude. Claude builds each change and gets it ready. **Nothing goes live until Padam gives the go.** The go is the Notion Tasks card moved to **Ship it**, or Padam saying "go" or "ship it" for that change in chat. A go for one change never covers another. Before it reaches him, every change gets a branch, a pull request, tests, a preview check and an independent review. After it ships it gets a live check, and it can be undone in minutes.

Claude Code: run `/msc-feature`. It walks through the flow. Any other tool: follow it by hand.

## The flow, for every change

1. **Branch.** Make a new worktree from the latest live branch (named in the repo note below): `git fetch origin <live>` then `git worktree add ~/development/<repo>-<slug> -b feature/<slug> origin/<live>`. One feature per branch. Split a big ask into slices: get the first useful piece ready, then build the next.
2. **Build and test.** Make small commits that say what changed and why. Run the repo's test command. Never ship with a failing test.
3. **Pull request.** Push `feature/<slug>` and open a PR into the live branch. The body uses `.claude/skills/msc-feature/PR-template.md`: what, why, how to check, how to undo, and which SQL and Workers are involved. The PR is the record. Padam doesn't need to read the code. He decides from the preview and the card.
4. **Preview.** Check the change at desktop and phone width. The repo note says where the preview is.
5. **Review.** Run `/code-review` on the diff, which gives a fresh read rather than your own. Fix what's real.
6. **Hand it to Padam and stop.** Set the Notion Tasks card to **Review**, with the PR link and the preview link. Post one comment: what it does in one line, which SQL and Workers it needs, and "Move this card to Ship it to make it live." Don't merge, run write SQL, deploy a Worker or set a secret. Reading live data is fine.

**Steps 7–11 happen only after Padam's go for this change.**

7. **Database.** SQL goes in a migration file on the branch. First back up the tables it touches to `~/development/msc-backups/<date>-<slug>/`. Then run it in one transaction through the Supabase Management API: `POST https://api.supabase.com/v1/projects/izsggdtdiacxdsjjncdq/database/query`, using the token in Keychain item `msc-supabase-token`. Do the additive part first, so the old and new code both work during the rollout.
8. **Workers.** Run `npx wrangler deploy --dry-run --outdir <tmp>` and compare the result with the live bundle. This catches edits made live without a commit. Then deploy, and write the version id in the PR. Secrets go in with `wrangler secret put`, the value piped from Keychain and never echoed or written down.
9. **Merge.** Squash-merge the PR. The repo note says what merging does here.
10. **Live check.** Within 10 minutes, run the main flow on the live site and confirm the console is clean. If it's broken, undo at once (revert the squash commit on the live branch, `npx wrangler rollback`, the reverse SQL from the PR), then tell Padam.
11. **Close the loop.** Set the Notion Tasks card to Done, with the PR and the live link. Send Padam one line: "Live: <what> · <link>".

## Flag these on the card

Every change already waits for Padam's go. When a change touches one of these, say so in the first line of the card comment and the PR, so he sees it before he decides:

- Money: prices, payments, PayU, the `checkpayment` Worker.
- Destructive SQL, or anything that exposes student data: DROP, DELETE, TRUNCATE, removing a column, loosening RLS.
- Messages to many students or recruiters: mail, WhatsApp, push.
- App Store or Play submissions.
- Legal or consent text, and anything published under Padam's name.

## Never

- Force-push, or rewrite history on a live branch.
- Delete a repo, a Supabase project, an R2 bucket, a KV namespace or a Worker.
- Put a secret value (API key, token, service-role key, password) in code, a commit, a PR or a log. Name the secret and where it lives instead.

Building, tests, PRs and previews need no asking. Shipping, after the go, needs the Claude session in Bypass permissions. Auto mode blocks pushes to a live branch as a production deploy. If that happens, say so in one line and don't retry.

## Repo-specific notes

- **Repo:** `mystudentclub`, the student web platform (vanilla HTML/JS/CSS, no build step). **This repo is public.**
- **Two live branches. Every web feature goes on both:**
  - `master` is `www.mystudentclub.com` (Cloudflare Pages project `mystudentclub`).
  - `mobile` is `mobile.mystudentclub.com` (Cloudflare Pages project `mobilemsc`). It is the mobile web version that loads inside the Flutter app's WebView, with the same data and Workers but the "Airy Flow" page shell.
  - The two branches have diverged a lot. **Port the logic. Don't copy files or cherry-pick blindly.**
  - After the `master` PR, make `feature/<slug>-mobile` from `origin/mobile`, test it, and open its PR into `mobile`.
  - Anything that can't be ported: say what and why in the PR.
- **Preview:** every pushed branch gets a Cloudflare Pages preview at once. The URL is in the PR's checks, or `gh api repos/seenmttai/mystudentclub/commits/<branch>/check-runs`.
- **Merging is going live, so it waits for Padam's go:**
  - Merging into `master` deploys www within a couple of minutes. Merging into `mobile` deploys mobile.msc.
  - A GitHub Action commits generated job pages to `master` every 3 hours, so fetch right before branching and before merging.
- **Test command:** `npm ci` once per worktree (dev deps jsdom and pglite), then `node --test`. It finds `tests/*.test.cjs` and works on both branches. Expect "fail 0".
- **Migrations:** `supabase/migrations/<YYYYMMDDNNNN>_<description>.sql`, on the `master` branch only. The database is shared, so don't duplicate the SQL on `mobile`.
- **Workers:** none of this site's Workers keep their source here. Keep it that way, because the repo is public.
  - Known Workers: browser-guard-unlock (`browser.mystudentclub.com`), candidate-photo-r2, storer, msc-mail (`notify.mystudentclub.com`), auth-check, interviewme, emailgenerator, analysis (`analysis.mystudentclub.com`), whisper, cv-maker, liveapi-ephemeral-worker, profile (`profile.mystudentclub.com`).
  - Look for the source on the Mac first (for example `~/development/msc-mail`). If it isn't there, pull the deployed bundle read-only before changing anything.
- **Auth and data:** Supabase project `izsggdtdiacxdsjjncdq`. Clients are created through `scripts/supabase-init.js`. Don't create a second client in a page.
- **Shared context:** `../CONTEXT.md` (workspace root) describes BrowserGuard, the Flutter WebView bridge and the profile engine. Read it before touching those areas.
