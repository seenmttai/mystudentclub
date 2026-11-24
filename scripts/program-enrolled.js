/**
 * Program pages: a student who is already enrolled sees "You're enrolled" and an "Open your course" button instead of
 * Register / Enrol / Notify Me. One script for the three program pages (Industrial Training, CA Freshers, Articleship),
 * on www and on the mobile site.
 *
 * A page opts in with <body data-program="industrial|fresher|articleship">. The script does nothing for a signed-out
 * visitor or a student who is not enrolled in THIS program, so those pages stay exactly as they were. For an enrolled
 * student it: turns every register / notify button into an "Open your course" link, replaces "Registration closed"
 * style labels, hides the waitlist notes and the registration card, and shows a short "You're enrolled" panel.
 *
 * A program marked launchSoon (Articleship, until its course opens) gets the "registered" version instead: the buttons
 * say "Registered • On the waitlist", a click shows "Course launching soon", and nothing links to the course. A student
 * is registered when public.program_registration holds a paid row for their login email (read through the
 * my_program_registrations() function) or when they already have an enrolment.
 *
 * The enrolment is read from public.enrollment (a student can read only their own rows). Old course names in that
 * table are matched through the same alias list the LMS uses.
 *
 * Browser: runs by itself on pages with data-program. Node (tests): require('./scripts/program-enrolled.js').
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCProgramEnrolled = api;
    if (typeof window !== 'undefined' && window === root && root.document) api.autoStart();
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    // Course names as they can appear in public.enrollment (the same aliases as learning-management-system/course-script.js).
    const PROGRAMS = Object.freeze({
        industrial: {
            slug: 'industrial-training-mastery',
            name: 'MSC Industrial Training Program',
            aliases: ['industrial-training', 'ca-industrial-training', 'msc-industrial-training-program', 'industrial-training-program', 'msc-ca-industrial-training']
        },
        fresher: {
            slug: 'msc-ca-freshers-program',
            name: 'MSC CA Freshers Program',
            aliases: ['ca-freshers', 'freshers', 'ca-freshers-program', 'msc-ca-freshers']
        },
        articleship: {
            slug: 'msc-articleship-program',
            name: 'MSC Articleship Program',
            aliases: ['articleship', 'articleship-program', 'articleship-mastery', 'msc-articleship-mastery'],
            // The course has not opened yet. A student who is registered (paid on the program page) or enrolled sees
            // "You're registered / on the waitlist", and a click says "Course launching soon" instead of opening the course.
            // On launch day delete this line: the page then shows "Open your course" like the other two programs.
            launchSoon: true
        }
    });

    // Paid registrations for programs with no course access at payment time (public.program_registration). Students cannot
    // read that table; this function returns their own rows, matched on the login email.
    const REGISTRATION_RPC = 'my_program_registrations';
    const PAID_STATUSES = new Set(['paid', 'free']);

    const AUTH_KEYS = ['sb-auth-auth-token', 'sb-izsggdtdiacxdsjjncdq-auth-token'];

    // Every button that asks to register, enrol or join a waitlist. Each becomes an "Open your course" link.
    const CTA_SELECTOR = [
        '.js-notify-btn', '#heroPrimaryCta', '#heroNotifyBtn', '#certNotifyBtn', '#notifyMeBtn', '#notifyMeFooterBtn',
        '#registerFooterBtn', '#registerButtonWorkshop', '.header-enroll-btn', '.btn-navy-sample', '.js-register-btn'
    ].join(',');

    // Small labels that say the program is closed or open for registration: the status pill at the top of the page
    // (only that one: the other eyebrow pills are section headings), the fixed bottom bar and the pricing box.
    const LABEL_SELECTOR = [
        '.hero-status-row .eyebrow-pill > span:last-child', '.status-closed-text', '.status-live-text > span:last-child',
        '.pricing-box-tag', '.register-open-badge'
    ].join(',');

    // Notes that only make sense before enrolling.
    const HIDE_SELECTOR = [
        '.next-batch-pill', '#notifyStatus', '.waitlist-status', '.notify-status-msg', '.limited-seats-badge', '.seats-badge',
        'a.header-nav-link[href="#register"]', 'a.header-nav-link[href="#waitlist-section"]',
        '.pricing-split-ribbon', '.pricing-amount-row', '.pricing-tenure-note', '.price-container'
    ].join(',');

    const ENROLLED_LABEL = "YOU'RE ENROLLED";
    const REGISTERED_LABEL = "YOU'RE REGISTERED";

    function normalise(course) {
        return String(course === undefined || course === null ? '' : course).trim().toLowerCase();
    }

    function courseUrl(key) {
        const program = PROGRAMS[key];
        return program ? '/learning-management-system/course?course=' + encodeURIComponent(program.slug) : '';
    }

    /** rows: [{ course }] from public.enrollment. True when one of them is this program (by name or old alias). */
    function isEnrolled(rows, key) {
        const program = PROGRAMS[key];
        if (!program || !Array.isArray(rows)) return false;
        const names = new Set([program.slug, ...program.aliases]);
        return rows.some(row => row && names.has(normalise(row.course)));
    }

    /**
     * rows from my_program_registrations(): a program name, or { program, status }. A row with no status is taken as paid;
     * a pending or failed payment never counts.
     */
    function isRegistered(rows, key) {
        const program = PROGRAMS[key];
        if (!program || !Array.isArray(rows)) return false;
        const names = new Set([program.slug, ...program.aliases]);
        return rows.some(row => {
            const name = typeof row === 'string' ? row : row && row.program;
            if (!names.has(normalise(name))) return false;
            const status = row && typeof row === 'object' && row.status ? normalise(row.status) : 'paid';
            return PAID_STATUSES.has(status);
        });
    }

    function injectStyle(doc) {
        if (doc.getElementById('msc-enrolled-style')) return;
        const style = doc.createElement('style');
        style.id = 'msc-enrolled-style';
        style.textContent = [
            '.msc-enrolled-panel{max-width:640px;margin:0 auto;padding:36px 24px;text-align:center;font-family:inherit}',
            '.msc-enrolled-check{width:56px;height:56px;margin:0 auto 14px;border-radius:50%;background:#16a34a;color:#fff;font-size:30px;line-height:56px;font-weight:700}',
            '.msc-enrolled-panel h2{margin:0 0 8px;font-size:1.5rem;line-height:1.25;color:#0f172a}',
            '.msc-enrolled-panel p{margin:0 0 18px;color:#475569;font-size:1rem;line-height:1.5}',
            '.msc-enrolled-panel .msc-open-course-btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;border-radius:999px;background:#0f172a;color:#fff;font-weight:700;text-decoration:none}',
            'a.msc-open-course{text-decoration:none;cursor:pointer}',
            'button.msc-launch-soon{cursor:pointer;font-family:inherit}',
            '.msc-launch-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.55)}',
            '.msc-launch-dialog{width:100%;max-width:400px;padding:28px 24px;border-radius:18px;background:#fff;color:#0f172a;text-align:center;box-shadow:0 24px 60px rgba(15,23,42,.35);font-family:inherit}',
            '.msc-launch-dialog .msc-enrolled-check{background:#2563eb}',
            '.msc-launch-dialog h2{margin:0 0 8px;font-size:1.35rem;line-height:1.25}',
            '.msc-launch-dialog p{margin:0 0 20px;color:#475569;font-size:1rem;line-height:1.5}',
            '.msc-launch-dialog button{padding:12px 28px;border:0;border-radius:999px;background:#0f172a;color:#fff;font-weight:700;font-size:1rem;cursor:pointer;font-family:inherit}'
        ].join('');
        doc.head.appendChild(style);
    }

    function openCourseLink(doc, original, url) {
        const link = doc.createElement('a');
        link.href = url;
        link.className = (original.className || '').replace(/\bjs-notify-btn\b/g, '').replace(/\s+/g, ' ').trim() + ' msc-open-course';
        if (original.id) link.id = original.id;
        link.innerHTML = '<span>Open your course</span> <i class="fas fa-arrow-right" aria-hidden="true"></i>';
        return link;
    }

    function enrolledPanel(doc, key) {
        const program = PROGRAMS[key];
        const panel = doc.createElement('div');
        panel.className = 'msc-enrolled-panel';
        const check = doc.createElement('div');
        check.className = 'msc-enrolled-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = '✓';
        const title = doc.createElement('h2');
        title.textContent = "You're enrolled in the " + program.name;
        const text = doc.createElement('p');
        text.textContent = 'Your access is active. Open your course any time from My Courses.';
        const link = doc.createElement('a');
        link.className = 'msc-open-course-btn';
        link.href = courseUrl(key);
        link.textContent = 'Open your course →';
        panel.append(check, title, text, link);
        return panel;
    }

    /** The "Course launching soon" pop-up. Closes on the button, a tap outside or Escape. */
    function openLaunchNotice(doc) {
        if (doc.querySelector('.msc-launch-overlay')) return;
        const previous = doc.activeElement;
        const overlay = doc.createElement('div');
        overlay.className = 'msc-launch-overlay';
        const dialog = doc.createElement('div');
        dialog.className = 'msc-launch-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'msc-launch-title');
        const check = doc.createElement('div');
        check.className = 'msc-enrolled-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = '✓';
        const title = doc.createElement('h2');
        title.id = 'msc-launch-title';
        title.textContent = 'Course launching soon';
        const text = doc.createElement('p');
        text.textContent = "You're registered and on the waitlist. We'll notify you soon.";
        const ok = doc.createElement('button');
        ok.type = 'button';
        ok.textContent = 'Got it';
        dialog.append(check, title, text, ok);
        overlay.appendChild(dialog);

        const close = () => {
            doc.removeEventListener('keydown', onKey, true);
            overlay.remove();
            if (previous && typeof previous.focus === 'function') previous.focus();
        };
        const onKey = event => { if (event.key === 'Escape') close(); };
        ok.addEventListener('click', close);
        overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        doc.addEventListener('keydown', onKey, true);
        doc.body.appendChild(overlay);
        ok.focus();
    }

    /** A register button turned into "Registered" for a program whose course has not opened. A click shows the notice. */
    function launchSoonButton(doc, original) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = (original.className || '').replace(/\bjs-notify-btn\b/g, '').replace(/\s+/g, ' ').trim() + ' msc-launch-soon';
        if (original.id) button.id = original.id;
        if (original.querySelector('.notify-footer-text')) {
            button.innerHTML = '<span class="notify-footer-text">Registered</span>';
        } else {
            button.innerHTML = '<span>Registered &bull; On the waitlist</span> <i class="fas fa-check-circle" aria-hidden="true"></i>';
        }
        button.addEventListener('click', () => openLaunchNotice(doc));
        return button;
    }

    function launchSoonPanel(doc, key) {
        const program = PROGRAMS[key];
        const panel = doc.createElement('div');
        panel.className = 'msc-enrolled-panel';
        const check = doc.createElement('div');
        check.className = 'msc-enrolled-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = '✓';
        const title = doc.createElement('h2');
        title.textContent = "You're registered for the " + program.name;
        const text = doc.createElement('p');
        text.textContent = "You're on the waitlist. The course is launching soon and we'll notify you soon.";
        panel.append(check, title, text);
        return panel;
    }

    /**
     * Turns a program page into its "already enrolled" version. Safe to call twice. For a program that is still
     * launching, the version is "registered, on the waitlist" and nothing links to the course.
     */
    function showEnrolled(doc, key) {
        if (!PROGRAMS[key] || doc.documentElement.classList.contains('msc-enrolled')) return false;
        const url = courseUrl(key);
        const soon = Boolean(PROGRAMS[key].launchSoon);
        injectStyle(doc);
        doc.documentElement.classList.add('msc-enrolled');

        // Sections that are only a waitlist or a registration form become the enrolled panel.
        doc.querySelectorAll('section.notify-section').forEach(section => {
            section.textContent = '';
            section.appendChild(soon ? launchSoonPanel(doc, key) : enrolledPanel(doc, key));
        });

        doc.querySelectorAll(CTA_SELECTOR).forEach(button => {
            if (!button.isConnected || button.closest('.msc-enrolled-panel')) return;
            button.replaceWith(soon ? launchSoonButton(doc, button) : openCourseLink(doc, button, url));
        });
        doc.querySelectorAll(LABEL_SELECTOR).forEach(label => { label.textContent = soon ? REGISTERED_LABEL : ENROLLED_LABEL; });
        doc.querySelectorAll(HIDE_SELECTOR).forEach(note => { note.hidden = true; note.style.display = 'none'; });
        return true;
    }

    function storedSessionExists() {
        try {
            return AUTH_KEYS.some(key => Boolean(root.localStorage && root.localStorage.getItem(key)));
        } catch (_) {
            return false;
        }
    }

    function loadScript(doc, src) {
        return new Promise((resolve, reject) => {
            const script = doc.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Could not load ' + src));
            doc.head.appendChild(script);
        });
    }

    /**
     * The site's Supabase client. The mobile program pages do not load one, so a signed-in visitor gets the shared client
     * loaded here; a signed-out visitor loads nothing.
     */
    async function getClient(doc) {
        const existing = root.supabaseClient || (typeof root.getSupabaseClient === 'function' ? root.getSupabaseClient() : null);
        if (existing) return existing;
        if (!storedSessionExists()) return null;
        try {
            if (!root.supabase) await loadScript(doc, '/scripts/supabase.js');
            await loadScript(doc, '/scripts/supabase-init.js');
        } catch (_) {
            return null;
        }
        return root.supabaseClient || (typeof root.getSupabaseClient === 'function' ? root.getSupabaseClient() : null);
    }

    /** Looks the student up and, when they are enrolled in this page's program, shows the enrolled version. */
    async function run(doc) {
        const body = doc.body;
        const key = body ? body.getAttribute('data-program') : null;
        if (!PROGRAMS[key]) return false;
        try {
            const client = await getClient(doc);
            if (!client || !client.auth) return false;
            const { data: sessionData } = await client.auth.getSession();
            const user = sessionData && sessionData.session && sessionData.session.user;
            if (!user) return false;
            const { data, error } = await client.from('enrollment').select('course').eq('uuid', user.id);
            let enrolled = !error && isEnrolled(data, key);
            // A paid registration is not an enrolment: for a program still launching, it also earns the registered state.
            if (!enrolled && PROGRAMS[key].launchSoon && typeof client.rpc === 'function') {
                try {
                    const registrations = await client.rpc(REGISTRATION_RPC);
                    enrolled = !registrations.error && isRegistered(registrations.data, key);
                } catch (_) { /* no function yet, or offline: the page stays as it was */ }
            }
            return enrolled ? showEnrolled(doc, key) : false;
        } catch (_) {
            return false;
        }
    }

    function autoStart() {
        const start = () => { run(root.document); };
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start);
        else start();
    }

    return Object.freeze({ PROGRAMS, CTA_SELECTOR, LABEL_SELECTOR, HIDE_SELECTOR, isEnrolled, isRegistered, courseUrl, showEnrolled, run, getClient, autoStart });
});
