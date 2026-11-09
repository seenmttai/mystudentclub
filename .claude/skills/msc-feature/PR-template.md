## What

<2–4 plain sentences: what changes, and for whom>

## Why

<Who asked for it, plus the Notion task link>

## How to check

1. Preview: <link>. For hire.msc, use `npm run dev:talent`. For the app, give the local steps.
2. <click by click>

Expected: <...>

## Tests and review

- `<test command>` → <summary line>
- `/code-review`: <what it found and what was fixed>

## SQL and Workers

- SQL: `supabase/migrations/<file>.sql`, run <date>, backup in `~/development/msc-backups/<date>-<slug>/`. Or "None".
- Workers: `<name>` version `<id>`, dry-run compared with live. Or "None".
- Secrets, vars or routes changed: <names only, never values>. Or "None".

## How to undo

- Code: revert this PR's squash commit on the live branch.
- Database: <the reverse SQL, or what can't be undone>
- Workers: `npx wrangler rollback` to `<previous version id>`

## Other branches and repos

<mystudentclub: link the `mobile` PR, or say what couldn't be ported and why. For a feature that spans repos, link the other PRs.>
