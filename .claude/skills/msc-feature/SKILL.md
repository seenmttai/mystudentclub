---
name: msc-feature
description: Use for any build, change, fix or ship in an MSC repo (mystudentclub, hiremsc, msc-app), including SQL on the MSC Supabase project and MSC Cloudflare Workers. Walks the 10-step flow in which Claude builds the change, checks it and makes it live.
---

# MSC feature flow

MSC's tech is Padam plus Claude, so Claude builds each change and makes it live. These steps replace the reviewer that used to sit in between. Every change can be read in its PR and undone in minutes.

Background: `AGENTS.md` at the repo root, loaded through CLAUDE.md. Its repo note gives the live branch, the test command, where the preview is, and what merging does.

## Steps

1. **Understand and slice.** Say in two sentences what will change and who it is for. Ask Padam only if his answer would change what gets built. Split a big ask into slices, and ship the first useful one before building the next. Check `gh pr list` and `git branch -r` for open work on the same pages.
2. **Worktree.** `git fetch origin <live>`, then `git worktree add ~/development/<repo>-<slug> -b feature/<slug> origin/<live>`. Work only there.
3. **Build and test.** Make small commits that say what changed and why. Run the repo's test command. Never ship with a failing test: fix it, or stop and report.
4. **Pull request.** Run `git push -u origin feature/<slug>`, then `gh pr create --base <live>` with the body from `PR-template.md` in this folder. mystudentclub also has `mobile`: port the logic on `feature/<slug>-mobile` from `origin/mobile`, test it, and open its own PR.
5. **Preview.** Open the preview at desktop and phone width and click through the change. Fix whatever is off. If the preview needs new tables, run the additive SQL from step 7 first.
6. **Review.** Run `/code-review` on the diff. Fix the real findings and say in the PR what was fixed.
7. **SQL** (if any).
   - The migration file goes on the branch, where the repo note says.
   - Back up the tables it touches to `~/development/msc-backups/<date>-<slug>/`: the schema, plus the affected rows as JSON.
   - Run it in one transaction:
     ```bash
     TOKEN=$(security find-generic-password -s msc-supabase-token -w)
     jq -Rs '{query: .}' <file>.sql | curl -sS -X POST \
       https://api.supabase.com/v1/projects/izsggdtdiacxdsjjncdq/database/query \
       -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data @-
     ```
   - Do the additive part first (new tables, columns, functions, policies), so the old code keeps working.
   - SQL that drops, deletes, truncates, removes a column or loosens RLS: stop and ask Padam.
   - If the Keychain has no token, stop. Tell Padam "the SQL is waiting for the Supabase key" and leave the PR open.
8. **Workers** (if any).
   - Run `npx wrangler deploy --dry-run --outdir <tmp>` and compare it with the live bundle.
   - Then run `npx wrangler deploy` and write the version id in the PR.
   - Secrets: `security find-generic-password -s <item> -w | npx wrangler secret put <NAME>`.
9. **Merge and check live.**
   - Order: SQL, then Workers, then merge.
   - Merge with `gh pr merge <n> --squash`. If that is denied, use `gh api -X PUT repos/seenmttai/<repo>/pulls/<n>/merge -f merge_method=squash`.
   - Within 10 minutes, run the main flow on the live site and check the console.
   - If it's broken, undo at once: `git revert` the squash commit and push it to the live branch, run `npx wrangler rollback`, and run the reverse SQL from the PR. Then tell Padam.
10. **Close the loop.** Set the Notion Tasks card to Done, with the PR and the live link. Tell Padam in one line: "Live: <what> · <link>".

## Ask Padam first

- Money: prices, payments, PayU, the `checkpayment` Worker.
- Destructive SQL, or anything that exposes student data.
- Messages to many students or recruiters: mail, WhatsApp, push.
- App Store or Play submissions.
- Legal or consent text, and anything published under Padam's name.

## Red flags: stop and go back to the steps

- A test is failing and you are about to merge.
- You haven't opened the preview.
- You're about to run SQL with no backup folder, or SQL that drops or deletes.
- You're about to run `wrangler deploy` without the dry-run comparison.
- You're about to tell Padam something is live before checking the live site.
- A mystudentclub web feature is on only one of `master` and `mobile`, and the PR doesn't say why.
- A secret value is in a file, a commit, a PR body or terminal output.
