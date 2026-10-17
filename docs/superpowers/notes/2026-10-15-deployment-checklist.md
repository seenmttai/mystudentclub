# Deployment checklist: Airy Flow mobile web port (Tasks 5 and 9) - NOT EXECUTED

Nothing here has been run. No migration, Worker deploy, Pages deploy or Supabase write was performed. Run it only with explicit backend/deploy approval, in a staging project first.

Pinned inputs: master `129251eab`, overhaul `f8430d53d` (`37b3dc3ed`, `40641617f`, `3cf383e44`, `ab7eccb0e`), logo `35bc7e5d8`, mobile base candidates `upstream/mobile 9748fdd08` (LIVE) vs `mobile-bugs 04ccbd5a9` (see `2026-10-15-mobile-host-verification.md`).

## 0. Choose the source base (blocking)
- [ ] Live host == `upstream/mobile 9748fdd08`, which does not contain `mobile-bugs 04ccbd5a9` (and mobile-bugs lacks the 3 live logo commits). Decide the base, reconcile, and re-run `node --test tests/*.test.cjs`.
- [ ] Record Cloudflare Pages project, current production deploy ID (rollback target), and deploy hook/branch. Not discoverable from outside.
- [ ] Note: the live host's own logo implementation (inline new mark) differs from this tree's horizontal `assets/logo.png` header image; the port here follows the requested horizontal logo. Confirm with design.

## 1. Backend SQL (Task 5) - files vendored from overhaul `f8430d53d`, unmodified
Apply in this order in the target project (staging, then production), each in its own transaction (files already wrap in `BEGIN/COMMIT`):
1. `database/20260927-public-resource-catalog.sql` (v1 `get_public_resource_catalog`; already deployed in production per probe, 200 OK names-only) and `database/20260927-resource-catalog-path-validation.sql` (replaces v1 function body only).
2. `database/20260927-public-resource-catalog-v2.sql` creates `get_public_resource_catalog_v2(p_program text)`; execute granted to `anon, authenticated`. **Production currently returns PGRST202 for v2**, so the library is on the v1 fallback (no day/group labels) until this is applied.
3. `supabase/migrations/202609270001_career_intake.sql` creates `career_intakes` (RLS on, only `select` own row for `authenticated`), `submit_career_intake(p_stage,p_details,p_source)` (execute: `anon, authenticated`), writes profile merge, `consentform` and `resource_access_logs`. It aborts up front if `profiles(uuid,profile,looking_for,updated_at)`, `resource_access_logs(name,email,phone,program_type,program_display,resource_title,resource_url,accessed_at)` or `consentform(user_id,cv_sharing_consent,consent_text,consented_at,withdrawn_at,updated_at,user_agent)` columns are missing; `consentform.cv_sharing_consent` must be boolean.

Pre-checks (read-only, SQL editor):
```sql
select to_regclass('public.career_intakes') as career_intakes, to_regclass('public.resource_access_logs') as logs, to_regclass('public.consentform') as consent;
select proname, pg_get_function_identity_arguments(oid) from pg_proc where pronamespace='public'::regnamespace and proname in ('submit_career_intake','get_public_resource_catalog','get_public_resource_catalog_v2');
select polname, polcmd from pg_policy where polrelid='public.career_intakes'::regclass;
select grantee, privilege_type from information_schema.role_table_grants where table_name='career_intakes';
select id, public from storage.buckets where id='industrial-training-mastery-resources';   -- expect exists, public=false
select policyname, cmd, roles from pg_policies where schemaname='storage' and tablename='objects';
```
Read-only anon probes (already done 2026-10-15, results in the verification note): v2 -> 404 PGRST202; v1 -> 200 names only.

Red/green smoke with disposable identities (do not record tokens or personal data):
- anon `rpc/get_public_resource_catalog_v2` returns rows with no `url`, `view_storage_path`, `download_storage_path` fields (green after step 2).
- anon `rpc/submit_career_intake` with `p_details.sharing_consent=true`, `consent_version='2026-09-27'`, stage in `ca-fresher|industrial-training|articleship|semi-qualified` creates exactly one `career_intakes` row and one `resource_access_logs` row; the same call without consent is rejected; anon cannot `select` from `career_intakes`.
- authenticated, non-enrolled user: `storage.from('industrial-training-mastery-resources').createSignedUrl(<known path>)` is denied; enrolled user receives a working signed URL; guessing a protected URL without a signature fails.
- Record migration ID(s), rollback approach (for functions: restore the previous definition from `git show <prior>:...`; never delete captured `career_intakes` rows) and who approved.

## 2. Notify Worker (Task 8) - external repo (msc-mail)
- [ ] `POST https://notify.mystudentclub.com/placed/start` exists (401 unauthenticated, verified). **CORS blocks the mobile origin: preflight with `Origin: https://mobile.mystudentclub.com` returned 403; only `https://www.mystudentclub.com` is allowed.** The Worker's allow-list must include the mobile origin (and any staging origin) before the hosted card can work in the WebView.
- [ ] Verify with a disposable signed-in account that the returned `href` is on `https://notify.mystudentclub.com/placed` and that the offer-letter file picker/upload works in the iPhone WebView. A missing Worker or failing picker is a release stop.

## 3. Pre-deploy gates (local, run before staging)
```
node --test tests/mobile-webview-routes.test.cjs tests/mobile-program-pages.test.cjs tests/mobile-resource-routes.test.cjs tests/resource-form-stage.test.cjs tests/placed-card.test.cjs tests/cv-builder-download.test.cjs tests/cv-builder-template-default.test.cjs
```
(`npm test` is still the placeholder failing script; run `node --test` directly or wire a script.) With staging up, re-run with `MOBILE_SITE_ORIGIN=https://<staging>`; the deployed route test fails on any root-index fallback.

## 4. Release order
1. Backend (section 1) in staging, verify; then production.
2. Deploy the selected static build to a Pages preview (not a copy of master/overhaul). Record deploy ID, source commit, migration IDs, Worker version, previous deploy ID.
3. Smoke on staging: `MOBILE_SITE_ORIGIN` test green; reveal gated links for QA with `localStorage.setItem('msc-enable-new-resources','1')`.
4. Physical iPhone matrix (current full-screen WebView, light/dark, notch/home-indicator, keyboard): web header and LMS bottom nav, back links, session refresh/account switch, five resource stage routes, free DOCX download (native blob bridge) and PDF preview (same-tab viewer, back button), premium denial vs enrolled access, domain-wise list, CV export, program CTAs, placement Worker picker/upload, plus LMS, AI interview, reviews, contact.
5. Only after 1-4: remove the `hidden`/`data-gated-resource` gate (menus in the five resource pages: `/articleship-resources.html`, `/semi-qualified-ca-resources.html`, `/domain-wise-hiring-companies.html`) and then ship the Flutter links (separate msc-app plan).
6. Promote production. Rollback: restore the recorded previous deploy; if backend cannot be reversed, hide new links and forward-fix.

> Update 2026-10-17: the Domain-wise Hiring Companies page (`/domain-wise-hiring-companies.html`) and its menu/footer links were removed from the mobile site at the user's request; the resource matrix above is now four stage routes and the Free Resources menu has six entries.

## 5. Known open items found in this port
- Industrial Training live-registration (master `adc53b657` payu CTA) is NOT ported in this tree (see report); `tests/mobile-program-pages.test.cjs` carries a `todo` for it.
- Premium file download on `/ca-resource/resource/?action=download` uses an anchor with a signed URL; the free path uses the native blob bridge. Confirm premium download on iPhone; if it fails, route it through the blob bridge too.
- Dark-mode appearance of the ported resource cards (tokens map to Airy Flow variables) needs a visual check at 320/390 px.
- The free Google Sheet (Hiring Companies List) opens in the same tab (no `_blank`), so users return with the viewer's back/WebView back.
