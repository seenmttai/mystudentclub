/**
 * /admin-offer-groups (super admins): WhatsApp group links for /offer-groups, the review queue of doubtful offer
 * letters (approve / reject / ban), verified students still waiting for a company group, and every claim.
 * Everything goes through the admin_offer_* RPCs (migration 202610310001_offer_groups.sql), each gated by
 * is_super_admin(). Letters open through short-lived signed URLs from the private offer-letters bucket.
 * "Interview answers" and "HR contacts" come from the "help the next student" step (migration
 * 202611170001_offer_insights.sql): read the answers, message each HR once with the intro below, mark it sent.
 */
(function (global) {
    'use strict';

    var CATEGORY_LABELS = { all: 'All categories', articleship: 'Articleship', 'industrial-training': 'Industrial Training', 'ca-fresher': 'CA Fresher', 'semi-qualified': 'Semi Qualified CA' };
    var REASONS = {
        company_unclear: 'Issuer not clear', name_mismatch: 'Name differs from account', suspected_edit: 'Looks edited',
        suspected_fake: 'Looks fake', duplicate_letter: 'Same letter on another account', not_clearly_an_offer: 'Not clearly an offer',
        needs_human: 'Checker could not finish', company_mismatch: 'Different company', not_offer_letter: 'Not an offer letter', unreadable: 'Unreadable'
    };
    var NOTES = { company_related: 'Group company', category_differs: 'Category differs', joining_date_differs: 'Joining date differs', city_differs: 'City differs' };
    var LINK = /^https:\/\/(chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}|(www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]{10,40})\/?(\?[A-Za-z0-9_=&.-]*)?$/;

    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            if (k === 'text') node.textContent = attrs[k];
            else if (k === 'class') node.className = attrs[k];
            else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
            else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) node.setAttribute(k, attrs[k]);
        });
        (children || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) node.append(c); });
        return node;
    }
    var date = function (s) { return s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
    var dateTime = function (s) { return s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''; };
    var chip = function (text, kind) { return el('span', { class: 'aog-chip aog-chip-' + (kind || 'grey'), text: text }); };

    /** The intro the team sends an HR a student shared (WhatsApp or email). */
    function hrIntro(name) {
        var first = String(name || '').trim().split(/\s+/)[0];
        return 'Hi' + (first ? ' ' + first : '') + ', this is Team My Student Club (MSC). We help companies hire CA students for Industrial Training and Articleship, and CA Freshers.\n\n'
            + 'If you are going to hire for industrial training anytime soon, please let us know. We will be really glad to help you with the right talent who can join immediately, as per your specific criteria.\n\n'
            + 'You can also post the role on hire.mystudentclub.com and use our AI tools to shortlist. Thank you!';
    }

    function csv(rows) {
        var cols = ['created_at', 'status', 'name', 'email', 'category', 'company', 'city', 'domain', 'joining_date', 'reasons', 'notes'];
        var esc = function (v) { var s = Array.isArray(v) ? v.join('; ') : String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        return [cols.join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return esc(r[c]); }).join(','); })).join('\n');
    }

    function init(opts) {
        var o = opts || {};
        var root = o.root || document.getElementById('aog-app');
        if (!root) return null;
        var client = o.client || global.supabaseClient || (typeof global.getSupabaseClient === 'function' ? global.getSupabaseClient() : null);
        var ask = o.prompt || function (q, d) { return global.prompt(q, d); };
        var confirmBox = o.confirm || function (q) { return global.confirm(q); };
        var state = { tab: 'review', companies: [], counts: {} };
        var status = el('p', { class: 'aog-status', role: 'status' });
        var body = el('div', { class: 'aog-body' });
        var tabs = el('nav', { class: 'aog-tabs', 'aria-label': 'Sections' });

        function say(text, bad) { status.textContent = text || ''; status.className = 'aog-status' + (bad ? ' aog-bad' : ''); }
        async function rpc(fn, args) {
            var r = await client.rpc(fn, args || {});
            if (r.error) throw new Error(r.error.message || 'Something went wrong');
            return r.data;
        }

        function renderTabs() {
            var items = [['review', 'To review'], ['groups', 'Group links'], ['missing', 'Missing groups'], ['claims', 'All claims'], ['answers', 'Interview answers'], ['hr', 'HR contacts']];
            tabs.replaceChildren.apply(tabs, items.map(function (t) {
                var n = state.counts[t[0]];
                return el('button', { type: 'button', class: 'aog-tab' + (state.tab === t[0] ? ' aog-tab-on' : ''), 'aria-pressed': String(state.tab === t[0]), onclick: function () { state.tab = t[0]; show(); } },
                    [document.createTextNode(t[1]), n ? el('span', { class: 'aog-count', text: String(n) }) : null]);
            }));
        }

        async function show() {
            renderTabs();
            say('Loading…');
            body.replaceChildren();
            try {
                if (state.tab === 'review') await showClaims('review');
                else if (state.tab === 'groups') await showGroups();
                else if (state.tab === 'missing') await showMissing();
                else if (state.tab === 'answers') await showAnswers();
                else if (state.tab === 'hr') await showHr();
                else await showClaims('all');
                say('');
            } catch (e) { say(e.message, true); }
        }

        // ---- claims ----

        async function openLetter(c, holder) {
            holder.replaceChildren(el('span', { class: 'aog-muted', text: 'Opening…' }));
            var paths = (c.page_paths || []).slice();
            if (c.file_path) paths.unshift(c.file_path);
            var links = [];
            for (var i = 0; i < paths.length; i++) {
                var r = await client.storage.from('offer-letters').createSignedUrl(paths[i], 600);
                if (r.error) { holder.replaceChildren(el('span', { class: 'aog-bad', text: 'Could not open: ' + r.error.message })); return; }
                links.push(r.data.signedUrl);
            }
            holder.replaceChildren.apply(holder, links.map(function (u, i) {
                var label = c.file_path && i === 0 ? 'Original file' : 'Page ' + (c.file_path ? i : i + 1);
                return el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', class: 'aog-link', text: label });
            }).concat(el('span', { class: 'aog-muted', text: 'Links work for 10 minutes.' })));
        }

        function claimCard(c, reload) {
            var ai = c.ai || {};
            var letter = el('div', { class: 'aog-letter' });
            var act = function (decision) {
                return async function () {
                    var note = decision === 'reject' ? ask('Why is it rejected? The student can try again.', '') : '';
                    if (note === null) return;
                    try { await rpc('admin_offer_claim_decide', { p_id: c.id, p_decision: decision, p_note: note || null }); say(decision === 'approve' ? 'Approved: ' + c.name + ' now sees the groups.' : 'Done.'); reload(); }
                    catch (e) { say(e.message, true); }
                };
            };
            var ban = async function () {
                var reason = ask('Ban ' + c.name + ' (' + c.email + ') permanently? Write the reason (they cannot sign in to MSC again):', 'Fake / edited offer letter');
                if (!reason) return;
                if (!confirmBox('This blocks sign-in on the site, the app and hire.msc for ' + c.email + '. Continue?')) return;
                try {
                    var r = await rpc('admin_offer_ban', { p_claim_id: c.id, p_reason: reason });
                    say(r && r.auth_banned ? 'Banned.' : 'Recorded as banned, but Supabase Auth did not take the ban. Ban the user in Supabase → Authentication too.', !(r && r.auth_banned));
                    reload();
                } catch (e) { say(e.message, true); }
            };
            var unban = async function () {
                if (!confirmBox('Lift the ban on ' + c.email + '?')) return;
                try { await rpc('admin_offer_unban', { p_user_id: c.user_id }); say('Ban lifted.'); reload(); } catch (e) { say(e.message, true); }
            };
            var statusKind = { verified: 'green', review: 'amber', rejected: 'red', revoked: 'red' }[c.status];
            return el('article', { class: 'aog-card' }, [
                el('div', { class: 'aog-card-head' }, [
                    el('div', {}, [el('strong', { text: c.name }), el('span', { class: 'aog-muted', text: ' · ' + (c.email || '') })]),
                    el('div', { class: 'aog-chips' }, [chip(c.status, statusKind), c.banned ? chip('banned', 'red') : null, c.attempts > 1 ? chip(c.attempts + ' attempts') : null])
                ]),
                el('p', { class: 'aog-line' }, [el('b', { text: c.company }), document.createTextNode(' · ' + c.city + ' · ' + (CATEGORY_LABELS[c.category] || c.category) + (c.domain ? ' · ' + c.domain : '') + ' · joining ' + date(c.joining_date))]),
                (c.reasons || []).length || (c.notes || []).length ? el('div', { class: 'aog-chips' }, (c.reasons || []).map(function (r) { return chip(REASONS[r] || r, 'amber'); }).concat((c.notes || []).map(function (n) { return chip(NOTES[n] || n); }))) : null,
                ai.summary ? el('p', { class: 'aog-summary', text: ai.summary }) : (ai.error ? el('p', { class: 'aog-summary aog-bad', text: 'Checker error: ' + ai.error }) : null),
                ai.issuer_as_printed || ai.candidate_name ? el('p', { class: 'aog-muted aog-small', text: 'On the letter: ' + [ai.issuer_as_printed, ai.candidate_name && 'to ' + ai.candidate_name, ai.designation, ai.joining_date && 'joining ' + ai.joining_date, ai.work_city].filter(Boolean).join(' · ') }) : null,
                (ai.tamper_signs || []).length ? el('ul', { class: 'aog-tamper' }, ai.tamper_signs.map(function (t) { return el('li', { text: t }); })) : null,
                c.review_note ? el('p', { class: 'aog-small', text: 'Note: ' + c.review_note + (c.reviewed_at ? ' (' + dateTime(c.reviewed_at) + ')' : '') }) : null,
                el('div', { class: 'aog-actions' }, [
                    el('button', { type: 'button', class: 'aog-btn', onclick: function () { openLetter(c, letter); }, text: 'View letter' }),
                    c.status !== 'verified' ? el('button', { type: 'button', class: 'aog-btn aog-btn-ok', onclick: act('approve'), text: 'Approve' }) : null,
                    c.status === 'review' || c.status === 'verified' ? el('button', { type: 'button', class: 'aog-btn', onclick: act('reject'), text: 'Reject (can retry)' }) : null,
                    c.status === 'verified' ? el('button', { type: 'button', class: 'aog-btn', onclick: act('revoke'), text: 'Withdraw groups' }) : null,
                    c.banned ? el('button', { type: 'button', class: 'aog-btn', onclick: unban, text: 'Lift ban' }) : el('button', { type: 'button', class: 'aog-btn aog-btn-bad', onclick: ban, text: 'Ban account' }),
                    el('span', { class: 'aog-muted aog-small', text: 'Sent ' + dateTime(c.created_at) })
                ]),
                letter
            ]);
        }

        async function showClaims(mode) {
            var filter = el('select', { 'aria-label': 'Status' }, ['all', 'verified', 'review', 'rejected', 'revoked'].map(function (s) { return el('option', { value: s, text: s === 'all' ? 'All statuses' : s }); }));
            var search = el('input', { type: 'search', placeholder: 'Search name, email, company, city', 'aria-label': 'Search claims' });
            var list = el('div', { class: 'aog-list' });
            var exportBtn = el('button', { type: 'button', class: 'aog-btn', text: 'Download CSV' });
            var rows = [];
            async function load() {
                rows = await rpc('admin_offer_claims', { p_status: mode === 'review' ? 'review' : filter.value, p_search: mode === 'review' ? null : search.value || null, p_limit: 500 });
                if (mode === 'review') { state.counts.review = rows.length; renderTabs(); }
                list.replaceChildren.apply(list, rows.length ? rows.map(function (c) { return claimCard(c, load); }) : [el('p', { class: 'aog-muted', text: mode === 'review' ? 'Nothing to review. 🎉' : 'No claims match.' })]);
            }
            exportBtn.addEventListener('click', function () {
                var a = el('a', { href: URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv' })), download: 'offer-claims-' + new Date().toISOString().slice(0, 10) + '.csv' });
                document.body.append(a); a.click(); a.remove();
            });
            if (mode !== 'review') {
                var t;
                filter.value = 'verified';
                filter.addEventListener('change', load);
                search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(load, 300); });
                body.append(el('div', { class: 'aog-toolbar' }, [filter, search, exportBtn]));
            }
            body.append(list);
            await load();
        }

        // ---- groups ----

        function groupForm(g, done) {
            var category = el('select', { id: 'aog-g-cat', required: '' }, Object.keys(CATEGORY_LABELS).map(function (k) { return el('option', { value: k, text: CATEGORY_LABELS[k] }); }));
            var company = el('input', { id: 'aog-g-company', list: 'aog-companies', placeholder: 'Blank = not company-specific', maxlength: '80' });
            var city = el('input', { id: 'aog-g-city', placeholder: 'Blank = any city', maxlength: '60' });
            var title = el('input', { id: 'aog-g-title', required: '', maxlength: '80', placeholder: 'e.g. MSC · Deloitte Gurgaon (IT 2026)' });
            var url = el('input', { id: 'aog-g-url', required: '', type: 'url', placeholder: 'https://chat.whatsapp.com/…' });
            var active = el('input', { id: 'aog-g-active', type: 'checkbox' });
            category.value = (g && g.category) || 'industrial-training';
            company.value = (g && g.company) || '';
            city.value = (g && g.city) || '';
            title.value = (g && g.title) || '';
            url.value = (g && g.url) || '';
            active.checked = !g || g.active !== false;
            var err = el('p', { class: 'aog-bad', role: 'alert' });
            var form = el('form', { class: 'aog-form' }, [
                el('h3', { text: g && g.id ? 'Edit group' : 'Add a group' }),
                el('div', { class: 'aog-form-grid' }, [
                    el('label', { for: 'aog-g-cat' }, [document.createTextNode('Category'), category]),
                    el('label', { for: 'aog-g-company' }, [document.createTextNode('Company'), company]),
                    el('label', { for: 'aog-g-city' }, [document.createTextNode('City'), city]),
                    el('label', { for: 'aog-g-title' }, [document.createTextNode('Name students see'), title]),
                    el('label', { for: 'aog-g-url', class: 'aog-wide' }, [document.createTextNode('WhatsApp invite link'), url])
                ]),
                el('label', { class: 'aog-check', for: 'aog-g-active' }, [active, document.createTextNode(' Active (students get this link)')]),
                el('p', { class: 'aog-muted aog-small', text: 'Students see every active group that fits them: company + city, company (any city), city, then the general group for their category.' }),
                err,
                el('div', { class: 'aog-actions' }, [
                    el('button', { type: 'submit', class: 'aog-btn aog-btn-ok', text: 'Save group' }),
                    el('button', { type: 'button', class: 'aog-btn', text: 'Cancel', onclick: function () { done(false); } })
                ])
            ]);
            form.addEventListener('submit', async function (e) {
                e.preventDefault();
                err.textContent = '';
                var link = url.value.trim().replace(/\/+$/, '');
                if (!LINK.test(link)) { err.textContent = 'Use a WhatsApp invite link like https://chat.whatsapp.com/AbCdEf1234567890'; url.focus(); return; }
                if (title.value.trim().length < 2) { err.textContent = 'Give the group a name.'; title.focus(); return; }
                try {
                    await rpc('admin_offer_group_save', { p_id: (g && g.id) || null, p_category: category.value, p_company: company.value.trim() || null, p_city: city.value.trim() || null, p_title: title.value.trim(), p_url: link, p_active: active.checked });
                    say('Saved. Students who match see it straight away.');
                    done(true);
                } catch (e2) { err.textContent = e2.message; }
            });
            return form;
        }

        async function showGroups(prefill) {
            var groups = await rpc('admin_offer_groups');
            var formHolder = el('div', {});
            var openForm = function (g) {
                formHolder.replaceChildren(groupForm(g, function (saved) { formHolder.replaceChildren(); if (saved) show(); }));
                formHolder.scrollIntoView({ behavior: 'smooth', block: 'start' });
            };
            var add = el('button', { type: 'button', class: 'aog-btn aog-btn-ok', text: '+ Add a group', onclick: function () { openForm(null); } });
            var table = el('table', { class: 'aog-table' }, [
                el('thead', {}, [el('tr', {}, ['Group', 'Category', 'Company', 'City', 'Students', ''].map(function (h) { return el('th', { text: h }); }))]),
                el('tbody', {}, groups.map(function (g) {
                    return el('tr', { class: g.active ? '' : 'aog-off' }, [
                        el('td', {}, [el('a', { href: g.url, target: '_blank', rel: 'noopener noreferrer', text: g.title }), g.active ? null : chip('off')]),
                        el('td', { text: CATEGORY_LABELS[g.category] || g.category }),
                        el('td', { text: g.company || '—' }),
                        el('td', { text: g.city || '—' }),
                        el('td', { text: String(g.members) }),
                        el('td', { class: 'aog-row-actions' }, [
                            el('button', { type: 'button', class: 'aog-btn aog-btn-sm', text: 'Edit', onclick: function () { openForm(g); } }),
                            el('button', { type: 'button', class: 'aog-btn aog-btn-sm aog-btn-bad', text: 'Delete', onclick: async function () {
                                if (!confirmBox('Delete "' + g.title + '"? Students will stop seeing it.')) return;
                                try { await rpc('admin_offer_group_delete', { p_id: g.id }); show(); } catch (e) { say(e.message, true); }
                            } })
                        ])
                    ]);
                }))
            ]);
            body.append(el('div', { class: 'aog-toolbar' }, [add]), formHolder, groups.length ? table : el('p', { class: 'aog-muted', text: 'No groups yet. Start with one general group per category, then company groups.' }));
            if (prefill) openForm(prefill);
        }

        async function showMissing() {
            var rows = await rpc('admin_offer_missing_groups');
            state.counts.missing = rows.length;
            renderTabs();
            if (!rows.length) { body.append(el('p', { class: 'aog-muted', text: 'Every verified student has a company group. 🎉' })); return; }
            body.append(el('p', { class: 'aog-muted', text: 'Verified students whose company has no group yet. Make the WhatsApp group, then add its link here: they see it on their page straight away.' }),
                el('table', { class: 'aog-table' }, [
                    el('thead', {}, [el('tr', {}, ['Company', 'City', 'Category', 'Students', 'Latest', ''].map(function (h) { return el('th', { text: h }); }))]),
                    el('tbody', {}, rows.map(function (r) {
                        return el('tr', {}, [el('td', { text: r.company }), el('td', { text: r.city }), el('td', { text: CATEGORY_LABELS[r.category] || r.category }), el('td', { text: String(r.students) }), el('td', { text: date(r.latest) }),
                            el('td', {}, [el('button', { type: 'button', class: 'aog-btn aog-btn-sm aog-btn-ok', text: 'Add group', onclick: function () {
                                state.tab = 'groups'; renderTabs(); body.replaceChildren();
                                showGroups({ category: r.category, company: r.company, city: r.city, title: 'MSC · ' + r.company + ' ' + r.city, active: true }).catch(function (e) { say(e.message, true); });
                            } })])]);
                    }))
                ]));
        }

        // ---- "help the next student" answers ----

        async function showAnswers() {
            var search = el('input', { type: 'search', placeholder: 'Search company, city, name or a question', 'aria-label': 'Search answers' });
            var list = el('div', { class: 'aog-list' });
            async function load() {
                var rows = await rpc('admin_offer_insights', { p_search: search.value || null, p_limit: 300 });
                list.replaceChildren.apply(list, rows.length ? rows.map(function (r) {
                    return el('article', { class: 'aog-card' }, [
                        el('div', { class: 'aog-card-head' }, [
                            el('strong', { text: (r.company || '?') + (r.city ? ' · ' + r.city : '') }),
                            el('span', { class: 'aog-muted aog-small', text: dateTime(r.updated_at) })
                        ]),
                        el('div', { class: 'aog-chips' }, [
                            chip(CATEGORY_LABELS[r.category] || r.category || 'No category'),
                            r.claim_status ? chip('Letter: ' + r.claim_status, r.claim_status === 'verified' ? 'green' : r.claim_status === 'review' ? 'amber' : 'grey') : null,
                            r.hr_count ? chip(r.hr_count + ' HR contact' + (r.hr_count === 1 ? '' : 's'), 'green') : null
                        ]),
                        el('p', { class: 'aog-muted aog-small', text: [r.name, r.email].filter(Boolean).join(' · ') }),
                        el('div', { class: 'aog-summary aog-pre', text: r.interview_questions })
                    ]);
                }) : [el('p', { class: 'aog-muted', text: 'No answers yet.' })]);
            }
            var t;
            search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { load().catch(function (e) { say(e.message, true); }); }, 300); });
            body.append(el('p', { class: 'aog-muted', text: 'What students were asked in their interviews, for the interview-prep material. Share questions without the student\'s name.' }),
                el('div', { class: 'aog-toolbar' }, [search]), list);
            await load();
        }

        async function showHr() {
            var filter = el('select', { 'aria-label': 'Status' }, [['new', 'Not messaged yet'], ['sent', 'Messaged'], ['skip', 'Skipped'], ['all', 'All']].map(function (x) { return el('option', { value: x[0], text: x[1] }); }));
            var search = el('input', { type: 'search', placeholder: 'Search company, name, phone or email', 'aria-label': 'Search HR contacts' });
            var list = el('div', { class: 'aog-list' });
            async function mark(h, to) {
                try { await rpc('admin_offer_hr_mark', { p_id: h.id, p_status: to }); say(to === 'sent' ? 'Marked as messaged: ' + (h.name || h.phone || h.email) + '.' : 'Done.'); await load(); }
                catch (e) { say(e.message, true); }
            }
            function hrCard(h) {
                var intro = hrIntro(h.name);
                var actions = [];
                if (h.phone) actions.push(el('a', { class: 'aog-btn aog-btn-ok aog-btn-link', href: 'https://wa.me/' + h.phone + '?text=' + encodeURIComponent(intro), target: '_blank', rel: 'noopener noreferrer', text: 'WhatsApp intro' }));
                if (h.email) actions.push(el('a', { class: 'aog-btn aog-btn-link', href: 'mailto:' + h.email + '?subject=' + encodeURIComponent('Hiring CA students? My Student Club can help') + '&body=' + encodeURIComponent(intro), text: 'Email intro' }));
                actions.push(el('button', { type: 'button', class: 'aog-btn', text: 'Copy intro', onclick: function () {
                    if (global.navigator && navigator.clipboard) navigator.clipboard.writeText(intro).then(function () { say('Intro copied.'); }, function () { say('Copy failed: select the text instead.', true); });
                } }));
                if (h.intro_status !== 'sent') actions.push(el('button', { type: 'button', class: 'aog-btn', text: 'Mark messaged', onclick: function () { mark(h, 'sent'); } }));
                if (h.intro_status === 'new') actions.push(el('button', { type: 'button', class: 'aog-btn aog-btn-bad', text: 'Skip', onclick: function () { mark(h, 'skip'); } }));
                if (h.intro_status !== 'new') actions.push(el('button', { type: 'button', class: 'aog-btn', text: 'Move back to not messaged', onclick: function () { mark(h, 'new'); } }));
                return el('article', { class: 'aog-card' }, [
                    el('div', { class: 'aog-card-head' }, [
                        el('strong', { text: (h.name || 'HR') + (h.company ? ' · ' + h.company : '') }),
                        el('span', { class: 'aog-muted aog-small', text: dateTime(h.created_at) })
                    ]),
                    el('p', { text: [h.phone ? '+' + h.phone : null, h.email].filter(Boolean).join(' · ') }),
                    el('div', { class: 'aog-chips' }, [
                        h.intro_status === 'sent' ? chip('Messaged ' + date(h.intro_sent_at), 'green') : h.intro_status === 'skip' ? chip('Skipped') : chip('Not messaged yet', 'amber'),
                        h.already_messaged ? chip('Already messaged via another student', 'red') : null,
                        h.shared_by_others ? chip('Shared by ' + h.shared_by_others + ' other student' + (h.shared_by_others === 1 ? '' : 's')) : null
                    ]),
                    el('p', { class: 'aog-muted aog-small', text: 'Shared by ' + ([h.student_name, h.student_email].filter(Boolean).join(' · ') || 'a student') + (h.city ? ' (' + h.city + ')' : '') }),
                    el('div', { class: 'aog-actions' }, actions)
                ]);
            }
            async function load() {
                var rows = await rpc('admin_offer_hr_contacts', { p_status: filter.value, p_search: search.value || null, p_limit: 500 });
                if (filter.value === 'new') { state.counts.hr = rows.length; renderTabs(); }
                list.replaceChildren.apply(list, rows.length ? rows.map(hrCard) : [el('p', { class: 'aog-muted', text: filter.value === 'new' ? 'Every HR contact has been messaged. 🎉' : 'No HR contacts match.' })]);
            }
            var t;
            filter.addEventListener('change', function () { load().catch(function (e) { say(e.message, true); }); });
            search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { load().catch(function (e) { say(e.message, true); }); }, 300); });
            body.append(el('p', { class: 'aog-muted', text: 'HR contacts students shared. Message each one once with the intro (it never mentions the student), then mark it messaged. Contacts students send on WhatsApp to 81041 35784 arrive in the desk inbox instead.' }),
                el('div', { class: 'aog-toolbar' }, [filter, search]), list);
            await load();
        }

        async function start() {
            root.replaceChildren(el('p', { class: 'aog-muted', text: 'Checking access…' }));
            if (!client) { root.replaceChildren(el('p', { class: 'aog-bad', text: 'Could not load. Refresh the page.' })); return; }
            var s = await client.auth.getSession();
            if (!s.data || !s.data.session) { root.replaceChildren(el('p', {}, [document.createTextNode('Please '), el('a', { href: '/login.html?redirect=' + encodeURIComponent('/admin-offer-groups'), text: 'sign in' }), document.createTextNode(' first.')])); return; }
            var admin = await client.rpc('is_super_admin');
            if (admin.error || !admin.data) { root.replaceChildren(el('p', { class: 'aog-bad', text: 'This page is only for MSC super admins.' })); return; }
            root.replaceChildren(tabs, status, body);
            if (!document.getElementById('aog-companies') && typeof fetch === 'function') {
                fetch('/assets/data/offer-companies.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
                    if (d) document.body.append(el('datalist', { id: 'aog-companies' }, d.companies.map(function (n) { return el('option', { value: n }); })));
                }).catch(function () { /* suggestions are optional */ });
            }
            try { state.counts.missing = (await rpc('admin_offer_missing_groups')).length; } catch (_) { /* shown when the tab opens */ }
            show();
        }

        start();
        return { state: state, show: show };
    }

    var api = { init: init, csv: csv, hrIntro: hrIntro };
    if (typeof module === 'object' && module.exports) module.exports = api;
    global.MSCAdminOfferGroups = api;
    if (typeof document !== 'undefined' && !global.MSC_ADMIN_OFFER_GROUPS_MANUAL) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
        else init();
    }
})(typeof window !== 'undefined' ? window : globalThis);
