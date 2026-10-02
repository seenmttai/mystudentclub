# MSC Mentorship: database

The Supabase side of `/mentorship/` (see `/mentorship/SPEC.md` §3 to §6). Cloudflare Pages serves every committed file, so nothing here holds a secret or a quiz answer. `_redirects` also sends `/supabase/mentorship/*` back to `/mentorship/`, so these files are not served as pages; check that after each deploy.

| File | What it is |
|---|---|
| `001_mentorship.sql` | The migration. One transaction, safe to re-run. 13 `mentorship_*` tables, 109 functions, 12 triggers, 2 storage buckets, 8 storage policies, 15 config keys. |
| `001_mentorship_down.sql` | Rollback. Drops everything the migration created, by exact name. Keeps the storage buckets and their files. |
| `verify.sql` | Read-only checks, one row each (18 rows). Everything should say `ok`. |
| `mentorship_quiz_seed.local.sql` | **Private and gitignored** (`supabase/mentorship/*.local.sql`). The 12 quiz questions **with answers**. Never commit, upload or paste it anywhere public. |

## Go-live order

1. msc-mail `supabase/APPLY-ALL.sql` (not in production yet). Optional for the site to work: until it exists, the mail triggers do nothing and never fail.
2. Deploy the msc-mail Worker with the mentorship handlers, still on `DRY_RUN=1`.
3. Run `001_mentorship.sql` in the Supabase SQL editor, then `mentorship_quiz_seed.local.sql`.
4. Add the first admin by hand (everything after that is done on `/mentorship/admin/`):

   ```sql
   insert into public.mentorship_staff (user_id, role, name, email)
   select id, 'admin', 'Team MSC', email from auth.users where email = '<admin email>';
   ```
5. Run `verify.sql`. Before step 1 and step 4, rows 17 and 18 say `WARN`; that is expected.
6. Test with seed accounts, then switch msc-mail `DRY_RUN` off.
7. Deploy the site.

If the SQL editor cannot write to `storage` (rows 13 and 14 of `verify.sql` say `WARN`), create the buckets in Supabase Storage: `mentorship-photos` (public, 2 MB, `image/jpeg`, `image/png`, `image/webp`) and `mentorship-cv` (private, 5 MB, `application/pdf`). The policies to add on `storage.objects` are in section 14 of the migration.

## Quiz seed

The seed is a plain upsert into `public.mentorship_quiz_question (id, position, prompt, options, correct_key, explanation, active)`. Questions missing from the file are switched off (`active = false`), never deleted. It is built from the private quiz key, which Team MSC keeps outside this repo. The answer key never leaves the database: `mentorship_quiz_questions()` returns prompts and options only, and grading happens in `mentorship_submit_quiz()`. If no questions are seeded, the quiz returns an empty list and a submit fails with `quiz_locked` (hint `no_questions`), so nobody can pass an empty quiz.

## Security model

- Every `mentorship_*` table has RLS on, no policies, and no rights for `anon` or `authenticated`. All reads and writes go through `SECURITY DEFINER` functions with `search_path = public, pg_temp`.
- `anon` can call only `mentorship_get_config()`, which returns public config keys only (the escalation contact is private). `authenticated` can call the 41 page RPCs, including `mentorship_is_staff()` (the CV read policy) and `mentorship_has_mentor_row()` (the upload policies). The three `mentorship_mail_*` functions are `service_role` only. All other helpers are revoked from `public`, `anon` and `authenticated`.
- Staff rights come from `mentorship_staff` (`admin` or `senior_mentor`, `active`), never from hard-coded emails. Senior mentors can read every staff view and edit only the staff note.
- The public mentor shape never contains `user_id`, email, mobile, WhatsApp, ICAI number, scores, CV, screening answers, consents or staff fields. Contact details appear only inside an active match: the mentor's WhatsApp and email to the mentee (the mobile is staff-only), the mentee's to the mentor, and everything to staff. A closed match shows names only.
- Public profile text (city, companies, employer, role, firm, headline, bio, quote) is checked for phone numbers, emails and links on the server (`mentorship_assert_no_contact`), names for letters only (`mentorship_name_ok`), and the Topmate link for a review-platform host (`mentorship_review_url`). Changing the LinkedIn or Topmate link removes the staff tick and logs `profile_link_changed`.
- Staff read what mentees tell Team MSC in confidence, so a live (`approved` or `paused`) mentor cannot be made staff (`invalid_input`, hint `is_mentor`) and active staff cannot be approved as a mentor (`invalid_transition`, hint `is_staff`).
- Only mentor applicants (a `mentorship_mentor` row) can upload to the photo and CV buckets.
- Mail rows carry ids and names only. The Worker fetches contact details at send time through `mentorship_mail_contacts()` and `mentorship_mail_mentor()`. Recipient emails always come from `auth.users`.
- The migration touches no existing table. The old portal (`mentor_profiles`, `mentorship_requests`, `mentorship_relationships`, ...) and any other `mentorship_*` function are left alone by both the migration and the rollback.

## Notes for page and mail builders

These are details the SPEC leaves open, decided here and covered by the tests.

- **Error hints.** `invalid_input` names the field (`mobile`, `scores.inter`, `consents.privacy`, `max_mentees_below_active`, `reason`, ...). `quiz_cooldown` and `review_too_early` give an ISO UTC time (`2026-10-03T09:15:00Z`). `reapply_later` gives a date (`2026-11-01`). `invalid_transition` gives `has_active_mentees`, `last_admin`, `not_pending`, `from_<status>` or `to_<status>`. `forbidden` gives `staff` or `admin` from staff functions, and `mentor_status` from `mentorship_my_mentees` when the mentor is not approved or paused.
- **Autosave.** Unknown keys, and keys not editable in the current status, are ignored. One invalid field fails the whole patch with `invalid_input`, so validate on the client first (core `hasContactDetails`, `isValidPersonName`, `isReviewProfileUrl` use the same rules). In particular, public text with a phone number (also split by spaces or dashes), an `@`, a link or a group link is rejected.
- **Normalisation.** Phones are stored as `91XXXXXXXXXX`. A bare `linkedin.com/in/x` gets `https://`. Lists are trimmed and de-duplicated, and companies are de-duplicated case-insensitively. Ticking `none` together with real conflicts keeps the real ones. `scores` is rebuilt from the known keys only. Photo and CV paths must be inside the caller's own folder (`<uid>/<file>`).
- **Consents.** The first consent time is kept on later saves. Unticking removes it. After submission, consents cannot be changed.
- **Own row.** `mentorship_save_mentor` and `mentorship_my_mentor().mentor` return the full row with `staff_note` always `null`, plus `first_name`, `active_mentees`, `mentees_total`, `slots_left` and `available`.
- **Re-applying.** A rejected mentor whose quiz was already passed goes straight to `training_passed` on resubmission, not `submitted`, so they are not stuck. No applied mail then (it would ask for the training they passed); the apply page shows the in-review screen.
- **Quiz.** Unanswered questions count as wrong. Answers for unknown question ids are not stored.
- **Booking.** `mentorship_book` checks, in order: program known (`invalid_input`), enabled (`program_closed`), enrolled (`not_enrolled`), WhatsApp on the student card (`student_profile_missing`), no active match (`already_matched`), no completed match (`mentorship_completed`), no match Team MSC ended (`mentorship_ended`: staff assign the next mentor), then the locked mentor (`mentor_unavailable`, `cannot_book_self`, `mentor_full`). Any booking race that reaches the unique index also returns `already_matched`.
- **Student card.** `mentorship_student.whatsapp` is nullable because an admin can assign a mentee who never filled the booking form. The card is then made from `profiles` or auth. Until a WhatsApp number exists anywhere, the match shows the `mentee_no_contact` flag instead of `intro_late`, and My mentor asks the student for the number.
- **Unmatched.** This means enrolled in the program (on or after `unmatched_since` when `enrollment.created_at` exists, or with a booking card) and with no `active` or `completed` match. A student whose match `ended` shows up again.
- **Switches.** Reassigning resolves a pending request as `approved`. Ending a match marks its pending request `withdrawn`, which does not count toward the limit.
- **Payouts.** `paid` keeps the old reference when none is given. Any other status replaces the reference, and clears `paid_at` and `paid_by`.
- **Reviews.** A student editing a hidden review does not republish it. A safety flag raises a red flag for 60 days after its last edit.
- **Mails.** Applied: a submission landing on `submitted`. Approved: any move to `approved` except a resume from `paused` (dedupe per status change). Rejected: a new `rejected_at`, queued an hour late, with `rejected_at` and `reapply_after` only (never the reason).
- **Worker RPCs.** `mentorship_mail_contacts()` and `mentorship_mail_mentor()` return `null` for an unknown id, so the handler should skip. `mentorship_mail_schedule_pulse()` returns `null` when the reminder for that Saturday is already queued or the match is not active.
- **Applied-mail dedupe.** The key is per second of `submitted_at` (SPEC §6.2).
- **Photos bucket.** It also has an own-folder `select` policy, so upserts work. Everyone else reads photos through the public URL. Photo paths therefore contain the mentor's auth uid, which is not secret. The apply page deletes a replaced photo or CV once the new path is saved; files of rejected or withdrawn applicants stay until staff remove them in Supabase Storage.

## Tests

The suite runs in PGlite (Postgres 18 in WebAssembly) against a stand-in for Supabase: roles with Supabase's default grants, `auth.users` and `auth.uid()`, `storage`, `profiles` and `enrollment`. It applies msc-mail's real base migration midway, so the mail triggers are tested with and without `mail_enqueue`. It also runs against a second enrollment shape (`uuid text`, no `created_at` or `batch`, no `profiles` table). The suite has 86 checks. Among other things, it checks that the field names match `/mentorship/assets/mentorship-core.js` and the return shapes match `mock-data.js`. Real concurrency (the `for update` lock on the mentor row) cannot be exercised in single-connection PGlite. The unique-index fallback is tested by simulating the race with a trigger.
