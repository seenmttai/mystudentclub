# How we build and ship (Padam + Claude)

Since 31 Oct 2026, MSC's tech is two people: Padam and Claude. Claude builds each change, you give the go, and then Claude makes it live. `AGENTS.md` has the full rules, and `/msc-feature` walks Claude through them.

## For Padam

- Ask in any Claude session, or add a card to Notion Tasks with Who = Claude. One line is enough.
- Claude builds it on a branch, tests it, checks the preview and has it reviewed. The card then moves to **Review**, with a preview link and one line on what it does.
- Happy with it? Move the card to **Ship it**, or say "go" in chat. Nothing goes live without that.
- Claude then makes it live and checks the live site. You get one line back: "Live: <what> · <link>".
- Claude flags it on the card when a change touches:
  - money
  - deleting or exposing student data
  - messages to many students or recruiters
  - store submissions
  - legal text
  - anything under your name
- If something breaks, it gets undone at once and you're told.

## Why every change still gets a pull request

You don't have to read the code. The PR is the record. It says what changed, why, how to check it and how to undo it, so any change can be read and reverted in minutes.

## One-time setup

- **Supabase write access:** a Supabase personal access token, saved on the Mac in Keychain as `msc-supabase-token`. Until it's there, changes with SQL wait.
- **Permissions:** Claude sessions that ship run in Bypass permissions.
