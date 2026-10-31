/**
 * /offer-groups: a signed-in student shares their offer letter once and, when it is verified, gets the WhatsApp
 * groups for their company, city and category.
 *
 * Status comes from the Supabase RPC my_offer_status() (migration 202610310001_offer_groups.sql). The letter goes to
 * the offer-verify Worker:
 *   POST https://offer.mystudentclub.com/verify   Authorization: Bearer <Supabase access token>
 *   { category, company, city, domain, joining_date, name, confirm: true, pages: [base64 JPEG], text,
 *     file: { name, type, data } | null, encrypted }
 *   → { ok: true, status: 'verified', name, company, city, groups, has_company_group }
 *   → { ok: true, status: 'review', message } | { ok: true, status: 'rejected', code, message, tries_left_today }
 *   → { ok: false, error, message, field? }
 * PDFs are drawn to JPEG pages here (pdf.js), so locked PDFs and scans work the same as screenshots.
 */
(function (global) {
    'use strict';

    var VERIFY_URL = 'https://offer.mystudentclub.com/verify';
    var MAX_FILE_BYTES = 10 * 1024 * 1024;
    var MAX_PAGES = 4;
    var PAGE_WIDTH = 1400;
    var CATEGORIES = [
        { id: 'articleship', label: 'Articleship', domains: 'Articleship Jobs' },
        { id: 'industrial-training', label: 'Industrial Training', domains: 'Industrial Training Job Portal' },
        { id: 'ca-fresher', label: 'CA Fresher', domains: 'Fresher Jobs' },
        { id: 'semi-qualified', label: 'Semi Qualified CA', domains: 'Semi Qualified Jobs' }
    ];
    var GROUP_LINK = /^https:\/\/(chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}|(www\.)?whatsapp\.com\/channel\/[A-Za-z0-9]{10,40})\/?(\?[A-Za-z0-9_=&.-]*)?$/;
    var REVIEW_REASONS = {
        company_unclear: 'we could not clearly match the letter to the company',
        name_mismatch: 'the name on the letter is different from the name on your MSC account',
        not_clearly_an_offer: 'the document does not clearly read as an offer',
        needs_human: 'our checker could not finish on its own'
    };

    // ---- small helpers (exported for tests) ----

    function titleCase(s) {
        return String(s || '').toLowerCase().replace(/(^|[\s.'-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
    }

    /** "ASHA R. VERMA" → "Asha"; the first word people are called by. */
    function firstName(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(function (p) { return p.replace(/\W/g, '').length > 1; });
        var first = parts[0] || String(name || '').trim();
        return first === first.toUpperCase() || first === first.toLowerCase() ? titleCase(first) : first;
    }

    /** Padam's message, as paragraphs. CA Freshers already have the prefix, so their middle line is different. */
    function successMessage(name, category) {
        var middle = category === 'ca-fresher'
            ? 'Please let us know in case of any future vacancies in your organisation. Enjoy your tenure, work hard and keep growing.'
            : 'Please let us know in case of any future vacancies in your organisation. Manage your studies well, enjoy your tenure, work hard and soon come back with the beautiful two-letter prefix as a CA Fresher.';
        return [
            'Congratulations ' + firstName(name) + '! All your efforts paid off well. Have the best of time ahead!!',
            'Hope we were able to add a bit of value in your journey.',
            middle,
            'Congratulations again. Looking forward to like, comment and repost your joining post.'
        ];
    }

    var aliasKey = function (s) { return String(s || '').toLowerCase().replace(/[ēé]/g, 'e').replace(/[^a-z0-9]+/g, ' ').trim(); };

    /** The MSC spelling of a company ("deloitte haskins & sells llp" → "Deloitte"); the typed text when unknown. */
    function snapCompany(value, data) {
        var text = String(value || '').replace(/\s+/g, ' ').trim();
        if (!text || !data) return text;
        var hit = data.aliases[aliasKey(text)] || data.aliases[aliasKey(text.replace(/&/g, ' and '))];
        if (hit) return hit;
        var bare = text.replace(/\b(private|pvt|limited|ltd|llp|inc|corporation|co)\b\.?/gi, ' ').replace(/[\s,.&-]+$/, '').replace(/\s+/g, ' ').trim();
        return data.aliases[aliasKey(bare)] || text;
    }

    function snapCity(value, data) {
        var text = String(value || '').replace(/\s+/g, ' ').trim();
        if (!text || !data) return text;
        return data.cityAliases[aliasKey(text)] || text;
    }

    function safeGroups(groups) {
        return (Array.isArray(groups) ? groups : []).filter(function (g) { return g && GROUP_LINK.test(String(g.url || '')); });
    }

    function todayIso(now) {
        var d = now || new Date();
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }

    function addDays(iso, days) {
        var d = new Date(iso + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().slice(0, 10);
    }

    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            if (k === 'text') node.textContent = attrs[k];
            else if (k === 'class') node.className = attrs[k];
            else node.setAttribute(k, attrs[k]);
        });
        (children || []).forEach(function (c) { if (c) node.append(c); });
        return node;
    }

    function bytesToBase64(bytes) {
        var chunks = [];
        for (var i = 0; i < bytes.length; i += 0x8000) chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
        return btoa(chunks.join(''));
    }

    function canvasToBase64(canvas) {
        return canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
    }

    // ---- reading the file in the browser ----

    var PasswordNeeded = function (wrong) { this.wrong = wrong; };

    async function readPdf(bytes, password) {
        var lib = global.pdfjsLib;
        if (!lib) throw new Error('The PDF reader did not load. Please refresh the page and try again.');
        if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = '/scripts/vendor/pdf.worker.min.js';
        var pdf;
        try {
            pdf = await lib.getDocument({ data: bytes.slice(), password: password || undefined }).promise;
        } catch (e) {
            if (e && e.name === 'PasswordException') throw new PasswordNeeded(e.code === 2 || !!password);
            throw new Error('We could not open this PDF. If it is a scan or a phone photo, upload it as a JPG or PNG instead.');
        }
        var pages = [];
        var text = [];
        var count = Math.min(pdf.numPages, MAX_PAGES);
        for (var n = 1; n <= count; n++) {
            var page = await pdf.getPage(n);
            var base = page.getViewport({ scale: 1 });
            var viewport = page.getViewport({ scale: Math.min(2.5, PAGE_WIDTH / base.width) });
            var canvas = document.createElement('canvas');
            canvas.width = Math.round(viewport.width);
            canvas.height = Math.round(viewport.height);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
            pages.push(canvasToBase64(canvas));
            try {
                var content = await page.getTextContent();
                text.push(content.items.map(function (i) { return i.str; }).join(' '));
            } catch (_) { /* text is only a hint */ }
        }
        return { pages: pages, text: text.join('\n\n').replace(/[ \t]+/g, ' ').trim(), totalPages: pdf.numPages, encrypted: !!password };
    }

    function loadImage(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () { resolve({ img: img, url: url }); };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('We could not open this image. Please upload a PDF, JPG or PNG (a screenshot works).')); };
            img.src = url;
        });
    }

    async function readImage(file) {
        var loaded = await loadImage(file);
        var img = loaded.img;
        var scale = Math.min(1, 1600 / img.naturalWidth, 2400 / img.naturalHeight);
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(loaded.url);
        return { pages: [canvasToBase64(canvas)], text: '', totalPages: 1, encrypted: false };
    }

    function fileKind(file) {
        var name = (file.name || '').toLowerCase();
        if (file.type === 'application/pdf' || /\.pdf$/.test(name)) return 'pdf';
        if (/^image\//.test(file.type) || /\.(jpe?g|png|heic|heif|webp)$/.test(name)) return 'image';
        return null;
    }

    /** → { pages, text, totalPages, encrypted, original: { name, type, data } | null } */
    async function prepareFile(file, password) {
        if (!file) throw new Error('Please choose your offer letter.');
        if (file.size > MAX_FILE_BYTES) throw new Error('That file is larger than 10 MB. Please upload a smaller one or a screenshot.');
        var kind = fileKind(file);
        if (!kind) throw new Error('Please upload the offer letter as a PDF, JPG or PNG. Word files: save as PDF first.');
        var bytes = new Uint8Array(await file.arrayBuffer());
        var read = kind === 'pdf' ? await readPdf(bytes, password) : await readImage(file);
        var type = kind === 'pdf' ? 'application/pdf' : file.type;
        read.original = ['application/pdf', 'image/png', 'image/jpeg'].indexOf(type) >= 0 ? { name: file.name, type: type, data: bytesToBase64(bytes) } : null;
        return read;
    }

    // ---- the page ----

    function init(opts) {
        var o = opts || {};
        var root = o.root || document.getElementById('offer-app');
        if (!root) return null;
        var fetchImpl = o.fetch || global.fetch.bind(global);
        var verifyUrl = o.verifyUrl || global.MSC_OFFER_VERIFY_URL || VERIFY_URL;
        var prepare = o.prepareFile || prepareFile;
        var now = o.now || function () { return new Date(); };
        var state = { session: null, data: null, domains: {}, prepared: null, file: null, password: '', busy: false, values: {} };

        function client() {
            if (o.client) return o.client;
            return global.supabaseClient || (typeof global.getSupabaseClient === 'function' ? global.getSupabaseClient() : null);
        }

        function show(node) {
            root.replaceChildren(node);
            root.setAttribute('aria-busy', 'false');
            var focus = node.querySelector('[data-autofocus]') || node.querySelector('h1, h2');
            if (focus && o.focus !== false) { focus.setAttribute('tabindex', '-1'); focus.focus({ preventScroll: false }); }
        }

        function card(cls, children) { return el('section', { class: 'og-card ' + (cls || '') }, children); }

        function loadingView(text) {
            return card('og-center', [el('div', { class: 'og-spinner', 'aria-hidden': 'true' }), el('p', { class: 'og-muted', text: text || 'Loading…' })]);
        }

        function messageView(title, body, action) {
            return card('og-center', [el('h2', { text: title }), el('p', { class: 'og-muted', text: body }), action || null]);
        }

        function signInView() {
            var back = encodeURIComponent('/offer-groups');
            return messageView('Sign in to share your offer letter', 'Use the account you use on My Student Club. It takes a few seconds.',
                el('a', { class: 'og-btn og-btn-primary', href: '/login.html?redirect=' + back, text: 'Sign in' }));
        }

        function groupCard(g) {
            var icon = { company_city: '🏢', company: '🏢', city: '📍', general: '🎓' }[g.kind] || '💬';
            var where = [g.company, g.city].filter(Boolean).join(' · ');
            return el('li', { class: 'og-group' }, [
                el('span', { class: 'og-group-icon', 'aria-hidden': 'true', text: icon }),
                el('div', { class: 'og-group-text' }, [el('strong', { text: g.title }), where ? el('span', { class: 'og-muted', text: where }) : null]),
                el('a', { class: 'og-btn og-btn-wa', href: g.url, target: '_blank', rel: 'noopener noreferrer', text: 'Join' })
            ]);
        }

        function successView(r) {
            var groups = safeGroups(r.groups);
            var paras = successMessage(r.name, r.category).map(function (t) { return el('p', { text: t }); });
            var list = el('ul', { class: 'og-groups' }, groups.map(groupCard));
            var pending = r.has_company_group ? null : el('p', { class: 'og-note', text: 'Your ' + r.company + (r.city ? ' · ' + r.city : '') + ' group is being set up. Come back to this page in a day or two and it will be here.' });
            var post = 'Happy to share that I am joining ' + r.company + (r.city ? ', ' + r.city : '') + '! Grateful to everyone who helped me along the way, including My Student Club. #CA #NewBeginnings';
            return card('og-success', [
                el('p', { class: 'og-hogaya', 'data-autofocus': '' }, [document.createTextNode('Hogaya! '), el('span', { class: 'og-heart', 'aria-hidden': 'true', text: '❤️' })]),
                el('div', { class: 'og-message' }, paras),
                el('h2', { class: 'og-groups-title', text: groups.length ? 'Here are your group links' : 'Your group links' }),
                groups.length ? list : el('p', { class: 'og-muted', text: 'Your groups are being set up. Come back to this page in a day or two.' }),
                pending && groups.length ? pending : null,
                el('div', { class: 'og-share' }, [
                    el('p', { text: 'Post about your joining on LinkedIn and tag My Student Club. We will like, comment and repost it.' }),
                    el('a', { class: 'og-btn og-btn-ghost', target: '_blank', rel: 'noopener noreferrer', href: 'https://www.linkedin.com/feed/?shareActive=true&text=' + encodeURIComponent(post), text: 'Write my joining post' })
                ])
            ]);
        }

        function reviewView(r) {
            var why = (r.reasons || []).map(function (x) { return REVIEW_REASONS[x]; }).filter(Boolean)[0];
            return card('og-center og-review', [
                el('p', { class: 'og-big-emoji', 'aria-hidden': 'true', text: '🙌' }),
                el('h2', { 'data-autofocus': '', text: 'Almost there, ' + firstName(r.name) + '!' }),
                el('p', { text: 'Your ' + (r.company || '') + ' offer letter needs a quick check by the MSC team' + (why ? ' (' + why + ')' : '') + '. It happens sometimes, nothing to worry about.' }),
                el('p', { class: 'og-muted', text: 'We will verify it within 24 hours and your groups will appear right here on this page.' })
            ]);
        }

        // ---- the form ----

        function field(label, input, hint, id) {
            return el('div', { class: 'og-field', 'data-field': id }, [
                el('label', { for: input.id, text: label }), input, hint ? el('p', { class: 'og-hint', text: hint }) : null,
                el('p', { class: 'og-field-error', id: input.id + '-error', role: 'alert' })
            ]);
        }

        function formView(notice) {
            var v = state.values;
            var chips = el('div', { class: 'og-chips', role: 'radiogroup', 'aria-labelledby': 'og-cat-label' }, CATEGORIES.map(function (c) {
                var id = 'og-cat-' + c.id;
                var input = el('input', { type: 'radio', name: 'category', id: id, value: c.id });
                if (v.category === c.id) input.checked = true;
                return el('label', { class: 'og-chip', for: id }, [input, el('span', { text: c.label })]);
            }));
            var company = el('input', { id: 'og-company', name: 'company', type: 'text', autocomplete: 'organization', list: 'og-company-list', maxlength: '80', placeholder: 'e.g. Deloitte, EY, HDFC Bank', required: '' });
            var city = el('input', { id: 'og-city', name: 'city', type: 'text', autocomplete: 'address-level2', list: 'og-city-list', maxlength: '60', placeholder: 'e.g. Mumbai', required: '' });
            var domain = el('select', { id: 'og-domain', name: 'domain' });
            var date = el('input', { id: 'og-date', name: 'joining_date', type: 'date', required: '', min: addDays(todayIso(now()), -400), max: addDays(todayIso(now()), 550) });
            var name = el('input', { id: 'og-name', name: 'name', type: 'text', autocomplete: 'name', maxlength: '100', required: '' });
            company.value = v.company || '';
            city.value = v.city || '';
            date.value = v.joining_date || '';
            name.value = v.name || '';

            var companyList = el('datalist', { id: 'og-company-list' }, ((state.data && state.data.companies) || []).map(function (n) { return el('option', { value: n }); }));
            var cityList = el('datalist', { id: 'og-city-list' }, ((state.data && state.data.cities) || []).map(function (n) { return el('option', { value: n }); }));
            company.addEventListener('blur', function () { company.value = snapCompany(company.value, state.data); });
            city.addEventListener('blur', function () { city.value = snapCity(city.value, state.data); });

            function fillDomains() {
                var cat = CATEGORIES.filter(function (c) { return c.id === (form.category && form.category.value); })[0];
                var items = cat ? state.domains[cat.domains] || [] : [];
                domain.replaceChildren(el('option', { value: '', text: cat ? 'Choose your domain' : 'Choose what you are joining as first' }));
                items.forEach(function (d) { domain.append(el('option', { value: d, text: d })); });
                domain.disabled = !cat;
                if (v.domain && items.indexOf(v.domain) >= 0) domain.value = v.domain;
            }

            // The file picker and its states.
            var fileInput = el('input', { id: 'og-file', name: 'offer_letter', type: 'file', accept: 'application/pdf,image/png,image/jpeg,image/heic,image/webp,.pdf,.jpg,.jpeg,.png,.heic,.webp', class: 'og-file-input' });
            var drop = el('label', { class: 'og-drop', for: 'og-file' }, [
                el('span', { class: 'og-drop-icon', 'aria-hidden': 'true', text: '📄' }),
                el('strong', { text: 'Upload your offer letter' }),
                el('span', { class: 'og-muted', text: 'PDF, JPG or PNG, up to 10 MB. A screenshot of the offer email works too.' })
            ]);
            var fileBox = el('div', { class: 'og-file-box', hidden: '' });
            var passwordBox = el('div', { class: 'og-password', hidden: '' });
            var fileStatus = el('p', { class: 'og-field-error', id: 'og-file-error', role: 'alert' });
            var fileWrap = el('div', { class: 'og-field', 'data-field': 'file' }, [el('span', { class: 'og-label', text: 'Offer letter' }), fileInput, drop, fileBox, passwordBox, fileStatus]);

            function showFile() {
                var p = state.prepared;
                if (!p) { fileBox.hidden = true; drop.hidden = false; return; }
                drop.hidden = true;
                fileBox.hidden = false;
                var thumb = el('img', { class: 'og-thumb', alt: 'First page of your offer letter', src: 'data:image/jpeg;base64,' + p.pages[0] });
                var more = p.totalPages > MAX_PAGES ? ' (first ' + MAX_PAGES + ' of ' + p.totalPages + ' pages are checked)' : (p.totalPages > 1 ? ' · ' + p.totalPages + ' pages' : '');
                var change = el('button', { type: 'button', class: 'og-link', text: 'Change file' });
                change.addEventListener('click', function () { fileInput.value = ''; state.prepared = null; state.file = null; showFile(); fileInput.click(); });
                fileBox.replaceChildren(thumb, el('div', {}, [el('strong', { text: state.file.name }), el('span', { class: 'og-muted', text: (p.encrypted ? 'Unlocked' : 'Ready') + more }), change]));
            }

            async function handleFile(file, password) {
                fileStatus.textContent = '';
                passwordBox.hidden = true;
                if (!file) return;
                state.file = file;
                state.prepared = null;
                fileBox.hidden = false;
                drop.hidden = true;
                fileBox.replaceChildren(el('div', { class: 'og-spinner og-spinner-sm', 'aria-hidden': 'true' }), el('span', { class: 'og-muted', text: 'Reading your file…' }));
                try {
                    state.prepared = await prepare(file, password);
                    showFile();
                } catch (e) {
                    state.prepared = null;
                    fileBox.hidden = true;
                    drop.hidden = false;
                    if (e instanceof PasswordNeeded || (e && e.passwordNeeded)) {
                        askPassword(file, e.wrong);
                    } else {
                        fileStatus.textContent = e.message || 'We could not read that file.';
                    }
                }
            }

            function askPassword(file, wrong) {
                var pw = el('input', { id: 'og-pdf-password', type: 'password', autocomplete: 'off', 'aria-describedby': 'og-pdf-password-hint' });
                var go = el('button', { type: 'button', class: 'og-btn og-btn-primary og-btn-sm', text: 'Unlock' });
                var unlock = function () { if (pw.value) handleFile(file, pw.value); };
                go.addEventListener('click', unlock);
                pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); unlock(); } });
                passwordBox.replaceChildren(
                    el('label', { for: 'og-pdf-password', text: wrong ? 'That password did not open it. Try again:' : 'This PDF is locked. Enter its password:' }),
                    el('div', { class: 'og-row' }, [pw, go]),
                    el('p', { class: 'og-hint', id: 'og-pdf-password-hint', text: 'Offer letters are often locked with your PAN or date of birth (check the email it came with). The password stays on your phone or laptop.' })
                );
                passwordBox.hidden = false;
                drop.hidden = false;
                pw.focus();
            }

            fileInput.addEventListener('change', function () { handleFile(fileInput.files && fileInput.files[0]); });
            ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('og-drag'); }); });
            ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('og-drag'); }); });
            drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFile(f); });

            var submit = el('button', { type: 'submit', class: 'og-btn og-btn-primary og-btn-block', text: 'Verify my offer letter' });
            var form = el('form', { class: 'og-form', novalidate: '' }, [
                notice || null,
                el('div', { class: 'og-field', 'data-field': 'category' }, [el('span', { class: 'og-label', id: 'og-cat-label', text: 'You are joining as' }), chips, el('p', { class: 'og-field-error', id: 'og-cat-error', role: 'alert' })]),
                el('div', { class: 'og-grid' }, [
                    field('Company or firm', company, null, 'company'),
                    field('City', city, null, 'city'),
                    field('Domain', domain, null, 'domain'),
                    field('Joining date', date, null, 'joining_date')
                ]),
                field('Your full name', name, 'As it is written on the offer letter.', 'name'),
                companyList, cityList, fileWrap,
                submit
            ]);
            form.addEventListener('change', function (e) { if (e.target && e.target.name === 'category') { v.domain = ''; fillDomains(); } });
            fillDomains();
            if (state.prepared && state.file) showFile();

            form.addEventListener('submit', function (e) {
                e.preventDefault();
                collect();
                if (validate()) confirmDialog();
            });

            function collect() {
                v.category = form.category.value || '';
                v.company = snapCompany(company.value, state.data);
                v.city = snapCity(city.value, state.data);
                v.domain = domain.value;
                v.joining_date = date.value;
                v.name = name.value.replace(/\s+/g, ' ').trim();
                company.value = v.company;
                city.value = v.city;
            }

            function setError(fieldName, message) {
                var box = form.querySelector('[data-field="' + fieldName + '"] .og-field-error');
                if (box) box.textContent = message || '';
                var input = form.querySelector('[data-field="' + fieldName + '"] input:not([type=radio]):not([type=file]), [data-field="' + fieldName + '"] select');
                if (input) { if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
            }

            function validate() {
                var errors = {};
                if (!v.category) errors.category = 'Choose what you are joining as.';
                if (v.company.length < 2) errors.company = 'Enter the company or firm name.';
                if (v.city.length < 2) errors.city = 'Enter the city you will work in.';
                if (!v.domain) errors.domain = 'Choose your domain.';
                if (!/^\d{4}-\d{2}-\d{2}$/.test(v.joining_date)) errors.joining_date = 'Enter your joining date.';
                else if (v.joining_date < date.min || v.joining_date > date.max) errors.joining_date = 'That joining date looks wrong. Please check it.';
                if (v.name.length < 2 || !/[a-z]/i.test(v.name)) errors.name = 'Enter your full name as it is on the letter.';
                if (!state.prepared) errors.file = state.file ? 'Your file is still being read, or needs its password.' : 'Upload your offer letter.';
                ['category', 'company', 'city', 'domain', 'joining_date', 'name', 'file'].forEach(function (k) { setError(k, errors[k]); });
                var first = Object.keys(errors)[0];
                if (first) {
                    var target = form.querySelector('[data-field="' + first + '"] input, [data-field="' + first + '"] select, [data-field="' + first + '"] .og-drop');
                    if (target && target.focus) target.focus();
                    return false;
                }
                return true;
            }

            function confirmDialog() {
                var label = CATEGORIES.filter(function (c) { return c.id === v.category; })[0].label;
                var tick = el('input', { type: 'checkbox', id: 'og-confirm' });
                var yes = el('button', { type: 'button', class: 'og-btn og-btn-primary', text: 'Yes, verify it', disabled: '' });
                var back = el('button', { type: 'button', class: 'og-btn og-btn-ghost', text: 'Go back' });
                var dialog = el('div', { class: 'og-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'og-confirm-title' }, [
                    el('div', { class: 'og-modal-card' }, [
                        el('p', { class: 'og-big-emoji', 'aria-hidden': 'true', text: '⚠️' }),
                        el('h2', { id: 'og-confirm-title', text: 'Before you send it' }),
                        el('p', { class: 'og-warn', text: 'You can do this only once.' }),
                        el('p', { text: "Please don't share the offer letter of a company you are not going to join, or a fake offer letter. That will permanently ban your MSC account." }),
                        el('div', { class: 'og-summary' }, [
                            el('span', { text: label }), el('strong', { text: v.company }), el('span', { text: v.city + ' · joining ' + v.joining_date.split('-').reverse().join('/') })
                        ]),
                        el('label', { class: 'og-check', for: 'og-confirm' }, [tick, el('span', { text: 'This is my own offer letter and I am joining ' + v.company + '.' })]),
                        el('div', { class: 'og-row og-row-end' }, [back, yes])
                    ])
                ]);
                var close = function () { dialog.remove(); document.removeEventListener('keydown', onKey); submit.focus(); };
                var onKey = function (e) { if (e.key === 'Escape') close(); };
                tick.addEventListener('change', function () { yes.disabled = !tick.checked; });
                back.addEventListener('click', close);
                yes.addEventListener('click', function () { dialog.remove(); document.removeEventListener('keydown', onKey); send(); });
                document.addEventListener('keydown', onKey);
                document.body.append(dialog);
                tick.focus();
            }

            return card('og-form-card', [form]);
        }

        // ---- sending ----

        function verifyingView() {
            var steps = ['Reading your letter', 'Checking it is from ' + state.values.company, 'Finding your groups'];
            var list = el('ol', { class: 'og-steps' }, steps.map(function (s, i) { return el('li', { class: i === 0 ? 'og-step-on' : '', text: s }); }));
            var i = 0;
            var timer = setInterval(function () {
                i = Math.min(i + 1, steps.length - 1);
                Array.prototype.forEach.call(list.children, function (li, n) { li.className = n < i ? 'og-step-done' : (n === i ? 'og-step-on' : ''); });
                if (i === steps.length - 1) clearInterval(timer);
            }, 6000);
            var view = card('og-center', [el('div', { class: 'og-spinner', 'aria-hidden': 'true' }), el('h2', { text: 'Checking your offer letter…' }), list, el('p', { class: 'og-muted', text: 'This takes up to a minute. Please keep this page open.' })]);
            view._stop = function () { clearInterval(timer); };
            return view;
        }

        async function send() {
            if (state.busy) return;
            state.busy = true;
            var view = verifyingView();
            show(view);
            var v = state.values;
            var p = state.prepared;
            var result;
            try {
                var c = client();
                var res0 = c ? await c.auth.getSession() : null;
                var token = res0 && res0.data && res0.data.session && res0.data.session.access_token;
                if (!token) { show(signInView()); return; }
                var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
                var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 150000) : null;
                try {
                    var res = await fetchImpl(verifyUrl, {
                        method: 'POST',
                        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
                        body: JSON.stringify({
                            category: v.category, company: v.company, city: v.city, domain: v.domain, joining_date: v.joining_date, name: v.name,
                            confirm: true, pages: p.pages, text: p.text, file: p.original, encrypted: p.encrypted
                        }),
                        credentials: 'omit',
                        signal: ctrl ? ctrl.signal : undefined
                    });
                    result = await res.json().catch(function () { return { ok: false, message: 'Something went wrong on our side. Please try again in a few minutes.' }; });
                } finally {
                    if (timer) clearTimeout(timer);
                }
            } catch (e) {
                result = { ok: false, error: 'offline', message: navigator.onLine === false ? 'You seem to be offline. Check your connection and try again.' : 'We could not reach our letter checker. Please try again in a minute. Nothing was used up.' };
            } finally {
                state.busy = false;
                if (view._stop) view._stop();
            }
            handleResult(result || {});
        }

        function handleResult(r) {
            if (r.ok && r.status === 'verified') { show(successView(r)); return; }
            if (r.ok && r.status === 'review') { show(reviewView({ name: state.values.name, company: r.company || state.values.company })); return; }
            if (r.error === 'sign_in') { show(signInView()); return; }
            if (r.error === 'already_done' || r.error === 'banned' || r.error === 'revoked') { start(); return; }
            var message = r.message || 'Something went wrong. Please try again.';
            if (r.ok && r.status === 'rejected') {
                if (typeof r.tries_left_today === 'number') message += r.tries_left_today > 0 ? ' (' + r.tries_left_today + ' more ' + (r.tries_left_today === 1 ? 'try' : 'tries') + ' today.)' : ' You can try again tomorrow.';
                // A wrong company means the letter was fine: keep it so only the company needs changing.
                if (r.code !== 'company_mismatch') {
                    state.prepared = null;
                    state.file = null;
                }
            }
            show(formView(el('div', { class: 'og-alert', role: 'alert', 'data-autofocus': '', text: message })));
        }

        // ---- start ----

        async function loadData() {
            var get = function (url) { return fetchImpl(url, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
            var both = await Promise.all([get('/assets/data/offer-companies.json'), get('/categories.json')]);
            state.data = both[0];
            Object.keys(both[1] || {}).forEach(function (k) {
                state.domains[k] = (both[1][k] || []).reduce(function (all, g) { return all.concat(typeof g === 'string' ? [g] : (g.items || [])); }, []);
            });
        }

        async function start() {
            root.setAttribute('aria-busy', 'true');
            show(loadingView());
            var c = client();
            if (!c) { show(messageView('Something did not load', 'Please refresh the page.', null)); return; }
            var sess = await c.auth.getSession();
            state.session = sess && sess.data ? sess.data.session : null;
            if (!state.session) { show(signInView()); return; }
            var results = await Promise.all([
                c.rpc('my_offer_status'),
                c.from('profiles').select('profile').eq('uuid', state.session.user.id).maybeSingle().then(function (r) { return r; }, function () { return {}; }),
                state.data ? null : loadData()
            ]);
            var status = results[0];
            if (status.error || !status.data) {
                show(messageView('This page is not ready yet', 'Please try again in a little while.', null));
                return;
            }
            var s = status.data;
            var profile = results[1] && results[1].data && results[1].data.profile;
            var meta = state.session.user.user_metadata || {};
            if (!state.values.name) state.values.name = (profile && (profile.name || profile.full_name)) || meta.full_name || meta.name || '';
            if (s.banned) {
                show(messageView('This account cannot share an offer letter', 'If you think this is a mistake, please write to the MSC team.', el('a', { class: 'og-btn og-btn-ghost', href: '/contact.html', text: 'Contact us' })));
                return;
            }
            var claim = s.claim;
            if (claim && claim.status === 'verified') { show(successView({ name: claim.name, category: claim.category, company: claim.company, city: claim.city, groups: s.groups, has_company_group: s.has_company_group })); return; }
            if (claim && claim.status === 'review') { show(reviewView(claim)); return; }
            if (claim && claim.status === 'revoked') {
                show(messageView('Your earlier offer letter was withdrawn', 'The MSC team withdrew your earlier claim. Please write to us to sort it out.', el('a', { class: 'og-btn og-btn-ghost', href: '/contact.html', text: 'Contact us' })));
                return;
            }
            var notice = null;
            if (s.rejected_today >= 5) notice = el('div', { class: 'og-alert', role: 'alert', text: "You've tried a few times today. Please try again tomorrow." });
            show(formView(notice));
        }

        start();
        return { start: start, state: state };
    }

    var api = { init: init, successMessage: successMessage, firstName: firstName, snapCompany: snapCompany, snapCity: snapCity, safeGroups: safeGroups, prepareFile: prepareFile, PasswordNeeded: PasswordNeeded, VERIFY_URL: VERIFY_URL };
    if (typeof module === 'object' && module.exports) module.exports = api;
    global.MSCOfferGroups = api;
    if (typeof document !== 'undefined' && !global.MSC_OFFER_GROUPS_MANUAL) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
        else init();
    }
})(typeof window !== 'undefined' ? window : globalThis);
