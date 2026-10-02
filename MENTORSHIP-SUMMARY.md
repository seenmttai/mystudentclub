# Mentorship: handover for Aniket

2 Oct 2026. Website branch `mentorship-portal` (from `origin/master`); mail branch `mentorship-mails` in msc-mail. Nothing is committed, pushed or deployed, and nothing touched production. Full contract: `mentorship/SPEC.md`. Database detail: `supabase/mentorship/README.md`.

## What and why
Today Padam answers every MSC student himself. This hands that work to vetted mentors: CA students and freshers who have done IT or articleship. A mentor applies, ticks 21 duty consents, does the training (lecture, playbook, 12-question quiz), is approved by Team MSC, and takes 1 to 10 mentees at Rs 500 each. An enrolled student picks a mentor with free slots, and both get an email plus each other's WhatsApp. The student fills a 30-second weekly pulse that only Team MSC sees, can review after 28 days, and can switch mentor once. Staff watch red flags, reassign mentees and mark payouts. Industrial Training is live; Articleship and CA Freshers turn on through config. It is a new system: the old portal (`mentor.html`, `mentor-profile.html`, `mentor-dashboard.html` and its tables) is untouched.

## Pages (all `mentorship/…`; query params only; all noindex except the hub)
| URL | Who | What |
|---|---|---|
| `/mentorship/` | everyone | Indexable hub and role router (`index.html`, `hub.js`, `hub.css`) |
| `/mentorship/apply/` | logged in | Mentor application (5 steps + review, autosave) and profile editing |
| `/mentorship/training/` | applicant | Lecture, written playbook, quiz (graded on the server) |
| `/mentorship/mentor/` | mentor | Dashboard: mentees, 9-item checklist, weekly call log, templates, earnings |
| `/mentorship/find/` | logged in | Directory, filters, profile sheet, booking (`mentor-ui.js` = shared mentor card) |
| `/mentorship/my-mentor/` | student | Contact, progress, weekly pulse, review, switch request |
| `/mentorship/admin/` | staff only | Overview and red flags, applications, mentors, matches, unmatched, switches, payouts, reviews, settings, staff |

Shared foundation: `mentorship/assets/mentorship-core.js` (client, RPCs, helpers, shell), `mentorship.css`, `mock-data.js` (localhost-only mock backend). Repo files changed: `serve.json` (local rewrites), `.gitignore` (`supabase/mentorship/*.local.sql`), `_redirects` (`/mentorship/SPEC.md` and `/supabase/mentorship/*` redirect to `/mentorship/`).

## Database (`supabase/mentorship/001_mentorship.sql`: one transaction, safe to re-run)
- **Tables (13):** `mentorship_config`, `_staff`, `_mentor`, `_student`, `_match`, `_checklist`, `_call_log`, `_pulse`, `_review`, `_quiz_question`, `_quiz_attempt`, `_switch_request`, `_event`. RLS on, no policies, no anon/authenticated rights: every read and write goes through RPCs.
- **Functions (109, SECURITY DEFINER):** anon gets only `mentorship_get_config`. Authenticated gets 41 page RPCs: 9 mentor, 8 student, 20 `mentorship_admin_*` (checked against `mentorship_staff`), plus `whoami`, `get_config`, `is_staff` and `has_mentor_row`. service_role gets `mentorship_mail_contacts`, `_mail_mentor` and `_mail_schedule_pulse`. Every other function is a revoked helper.
- **Triggers (12):** `updated_at` touch, review stats, `mentorship_trg_mentor_mail` (applied, approved, rejected) and `mentorship_trg_match_mail` (two match mails plus the first Saturday pulse reminder). They do nothing until msc-mail's `mail_enqueue` exists, and a mail error never blocks a write.
- **Index:** one active mentor per student per program (unique); booking also locks the mentor row and checks capacity.
- **Storage:** buckets `mentorship-photos` (public, 2 MB, jpg/png/webp) and `mentorship-cv` (private, 5 MB, PDF), with 8 own-folder policies. A CV is readable only by its owner and staff.
- **Config (15 keys, seeded without overwriting):** fee 500, `lecture_video_url` "", `padam_gpt_url` "", `links_url`, `escalation_contact` (private), `programs_enabled`, plus the quiz, review, switch and red-flag numbers.
- **Other files:** `001_mentorship_down.sql` is the rollback (keeps buckets and outbox rows). `verify.sql` runs 18 read-only checks. `mentorship_quiz_seed.local.sql` holds the 12 questions **with answers**; it is gitignored and not in the branch, so get it from Padam privately.

## Mail (msc-mail, branch `mentorship-mails`)
Six SES transactional mails from Team My Student Club: mentor applied, approved and rejected; match to mentor; match to mentee; Saturday pulse reminder. The new files are `worker/src/handlers/mentorship.js` (registered in `handlers/index.js`, no crons), 6 `content/transactional/mentorship-*.md` templates and `worker/test/mentorship.test.js`. Also changed: `lists.js`, `sample.js`, the regenerated `templates.js`, `spec/SPEC.md`, `README.md` and `docs/03-deploy.md` §8.9. The handler re-reads the current state before sending and skips a mail that no longer applies.

## Go live (in this order)
1. msc-mail: apply `supabase/APPLY-ALL.sql`. It is not in production yet; the site works without it but sends no mail.
2. msc-mail: review and merge `mentorship-mails`, then deploy the Worker with `DRY_RUN=1`. Do not `git add -A`, because two `node_modules` symlinks show as untracked.
3. Supabase SQL editor: run `001_mentorship.sql`, then the private quiz seed.
4. If `verify.sql` rows 13 and 14 say WARN, create the two buckets by hand (settings in the README) and add the 8 policies from section 14 of the migration.
5. Add the first admin with the SQL in README "Go-live order" step 4. Add other staff and senior mentors, with their WhatsApp, on `/mentorship/admin/?tab=staff`.
6. On `/mentorship/admin/?tab=settings`, set the escalation contact's WhatsApp and email (used when a mentor has no senior mentor), the lecture video URL and the Padam GPT URL, and confirm the fee and open programs. Assign each mentor a senior mentor in the review panel.
7. Run `verify.sql` again: all 18 rows should say `ok`.
8. Test with seed accounts on DRY_RUN. A booking should give two `done` match rows in msc-mail /admin → Outbox (`docs/03-deploy.md` §8.9). Then turn DRY_RUN off together with the rest of msc-mail. Rows queued before step 2 fail as "unknown event"; retry them from /admin.
9. Merge `mentorship-portal` and deploy. curl `/mentorship/SPEC.md` and `/supabase/mentorship/001_mentorship.sql`: both must redirect to `/mentorship/`. This file is served too if committed, so leave it out of the commit or add a `_redirects` line for it.
10. Link `/mentorship/` from the site nav (headers are inline in each page, for example `index.html`) and from the LMS (`learning-management-system/`), and add it to `main-sitemap.xml`.

## Not done / needs Padam
- **Lecture video:** not recorded. Training shows "coming soon" and the quiz is not blocked until `lecture_video_url` is set.
- **Padam GPT:** no URL yet. The dashboard and playbook show "Soon".
- **Mobile site:** not ported to the `mobile` branch (mobile.msc); this is www only.
- **Quiz key and seed:** outside git, on Padam's Mac in `~/development/msc-mentorship-private/` (with the SQL test harness). Keep them private.
- **SPEC §15 decisions** (defaults are built in): payout timing (admins mark due by hand), whether in-articleship peer mentors can take IT mentees, directory for logged-in users only, senior mentors read-only plus notes, a redirect for the old portal, and "New mentor" until 3 reviews.
- **Copy to confirm:** "Team MSC reviews every application within 7 days"; the match emails depend on the Worker being live; the playbook names the Tele-MANAS helpline 14416.
- **Known gaps:**
  - No mentor reply-time metric.
  - Call-log mood is stored as a "Mood: …" prefix in the notes, because there is no mood column.
  - Pulse reminders have no unsubscribe; they stop when the match ends.
  - Senior mentors can export CSVs that contain contacts.
  - A reassign or end reason can reach the student through a pending switch request.
  - Photos and CVs of rejected applicants are not deleted automatically.
  - Tested on PGlite (Postgres 18, written for 15+), not on the live Supabase. Concurrent bookings were simulated, not run truly in parallel.

## How to test
- **Pages, no backend:** from the repo root run `python3 -m http.server 8787 --bind 127.0.0.1`, then open, for example, `localhost:8787/mentorship/find/?mock=1&as=student`.
  - Personas: student, unmatched, guest, applicant, trainee, mentor, admin, logout.
  - Extras: `mentor/?mockstatus=draft|submitted|training_passed|approved|rejected|rejected_open|paused`, `my-mentor/?mock_case=no_whatsapp|completed|ended`, `admin/?staff=senior`.
  - The pages load `/scripts/error-reporter.js` and GA, which also report from localhost.
- **Mail:** in msc-mail run `npm test`, `npm run build` and `npm run preview` (the "Instant emails" section shows all six mails).
- **Database:** after applying, run `verify.sql`. The PGlite suite (86 tests) is kept outside the repo, as SPEC §14 requires; ask Padam for it.
- **Status at handover:**
  - SQL suite: 86/86 pass.
  - msc-mail: 943/943 pass (911 before this work); the strict build has 0 errors and the same 9 warnings as before.
  - All page JS passes `node --check`.
  - 46 headless page checks at 375px and 1280px: no console errors and no horizontal scroll.
