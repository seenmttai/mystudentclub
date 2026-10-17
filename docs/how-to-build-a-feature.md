# How to build a feature with Claude (for the developer)

This is the short version of the process the team agreed on. The goal: the developer builds whenever they want, the maintainer ships it within a day, and nothing breaks on the live site.

## The one rule

**Claude builds everything. Claude makes nothing live.**

Going live means: running SQL on Supabase, deploying a Cloudflare Worker, changing anything in a dashboard, or merging into the main branch. Those four things belong to the maintainer. Everything else belongs to the developer and Claude.

Why: when a change goes live without a trail, the maintainer cannot see what changed, cannot test it, and cannot undo it. That is where the weeks go. When it arrives as a branch plus a handover zip, it can be reviewed and shipped the same day.

## What the developer does

Open Claude Code inside the repo to change (`mystudentclub`, `hiremsc` or `msc-app`) and type:

```
/msc-feature
```

Then describe the feature in plain words. Say what it should do, who it is for, and why. Claude will ask a couple of questions, write a scope note, build the feature on a branch, run the tests, and prepare the handover.

Useful prompts:

- **Start:** `/msc-feature Add a LinkedIn URL field to the student profile so recruiters can see it.`
- **Continue later:** `/msc-feature Continue the linkedin-url feature on branch feature/linkedin-url.`
- **Finish:** `/msc-feature Hand over the linkedin-url feature.`

Claude will refuse to deploy or run SQL even when asked. That is on purpose. If it ever does deploy something, tell the maintainer the same day.

## What comes out at the end

1. A branch pushed to GitHub, named like `feature/linkedin-url`. The maintainer opens the pull request from it, which creates a Netlify preview link (for the web site) where the feature can be clicked through before it goes live.
2. A zip file in the `handover/` folder of the repo, named like `2026-10-18-linkedin-url.zip`. It contains the handover document, any SQL files, and any Worker files.

Send the maintainer the branch name and the zip. That is all they need.

## What the maintainer does

Reads the handover, opens the pull request, tests on the preview, runs the SQL, deploys the Workers, merges. Anything unclear gets asked on the pull request. Target: live within 24 hours of receiving it.

## One-time setup on the developer's machine

1. **Supabase MCP in read-only mode.** In the file where the Supabase MCP server is configured (usually `~/.claude.json` or the Claude settings), add `--read-only` to its arguments and restart Claude Code. Claude can then read tables but physically cannot change them.
2. **Cloudflare token read-only.** If Claude or GPT has a Cloudflare API token, replace it with one that has only Read permissions (Workers Scripts: Read, Account Settings: Read). The human dashboard login stays as it is.
3. **Pull the latest branch** in each repo so the new `AGENTS.md`, `CLAUDE.md` and `.claude/` folder are there. They make all of this automatic.
4. **Open Claude inside the repo folder**, not a parent folder. The safety rules only load when Claude starts in `mystudentclub`, `hiremsc` or `msc-app` itself.
5. **Share the MCP server names with the maintainer.** Open Claude Code and type `/mcp`; it lists them. The block list needs the exact names (for example `supabase`, `cloudflare`). If a name is different from what the block list assumes, it will not catch that server.

If the developer uses ChatGPT or Codex instead of Claude, it reads the same `AGENTS.md` file and should follow the same steps by hand. Ask it to "follow AGENTS.md" at the start.
