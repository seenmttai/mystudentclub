# MSC Mentorship: build spec

Version 1 · 2 Oct 2026 · Owner: architect.

**This file is public-safe.** Cloudflare Pages serves every file in this repo (`/hirer-security-rls.sql` returns 200 on the live site), so this spec contains no secrets, no quiz answers and no local machine paths. Do not add any. `_redirects` also sends `/mentorship/SPEC.md` and `/supabase/mentorship/*` back to `/mentorship/` (Pages has no 404 rule), so these build documents are not served as pages; check both URLs after each deploy.

---

## 0. What we are building

Padam currently answers every MSC student himself. This system hands that work to vetted mentors while students still feel looked after.

- **Mentors** are CA students and freshers who have done industrial training (IT) or articleship, ideally MSC alumni. Each one:
  - applies through the onboarding form;
  - consents to every duty, one checkbox each;
  - completes the training (lecture, playbook, quiz);
  - is approved by Team MSC;
  - takes 1 to 10 mentees, for a fee of **Rs 500 per mentee** (`config.mentor_fee_inr`).
- **Students** enrolled in an MSC program pick a mentor with free capacity. Both sides get an email and see each other's WhatsApp. The mentor runs a weekly call, CV review, mock interview and joining help. The student fills a 30-second weekly pulse and, after 4 weeks, a review.
- **Staff** (`mentorship_staff`: `admin` or `senior_mentor`):
  - approve, reject, pause and replace mentors;
  - watch red flags;
  - reassign mentees;
  - mark payouts.
- **Programs.** Industrial Training launches now. Articleship and CA Freshers are already in the data model and are switched on through `config.programs_enabled`.

Non-negotiables for every builder:

1. **All database writes go through `SECURITY DEFINER` RPCs.** Every `mentorship_*` table is deny-all for `anon` and `authenticated`, so the client never inserts into or updates a table directly. The only exception is file uploads to Storage.
2. **Contact details stay hidden until matched.** A mentor's WhatsApp and email go only to that mentor's mentees while the match is active, and to staff. The mentor's mobile number is staff-only. A mentee's contact details go only to their mentor while the match is active, and to staff. Closed matches show names only. Public profile text (headline, bio, quote, companies, employer, cities) never carries a phone number, an email or a link.
3. **Escape everything.** Build markup with core `html\`\`` (it auto-escapes) and pass URLs through `safeUrl()`. Never put user data into `innerHTML` raw.
4. **Mobile first.** Every page must look polished at 375px with no horizontal scroll, then scale up to 1280px.
5. **Copy voice** (full rules in §13):
   - speak as "Team My Student Club";
   - keep it warm and Indian-student friendly, using "Hojayega" where it fits;
   - **never promise placement, a job or a referral**;
   - **never say Padam will personally respond**.

---

## 1. Pages

| URL | Files | Owner | Who can use it | Purpose |
|---|---|---|---|---|
| `/mentorship/` | `mentorship/index.html`, `mentorship/hub.js`, `mentorship/hub.css` | admin builder | everyone (indexable) | Landing page and role router |
| `/mentorship/apply/` | `mentorship/apply/index.html`, `apply.js`, `apply.css` | mentor builder | logged in | Mentor onboarding form (autosaved draft) and profile editing |
| `/mentorship/training/` | `mentorship/training/…` | mentor builder | mentor with status `submitted` or later | Lecture, written playbook, quiz |
| `/mentorship/mentor/` | `mentorship/mentor/…` | mentor builder | mentor (`approved` or `paused`; other statuses see a status screen) | Mentor dashboard |
| `/mentorship/find/` | `mentorship/find/…` | student builder | logged in (booking needs enrollment) | Mentor directory, profile sheet and booking |
| `/mentorship/my-mentor/` | `mentorship/my-mentor/…` | student builder | logged-in student | Mentor contact, what to expect, pulse, review, switch |
| `/mentorship/admin/` | `mentorship/admin/…` | admin builder | staff only | Approvals, red flags, matches, payouts, settings |

**Routing rules**
- Cloudflare Pages serves `folder/index.html` at `folder/`. Unknown paths fall back to the homepage with HTTP 200, so use **query parameters, never path segments**:
  - `find/?mentor=<uuid>` opens that mentor's profile sheet.
  - `find/?program=<key>` filters by program.
  - `my-mentor/?program=<key>`, `?pulse=1` (opens the pulse form) and `?review=1`.
  - `mentor/?match=<uuid>` scrolls to and expands that mentee.
  - `mentor/?tab=mentees|earnings|resources`.
  - `training/#lecture`, `#playbook` and `#quiz`.
  - `admin/?tab=overview|applications|mentors|matches|unmatched|switches|payouts|reviews|settings|staff`, plus `admin/?mentor=<uuid>` to open that mentor's review panel.
  - `apply/?step=1..6`.
- Link with the clean form (`/mentorship/find/`) and use **absolute** asset paths.
- `serve.json` already has local-preview rewrites for all seven folders. Cloudflare ignores that file, and nothing goes in `_redirects`.
- Every page except the hub carries `<meta name="robots" content="noindex, follow">`.

---

## 2. Shared foundation (read-only for builders)

The architect owns these files. Builders must not edit them; ask the orchestrator for changes instead.
- `/mentorship/assets/mentorship.css`: the design system, every class prefixed `ms-`.
- `/mentorship/assets/mentorship-core.js`: an ES module with the client, auth, context, RPCs, constants, UI helpers and the shell.
- `/mentorship/assets/mock-data.js`: a mock backend for localhost only. Its handlers return the exact RPC shapes, so it doubles as executable examples of the contract.

### 2.1 Page template (copy exactly, then change the title, description, canonical, page module and `active`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="only light">
  <title>Find a mentor | My Student Club</title>
  <meta name="description" content="…">
  <meta name="robots" content="noindex, follow">            <!-- omit on the hub only -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://www.mystudentclub.com/mentorship/find/">
  <meta property="og:title" content="…"><meta property="og:description" content="…">
  <meta property="og:image" content="https://www.mystudentclub.com/assets/og-image.png">
  <meta property="og:site_name" content="My Student Club">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="https://www.mystudentclub.com/mentorship/find/">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/scripts/portal-style.css?v=2.1">
  <link rel="stylesheet" href="/mentorship/assets/mentorship.css?v=1">
  <link rel="stylesheet" href="/mentorship/find/find.css?v=1">  <!-- optional page CSS -->
  <script src="/scripts/supabase.js"></script>
  <script src="/scripts/supabase-init.js"></script>
  <script src="/scripts/error-reporter.js"></script>
  <link rel="icon" href="https://www.mystudentclub.com/favicon.png" sizes="192x192" type="image/png">
  <link rel="shortcut icon" href="https://www.mystudentclub.com/favicon.ico">
  <link rel="apple-touch-icon" href="https://www.mystudentclub.com/assets/icon-70x70.png">
</head>
<body class="ms-body">
  <main id="ms-main" class="ms-main"><!-- page renders here; the header, sub-nav and footer are injected --></main>
  <script type="module" src="/mentorship/find/find.js?v=1"></script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-1450NCVE65"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-1450NCVE65');</script>
</body>
</html>
```

Page module skeleton:

```js
import { initPage, rpc, html, setContent, showError, skeleton, emptyState } from '/mentorship/assets/mentorship-core.js?v=1';
const main = document.getElementById('ms-main');
setContent(main, skeleton('page'));
const ctx = await initPage({ active: 'find', auth: true });   // active: hub|find|my-mentor|apply|training|mentor|admin
if (!ctx.backendReady) { /* render the "being set up" callout (copy in §13) and stop */ }
```

**Always import with the exact specifier `'/mentorship/assets/mentorship-core.js?v=1'`.** A different query string loads a second copy of the module with its own state. Page-to-page relative imports such as `./mock.js` are fine.

### 2.2 Core API (`mentorship-core.js`)

**Client and auth**

| Function | Notes |
|---|---|
| `getClient()` | The site's shared `window.supabaseClient`. Never create another client. |
| `getSession({wait})` → session \| null | Same fallback chain as the LMS. |
| `getUser()` | |
| `requireLogin()` | Sends the visitor to `/login.html?redirect=<path>` and never resolves. |
| `loginUrl(path?)` | Returns a path only; a full URL breaks Google OAuth. |
| `logout()` | Mirrors the portal's logout, and also clears the mentorship backups (`ms_apply_draft_*`, `ms_quiz_*`) so a shared computer keeps no answers. |
| `nameFromUser(user)` | |

**Context and config**

| Function | Notes |
|---|---|
| `getContext({force})` → `ctx` | One `mentorship_whoami` call, cached. Keys: `{ session, user, email, name, staffRole, isStaff, isAdmin, mentor, student, enrolledPrograms[], activeMatches[], closedMatches[], config, backendReady, error }`. After any write that changes the role or status, call `getContext({force:true})`. |
| `getConfig({force})` | Never throws; falls back to `DEFAULT_CONFIG`. |
| `enabledPrograms(config)` | |
| `isProgramEnabled(config, key)` | |
| `programLabel(key, {long})` | |
| `programCopy(key)` / `PROGRAM_COPY` | Program-specific copy (`openings`, `hunt`, `findLead`, `applyHero`), so pages and the `keep_going` template read right for Articleship and CA Freshers. |
| `isEnrolled(program)` | Client-side LMS logic, for UI only; the server re-checks. |
| `getEnrolledPrograms({force})` → `Set` | |
| `courseToProgram(course)` | |
| `getProfilePrefill()` → `{name, email, phone, city}` | Reads `public.profiles` plus auth metadata. |

**RPCs and errors**

| Function | Notes |
|---|---|
| `rpc(fn, args)` → data | Throws `MsError {code, message (friendly), hint, raw}`. |
| `showError(err, fallback?)` | Shows a toast and returns the `MsError`. |
| `friendlyError(errOrCode)` | |
| `isMissingBackend(err)` | |
| `ERROR_COPY` | Map from error code to friendly copy. |

**Storage**

| Function | Notes |
|---|---|
| `uploadFile('photo' \| 'cv', file)` → path | Photos are downscaled to at most 800px JPEG. Validates type and size. |
| `photoUrl(path)` | |
| `signedUrl(bucket, path, secs)` | |
| `removeFile('photo' \| 'cv', path)` | Deletes one of the user's own uploads (the replaced photo or CV) after the new path is saved. Never throws. |
| `STORAGE` | |
| `UPLOAD_RULES` | |

**Formatting**

| Function | Notes |
|---|---|
| `escapeHtml(v)` | |
| `` html`...` `` | Auto-escapes interpolations, joins arrays, passes `raw()` through. |
| `raw(str)` | |
| `setContent(el, content)` | |
| `safeUrl(u)` | |
| `normalizeUrl(u)` | |
| `isLinkedInUrl(u)` | |
| `isReviewProfileUrl(u)` / `REVIEW_HOSTS` | Topmate (or ADPList, MentorCruise, Superpeer, Unstop, Preplaced) profile links only. Same rule as SQL `mentorship_review_url`. |
| `hasContactDetails(text)` | Phone numbers (also split by spaces or dashes), emails, links and group links. Same rule as SQL `mentorship_has_contact`. |
| `isValidPersonName(name)` | Letters, spaces and `. ' -` only. Same rule as SQL `mentorship_name_ok`. |
| `normalizePhone(p)` | Returns `'91XXXXXXXXXX'`. |
| `isValidIndianMobile(p)` | |
| `formatPhone(p)` | |
| `waLink(phone, text)` | |
| `telLink(phone)` | |
| `mailtoLink(email, subject)` | |
| `fillTemplate(tpl, vars)` | |
| `firstName(name)` | |
| `initials(name)` | |
| `plural(n, one, many)` | |
| `labelOf(list, key)` | |
| `labelsOf(list, keys)` | |
| `stageLabel(key, {short})` | |
| `tierOf(stage)` | |
| `journeyLines(mentor)` → `[{icon, label, text}]` | |
| `formatDate(v)` | IST. |
| `formatDateTime(v)` | IST. |
| `timeAgo(v)` | |
| `istDateKey(v)` | |
| `daysBetween(a, b)` | |
| `daysSince(v)` | |
| `weekNumber(startedAt, at?)` | |
| `istWeekStart(v)` | |
| `monthYearLabel('2027-05')` | |
| `attemptOptions({from, to})` | |
| `formatINR(n)` | Returns `"Rs 1,500"`. |

**UI**

| Function | Notes |
|---|---|
| `$`, `$$` | |
| `qs(name)` | |
| `debounce(fn, ms)` | |
| `setBusy(btn, bool)` | |
| `toast(msg, {type, timeout})` | |
| `openModal({title, body, actions, wide, dismissible, onClose})` → `{el, body, close, buttons}` | A bottom sheet on phones. If an action's `onClick` returns `false`, the modal stays open. |
| `confirmDialog({...})` → `Promise<boolean>` | |
| `emptyState({icon, title, text, action})` | |
| `skeleton('cards' \| 'list' \| 'page', n)` | |
| `loadingBlock(text)` | |
| `statusBadge('mentor' \| 'match' \| 'payout' \| 'switch', key)` | |
| `tierChip(tier)` | |
| `avatarHtml({name, photo_path, size, verified})` | |
| `ratingHtml(avg, count, minReviews)` | Shows "New mentor" below the minimum review count. |
| `starsHtml(rating)` | |
| `copyText(text)` | |
| `toCsv(rows, cols)` | |
| `downloadCsv(filename, rows, cols)` | Guards against formula injection. |
| `embedVideo(url)` → `{kind: 'iframe' \| 'file' \| 'link', src}` | |
| `track(event, params)` | No personal data. |

**Shell**

| Function | Notes |
|---|---|
| `initPage({active, auth, subnav, footer})` → `ctx` | |
| `mountShell(...)` | Injects the site header (same markup as index.html, with **Mentorship** active), the drawer with a Mentorship section, a sticky role-aware sub-nav and the footer, and wires them up. |
| `subnavKeys(ctx)` | |

**Constants** (these keys are the SQL check-constraint values; §3):
- Programs and stages: `PROGRAMS`, `PROGRAM_KEYS`, `COURSE_TO_PROGRAM`, `STAGES`, `TIERS`, `STAGE_REQUIRED`.
- Vocabulary lists: `DOMAINS`, `FIRM_TYPES`, `LANGUAGES`, `CITIES`, `CALL_SLOTS`, `WEEKLY_HOURS`, `EXPERIENCE_YEARS`, `MENTORING_EXPERIENCE`, `CONFLICTS`, `HEARD_FROM`, `MENTEE_CAPACITY`, `IT_DURATIONS`, `HUNT_STAGES`.
- Mentor work: `CHECKLIST_ITEMS`, `DUTIES`, `POLICY_CONSENTS`, `REQUIRED_CONSENTS` (21 keys), `CODE_OF_CONDUCT`, `SCENARIO_QUESTION`.
- Student side: `STUDENT_COMMITMENTS`, `REVIEW_TAGS`.
- Status maps (label plus tone): `MENTOR_STATUS`, `MATCH_STATUS`, `PAYOUT_STATUS`, `SWITCH_STATUS`, `RED_FLAGS`.
- Content: `RESOURCES`, `FIRST_MESSAGES`.
- Defaults and limits: `DEFAULT_CONFIG`, `LIMITS`.
- Paths: `PATHS`, `SITE_ORIGIN`.

### 2.3 CSS reference (`mentorship.css`)

**Theme and tokens**
- The page is locked light (`color-scheme: only light`) because the site has no dark theme. This stops Android and Samsung auto-dark from inverting colours.
- Tokens are `--ms-*`: palette, `--ms-primary` (#2563eb, AA on white), radii, shadows, `--ms-header-h`, `--ms-subnav-h` and `--ms-sticky-top`. **Anything sticky under the sub-nav uses `top: var(--ms-sticky-top)`.**

**Layout**
- `.ms-main`, `.ms-container` (`--narrow` 760px, `--wide`), `.ms-section`.
- `.ms-stack`, `.ms-row`, `.ms-row--nowrap`, `.ms-between`, `.ms-end`, `.ms-grow`. Set the gap with the `--ms-gap` custom property.
- `.ms-grid`, `--2`, `--3`, `--4`, `--auto`.
- `.ms-layout`, `--right`, `.ms-layout__aside` (sidebar from 1024px).
- `.ms-hero`, `.ms-hero__inner`, `.ms-pagehead`, `.ms-back`, `.ms-divider`.
- Utilities: `.ms-hide-mobile`, `.ms-hide-desktop`, `.ms-hidden`, `.ms-sr-only`, plus margin utilities `.ms-mt-8/16/24/32` and `.ms-mb-8/16/24`.

**Typography**
- `.ms-h1`, `.ms-h2`, `.ms-h3`, `.ms-lead`, `.ms-eyebrow`.
- `.ms-muted`, `.ms-text-2`, `.ms-small`, `.ms-xs`, `.ms-strong`, `.ms-center`, `.ms-truncate`, `.ms-clamp-2`, `.ms-clamp-3`, `.ms-link`.
- `.ms-prose` for long text such as the playbook. `.ms-template` is a WhatsApp message block.

**Surfaces**
- `.ms-card` (`--flat`, `--soft`, `--accent`, `--hover`), with `__head`, `__title`, `__sub` and `__foot`.
- `.ms-stats` and `.ms-stat` (`__label`, `__value`, `__sub`; `--warn`, `--danger`, `--good`).
- `.ms-kv`, a `dl` laid out as key/value pairs.

**Buttons**
- `.ms-btn` with `--primary`, `--gradient`, `--secondary`, `--soft`, `--ghost`, `--outline`, `--success`, `--danger`, `--danger-soft`, `--whatsapp`; sizes `--sm` and `--lg`; `--block`.
- `.is-loading` is set through `setBusy`. Wrap button text in `<span>` so the spinner can hide it.
- `.ms-icon-btn`, `.ms-btn-row`, `.ms-btn-row--stack`.

**Chips and badges**
- `.ms-chips`, `.ms-chip`, `.ms-badge`.
- Tones: `.ms-tone-blue`, `-green`, `-amber`, `-red`, `-purple`, `-gray`, `-outline`. Also `.ms-dot`.
- Field visibility tags: `.ms-vis--public` ("On your profile"), `.ms-vis--private` ("Only Team MSC"), `.ms-vis--matched` ("Matched mentees only").

**Forms**
- `.ms-form`, `.ms-form-grid` with `.ms-span-2`.
- `.ms-field` (`.is-invalid` reveals `.ms-error`), `.ms-label`, `.ms-hint`, `.ms-counter` (`.is-over`).
- `.ms-req`: **put it on the text span**: `<label class="ms-label"><span class="ms-req">WhatsApp</span> <span class="ms-vis …">…</span></label>`.
- `.ms-input`, `.ms-select`, `.ms-textarea` (16px font, so iOS does not zoom), `.ms-input-group` with `__addon` (for "+91").
- `.ms-fieldset`, `.ms-form-section` with `__title`.
- Toggle chips: `.ms-choices` > `label.ms-choice` > `input` + `span`.
- Radio or checkbox cards: `.ms-options` (`--2`) > `label.ms-option` > `input` + `.ms-option__mark` + `.ms-option__body` (`__title`, `__desc`). Quiz feedback adds `.is-correct` or `.is-wrong`.
- Consent rows: `label.ms-check` > `input` + `.ms-check__box` + `.ms-check__text` (`strong`, `small`).
- `.ms-switch` > `input` + `.ms-switch__track` + text.
- `.ms-star-input`: radios ordered 5 down to 1, each followed by its label.
- Uploads: `.ms-upload` (the dropzone, with the input inside) and `.ms-file` (`__icon`, `__name`). `.ms-photo-pick`.

**Steppers, progress and saving**
- `.ms-stepper` > `li.ms-step` (`.is-active`, `.is-done`) > `.ms-step__dot` + `.ms-step__label`.
- `.ms-progress` > `.ms-progress__bar` (`--green`, `--amber`, `--red`).
- `.ms-sticky-actions` is the bottom action bar on phones. `.ms-savestate` has `.is-saving` and `.is-error`.

**Navigation and tables**
- `.ms-tabs` > `button.ms-tab` (`.is-active` or `aria-selected`).
- `.ms-table-wrap` > `table.ms-table`. Add `.ms-table--stack` plus `data-label` on each `td` so rows become cards under 640px. `.ms-num` right-aligns numbers.

**Messages and empty states**
- `.ms-callout` (`--success`, `--warn`, `--danger`, `--gray`) with `__title`.
- `.ms-hojayega` prints its own "Hojayega!" label, so don't write it inside.
- `.ms-empty`, `.ms-spinner`, `.ms-loading`, `.ms-skel` (`--line`, `--title`, `--circle`, `--block`).
- Toasts (`.ms-toasts`, `.ms-toast`) and modals (`.ms-modal-backdrop`, `.ms-modal`) are created by core.

**People, mentors and progress views**
- `.ms-avatar` (`--xs`, `--sm`, `--lg`, `--xl`) with `__tick`.
- `.ms-person`, `.ms-rating`, `.ms-stars`.
- Mentor card: `.ms-mentor-card` with `__top`, `__name`, `__stage`, `__headline`, `__journey`, `__meta` and `__foot`. `.is-full` dims it. Slots left use `.ms-slots` (`.is-low`, `.is-full`).
- `.ms-contact` with `__actions`.
- Search and filters: `.ms-search`, `.ms-filterbar` (sticky), `.ms-scroll-x`.
- Mentee checklist: `.ms-checklist` > `.ms-checkitem` (`.is-done`, `.is-due`, `.is-late`) with `__toggle`, `__body`, `__label` and `__meta`.
- `.ms-timeline` > `li` (`.is-muted`, `.is-good`) with `__title` and `__meta`.
- `details.ms-acc` > `summary` + `.ms-acc__body`.
- Video: `.ms-video` (16:9) and `.ms-coming-soon` (`__icon`, `__title`, `__text`). `.ms-soon-pill`.
- `.ms-score`: set `--pct` (0 to 100); `--fail` styles a failed score.

**Page-only CSS** goes in that page's folder with an `ms-<page>-` prefix, for example `.ms-find-filter-sheet`. Never restyle the `ms-*` base classes or `portal-style.css` classes globally.

### 2.4 Mock mode and local preview (no backend needed)

Serve the repo root locally, then open a page with `?mock=1&as=<persona>`:

```sh
cd <website repo root> && python3 -m http.server 8787 --bind 127.0.0.1
# then open http://localhost:8787/mentorship/find/?mock=1&as=student
```

- **Personas:** `student` (matched), `unmatched` (enrolled, no mentor), `guest` (not enrolled), `applicant` (draft mentor), `trainee` (submitted), `mentor` (approved, 3 mentees), `admin`, `logout`.
- **Turning it on and off:** mock mode only runs on localhost, `*.localhost` or `*.test`, and stays on until `?mock=0`. The sub-nav shows a "Mock" pill that switches persona.
- **Add your own mocks** from a page module: `if (isMockMode()) await import('./mock.js')`, where that file calls `registerMocks({...})`. To simulate an error, throw `new MsError('mentor_full')`.
- **Never test against production.** Do not call real RPCs or upload real files with production credentials. Mock mode makes no network calls to Supabase for RPCs, config, enrollment or storage.

---

## 3. Database

### 3.1 Names: avoid the old portal

These tables already exist in production and **must not be touched or reused**:
- `mentor_profiles`, `mentor_areas`, `mentorship_requests`, `mentorship_relationships`, `mentor_reviews`, `forum_user_profiles`, `user_roles`.

These names are referenced by old dead code, so don't create them:
- `mentorship_sessions`, `mentorship_messages`.

New tables use **singular** names under the `mentorship_` prefix. Functions are `mentorship_*`, triggers are `mentorship_trg_*`, and the mail glue is `mentorship_mail_*`. **Nothing is named `mail_*`**; msc-mail's rollback report flags those.

### 3.2 Tables

Every table has RLS on, and **no policies for anon or authenticated** (deny-all). Revoke all from `anon` and `authenticated`. `service_role` keeps its default access, which the Worker uses. All timestamps are `timestamptz`. An `updated_at` column is maintained by `mentorship_trg_touch()`.

**`mentorship_config`**: key/value settings

| column | type | notes |
|---|---|---|
| key | text pk | `^[a-z_]{2,40}$` |
| value | jsonb not null | |
| is_public | boolean not null default true | public keys are returned by `mentorship_get_config()` |
| note | text | |
| updated_at, updated_by uuid | | |

**`mentorship_staff`**

| column | type | notes |
|---|---|---|
| user_id | uuid pk → auth.users on delete cascade | |
| role | text not null | `'admin'` or `'senior_mentor'` |
| name, email, whatsapp | text | whatsapp normalised to `91XXXXXXXXXX` |
| active | boolean not null default true | |
| created_at, updated_at, added_by uuid | | |

**`mentorship_mentor`**: one row per user. It holds the application, the public profile and the status. In the notes column, **P** means public on the profile card, **M** means shown to matched mentees and staff, and **S** means staff only.

| column | type / constraint | vis |
|---|---|---|
| id | uuid pk default gen_random_uuid() | P |
| user_id | uuid not null unique → auth.users on delete cascade | S |
| status | text not null default `'draft'`; one of the §3.3 statuses | S |
| tier | text: `peer_mentor` or `ca_mentor`, derived from the stage at submit | P |
| full_name | text ≤ 80 | P |
| email | text, server-set from auth.users (never from the client) | M |
| mobile | text, normalised `^91[6-9]\d{9}$` | S |
| whatsapp | text, normalised | M |
| city | text ≤ 40 (a CITIES key or free text) | P |
| photo_path | text (bucket `mentorship-photos`, `<uid>/…`) | P |
| linkedin_url | text, https, must contain `linkedin.com/in/` | S, or P when `show_linkedin` |
| show_linkedin | boolean not null default false | |
| topmate_url | text, https on a review-platform host (`mentorship_vocab('review_hosts')` = core `REVIEW_HOSTS`: topmate.io, adplist.org, mentorcruise.com, superpeer.com, unstop.com, preplaced.in, or a subdomain) | P |
| languages | text[] not null default '{}', LANGUAGES keys, 1 to 6 | P |
| stage | text, STAGES keys | P |
| final_attempt | text `^\d{4}-(0[1-9]\|1[0-2])$` | P |
| did_it | boolean (asked only of qualified stages) | P |
| it_company | text ≤ 80 | P |
| it_domain | text, DOMAINS key | P |
| it_duration_months | smallint 1 to 24 | P |
| it_start | text YYYY-MM | P |
| it_city | text ≤ 40 | P |
| articleship_firm | text ≤ 80 | P |
| articleship_firm_type | text, FIRM_TYPES key | P |
| articleship_domain | text, DOMAINS key | P |
| articleship_city | text ≤ 40 | P |
| articleship_year | smallint 1 to 3 (only `in_articleship`) | P |
| qualified_on | text YYYY-MM | P |
| employer | text ≤ 80 | P |
| role_title | text ≤ 80 | P |
| experience_years | text, EXPERIENCE_YEARS key | P |
| icai_number | text ≤ 20 (optional) | S |
| scores | jsonb not null default '{}': `{foundation:{marks,out_of,attempts,exempt}, inter:{marks,out_of,attempts}, final:{marks,out_of,attempts}, rank_note}` | S |
| domains | text[] not null default '{}', DOMAINS keys, 1 to 6 | P |
| companies_known | text[] not null default '{}', ≤ 15 items of ≤ 60 chars | P |
| headline | text ≤ 90 | P |
| bio | text, 120 to 800 | P |
| wish_i_knew | text ≤ 200 | P |
| programs | text[] not null default `'{industrial-training}'`, PROGRAM_KEYS | P |
| max_mentees | smallint not null default 5, 1 to `config.max_mentees_cap` (10) | P (as slots) |
| weekly_hours | text, WEEKLY_HOURS key | S |
| call_slots | text[] not null default '{}', CALL_SLOTS keys | P |
| accepting | boolean not null default true (the mentor's own "taking new mentees" switch) | P |
| cv_path | text (bucket `mentorship-cv`) | S |
| why_mentor | text, 80 to 800 | S |
| scenario_answer | text, 120 to 900 | S |
| mentoring_experience | text, MENTORING_EXPERIENCE key | S |
| conflicts | text[] not null default '{}', CONFLICTS keys (`none` must be alone) | S |
| conflicts_note | text ≤ 300 | S |
| heard_from | text, HEARD_FROM key | S |
| consents | jsonb not null default '{}': `{<consent key>: "<ISO timestamp>"}`, server-stamped | S |
| training | jsonb not null default '{}': `{lecture_at, playbook_at}` | S |
| quiz_passed_at | timestamptz | S |
| quiz_best_pct | smallint | S |
| quiz_attempts | int not null default 0 | S |
| quiz_last_at | timestamptz | S |
| linkedin_checked, topmate_checked | boolean not null default false (staff verification). `mentorship_save_mentor` resets each one when the mentor changes that link, and logs `profile_link_changed` (a new photo of a live mentor too) so staff check again | P (as a badge) |
| staff_note | text | S |
| senior_mentor_id | uuid → mentorship_staff(user_id) on delete set null | S |
| rating_avg | numeric(3,2) | P |
| review_count | int not null default 0 (maintained by trigger) | P |
| submitted_at, approved_at, approved_by, rejected_at, reject_reason, reapply_after (date), paused_at, pause_reason, status_changed_at, created_at, updated_at | | S |

Indexes: `(status)`, and a GIN index on `programs`.

**`mentorship_student`**: the student's contact card. One row per user, written by `mentorship_save_student`.

| column | type |
|---|---|
| user_id | uuid pk → auth.users on delete cascade |
| full_name | text ≤ 80 not null |
| email | text (server-set from auth) |
| whatsapp | text not null, normalised Indian mobile |
| city | text ≤ 40 |
| created_at, updated_at | |

**`mentorship_match`**: the mentee-to-mentor pairing, and the unit that gets paid.

| column | type / notes |
|---|---|
| id | uuid pk |
| program | text not null, PROGRAM_KEYS |
| mentor_id | uuid not null → mentorship_mentor(id) on delete cascade |
| mentee_user_id | uuid not null → auth.users on delete cascade |
| status | text not null default 'active': `active`, `completed`, `switched` or `ended` |
| source | text not null default 'self': `self` (booked), `admin` (assigned) or `switch` (reassigned) |
| previous_match_id | uuid → mentorship_match(id) |
| batch | text (copied from `enrollment.batch` when available) |
| fee_inr | int not null (snapshot of `config.mentor_fee_inr` at creation) |
| payout_status | text not null default 'unpaid': `unpaid`, `due`, `paid` or `void` |
| payout_ref | text ≤ 120 |
| paid_at, paid_by uuid | |
| started_at | timestamptz not null default now() |
| ended_at, end_reason text, ended_by uuid | |
| created_by uuid, created_at, updated_at | |

- **Unique partial index** `(mentee_user_id, program) where status = 'active'`: one active mentor per student per program.
- Index `(mentor_id) where status = 'active'`, used by capacity counts.
- Capacity counts **active matches across all programs** and must be below `max_mentees`.

**`mentorship_checklist`**: PK `(match_id, item)`

| column | type |
|---|---|
| match_id | uuid → mentorship_match on delete cascade |
| item | text, CHECKLIST_ITEMS keys: `intro_sent, first_call, cv_reviewed, resources_shared, mock_interview, offer_received, joining_formalities, joined, joining_post` |
| done_at | timestamptz not null default now() |
| note | text ≤ 300 |
| updated_by uuid, updated_at | |

Unticking an item deletes its row.

**`mentorship_call_log`**: the mentor's weekly call. Unique `(match_id, week_no)`; logging the same week again updates that row.

| column | type |
|---|---|
| id | uuid pk |
| match_id | uuid → match on delete cascade |
| week_no | smallint 1 to 60 |
| called_on | date not null, ≤ today in IST, ≥ the match start date |
| hunt_stage | text, HUNT_STAGES keys |
| applications_count | int 0 to 500 (applications this week) |
| interviews_count | int 0 to 100 default 0 |
| notes | text ≤ 1000 (mentor and staff only) |
| created_by, created_at, updated_at | |

**`mentorship_pulse`**: the student's weekly check-in, private to the student and staff (**the mentor never sees it**). Unique `(match_id, week_start)`; resubmitting in the same week updates it.

| column | type |
|---|---|
| id | uuid pk |
| match_id | uuid → match on delete cascade |
| mentee_user_id | uuid |
| week_start | date (Monday, IST) |
| applications_count | int 0 to 500 |
| hunt_stage | text, HUNT_STAGES keys |
| mentor_called | boolean not null |
| rating | smallint 1 to 5 not null |
| issue | text ≤ 1000 |
| created_at, updated_at | |

**`mentorship_review`**: one per match, editable by the student.

| column | type |
|---|---|
| id | uuid pk |
| match_id | uuid unique → match on delete cascade |
| mentor_id | uuid |
| mentee_user_id | uuid |
| rating | smallint 1 to 5 |
| tags | text[] (REVIEW_TAGS keys, ≤ 3) |
| body | text ≤ 600 (public) |
| safety_flag | boolean not null default false (private: "asked for money, sold a course or promised a job") |
| private_note | text ≤ 1000 (staff only) |
| published | boolean not null default true (staff can hide; mentors cannot delete) |
| created_at, updated_at | |

Trigger `mentorship_trg_review_stats` recomputes `mentorship_mentor.rating_avg` and `review_count` from **published** reviews.

**`mentorship_quiz_question`**: the answer key never leaves the database.

| column | type |
|---|---|
| id | text pk (`q01` to `q12`) |
| position | smallint |
| prompt | text |
| options | jsonb `[{key:'a', text}, …]` |
| correct_key | text |
| explanation | text |
| active | boolean default true |

Seeded from a **gitignored** file, `supabase/mentorship/mentorship_quiz_seed.local.sql` (`.gitignore` has `supabase/mentorship/*.local.sql`). The content and the private key file are covered in §8.3.

**`mentorship_quiz_attempt`**

| column | type |
|---|---|
| id | uuid pk |
| mentor_id | uuid → mentor on delete cascade |
| user_id | uuid |
| answers | jsonb `{qid: key}` |
| correct | int |
| total | int |
| score_pct | int |
| passed | boolean |
| created_at | |

**`mentorship_switch_request`**

| column | type |
|---|---|
| id | uuid pk |
| match_id | uuid → match on delete cascade |
| mentee_user_id | uuid |
| program | text |
| reason | text, 20 to 600 |
| status | text default 'pending': `pending`, `approved`, `declined` or `withdrawn` |
| resolution_note | text |
| resolved_by | uuid |
| resolved_at | |
| new_match_id | uuid |
| created_at | |

**`mentorship_event`**: the audit log (staff read through `mentorship_admin_mentor_detail`).

| column | type |
|---|---|
| id | bigserial pk |
| actor_id | uuid |
| kind | text |
| mentor_id | uuid |
| match_id | uuid |
| detail | jsonb |
| created_at | |

Event kinds:
- `application_submitted`, `quiz_attempt`, `status_changed`
- `match_created`, `match_reassigned`, `match_ended`
- `switch_requested`, `switch_resolved`
- `payout_updated`, `review_hidden`
- `config_changed`, `staff_changed`, `mentor_updated_by_staff`

### 3.3 Status pipelines

Mentor statuses: `draft` → `submitted` → `training_passed` → `approved`, plus `rejected` and `paused`.

| from → to | who | how | rule |
|---|---|---|---|
| (none) → draft | mentor | first `mentorship_save_mentor` | creates the row |
| draft → submitted | mentor | `mentorship_submit_application` | every required field and all 21 consents present; sets `submitted_at` and `tier` |
| rejected → submitted | mentor | same | only when `reapply_after <= today` (otherwise `reapply_later`, with hint = date) |
| submitted → training_passed | system | `mentorship_submit_quiz` pass | sets `quiz_passed_at` |
| training_passed or paused → approved | admin | `mentorship_admin_set_status` | needs `quiz_passed_at` (`quiz_not_passed`); sets `approved_at` the first time and `approved_by` |
| rejected → approved | admin | same | only when `quiz_passed_at` is set |
| submitted, training_passed, approved or paused → rejected | admin | same | `p_reason` required; sets `reapply_after = today + 30`; refused while the mentor has active matches (`invalid_transition`, hint `has_active_mentees`; reassign them first) |
| approved → paused | admin | same | `p_reason` required. Hidden from the directory and no new bookings; existing mentees continue |

Match statuses: `active` → `completed` (finished; admin) | `ended` (stopped early; admin) | `switched` (replaced by a new match; admin reassign).

Payout statuses: `unpaid` (default) → `due` → `paid` | `void`. All set by an admin; there is no automatic rule in v1.

### 3.4 Storage

Create the buckets inside a guarded `do $$ … exception when others then raise warning … $$` block, with `insert into storage.buckets … on conflict (id) do update`, the msc-mail pattern. If SQL is not allowed to write to storage, print an instruction to create them in the dashboard.

| bucket | public | size limit | MIME types | path |
|---|---|---|---|---|
| `mentorship-photos` | **public** (profile photos are public anyway) | 2 MB | image/jpeg, image/png, image/webp | `<auth uid>/photo-<ts>.<ext>` |
| `mentorship-cv` | private | 5 MB | application/pdf | `<auth uid>/cv-<ts>.pdf` |

Policies on `storage.objects`, named `mentorship_*`:
- **Insert** in either bucket: `bucket_id = '<bucket>' and (storage.foldername(name))[1] = auth.uid()::text and public.mentorship_has_mentor_row()` (only mentor applicants upload; no free public image hosting for every signed-up user).
- **Update, delete** in either bucket: `bucket_id = '<bucket>' and (storage.foldername(name))[1] = auth.uid()::text`. The apply page deletes the replaced photo or CV (core `removeFile`) once the new path is saved.
- **Select on `mentorship-cv`:** the owner's own folder, **or** `public.mentorship_is_staff()`.
- **Photos:** no select policy is needed, because they are read by public URL.

### 3.5 Config keys (`mentorship_config`, seeded `on conflict do nothing`)

| key | default | public | used by |
|---|---|---|---|
| `mentor_fee_inr` | `500` | yes | hub, apply consent, earnings, `match.fee_inr` snapshot |
| `lecture_video_url` | `""` | yes | training (empty means the "lecture coming soon" state) |
| `padam_gpt_url` | `""` | yes | mentor dashboard and playbook (empty means "coming soon") |
| `links_url` | `"https://www.mystudentclub.com/links"` | yes | templates, resources |
| `escalation_contact` | `{"name":"Team My Student Club","whatsapp":"","email":""}` | no (staff details; mentors read it through `mentorship_my_mentor().escalation`) | fallback when a mentor has no `senior_mentor_id` |
| `programs_enabled` | `["industrial-training"]` | yes | everything; switch on `articleship` and `ca-fresher` later |
| `quiz_pass_pct` | `80` | yes | quiz |
| `quiz_cooldown_hours` | `24` | yes | quiz retry after a failed attempt |
| `review_after_days` | `28` | yes | review eligibility |
| `max_mentees_cap` | `10` | yes | `max_mentees` upper bound |
| `min_reviews_for_rating` | `3` | yes | "New mentor" below this |
| `switch_limit` | `1` | yes | switch requests per student per program |
| `unmatched_after_days` | `2` | no | red flag |
| `unmatched_since` | `"2026-10-01"` | no | ignore enrollments older than this (earlier batches) |
| `red_flag_call_days` | `8` | no | red flag |

### 3.6 Internal helper functions

These have no grant to `anon` or `authenticated` unless a note says otherwise. All of them use `security definer set search_path = public, pg_temp`.

**Roles and config**
- `mentorship_is_staff(p_role text default null) returns boolean`:
  - true when `auth.uid()` is an active staff member;
  - when `p_role = 'admin'`, it requires the admin role;
  - **granted to authenticated**, because the storage policy needs it.
- `mentorship_require_staff(p_role text default null)` raises `forbidden`.
- `mentorship_has_mentor_row() returns boolean`: true when `auth.uid()` has a mentor row. **Granted to authenticated**, because the storage insert policies need it.
- `mentorship_cfg(p_key text) returns jsonb`.

**Enrollment**
- `mentorship_course_program(p_course text) returns text` (immutable) uses the same alias map as `COURSE_TO_PROGRAM`:
  - `industrial-training-mastery`, `industrial-training`, `ca-industrial-training`, `msc-industrial-training-program`, `industrial-training-program` and `msc-ca-industrial-training` map to `industrial-training`;
  - `msc-ca-freshers-program`, `ca-freshers`, `freshers`, `ca-freshers-program` and `msc-ca-freshers` map to `ca-fresher`;
  - `msc-articleship-program` and `articleship-excellence` map to `articleship`.
  - Input is matched trimmed and lower-cased.
- `mentorship_enrolled_programs(p_user uuid) returns text[]` reads `public.enrollment(uuid, course)`. It is guarded with `to_regclass('public.enrollment')`, and runs the query through `EXECUTE` so that tests without the table still work.

**Formatting and time**
- `mentorship_norm_phone(text) returns text` (immutable): digits only. It drops a leading 0 from 11 digits and adds a `91` prefix to 10 digits. It returns null unless the result matches `^91[6-9]\d{9}$`.
- `mentorship_ist_week_start(timestamptz default now()) returns date` gives the Monday of that week in IST.
- `mentorship_week_no(p_started timestamptz, p_at timestamptz default now()) returns int` is `floor((ist_date(p_at) - ist_date(p_started)) / 7) + 1`, with a minimum of 1. **It must match core `weekNumber()`.**

**Validation** (each mirrors a core function, and the SQL tests check they agree)
- `mentorship_has_contact(text)` / `mentorship_assert_no_contact(text, field)` = core `hasContactDetails()`: a 10-digit number, also split by spaces, dots, brackets or dashes; an `@`; `http:`/`https:`, `www.`, `wa.me`, `t.me`, `chat.whatsapp`, `bit.ly`, a domain with a path; or the word `telegram`. Raises `invalid_input` with the field name.
- `mentorship_name_ok(text)` / `mentorship_name(jsonb, field)` = core `isValidPersonName()`: letters (any script), spaces and `. ' -` only, no domain ending. Used for every `full_name`.
- `mentorship_review_url(jsonb, field)` = core `isReviewProfileUrl()`: https on a `review_hosts` host, no port or user part.

**Shapes, logging and triggers**
- `mentorship_public_mentor(m mentorship_mentor) returns jsonb` builds the **public mentor shape** (§4.3) in one place.
- `mentorship_log_event(p_kind text, p_mentor uuid, p_match uuid, p_detail jsonb)`.
- Trigger functions:
  - `mentorship_trg_touch()`
  - `mentorship_trg_review_stats()`
  - `mentorship_trg_mentor_mail()`
  - `mentorship_trg_match_mail()`

---

## 4. RPC contract

### 4.1 Conventions

**Function shape**
- Write every function as `language plpgsql security definer set search_path = public, pg_temp`.
- Start each one with `if auth.uid() is null then raise exception 'not_logged_in' using errcode = 'P0001'; end if;`.
- `revoke all on function … from public, anon;` then `grant execute … to authenticated`. `mentorship_get_config` is also granted to `anon`, and the `mentorship_mail_*` functions go to `service_role` only.
- **Read RPCs return `jsonb`**: an object or an array, never null. Return `'[]'::jsonb` for an empty list.

**Errors**
- Raise `raise exception '<code>' using errcode = 'P0001', hint = '<optional detail>'`. Core maps the code to friendly copy.
- The codes are: `not_logged_in`, `forbidden`, `not_found`, `invalid_input` (the hint names the field), `program_closed`, `not_enrolled`, `student_profile_missing`, `already_matched`, `mentor_unavailable`, `mentor_full`, `cannot_book_self`, `switch_used`, `switch_pending`, `not_editable`, `incomplete`, `quiz_locked`, `quiz_cooldown` (hint = ISO time of the next attempt), `already_passed`, `review_too_early` (hint = ISO eligible time), `match_not_active`, `invalid_transition` (hint = reason), `quiz_not_passed`, `reapply_later` (hint = date), `mentorship_completed` and `mentorship_ended` (hint = program).

**Validation**
- Validate every input on the server: lengths per `LIMITS`, enum keys, array sizes, https URLs (`^https://`), and phone numbers through `mentorship_norm_phone`.
- Unknown keys in a `p_patch` are **ignored** without error, so autosave can send whole forms.

**Return shapes**
- `/mentorship/assets/mock-data.js` is the reference for every return shape. The SQL output must match it field for field.

**Concurrency**
- **Booking:** lock the mentor row with `select … for update`, count active matches, then insert. The partial unique index guards the student side, and a `unique_violation` maps to `already_matched`.

### 4.2 Functions

#### Public

**`mentorship_get_config() returns jsonb`** (anon and authenticated)
- Returns `{key: value}` for every `is_public` row.

#### Signed-in user

**`mentorship_whoami() returns jsonb`**
- Returns:
  `{ user_id, email, name, staff_role: 'admin'|'senior_mentor'|null, mentor: {id,status,tier,full_name,photo_path,quiz_passed_at,accepting}|null, student: {full_name,whatsapp,city}|null, enrolled_programs: text[], active_matches: [{match_id,program,mentor_id}], closed_matches: [{match_id,program,status: 'completed'|'ended',mentor_id}] }`
- `closed_matches` lists, per program with no active match, the latest `completed` (preferred) or `ended` match. Self-booking is closed there (see `mentorship_book`).
- `name` comes from the mentor row, else the student row, else auth metadata.

#### Mentor side

**`mentorship_save_mentor(p_patch jsonb) returns jsonb`**
- Creates the row on first call: status `draft`, email from auth.users, and `full_name` defaulting to the auth name.
- Which keys it accepts depends on the status:
  - **`draft` or `rejected`:** every applicant field in §3.2, from `full_name` through `heard_from`, plus `consents`. It does not take email, status, tier, training, quiz, staff, rating or timestamp fields.
  - **`submitted`, `training_passed`, `approved` or `paused`:** profile fields only. These are `photo_path`, `cv_path`, `headline`, `bio`, `wish_i_knew`, `languages`, `city`, `mobile`, `whatsapp`, `linkedin_url`, `show_linkedin`, `topmate_url`, `domains`, `companies_known`, `call_slots`, `weekly_hours`, `programs`, `accepting` and `max_mentees`. `max_mentees` cannot go below the current active count (`invalid_input`, hint `max_mentees_below_active`).
- `p_patch.consents` is `{key: true|false}`. The server stamps `now()` for true and removes the key for false; the client never sends timestamps.
- `full_name` must pass `mentorship_name_ok`. The public text fields (`city`, `it_company`, `it_city`, `articleship_firm`, `articleship_city`, `employer`, `role_title`, `headline`, `bio`, `wish_i_knew`, each `companies_known` item) must not carry contact details (`mentorship_assert_no_contact`). `topmate_url` must be a review-platform link (`mentorship_review_url`). All of these raise `invalid_input` with the field name.
- Changing `linkedin_url` or `topmate_url` resets `linkedin_checked` or `topmate_checked`; outside `draft`, the change (and a new photo of an approved or paused mentor) is logged as `profile_link_changed`.
- `scores` replaces the stored object as a whole.
- Returns the mentor's own full row (as jsonb).

**`mentorship_submit_application() returns jsonb`**
- Returns `{ok, status, missing: [field keys or 'consents.<key>']}`.
- It checks:
  - the required fields (§7);
  - `STAGE_REQUIRED[stage]`;
  - the `it_*` fields when `did_it`;
  - the scores rules;
  - all 21 `REQUIRED_CONSENTS`.
- On success it moves the status as described in §3.3. If the application is already submitted or further along, it returns `{ok:true,status}` unchanged.

**`mentorship_my_mentor() returns jsonb`**
- Returns `not_found` when the user has no mentor row.
- On success returns:
  `{ mentor: <own full row>, active_count, slots_left, earnings: {fee_inr, active_count, active_value_inr, unpaid_inr, due_inr, paid_inr, rows:[{match_id, mentee_name, program, status, started_at, fee_inr, payout_status, paid_at, payout_ref}]}, escalation: {name, whatsapp, email, role}, quiz: {attempts, best_pct, passed_at, last_attempt_at, next_attempt_at, pass_pct, cooldown_hours}, consents_missing: [] }`
- `escalation` is the assigned senior mentor (from `mentorship_staff`), else `config.escalation_contact`.

**`mentorship_mark_training(p_step text) returns jsonb`**
- `p_step` is `lecture` or `playbook`. The status must not be `draft` (else `quiz_locked`).
- Returns `{training}`.

**`mentorship_quiz_questions() returns jsonb`**
- The status must be `submitted` or later (else `quiz_locked`).
- Returns `{questions:[{id, position, prompt, options:[{key,text}]}], pass_pct, cooldown_hours, attempts, passed_at, next_attempt_at}`. **It never returns `correct_key` or `explanation`.**

**`mentorship_submit_quiz(p_answers jsonb) returns jsonb`**
- `p_answers` is `{qid: key}`. Unanswered questions count as wrong.
- Errors:
  - `quiz_locked` when the status is `draft`;
  - `already_passed` once the quiz has been passed;
  - `quiz_cooldown` when the last attempt failed less than `quiz_cooldown_hours` ago.
- Inserts an attempt and updates `quiz_attempts`, `quiz_best_pct` and `quiz_last_at`.
- Pass rule: `correct*100 >= pass_pct*total`. A pass sets `quiz_passed_at` and moves `submitted` to `training_passed`.
- Returns `{score_pct, correct, total, passed, wrong_ids:[qid], explanations: {qid: text} (only when passed, otherwise {}), next_attempt_at (when failed), status}`.
- On a fail, only the wrong question ids are shown (no answers), so the mentor goes back and re-reads the playbook.

**`mentorship_my_mentees(p_include_closed boolean default false) returns jsonb`**
- The mentor's status must be `approved` or `paused` (else `forbidden`).
- Returns an array of:
  `{ match_id, program, status, started_at, ended_at, week_no, days_active, mentee: {user_id, full_name, first_name, whatsapp, email, city}, checklist: {<item>: {done_at, note}}, calls: [{id, week_no, called_on, hunt_stage, applications_count, interviews_count, notes, created_at}] (newest first, at most 12), calls_total, last_call_on, days_since_call, latest_stage, latest_applications, flags: ['intro_late'|'no_call_8d'|'mentee_no_contact'] }`
- For a match that is not active, `mentee` is `{user_id, full_name, first_name}` only (no contact details after a switch or an end).
- `calls_total` counts every call log of the match, so the dashboard can say "the last 12 of N".
- `mentee_no_contact` replaces `intro_late` while the mentee has no WhatsApp number anywhere (an admin-assigned mentee who never filled the booking form).

**`mentorship_set_checklist(p_match_id uuid, p_item text, p_done boolean, p_note text default null) returns jsonb`**
- Only the mentor of that match may call it, and the match must be active (`match_not_active` otherwise).
- Returns `{match_id, checklist}`.

**`mentorship_log_call(p_match_id uuid, p_week_no int, p_called_on date, p_stage text, p_applications int, p_interviews int default 0, p_notes text default null) returns jsonb`**
- Only the mentor of an active match may call it.
- Upserts on `(match_id, week_no)` and returns the call row.

#### Student side

**`mentorship_save_student(p_full_name text, p_whatsapp text, p_city text default null) returns jsonb`**
- Upserts the student's contact card. Email comes from auth. `p_full_name` must pass `mentorship_name_ok` (it goes into the mentor's mail).
- Returns `{full_name, whatsapp, city, email}`.
- My mentor also calls it when an admin-assigned student has no WhatsApp number yet.

**`mentorship_list_mentors(p_program text default 'industrial-training') returns jsonb`**
- Returns approved mentors whose `programs` contain `p_program`, as an array of the **public mentor shape** (§4.3).
- Order: available first, then a stable daily rotation (`md5(id || current_date)`). The client sorts again as needed.
- Full mentors are included with `available:false`.

**`mentorship_mentor_public(p_mentor_id uuid) returns jsonb`**
- Approved or paused mentors only.
- Returns `{ mentor: <public shape>, reviews: [{id, rating, tags, body, author ('Riya S.'), program, created_at}] (published, newest first, at most 30), tag_counts: {tag: n} }`.

**`mentorship_book(p_mentor_id uuid, p_program text) returns jsonb`**
- Returns the match in the `my_match.matches[]` shape. The steps, in this order:
  1. Logged in.
  2. The program is enabled (`program_closed`).
  3. The student is enrolled, via `mentorship_enrolled_programs` (`not_enrolled`).
  4. A student row with a WhatsApp number exists (`student_profile_missing`).
  5. No active match exists for this program (`already_matched`), no `completed` one (`mentorship_completed`: one mentorship per program), and no `ended` one (`mentorship_ended`: after Team MSC ends a match early, Team MSC sets up the next mentor through admin assign).
  6. Lock the mentor row. It must be approved, `accepting`, list the program in `programs`, and not belong to the caller (`mentor_unavailable` / `cannot_book_self`).
  7. Active count < `max_mentees` (`mentor_full`).
  8. Insert the match: `fee_inr` from config, `batch` from enrollment when that column exists, `source 'self'`.
  9. Log the event.
- The insert trigger queues the two match mails and the first pulse reminder (§6).

**`mentorship_my_match(p_program text default null) returns jsonb`**
- Returns:
  `{ student: {full_name, whatsapp, city, email}|null, matches: [{ match_id, program, status, started_at, week_no, days_active, mentor: <public shape + whatsapp, email (active matches only)>, checklist: {<item>: {done_at}}, pulse_this_week: <pulse row>|null, pulses_count, last_pulse_at, review: <own review row>|null, review_eligible_at, can_review, switch_request: {id,status,reason,created_at,resolution_note,resolved_at}|null, switch_available }] }`
- Active matches come first, then the newest.
- Mentor contact details (WhatsApp and email, never the staff-only mobile) appear **only in the caller's own active matches**. A closed match shows the public shape only.
- `checklist` carries the mentor's ticked items with their done dates only (never the mentor's notes), for the student's progress card.

**`mentorship_submit_pulse(p_match_id uuid, p_applications int, p_stage text, p_mentor_called boolean, p_rating int, p_issue text default null) returns jsonb`**
- Only the mentee of an active match may call it.
- Upserts on `(match_id, istWeekStart)` and returns the pulse row.

**`mentorship_submit_review(p_match_id uuid, p_rating int, p_tags text[] default '{}', p_body text default null, p_safety_flag boolean default false, p_private_note text default null) returns jsonb`**
- Only the mentee of the match may call it. The match's status can be anything, but `now() - started_at >= review_after_days` (`review_too_early`, hint = the eligible time).
- Upserts one review per match and returns the review row.

**`mentorship_request_switch(p_match_id uuid, p_reason text) returns jsonb`**
- Only the mentee of an active match may call it.
- Errors: `switch_pending` when a request is already pending; `switch_used` when the mentee has reached `switch_limit` requests (any status except `withdrawn`) for this program.
- Returns the request row.

#### Staff

Read functions need `mentorship_is_staff()`. Write functions need the **admin** role, except where noted.

**`mentorship_admin_overview() returns jsonb`**
- Returns `{counts: {mentors: {<status>: n}, active_matches, matches_by_program: {}, unmatched, red_flags: {high, medium}, switch_pending, payouts: {unpaid_inr, due_inr, paid_inr, due_count}}, generated_at}`.

**`mentorship_admin_red_flags() returns jsonb`**
- Returns an array of `{kind, severity: 'high'|'medium', match_id, mentor_id, mentor_name, mentee_user_id, mentee_name, program, detail, since}`, using the rules in §5.

**`mentorship_admin_mentors(p_status text default null) returns jsonb`**
- Returns full rows plus `active_count` and `senior_mentor_name`.

**`mentorship_admin_mentor_detail(p_mentor_id uuid) returns jsonb`**
- Returns `{mentor, active_count, quiz_attempts: [], matches: [admin match shape], reviews: [admin review shape], events: [{id, kind, actor_name, detail, created_at}]}`.

**`mentorship_admin_matches(p_status text default 'active', p_program text default null) returns jsonb`**
- Passing `p_status = null` returns all matches.
- Returns an array of:
  `{match_id, program, status, started_at, ended_at, week_no, source, mentor:{id, full_name, whatsapp, email}, mentee:{user_id, full_name, whatsapp, email, city}, checklist_done, checklist_total, last_call_on, days_since_call, latest_stage, last_pulse:{rating, mentor_called, applications_count, issue, created_at}|null, review:{rating, safety_flag}|null, fee_inr, payout_status, paid_at, payout_ref}`

**`mentorship_admin_unmatched(p_program text default 'industrial-training') returns jsonb`**
- Returns students who are enrolled (enrollment on or after `unmatched_since`, where `enrollment.created_at` exists) or who have a student row, with no active match.
- Each item: `{user_id, email, name, whatsapp, city, enrolled_at, batch, days_waiting, has_student_row}`.
- `name` and `whatsapp` come from `mentorship_student`, else `public.profiles.profile`, else auth metadata.

**`mentorship_admin_switch_requests(p_status text default 'pending') returns jsonb`**
- Returns an array of `{id, match_id, program, status, reason, created_at, mentee:{user_id, full_name, whatsapp}, mentor:{id, full_name}, resolution_note, resolved_at}`.

**`mentorship_admin_reviews(p_mentor_id uuid default null) returns jsonb`**
- Returns an array of `{id, match_id, mentor_id, mentor_name, mentee_name, rating, tags, body, safety_flag, private_note, published, created_at}`, with safety flags first.

**`mentorship_admin_staff() returns jsonb`** and **`mentorship_admin_get_config() returns jsonb`**
- Staff: `[{user_id, email, name, role, whatsapp, active, created_at}]`.
- Config: `[{key, value, is_public, note, updated_at}]`.

**`mentorship_admin_set_status(p_mentor_id uuid, p_status text, p_reason text default null) returns jsonb`** (admin)
- Applies the transitions in §3.3 and returns the full row.
- It refuses to approve an active staff member (`invalid_transition`, hint `is_staff`): staff read what mentees share in confidence.

**`mentorship_admin_update_mentor(p_mentor_id uuid, p_patch jsonb) returns jsonb`**
- Admin may patch `linkedin_checked`, `topmate_checked`, `staff_note`, `senior_mentor_id` and `max_mentees`. **A senior mentor may patch only `staff_note`.**

**`mentorship_admin_create_match(p_mentee_user_id uuid, p_mentor_id uuid, p_program text, p_force boolean default false) returns jsonb`** (admin)
- Skips the enrollment check.
- `p_force` skips the capacity and accepting checks, but never the one-active-match rule.
- If the student has no `mentorship_student` row, one is created from profiles or auth (WhatsApp may be null).
- `source 'admin'`. Returns the admin match shape.

**`mentorship_admin_reassign(p_match_id uuid, p_new_mentor_id uuid, p_reason text, p_force boolean default false) returns jsonb`** (admin)
- The old match becomes `switched`, with `ended_at` and `end_reason` set.
- A new active match is created with `source 'switch'` and `previous_match_id`.
- Any pending switch request is resolved as `approved`, with `new_match_id`.
- Returns the new match in the admin shape.

**`mentorship_admin_end_match(p_match_id uuid, p_status text, p_reason text default null) returns jsonb`** (admin)
- `p_status` is `completed` or `ended`.

**`mentorship_admin_resolve_switch(p_request_id uuid, p_approve boolean, p_new_mentor_id uuid default null, p_note text default null) returns jsonb`** (admin)
- Approving needs `p_new_mentor_id`, and calls the reassign logic.

**`mentorship_admin_set_payout(p_match_ids uuid[], p_status text, p_reference text default null) returns integer`** (admin)
- Returns the number of rows updated.
- `paid` sets `paid_at` and `paid_by`; every other status clears them.

**`mentorship_admin_set_review(p_review_id uuid, p_published boolean) returns jsonb`** (admin)

**`mentorship_admin_set_config(p_key text, p_value jsonb, p_is_public boolean default null) returns jsonb`** (admin)
- Validates the known keys:
  - `mentor_fee_inr`: an integer from 0 to 100000;
  - URL keys: empty or https;
  - `programs_enabled`: a subset of `PROGRAM_KEYS`;
  - URL keys must have a real host (`^https://<host>(/…)?$`, no port or user part).
- A new key is private unless `p_is_public` says otherwise; an existing key keeps its visibility.

**`mentorship_admin_upsert_staff(p_email text, p_role text, p_name text default null, p_whatsapp text default null, p_active boolean default true) returns jsonb`** (admin)
- The email must belong to an existing auth user (`not_found` otherwise).
- It refuses to deactivate or demote the last active admin.
- It refuses to make an `approved` or `paused` mentor active staff (`invalid_input`, hint `is_mentor`): staff read pulses, private review notes and red-flag details that mentees share with Team MSC and not with their mentor.

#### Worker (service_role only)

**`mentorship_mail_contacts(p_match_id uuid) returns jsonb`**
- Returns:
  `{match_id, status, program, program_label, started_at, week_start_current, pulse_this_week: bool, mentor:{mentor_id, user_id, full_name, first_name, email, whatsapp, mobile}, mentee:{user_id, full_name, first_name, email, whatsapp, city}}`
- Emails come from auth.users.

**`mentorship_mail_mentor(p_mentor_id uuid) returns jsonb`**
- Returns `{mentor_id, user_id, status, full_name, first_name, email, submitted_at, approved_at, rejected_at, reapply_after, quiz_passed_at, status_changed_at}`.

**`mentorship_mail_schedule_pulse(p_match_id uuid) returns bigint`**
- Queues the next pulse reminder (§6). Returns the outbox id or null.
- Also called from the match trigger.

### 4.3 Public mentor shape (`mentorship_public_mentor`)

```
{ id, full_name, first_name, photo_path, tier, stage, city, languages[], domains[], programs[], headline, bio, wish_i_knew,
  did_it, it_company, it_domain, it_duration_months, it_start, articleship_firm, articleship_firm_type, articleship_domain,
  articleship_city, final_attempt, qualified_on, employer, role_title, experience_years, companies_known[], call_slots[],
  topmate_url, linkedin_url (null unless show_linkedin), linkedin_checked, topmate_checked, rating_avg, review_count,
  mentees_total (all matches ever), max_mentees, active_mentees, slots_left,
  accepting (= accepting and status 'approved', so a paused mentor reads "Not taking mentees"),
  available (= status 'approved' and accepting and slots_left > 0), approved_at }
```

It **never** includes `user_id`, `email`, `mobile`, `whatsapp`, `icai_number`, `scores`, `cv_path`, the screening answers, consents or staff fields.

---

## 5. Red-flag rules (`mentorship_admin_red_flags`)

These apply to active matches unless a rule says otherwise. Times are in IST.

| kind | severity | rule | `since` |
|---|---|---|---|
| `intro_late` | high | `now() - started_at > 24h`, no `intro_sent` checklist row, and the mentee has a WhatsApp number | started_at + 24h |
| `mentee_no_contact` | high | the mentee has no WhatsApp number anywhere (student card, then profile), so the intro cannot go | started_at |
| `no_call_8d` | medium (high at 14+ days) | match age ≥ `red_flag_call_days` (8) **and** (no call log, or the latest `called_on` is ≤ today − 8) | last call or started_at |
| `mentor_not_calling` | high | any pulse in the last 14 days with `mentor_called = false` | that pulse |
| `low_rating` | medium (high at ≤ 2) | latest pulse within 21 days has `rating < 4` | that pulse |
| `no_applications_2w` | medium | match age ≥ 14 days; the latest stage is not `offer`, `joined` or `on_hold`; and no call log or pulse in the last 14 days has `applications_count > 0` | 14 days ago |
| `pulse_issue` | medium | a pulse in the last 14 days with a non-empty `issue`; `detail` is the first 140 characters | that pulse |
| `safety_flag` | high | a review with `safety_flag = true` created in the last 60 days (any match status) | review |
| `switch_pending` | medium | a switch request with status `pending` | request |
| `unmatched` | medium (high at 7+ days) | enrolled in an **enabled** program, no active match for it, and waiting ≥ `unmatched_after_days` (2). Waiting starts at `enrollment.created_at` (only if on or after `unmatched_since`), else at `mentorship_student.created_at` | start of waiting |

Sort by severity (high first), then `since` (oldest first). Mentor dashboards show `intro_late`, `mentee_no_contact` and `no_call_8d` as `flags` on their own mentees.

---

## 6. Mail through the msc-mail outbox

### 6.1 How it connects

Site tables fire **AFTER triggers**, which call `public.mail_enqueue(event, email, payload, dedupe_key, not_before)`. The msc-mail Worker (`notify.mystudentclub.com`) claims the outbox every minute, then `handlers/mentorship.js` re-reads the current state through the service RPCs above, sends the transactional template through SES, and marks the row done.

Trigger rules (these are hard rules, all tested in the mail brief):
- **Function form:** `language plpgsql security definer set search_path = public, pg_temp set lock_timeout = '500ms'`, with `revoke all … from public, anon, authenticated`. SECURITY DEFINER is mandatory, because `authenticated` cannot execute `mail_enqueue`.
- **The first statement** is `if to_regprocedure('public.mail_enqueue(text, text, jsonb, text, timestamptz)') is null then return null; end if;`. **`mail_outbox` does not exist in production yet**, so the triggers must be silent no-ops until it does. Never write a `language sql` function that names `mail_*` objects.
- **Read safely and never block:** read columns through `to_jsonb(new)`. Wrap the body in `begin … exception when others then raise warning 'mentorship: … (% %)', sqlstate, sqlerrm; end;` so a mail problem never blocks a booking or an approval. `return null`.
- **Recipients:**
  - The recipient's email comes from **auth.users by user id**, using `mail_user_row(uuid)->>'email'` behind the same guard. It never comes from client input.
  - Send one outbox row per recipient.
  - **No phone numbers and no free text in payloads.** The Worker fetches contacts at send time.

### 6.2 Events

| event | to | fired when | dedupe key | payload | template id |
|---|---|---|---|---|---|
| `mentorship_mentor_applied` | the mentor | `mentorship_mentor.status` becomes `submitted` (a re-application whose quiz was already passed lands on `training_passed`: no mail, the page shows the in-review screen) | `mentorship_mentor_applied:<mentor_id>:<epoch(submitted_at)>` | `{mentor_id, user_id, name}` | `transactional-mentorship-mentor-applied` |
| `mentorship_mentor_approved` | the mentor | status becomes `approved` from anything but `paused` (the first approval, or an approval after a rejection; resuming a pause sends nothing) | `mentorship_mentor_approved:<mentor_id>:<epoch(status_changed_at)>` | `{mentor_id, user_id, name, status_changed_at}` | `transactional-mentorship-mentor-approved` |
| `mentorship_mentor_rejected` | the mentor | status becomes `rejected` (new `rejected_at`); `not_before` is now() + 1 hour, so an undo sends nothing | `mentorship_mentor_rejected:<mentor_id>:<epoch(rejected_at)>` | `{mentor_id, user_id, name, rejected_at, reapply_after}` (never `reject_reason`) | `transactional-mentorship-mentor-rejected` |
| `mentorship_match_mentor` | the mentor | `mentorship_match` insert with status `active` | `mentorship_match_mentor:<match_id>` | `{match_id, mentor_id, user_id (mentor), name (mentor), mentee_name, program, program_label}` | `transactional-mentorship-match-mentor` |
| `mentorship_match_mentee` | the student | same insert | `mentorship_match_mentee:<match_id>` | `{match_id, user_id (mentee), name (mentee), mentor_name, program, program_label}` | `transactional-mentorship-match-mentee` |
| `mentorship_pulse_reminder` | the student | queued by the match trigger and re-queued weekly (below) | `mentorship_pulse_reminder:<match_id>:<week_start YYYY-MM-DD>` | `{match_id, user_id, name, mentor_name, week_start}` | `transactional-mentorship-pulse-reminder` |

- `name` is the recipient's `full_name` from the mentorship tables, falling back to `mail_meta_name`.
- `program_label` is `PROGRAMS[program].label`, for example "Industrial Training".

**Pulse reminder schedule**
- `not_before` is the next **Saturday 11:00 IST** that is at least 5 days after `started_at` for the first reminder, and more than 12 hours from now for every later one.
- `week_start` is the Monday of that Saturday's week.
- `mentorship_mail_schedule_pulse(match_id)` queues the next reminder:
  - only while the match is active;
  - idempotently, through the dedupe key;
  - the Worker calls it after each reminder, whether that reminder was sent or skipped.

### 6.3 Worker handlers (`msc-mail-mentorship/worker/src/handlers/mentorship.js`)

Each handler follows the brief's `sendOnce` pattern, using KV once-keys `mentorship:<event>:<id>`.

| event | re-check | vars sent to the template |
|---|---|---|
| `mentorship_mentor_applied` | `rpc('mentorship_mail_mentor')`. Skip unless the status is `submitted` or `training_passed` | `training_url` = `mailLink(site('/mentorship/training/'))` |
| `mentorship_mentor_approved` | Skip unless the status is `approved`. KV key `mentorship:mentor_approved:<id>:<epoch(status_changed_at)>` | `dashboard_url` = `/mentorship/mentor/` |
| `mentorship_mentor_rejected` | Skip unless the status is `rejected` | `reapply_date` (reapply_after as "1 November 2026"), `apply_url` = `/mentorship/apply/` |
| `mentorship_match_mentor` | `rpc('mentorship_mail_contacts')`. Skip unless the status is `active` | `mentee_name`, `mentee_phone` (formatted `+91 98765 43210`), `mentee_email`, `program_label`, `dashboard_url` = `/mentorship/mentor/?match=<id>`, `whatsapp_url` = `https://wa.me/<digits>` |
| `mentorship_match_mentee` | same | `mentor_name`, `mentor_phone`, `mentor_email`, `program_label`, `my_mentor_url` = `/mentorship/my-mentor/`, `whatsapp_url` |
| `mentorship_pulse_reminder` | Skip if the match is not active, or if `pulse_this_week` is true. Afterwards always call `rpc('mentorship_mail_schedule_pulse')` | `mentor_name`, `pulse_url` = `/mentorship/my-mentor/?pulse=1` |

Site links go through `mailLink(env, …)` to `https://notify.mystudentclub.com/site/...`. Mail never links straight to www.

### 6.4 Templates (`content/transactional/mentorship-*.md`, all `sender: transactional`)

| file | suggested subject (≤ 50 chars with sample values) | button |
|---|---|---|
| `mentorship-mentor-applied.md` | "Your mentor application is in" | `[[Open mentor training]]({{training_url}})` |
| `mentorship-mentor-approved.md` | "You are approved as an MSC mentor" | `[[Open your mentor dashboard]]({{dashboard_url}})` |
| `mentorship-mentor-rejected.md` | "About your MSC mentor application" | `[[Open your application]]({{apply_url}})` |
| `mentorship-match-mentor.md` | "Meet your new mentee, {{mentee_name}}" | `[[Open your dashboard]]({{dashboard_url}})` plus a secondary `[[WhatsApp {{mentee_name}}]]({{whatsapp_url}}){.secondary}` if lint allows |
| `mentorship-match-mentee.md` | "Meet your mentor, {{mentor_name}}" | `[[See your mentor's details]]({{my_mentor_url}})` plus a secondary WhatsApp button |
| `mentorship-pulse-reminder.md` | "How did this week go?" | `[[Share this week in 30 seconds]]({{pulse_url}})` (≤ 40 characters) |

**What each mail says**
- **Mentor match mail:** the mentee's name, WhatsApp and email as text. It asks the mentor to send the intro from the dashboard template within 24 hours and to fix the first call, and points to the playbook.
- **Mentee match mail:** the mentor responds on WhatsApp within a few hours, does a weekly call, reviews the CV, runs a mock interview and helps until joining. Nobody can promise a job, and no one should ask for money.

**msc-mail lint traps** (each one is a build error):
- the words "reply" or "replies" (write "respond");
- `I`, `me` or `my` in prose, which also means no "My mentor" label;
- **"Padam" anywhere**, so the joining-post tagging rule stays out of mail;
- em dashes;
- "actually", "exactly", "honestly", "truly", "genuinely";
- typed program prices;
- images;
- direct www or `wa.me` links written in the Markdown (the `whatsapp_url` variable is fine);
- the same 6-word sentence in 3 or more mails.

**Other template rules**
- Add each new id to `TRANSACTIONAL_IDS` in `scripts/lib/lists.js` and add sample values in `scripts/lib/sample.js` (for example `mentee_name: 'Riya Sharma'`, `mentor_name: 'Ananya Iyer'`).
- Keep the body to 100 words or fewer, with one primary button.
- The Worker registry gains `mentorship` in `MODULES`. The module must not export crons, which keeps the crons test unchanged.

### 6.5 Go-live order (for whoever ships it; no builder deploys anything)

1. Apply msc-mail `supabase/APPLY-ALL.sql`. It is not in production yet.
2. Deploy the Worker with the mentorship handlers, still on `DRY_RUN=1`.
3. Apply the mentorship migration (`supabase/mentorship/001_mentorship.sql`; rollback: `001_mentorship_down.sql`), then the private quiz seed.
4. Add the first admin by hand:

   ```sql
   insert into public.mentorship_staff(user_id, role, name, email)
   select id, 'admin', 'Team MSC', email from auth.users where email = '<admin email>';
   ```
5. Test with seed accounts, then switch `DRY_RUN` off together with the rest of msc-mail.
6. Deploy the site.

If mentorship rows reach the outbox before the handler is deployed, they fail with "unknown event". Retry them from msc-mail `/admin`.

---

## 7. Mentor application (`/mentorship/apply/`): the final question list

It has **5 steps and a review screen**, takes about 10 minutes, and works on a phone. It autosaves:
- through `mentorship_save_mentor`, debounced 1.2 seconds after a change, on blur and on every step change;
- with a backup copy in `localStorage['ms_apply_draft_<uid>']`, offered back if the server save fails.

The page uses the stepper, a "Saved" indicator (`.ms-savestate`) and sticky Back/Continue buttons. Every field shows its visibility tag:
- `.ms-vis--public` "On your profile";
- `.ms-vis--matched` "Matched mentees only";
- `.ms-vis--private` "Only Team MSC".

Fields marked * are required at submit; Continue does not block on them, only Submit does. The step does inline validation as the mentor goes.

**Step 1: About you**

| key | label | input | vis | rules |
|---|---|---|---|---|
| full_name* | Full name (as on ICAI records) | text | public | ≤ 80, letters only (`isValidPersonName`; the server checks the same rule) |
| (email) | Email | read-only, from login | matched | |
| mobile* | Mobile number | tel with +91 addon | private | valid Indian mobile |
| whatsapp* | WhatsApp number | tel, plus a "Same as mobile" checkbox | matched | valid Indian mobile |
| city* | City | select CITIES; "Other" shows a text box ≤ 40 | public | |
| photo_path* | Profile photo | photo picker (circle preview) | public | JPG, PNG or WebP ≤ 2 MB. Hint: "A clear, smiling, passport-style photo. No logos or group photos." |
| linkedin_url* | LinkedIn profile | url | private (with a `show_linkedin` switch: "Show on my profile") | must match `linkedin.com/in/` |
| topmate_url | Topmate or other mentoring profile with reviews | url | public | https on a review platform (`REVIEW_HOSTS`: Topmate, ADPList, MentorCruise, Superpeer, Unstop, Preplaced); recommended: "Helps students trust you, and lets us check reviews" |
| languages* | Languages you can mentor in | chips LANGUAGES | public | 1 to 6 |

**Step 2: Your CA journey**

| key | label | input | vis | shown when |
|---|---|---|---|---|
| stage* | Where are you today? | option cards from STAGES (with descriptions) | public (as the stage and the tier chip) | always |
| final_attempt | CA Final attempt | select `attemptOptions()` (Jan, May, Sep, Nov) | public | `final_*` stages (required); `in_articleship` (optional, labelled "Planned CA Final attempt") |
| did_it | Did you do industrial training? | yes/no | public | qualified stages |
| it_company* | Industrial training company | text | public | `final_in_it`, `final_it_done`, or `did_it` |
| it_domain* | IT domain | select DOMAINS | public | same |
| it_duration_months* | IT duration | select IT_DURATIONS ("12 months") | public | same |
| it_start* | IT start month | month input (YYYY-MM) | public | `final_in_it`, `final_it_done` |
| it_city | IT city | text | public | same, optional |
| articleship_firm* | Articleship firm | text | public | every stage |
| articleship_firm_type* | Firm type | select FIRM_TYPES (Big 4 / Big 6 or network / mid-size / small) | public | every stage |
| articleship_domain* | Main articleship domain | select DOMAINS | public | every stage |
| articleship_city | Articleship city | text | public | optional |
| articleship_year* | Which year of articleship? | 1/2/3 | public | `in_articleship` |
| qualified_on* | Qualified as CA in | month input | public ("CA since …") | qualified stages |
| employer* | Current employer | text | public | qualified stages |
| role_title* | Current role | text | public | qualified stages |
| experience_years* | Experience after qualifying | select EXPERIENCE_YEARS | public | `qualified_experienced` |
| icai_number | ICAI registration or membership number | text | private | optional. Hint: "Only used to verify you. Never shown." |

**Step 3: Scores and expertise**

| key | label | input | vis | rules |
|---|---|---|---|---|
| scores.foundation | CA Foundation: marks, out of (400), attempts, plus a "Direct entry (no Foundation)" checkbox | number group | private | required unless the exemption box is ticked |
| scores.inter* | CA Inter: marks, out of (600 new scheme / 800 old scheme), attempts | number group | private | required |
| scores.final | CA Final: marks, out of (600/800), attempts | number group | private | required for qualified stages |
| scores.rank_note | Ranks or exemptions (optional) | text ≤ 120 | private | |
| domains* | Domains you can guide | chips DOMAINS | public | 1 to 6 |
| companies_known | Companies you know well or interviewed with | tag input (Enter or comma) | public | ≤ 15 items, each ≤ 60 characters |
| headline* | Your headline | text ≤ 90 with a counter | public | Placeholder: "IT in Risk Advisory at Deloitte · Happy to help with Big 4 interviews" |
| bio* | Your story, in your own words | textarea 120 to 800 with a counter | public | Prompt: "Write it like you are talking to a junior who is where you were. Your journey, and what you can help with." No phone numbers, emails or links: the client checks with `hasContactDetails()` and the server rejects the same text (`mentorship_assert_no_contact`: 10 digits even when split by spaces or dashes, `@`, links, `wa.me`, `t.me`, `chat.whatsapp`, `telegram`, `bit.ly`). The same rule covers every public text field: headline, quote, companies, employer, role, firm names and cities. |
| wish_i_knew | One thing you wish someone had told you before IT | text ≤ 200 | public | optional; shown as a quote on the profile |

**Step 4: Mentoring and screening**

| key | label | input | vis | rules |
|---|---|---|---|---|
| programs* | Which MSC programs do you want to mentor? | option cards for all three; programs not in `programs_enabled` show a "Launching later" pill but can still be picked | public | ≥ 1 |
| max_mentees* | How many mentees can you take per batch? | select 1 to 10 | public (as slots) | hint: "Most mentors take 5 to 8. Each mentee needs a weekly call." Also shows "You earn Rs {fee} per mentee" from config |
| weekly_hours* | Hours you can give each week | select WEEKLY_HOURS | private | |
| call_slots* | When can you usually take calls? | chips CALL_SLOTS | public | ≥ 1 |
| cv_path* | Your CV | PDF upload | private | ≤ 5 MB |
| why_mentor* | Why do you want to mentor CA students? | textarea 80 to 800 | private | |
| scenario_answer* | Scenario: the `SCENARIO_QUESTION` text | textarea 120 to 900 | private | Hint: "Write it exactly as you would send it on WhatsApp." |
| mentoring_experience* | Have you guided juniors or article assistants before? | radio MENTORING_EXPERIENCE | private | |
| conflicts* | Anything we should know? | checkboxes CONFLICTS (`none` clears the others) | private | if anything other than `none` is ticked, `conflicts_note` ≤ 300 is required. Hint: "This does not disqualify you. It helps us keep things fair." |
| heard_from | How did you hear about MSC mentorship? | select HEARD_FROM | private | optional |

**Step 5: Commitments** (each one is its own `.ms-check`, **with no "select all"**)
- Intro copy: "These are the promises MSC students count on. Tick each one only if you can keep it."
- The 18 `DUTIES` come first. Then a "Code of conduct" box lists `CODE_OF_CONDUCT`.
- Then the 3 `POLICY_CONSENTS`. In `payout_terms`, `{fee}` is replaced with `config.mentor_fee_inr`.
- Each tick is saved immediately as `consents: {key: true}`.

**Step 6: Review and submit**
- **Preview:** a live mentor card, labelled "This is how students will see you", built with the same markup as the find page's `.ms-mentor-card`.
- **Missing fields:** listed with "Fix" links to their step, using `missing[]` from `mentorship_submit_application`.
- **Submit:** the "Submit application" button calls `mentorship_submit_application`. On `ok`, show a success screen and send the mentor to `/mentorship/training/`. Copy: "Application received. Next: watch the lecture, read the playbook and pass a short quiz. Team MSC reviews every application within 7 days."

**What the page shows at each status** (from `ctx.mentor.status`)

| status | what the page shows |
|---|---|
| no row or `draft` | the form |
| `submitted` or `training_passed` | a read-only summary with a "Go to training" link, plus an "Edit public profile" section with the profile fields only |
| `approved` or `paused` | "Edit your profile" with the profile fields only, plus the `accepting` switch and a dashboard link |
| `rejected` | `reject_reason` and `reapply_after`. Once that date has passed, the form unlocks and can be submitted again |

---

## 8. Training (`/mentorship/training/`)

**Gate**
- The visitor must be logged in.
- With no mentor row or a `draft` status, the page shows a callout to finish the application.

**Layout**
- A 3-part progress header: Lecture, Playbook, Quiz. Each part is ticked from `training.lecture_at`, `training.playbook_at` and `quiz_passed_at`.
- Three sections with anchors `#lecture`, `#playbook` and `#quiz`.

### 8.1 Lecture
- Uses `embedVideo(config.lecture_video_url)`:
  - for an `iframe` result, show an `.ms-video` iframe with `allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"` and `loading="lazy"`;
  - for a `file` result, show a `<video controls playsinline>`;
  - for a `link` result, show a button to open it.
- **When the URL is empty**, show `.ms-coming-soon`: "Padam's mentor lecture is coming soon" / "It will appear right here. Read the playbook and take the quiz meanwhile." In that case, **the lecture does not block the quiz.**
- The "I have watched the lecture" button calls `mentorship_mark_training('lecture')`.

### 8.2 Written playbook

The mentor builder writes this as `.ms-prose` inside `.ms-acc` sections. The content must cover:
1. **Your role.** You are an elder brother or sister through the hunt, from week 1 to the joining post. Hojayega.
2. **The duties.** List `DUTIES` titles and details, grouped as: Responding, Weekly rhythm, Hunt support, Joining, Never.
3. **Your first 24 hours.**
   - The intro message (`FIRST_MESSAGES.intro`).
   - Ask for their CV, domains and where they have applied.
   - Fix the first call.
   - Tick "Intro sent".
   - Show every `FIRST_MESSAGES` template in a `.ms-template` with a Copy button.
4. **Weekly call script (15 minutes).**
   - Opening: how was your week?
   - Numbers: applications sent, shortlists, interviews, stage.
   - Blockers.
   - One focus for next week (an applications target, CV fixes, a domain to revise).
   - Close: date of the next call.
   - Afterwards, log it on the dashboard right after the call (week, stage, applications, notes).
5. **CV review checklist.**
   - One page.
   - Contact details and LinkedIn at the top.
   - Articleship work first, with specifics: clients by industry (not names), audits handled, tools.
   - Skills that match the target domain.
   - Scores and attempts stated honestly.
   - No photo, no long objective.
   - Consistent dates, a PDF, and a sensible file name.
   - Re-check the revised version.
   - Point them to the AI CV reviewer and the CV builder.
6. **Mock interview guide (30 to 45 minutes).**
   - "Tell me about yourself" in 60 to 90 seconds.
   - Why this domain and this firm.
   - Articleship deep-dive.
   - 5 to 8 domain technical questions (use the MSC interview booklets).
   - A situational question.
   - Their questions to the interviewer.
   - Feedback: 3 strengths and 3 fixes, then repeat.
7. **Keep them applying.**
   - Weekly targets.
   - Openings come late: "sate hai, wo last last mein hi aate hai".
   - Rejections are normal.
   - Never let them quit early.
   - No promises.
8. **MSC resources.** List `RESOURCES` with Copy buttons. Explain when to share each one. Everything is on `mystudentclub.com/links`.
9. **Padam GPT.** Use it for interview-prep questions. Use `config.padam_gpt_url`; when it is empty, show the "coming soon" pill.
10. **After the offer.**
    - Read the offer letter together.
    - Joining formalities: documents and ICAI paperwork.
    - First-week doubts.
    - The joining LinkedIn post tags **Padam Bhansali, My Student Club, you (the mentor) and their parents**.
    - Tick the checklist items.
11. **Escalation.**
    - Escalate to your senior mentor (WhatsApp from the dashboard) for:
      - anything you are unsure of;
      - a mentee who has been silent for 8 days;
      - a wellbeing concern (the same day);
      - payment or behaviour issues.
    - Never guess.
12. **Dos and don'ts.**
    - **Do:** respond within 4 to 5 hours; be honest; log every call; keep it private.
    - **Don't:** sell courses or groups; move mentees to other groups; take money or favours; promise a job, referral or placement; paste personal details into AI tools; log calls that didn't happen.
13. **Payouts.** Rs `{fee}` per mentee, paid by Team MSC. The dashboard shows each payout's status. No money ever comes from mentees.

The "I have read the playbook" button calls `mentorship_mark_training('playbook')`.

### 8.3 Quiz

**Content**
- **12 scenario MCQs**, one per duty area:
  1. Intro within 24 hours.
  2. The 4 to 5 hour response.
  3. Nothing unread at the end of the day.
  4. Keeping them applying.
  5. No placement promise.
  6. Don't guess; escalate.
  7. No selling or poaching.
  8. Offer, joining formalities and the joining post.
  9. A mentee who goes silent, and an honest log.
  10. CV review.
  11. Mock interview.
  12. Wellbeing escalation.
- **Pass mark:** `config.quiz_pass_pct`, 80%, which means 10 of 12. Retry after `quiz_cooldown_hours` (24) following a failed attempt.
- **The questions and answers are private.** Team MSC keeps the key outside this repo. The SQL builder converts it into the gitignored `supabase/mentorship/mentorship_quiz_seed.local.sql`. It never goes into a committed file or into client code.

**Page behaviour**
- The quiz is enabled once `training.playbook_at` is set. Otherwise it shows a disabled state: "Read the playbook first."
- Questions come from `mentorship_quiz_questions()` and are rendered as `.ms-option` radio cards, with "7 of 12 answered" progress. Submit unlocks when every question is answered.
- **Result:**
  - an `.ms-score` ring;
  - when failed: "Questions 3, 7 need another look", plus the time of the next attempt and a link to the playbook;
  - when passed: the explanations, then "You're in review. Team MSC reviews every application within 7 days, and we will email you the decision."
  - If the mentor is already approved, link to the dashboard instead.

---

## 9. Student side

### 9.1 Find a mentor (`/mentorship/find/`)

**Who sees what**
- **Logged out:** a hero with a login CTA (`loginUrl()`), and no data.
- **Logged in:** `mentorship_list_mentors(program)`.
- **Not enrolled in the program:** a banner, "Mentors are part of the MSC Industrial Training Program", with a link to `PROGRAMS[p].page`. Choose buttons read "Enrol to choose".
- **Already matched for the program:** a banner, "You are matched with {name}", linking to My mentor. Choose buttons are disabled.

**Search and filters**
- Program tabs appear only when more than one program is enabled.
- The search box covers the name, headline, `it_company`, `articleship_firm`, `employer`, `companies_known` and the domain labels.
- The **Available only** toggle defaults to on.
- Filters:
  - Domain (multi);
  - Firm type (articleship);
  - Mentor stage: "Doing IT now", "Completed IT", "Qualified CA";
  - City;
  - Language;
  - Company: chips for the top companies, counted from the data.
- On phones the filters open in a bottom sheet with an active-filter count; from 1024px they sit in a sidebar.
- Sorting:
  - **Recommended** (the default): available first, then a Bayesian rating `(avg*count + 4.5*3)/(count+3)`, then the server's rotation order;
  - Most reviews;
  - Most slots left;
  - Newest.

**Mentor card** (`.ms-mentor-card`)
- The avatar shows a verified tick when `linkedin_checked`, with the title "LinkedIn checked by Team MSC".
- Name and tier chip; the short stage label; `ratingHtml` (which shows "New mentor" under 3 reviews); the headline, clamped to 2 lines.
- The first 2 `journeyLines`; languages and city.
- Slots left: green, amber at 2 or fewer, grey when full.
- Buttons: Profile and Choose.

**Profile sheet** (wide modal, deep-linked with `?mentor=<id>`) uses `mentorship_mentor_public`:
- **Header:** avatar, name, tier, stage, and badges ("LinkedIn checked", "Topmate reviews checked").
- **Links:** "See reviews on Topmate" points to `topmate_url` (`rel="noopener"`, `target="_blank"`), and LinkedIn appears if it was returned.
- **Profile body:**
  - the `wish_i_knew` quote;
  - About (the bio);
  - a journey timeline;
  - domain chips;
  - companies they know;
  - languages;
  - call slots.
- **Reviews:** stars, tags, body, author and month, plus tag counts. When there are none, show "No reviews yet. This mentor is new to MSC."
- **Footer note:** "Mentors share their own experience. Nobody on MSC can promise you a job, referral or placement, and no one should ask you for money."
- **Choose** button.

**Booking** (modal)
1. Show the mentor's mini card.
2. Collect the student's name, prefilled from `ctx.student` or `getProfilePrefill()`.
3. Collect their WhatsApp number (required, a valid Indian mobile) and city (optional).
4. Show all `STUDENT_COMMITMENTS` as `.ms-check` boxes; every one is required.
5. The "Confirm {first_name} as my mentor" button calls `mentorship_save_student`, then `mentorship_book`.

Errors:
- `mentor_full` or `mentor_unavailable`: show a toast and refresh the list.
- `already_matched`, `mentorship_completed` or `mentorship_ended`: show the message, then go to My mentor.
- `not_enrolled`: show the program CTA.
- `invalid_input` with hint `full_name` or `whatsapp`: mark that field.

**Success screen**
- "You are matched with {name}! {name} will message you on WhatsApp within 24 hours. You will also get an email with their details."
- A primary WhatsApp button, "Say hi to {first}". It uses `waLink(mentor.whatsapp, 'Hi {first}, this is {student} from My Student Club. You are my mentor for Industrial Training!')`.
- A secondary "Go to My mentor" button.
- Refresh the context with `getContext({force:true})`.

### 9.2 My mentor (`/mentorship/my-mentor/`)

**Data and empty states**
- Uses `mentorship_my_match()`.
- **No match:**
  - enrolled: "Pick your mentor", linking to find;
  - not enrolled: the program page;
  - either way, explain what mentorship includes.
- **Finished:** with no active match and a `completed` one, show "Your mentorship is complete" (a joining-post reminder and the review button), not "Pick your mentor": self-booking is closed for that program. After an `ended` match, show "Your mentorship was closed" with a Contact Team MSC button (Team MSC sets up the next mentor). Find shows the same state for `ctx.closedMatches`.
- **No WhatsApp yet:** an admin-assigned student whose card has no WhatsApp number sees an "Add your WhatsApp so {first} can reach you" form (`mentorship_save_student`) above the mentor card.
- Show a program switcher when there are several matches.

**Mentor card** (`.ms-contact`)
- Avatar, name, tier, stage, headline.
- Buttons: WhatsApp (`waLink`), Call (`telLink` on the WhatsApp number; the mentor's mobile is staff-only), Email (`mailtoLink`), and Topmate when present.
- "Matched on {date} · Week {n}".

**What to expect / Your progress**
- `matches[].checklist` (done dates only) turns this card into "Your progress, n of 9" with a done date per step.
- Your mentor responds within 4 to 5 hours, does a weekly call, reviews your CV, takes a mock interview, shares the right MSC resources, and helps with joining formalities. They also make sure your joining post tags everyone.
- **What your mentor will never do:** ask for money, sell a course or group, move you to another group, or promise a job.
- "If something feels wrong, tell Team MSC" points to the switch request or the contact page.

**Weekly pulse card** (`?pulse=1` scrolls to it and opens it)
- Labelled "Takes 30 seconds". "Your answers go to Team MSC, not to your mentor."
- Fields:
  - applications this week (a number stepper);
  - stage (`HUNT_STAGES`);
  - "Did your mentor call you this week?" (Yes/No as option cards);
  - "How is your mentor doing?" (a `.ms-star-input` from 1 to 5);
  - "Anything wrong? (optional, private)" as a textarea.
- Submits `mentorship_submit_pulse`. Once done, show a summary with an Edit button; resubmitting in the same week updates it.

**Review card**
- **Before `review_eligible_at`:** "You can review {first} from {date}".
- **Once `can_review`:** a form with stars, up to 3 `REVIEW_TAGS`, an optional public text (≤ 600), and a private question ("Did your mentor ask for money, sell you a course or promise a job?" Yes/No, sent as `p_safety_flag`), plus an optional private note. It calls `mentorship_submit_review`.
- **Afterwards:** show the review with an Edit button.

**Switch** ("Need a different mentor?")
- A modal asks for a reason (20 to 600 characters) and calls `mentorship_request_switch`.
- When a request is pending, show its status. When `switch_available` is false and nothing is pending, say "You have used your switch. Contact Team MSC if something is wrong."

---

## 10. Mentor dashboard (`/mentorship/mentor/`)

**Gate by status**

| status | screen |
|---|---|
| no row | CTA to apply |
| `draft` | Continue your application |
| `submitted` | Training CTA |
| `training_passed` | "In review": what happens next, the expected time (7 days), and a link to reread the playbook |
| `rejected` | The reason, and the date they can apply again |
| `paused` | A banner with the reason. Existing mentees stay fully workable |
| `approved` | The full dashboard |

Data comes from `mentorship_my_mentor()` and `mentorship_my_mentees()`.

**Header**
- A greeting and the status badge.
- "{active} of {max} mentees", as a progress bar.
- The **Taking new mentees** switch, which saves `{accepting}` through `mentorship_save_mentor`.
- Quick actions:
  - Playbook (links to training);
  - **Padam GPT** (`config.padam_gpt_url`, or a "Coming soon" pill when empty);
  - **Escalate to {senior mentor}** (the WhatsApp link from `escalation`);
  - Resources.

**Mentees tab** (the default)
- **"Today" callout:** generated from the flags, for example "Send Kabir's intro (due today)" or "Pooja: no call in 9 days".
- **One card per mentee (`?match=` expands it):**
  - avatar, name, city, program, "Week N";
  - buttons: WhatsApp (with the intro template while `intro_sent` is not done, the weekly template after that), Call, Email, and **Message templates** (a modal listing every `FIRST_MESSAGES` entry filled with `fillTemplate`, each with Copy and Open in WhatsApp).
- **Checklist (`CHECKLIST_ITEMS`):**
  - Tapping an item calls `mentorship_set_checklist`.
  - A done item shows its date.
  - A pending item with `dueDays` is styled `.is-due` on the due day and `.is-late` after it.
- **Call log:**
  - **Log this week's call** opens a modal with:
    - week (prefilled with `weekNumber(started_at)`, editable);
    - date (defaults to today in IST, no future dates);
    - stage (`HUNT_STAGES`);
    - applications this week;
    - interviews;
    - notes.
  - It saves through `mentorship_log_call`.
  - A `.ms-timeline` shows the last 5 calls, with "Show all".
- **Template variables:** `mentee_first`, `mentor_first`, `mentor_name`, `program` (the label), `links_url` (config), `slot` (from the mentor's first `call_slots` entry, for example "this evening"), and `mentor_line`.
  - `mentor_line`: "I did my industrial training at {it_company} in {domain}", else "I did my articleship at a {firm type} firm in {domain}", followed by ", and I am now {role_title} at {employer}" when the mentor is qualified.

**Earnings tab**
- Stats:
  - "Rs {fee} per mentee";
  - "This batch: Rs {active_value_inr}" ({active} × fee);
  - Due;
  - Paid.
- A table of rows (mentee, program, started, match status, payout status, paid date and reference). It turns into stacked cards on phones.
- Note: "Payouts are made by Team MSC. Questions? Ask your senior mentor."

**Resources tab**
- `RESOURCES` cards, each with Copy link and Share on WhatsApp.
- The Padam GPT card.

**Profile**
- A link to `/mentorship/apply/` in edit mode.

---

## 11. Admin (`/mentorship/admin/`)

**Gate**
- `ctx.isStaff`. Anyone else sees "This page is for Team MSC" and no data is fetched.
- Senior mentors get the same views. Write buttons are hidden for them, except editing the staff note.

**Tabs** (`.ms-tabs`, with `?tab=`)

1. **Overview**
   - `mentorship_admin_overview` stats: mentors by status, active matches, unmatched, red flags, payouts due.
   - **Red flags** from `mentorship_admin_red_flags`, grouped by severity. Each shows the `RED_FLAGS[kind]` icon and label, the detail, and "since".
   - Each flag has actions: WhatsApp the mentor or mentee, open the match, and Reassign.
2. **Applications**
   - Mentors in `training_passed` first, then `submitted`.
   - Each card shows the stage, quiz result, submitted date and a consents count of n/21.
   - Clicking a card opens the **review panel** (wide modal, `?mentor=`, using `mentorship_admin_mentor_detail`). It contains:
     - the public card preview;
     - the private fields: mobile, WhatsApp, email, ICAI number, LinkedIn and Topmate links;
     - the scores table;
     - **View CV**, through `signedUrl('mentorship-cv', cv_path, 300)`;
     - the screening answers, with `SCENARIO_QUESTION` above the scenario answer;
     - conflicts and their note;
     - consents with timestamps (any missing ones highlighted);
     - training timestamps and quiz attempts;
     - verification switches (`linkedin_checked`, `topmate_checked`);
     - the staff note and a senior mentor select;
     - the events list.
   - Actions:
     - **Approve**, disabled until the quiz is passed;
     - **Reject**: the reason is required, with quick picks such as "We already have enough mentors for your profile this batch", "Please add a clearer photo and LinkedIn" and "Scenario answer needs more care". The mentor can apply again after 30 days.
     - **Pause / Resume.**
3. **Mentors**
   - Approved and paused mentors, with search, active/max counts, rating, flags, and CSV export.
4. **Matches** (`mentorship_admin_matches`)
   - A table with the mentor, mentee, week, last call, last pulse rating, checklist n/9 and payout status.
   - Actions:
     - **Reassign:** pick a mentor with capacity; a "force" checkbox overrides capacity.
     - **End:** completed or ended, with a reason.
   - CSV export.
5. **Unmatched**
   - **Assign** opens a mentor picker, which calls `mentorship_admin_create_match`.
   - Each row has a WhatsApp link to the student. CSV export.
6. **Switch requests**
   - Approve (pick the new mentor) or decline (with a note).
7. **Payouts**
   - Filter by payout status.
   - Select rows, then **Mark due**, **Mark paid** (with a reference such as a UPI id) or **Void**, through `mentorship_admin_set_payout`.
   - Totals and CSV export.
8. **Reviews**
   - Safety-flagged reviews first; Hide/Publish through `mentorship_admin_set_review`.
9. **Settings**
   - An editor for every config key:
     - fee;
     - lecture URL and Padam GPT URL (validated as https or empty);
     - links URL;
     - escalation contact (name, WhatsApp, email);
     - `programs_enabled` toggles;
     - quiz pass percentage and cooldown;
     - review days, minimum reviews and switch limit;
     - the private `unmatched_*` and `red_flag_call_days` keys.
   - Saves through `mentorship_admin_set_config`.
10. **Staff**
    - A list. Admins can add someone by email with a role, and deactivate them.

CSV exports use `downloadCsv` with readable labels, for example `labelOf(DOMAINS, k)`.

---

## 12. Hub (`/mentorship/`, indexable)

**Hero**
- Eyebrow: "MSC Mentorship".
- H1: "A senior who has been there, for your IT hunt".
- Lead: "Pick a mentor who did industrial training where you want to go. WhatsApp support within hours, a weekly call, CV review and mock interviews, all the way to joining. Hojayega."

**Role-aware CTAs** (from `ctx`)
- Logged out: "Find your mentor" goes to login, then on to find.
- Enrolled with no match: "Find your mentor".
- Matched: "Open My mentor".
- Not enrolled: "Find your mentor" (browse) plus "Join the IT program".
- A mentor at any status: "Mentor dashboard", "Continue application" or "Mentor training", depending on the status.
- Staff also get "Admin".

**Sections**
1. **How it works for students**, in 4 steps:
   1. Pick your mentor.
   2. They message you within 24 hours.
   3. A weekly call, a CV review and a mock interview.
   4. Help until you join, plus a joining post that tags everyone who helped.
2. **What your mentor does**, a summary of the duties, and **what they never do.**
3. **For mentors.**
   - "Done your IT or articleship? Become a mentor."
   - Rs `{config.mentor_fee_inr}` per mentee, 5 to 10 mentees per batch, training and a short quiz, and approval by Team MSC.
   - "Become a mentor" CTA.
4. **FAQ** (`.ms-acc`):
   - Who are the mentors?
   - Is it included in my program?
   - Can I change my mentor? (one switch, through Team MSC)
   - What if my mentor doesn't respond? (the weekly check-in, Team MSC steps in)
   - Do mentors guarantee placement? No.
   - How are mentors chosen?
5. **Disclaimer**, in the footer copy.

Do not invent numbers. Show counts only if they come from data, and none are required.

---

## 13. Copy and voice (every page and mail)

**Voice**
- We are **Team My Student Club** ("we", "us"), and we speak to one student ("you").
- Warm, short sentences in Indian English. One or two Hinglish touches at most: "Hojayega", "Chalo", "All the best".

**Never**
- Promise placement, a job, a referral or an outcome. "We help you prepare" is fine; "we guarantee" and "we ensure" are not.
- Say Padam will respond, review or call. Padam appears only as the lecture's speaker, as "Padam GPT", and in the joining-post tagging rule (pages only, never in mail).
- Invent member counts or success numbers.
- Use the phrases "verified mentors", "guarantee", "100%", "hurry", "limited seats", "click here".

**Mentor-facing pages**
- The consent and duty statements are written in the mentor's own voice ("I will ...").

**Standard strings**

| Use | Copy |
|---|---|
| Backend not ready | "Mentorship is being set up. Please check back soon." |
| Private field tag | "Only Team MSC sees this" |
| Matched-only tag | "Shared only with your matched mentees" |
| Public tag | "Shown on your profile" |
| Student disclaimer | "Mentors share their own experience. Nobody on MSC can promise you a job, referral or placement, and no one should ask you for money." |
| Pulse privacy | "Your answers go to Team MSC, not to your mentor." |
| Empty mentees | "No mentees yet. When a student picks you, they show up here with their WhatsApp number." |

---

## 14. Ownership, integration and testing

| Builder | Owns (creates and edits only these) |
|---|---|
| architect | `mentorship/SPEC.md`, `mentorship/assets/*`, plus the one-off lines added to `serve.json` and `.gitignore` |
| SQL builder | `supabase/mentorship/*`: `001_mentorship.sql`, `001_mentorship_down.sql`, `verify.sql`, `README.md`, and the gitignored `mentorship_quiz_seed.local.sql` |
| mentor builder | `mentorship/apply/*`, `mentorship/training/*`, `mentorship/mentor/*` |
| student builder | `mentorship/find/*`, `mentorship/my-mentor/*` |
| admin builder | `mentorship/admin/*`, `mentorship/index.html`, `mentorship/hub.js`, `mentorship/hub.css` |
| mail builder | the msc-mail repo (branch `mentorship-mails`): templates, `lists.js`, `sample.js`, `handlers/mentorship.js`, the registry, tests and docs (§6) |

**Rules for every builder**
- **No commits, pushes or deploys.** No `wrangler` or Pages commands, no Sendy or SES calls, and no writes to production Supabase.
- Don't touch `mentor.html`, `mentor-profile.html`, `mentor-dashboard.html` or any other page outside your folders.
- Code against the contract here and in `mock-data.js`. Verify your pages in mock mode at **375px and 1280px**, for every persona that reaches them, with no console errors and no horizontal scroll.
- If you need a core change or a new shared component, **do not edit `assets/`**. Report it in your final notes, and in the meantime put a page-local version in your folder.

**SQL builder**
- **File and transaction:**
  - One idempotent file with a header (WHAT IT DOES / HOW TO APPLY / ROLLBACK / VERIFY).
  - `begin; set local lock_timeout = '3s'; … commit;`.
  - `create table if not exists` is allowed **only for the new `mentorship_*` names**.
  - `drop policy if exists`, `create or replace function`.
- **Seeding:** seed config `on conflict (key) do nothing`.
- **Rollback and verify:**
  - The `_down.sql` drops everything the migration creates. It keeps the storage buckets and prints a note about them.
  - `verify.sql` is read-only and checks:
    - tables and RLS on;
    - no policies for anon or authenticated on the tables;
    - the function list and grants;
    - the triggers;
    - the config keys;
    - the bucket and policy count.
- **Testing:** use PGlite (`@electric-sql/pglite`, as in msc-mail), with the tests kept outside this repo. Provide stubs for:
  - the `auth.users` table;
  - `auth.uid()` reading a GUC;
  - the `anon`, `authenticated` and `service_role` roles;
  - a `storage` schema;
  - `public.enrollment(uuid, course, batch, created_at)` and `public.profiles(uuid, profile jsonb)`.
- **What the tests must cover:**
  - the whole flow: apply, submit, quiz, approve, book (including races and capacity), log, pulse, review, switch, reassign and red flags;
  - the mail triggers with and without a stub `mail_enqueue`;
  - that `anon` and `authenticated` cannot select any table.

**Mail builder**
- Follow §6 and the mail brief.
- `npm run build` must report 0 errors and `npm test` must be all green. The baseline is 911 tests; add `worker/test/mentorship.test.js`.

---

## 15. Open decisions for Padam (defaults are already built in)

1. **Payout timing.** Rs 500 per mentee is configurable. The default here is that an admin marks matches due or paid by hand. When should a mentee become "due"? For example, after the first call plus 4 weeks, or at joining.
2. **Peer mentors still in articleship.** The `in_articleship` stage is allowed so they can apply, and admins judge each case. Should they be allowed for Industrial Training at all?
3. **Directory visibility.** The default is logged-in users only, so mentor names and companies are not public on the web. A public read-only list would help marketing.
4. **Senior mentor powers.** The default is read-only plus notes, and an admin approves, rejects and reassigns. Should senior mentors be able to reassign?
5. **Old portal.** Should `/mentor.html` and the other old portal pages be redirected to `/mentorship/` later, with a `_redirects` line? They are untouched for now.
6. **Review threshold.** The default shows "New mentor" until 3 reviews.
