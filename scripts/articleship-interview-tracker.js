/**
 * MSC Articleship Program: Interview syllabus tracker (Day 4, row 4.1), /articleship-program/interview-tracker/.
 *
 * Domain + interview date → days left; Core first, then your domain (and second choice), then the written test and GD;
 * status per topic (Not started / Learning / Ready), a target date and a note; Read links to the booklet page; % per
 * section; the night-before view; the interview-day checklist (its one home); "My interviews" with "Share with MSC".
 *
 * Content: /articleship-program/interview-tracker/syllabus.json (source: msc-content v3/build/day-4/4.1/syllabus.json).
 * Progress: MSCArticleshipProgress store "interview-tracker" (device at once, account when the table exists).
 * "My domain" and the second choice are the programme's shared setting.
 *
 * Browser: window.MSCInterviewTracker. Node (tests): require('./scripts/articleship-interview-tracker.js').
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCInterviewTracker = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict';

    const TOOL = 'interview-tracker';
    const DAY = 4;
    const CONTENT_URL = '/articleship-program/interview-tracker/syllabus.json';

    /**
     * "Share with MSC" posts one interview to MSC's Google Form "Share your interview" (human step H1 creates it).
     * While `action` is empty the Share button stays hidden. When the form exists, paste its formResponse URL and the
     * entry ids of its questions (Form → ⋮ → Get pre-filled link shows them as entry.NNNN). Nothing else changes.
     */
    const SHARE_FORM = Object.freeze({
        action: '',
        fields: Object.freeze({
            month: '', firm: '', type: '', city: '', domain: '', backup: '', stage: '', round: '', mode: '', length: '',
            how: '', questions: '', missed: '', task: '', outcome: '', wait: '', tip: ''
        })
    });

    /**
     * Programme pages the syllabus links to that another build adds to the branch. While `live` is false, a link to
     * one opens its row's Day in the course instead (the student sees the row there; never a dead link). Set `live`
     * to true once the page is committed; tests/articleship-interview-tracker.test.cjs checks the two agree.
     */
    const PAGE_ROWS = Object.freeze({
        '/articleship-program/written-test/': Object.freeze({ day: 4, title: 'Written test practice', live: true })
    });

    const STATUSES = Object.freeze(['not-started', 'learning', 'ready']);
    const STATUS_LABELS = Object.freeze({ 'not-started': 'Not started', learning: 'Learning', ready: 'Ready' });
    const ROUNDS = Object.freeze(['HR call', 'Written test', 'Group discussion', 'Technical', 'Partner', 'Other']);
    const MODES = Object.freeze(['Online', 'In person', 'Phone']);
    const HOW_CALLED = Object.freeze(['Application form', 'Mail', 'LinkedIn', 'Referral', 'Walk-in', 'Campus']);
    const OUTCOMES = Object.freeze(['Waiting', 'Next round', 'Offer', 'Not selected']);
    const FIRM_TYPES = Object.freeze(['Large network', 'Mid-size firm', 'Small firm']);
    const RESULT_STAGES = Object.freeze(['Result awaited', 'Result out']);
    const LENGTHS = Object.freeze(['Under 15 min', '15 to 30 min', '30 to 60 min', 'Over an hour']);
    const WAITS = Object.freeze(['Same day', 'Within a week', '1 to 2 weeks', 'Over 2 weeks']);
    const DAY_MODES = Object.freeze({ 'in-person': 'In person', online: 'Online' });
    const PARTS = Object.freeze(['core', 'domain', 'after']);
    /**
     * Saved shape. Every per-topic map has a twin "<map>At" ({ key: ms }) and the two single values carry "<value>At",
     * so two devices merge key by key: the newer change wins and keys a device never touched are left alone.
     * missedDone: { "<entry id>:<line hash>": true } = a "Questions you couldn't answer" line ticked "Got it now".
     */
    const DEFAULTS = Object.freeze({
        interviewDate: '', interviewDateAt: 0, status: {}, statusAt: {}, dates: {}, datesAt: {}, notes: {}, notesAt: {},
        dayTicks: {}, dayTicksAt: {}, dayMode: '', dayModeAt: 0, missedDone: {}, missedDoneAt: {}, log: [], logDeleted: {}
    });
    const KEYED = Object.freeze(['status', 'dates', 'notes', 'dayTicks', 'missedDone']);
    /** A deleted interview is remembered this long so another device cannot bring it back; then it is forgotten. */
    const DELETED_KEEP_DAYS = 180;
    /** A long section opens with this many topics still to do, and a "Show all" for the rest. */
    const PREVIEW_TOPICS = 5;
    /** Practise your interview (row 4.13); presets: round=full|technical|hr|call, domain=<slug>, firm=<name>. */
    const MOCK_PAGE = '/ai-interview.html';
    const SECTION_ROUNDS = Object.freeze({ hr: 'hr' });
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
        'October', 'November', 'December'];
    const TEXT_MAX = 2000;
    const LOG_MAX = 200;

    // ---------- small helpers ----------
    function text(value) {
        return value === undefined || value === null ? '' : String(value).trim();
    }

    function clip(value, max) {
        const t = text(value);
        return t.length > max ? t.slice(0, max) : t;
    }

    function isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function slug(value) {
        return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    }

    /** Only links a student can safely follow: same-site paths, anchors, https. */
    function safeHref(value) {
        const href = text(value);
        if (!href) return '';
        if (/^\/(?!\/)/.test(href) || href.startsWith('#')) return href;
        if (/^https:\/\/[^\s]+$/i.test(href)) return href;
        return '';
    }

    function isExternal(href) {
        return /^https:\/\//i.test(href) && !/^https:\/\/(www\.|mobile\.)?mystudentclub\.com(\/|$)/i.test(href);
    }

    // ---------- content ----------
    function normaliseRead(read) {
        if (!read) return null;
        if (typeof read === 'string') return safeHref(read) ? { href: safeHref(read) } : null;
        if (read.href) return safeHref(read.href) ? { href: safeHref(read.href) } : null;
        const row = text(read.row);
        if (!row) return null;
        const page = Number(read.page);
        return { row, page: Number.isSafeInteger(page) && page > 1 ? page : null, find: text(read.find) };
    }

    /**
     * Build step (not used by the page; build/tools/interview-tracker/wire_pages.mjs runs it on the built booklets):
     * fill each topic's read.page from the booklets' text, one string per page:
     * pageTexts = { '4.4': ['page 1 text', 'page 2 text', …] }. Pages that list questions (contents or index: a heading
     * word at the top, or 12+ numbered lines) are skipped unless nothing else matches. Of the other pages, the first
     * whose numbered question line ("12. …", "Q12 …") carries read.find wins; else the first page that carries it.
     * Returns { content (a copy), found, missing: [{ id, row, find }] }.
     */
    function resolvePages(content, pageTexts) {
        const flat = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u2018\u2019]/g, "'")
            .replace(/[^a-z0-9']+/g, ' ').trim();
        const numbered = /^\s*(?:q\s*)?\d{1,3}\s*[.):]\s+\S/i;
        const isIndex = page => {
            const textOf = String(page || '');
            if (/^\s*(?:contents|index|in this booklet|questions in this booklet)\b/i.test(textOf.slice(0, 300).replace(/^[^a-z]*/i, ''))) return true;
            return textOf.split(/\r?\n/).filter(line => numbered.test(line)).length >= 12;
        };
        const out = JSON.parse(JSON.stringify(content || {}));
        const missing = [];
        let found = 0;
        (Array.isArray(out.sections) ? out.sections : []).forEach(section => {
            (Array.isArray(section.topics) ? section.topics : []).forEach(topic => {
                const read = topic.read;
                if (!isPlainObject(read) || !read.row || !read.find) return;
                const pages = pageTexts && Array.isArray(pageTexts[read.row]) ? pageTexts[read.row] : null;
                const needle = flat(read.find);
                const hits = [];
                if (pages && needle) {
                    pages.forEach((page, i) => {
                        if (!(' ' + flat(page) + ' ').includes(' ' + needle + ' ')) return;
                        const inQuestion = String(page).split(/\r?\n/).some(line => numbered.test(line) && (' ' + flat(line) + ' ').includes(' ' + needle + ' '));
                        hits.push({ i, index: isIndex(page), inQuestion });
                    });
                }
                const body = hits.filter(hit => !hit.index);
                const best = body.find(hit => hit.inQuestion) || body[0] || hits[0];
                if (!best) {
                    delete read.page;
                    missing.push({ id: topic.id || '', row: String(read.row), find: String(read.find) });
                    return;
                }
                read.page = best.i + 1;
                found += 1;
            });
        });
        return { content: out, found, missing };
    }

    function normaliseLink(link) {
        if (!link) return null;
        const label = text(link.label);
        if (!label) return null;
        if (link.href) return safeHref(link.href) ? { label, href: safeHref(link.href) } : null;
        if (link.row) return { label, row: text(link.row) };
        if (link.title !== undefined && link.day !== undefined) return { label, day: Number(link.day), title: text(link.title) };
        return null;
    }

    /**
     * { sections: [{ id, part: core|domain|after, domain?, title, practise?, topics: [{ id, topic, know, most, read }] }],
     *   ready, order, booklets: { row: title }, nightBefore, interviewDay } → a checked model.
     */
    function normaliseContent(content) {
        const source = content || {};
        const booklets = isPlainObject(source.booklets) ? Object.assign({}, source.booklets) : {};
        const ids = new Set();
        const sections = (Array.isArray(source.sections) ? source.sections : []).map((raw, si) => {
            const id = slug(raw.id || raw.title) || 'section-' + (si + 1);
            const part = PARTS.includes(raw.part) ? raw.part : 'core';
            const topics = (Array.isArray(raw.topics) ? raw.topics : []).map((t, ti) => {
                const name = text(t.topic || t.title || t.name);
                if (!name) throw new Error('Topic ' + (ti + 1) + ' in ' + id + ' has no name');
                let tid = slug(t.id) || slug(id + '-' + name);
                if (ids.has(tid)) throw new Error('Duplicate topic id: ' + tid);
                ids.add(tid);
                return { id: tid, topic: name, know: text(t.know || t.what), most: t.most === true, read: normaliseRead(t.read), sectionId: id };
            });
            if (!topics.length) throw new Error('Section ' + id + ' has no topics');
            return {
                id, part, title: text(raw.title) || id,
                domain: part === 'domain' ? slug(raw.domain || id) : null,
                practise: normaliseLink(raw.practise),
                topics
            };
        });
        if (!sections.length) throw new Error('Syllabus has no sections');
        const byId = new Map();
        sections.forEach(section => section.topics.forEach(topic => byId.set(topic.id, topic)));
        const night = source.nightBefore || {};
        const day = source.interviewDay || {};
        return {
            title: text(source.title),
            ready: text(source.ready),
            order: text(source.order),
            booklets,
            sections,
            byId,
            total: byId.size,
            nightBefore: {
                steps: (Array.isArray(night.steps) ? night.steps : []).map(text).filter(Boolean),
                testWeek: night.testWeek && Array.isArray(night.testWeek.steps)
                    ? { title: text(night.testWeek.title), steps: night.testWeek.steps.map(text).filter(Boolean) } : null
            },
            interviewDay: {
                sections: Array.isArray(day.sections) ? day.sections : [],
                notes: (Array.isArray(day.notes) ? day.notes : []).map(n => ({
                    title: text(n.title), text: text(n.text), link: normaliseLink(n.link), mode: DAY_MODES[text(n.mode)] ? text(n.mode) : ''
                })).filter(n => n.title || n.text)
            }
        };
    }

    // ---------- links (Read, practise) ----------
    function fallbackResourceLink(day, title, page) {
        const params = new URLSearchParams({ course: 'msc-articleship-program', session: String(Number(day) + 1) });
        if (title) params.set('resource', String(title));
        if (title && Number(page) > 1) params.set('page', String(Number(page)));
        return '/learning-management-system/course?' + params.toString();
    }

    function lmsLink(lms) {
        return lms && typeof lms.resourceLink === 'function' ? lms.resourceLink : fallbackResourceLink;
    }

    /** A programme page that is not on the branch yet → its row's Day in the course; anything else unchanged. */
    function pageHref(href, lms, pageRows) {
        const rows = pageRows || PAGE_ROWS;
        const path = String(href || '').split(/[?#]/)[0];
        const row = Object.prototype.hasOwnProperty.call(rows, path) ? rows[path] : null;
        return row && !row.live ? lmsLink(lms)(row.day, row.title) : href;
    }

    /** "Read" → the booklet page in the course (in place, Back returns here) or a programme page. */
    function readHref(read, model, lms) {
        if (!read) return '';
        if (read.href) return pageHref(read.href, lms);
        const title = model.booklets[read.row];
        if (!title) return '';
        return lmsLink(lms)(DAY, title, read.page);
    }

    function linkHref(link, model, lms) {
        if (!link) return '';
        if (link.href) return pageHref(link.href, lms);
        if (link.row) {
            const title = model.booklets[link.row];
            return title ? lmsLink(lms)(DAY, title) : '';
        }
        if (link.title && Number.isInteger(link.day)) return lmsLink(lms)(link.day, link.title);
        return '';
    }

    function readLabel(read, model) {
        if (!read) return '';
        if (read.href) return readText(read);
        return model.booklets[read.row] ? 'Read in ' + model.booklets[read.row] : 'Read';
    }

    /** The button's word: "Practise" for a practice page (written test, AI interview), "Read" for a booklet. */
    function readText(read) {
        return read && read.href && /^\/(?:articleship-program\/written-test\/|ai-interview)/.test(read.href) ? 'Practise' : 'Read';
    }

    /**
     * A set mock in Practise your interview: { round, domain, firm } → /ai-interview.html?mode=articleship&round=…
     * Given `href` (an /ai-interview.html link from the content), its own parameters stay and only missing ones are added.
     */
    function mockHref(preset, href) {
        const p = preset || {};
        const base = text(href) && text(href).split(/[?#]/)[0] === MOCK_PAGE ? text(href) : MOCK_PAGE + '?mode=articleship';
        const [path, query] = base.split('#')[0].split('?');
        const params = new URLSearchParams(query || '');
        if (!params.has('mode')) params.set('mode', 'articleship');
        [['round', p.round], ['domain', p.domain], ['firm', clip(p.firm, 120)]].forEach(([key, value]) => {
            if (text(value) && !params.has(key)) params.set(key, text(value));
        });
        return path + '?' + params.toString();
    }

    function isMockHref(href) {
        return text(href).split(/[?#]/)[0] === MOCK_PAGE;
    }

    /** "Practise a GST mock", "Practise an M&A tax mock": the domain's name in a sentence. */
    function mockLabel(domainTitle) {
        const name = text(domainTitle);
        const first = name.split(/\s/)[0] || '';
        const acronym = first.length > 1 && first === first.toUpperCase();
        const shown = acronym ? name : name.charAt(0).toLowerCase() + name.slice(1);
        const an = /^[aeiou]/i.test(name) || (acronym && /^[AEFHILMNORSX]/.test(first));
        return 'Practise ' + (an ? 'an ' : 'a ') + shown + ' mock';
    }

    // ---------- dates ----------
    function isISODate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return false;
        const [y, m, d] = value.split('-').map(Number);
        const date = new Date(Date.UTC(y, m - 1, d));
        return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
    }

    function dayNumber(iso) {
        const [y, m, d] = iso.split('-').map(Number);
        return Math.round(Date.UTC(y, m - 1, d) / 86400000);
    }

    /** The student's own calendar day (local time), as YYYY-MM-DD. */
    function todayISO(now) {
        const date = now instanceof Date ? now : new Date(typeof now === 'number' ? now : Date.now());
        const pad = n => String(n).padStart(2, '0');
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    function daysLeft(dateISO, today) {
        if (!isISODate(dateISO) || !isISODate(today)) return null;
        return dayNumber(dateISO) - dayNumber(today);
    }

    /** { state: none|future|tomorrow|today|past, days, big, label } for the countdown. */
    function countdown(dateISO, today) {
        const days = daysLeft(dateISO, today);
        if (days === null) return { state: 'none', days: null, big: '', label: 'Add your interview date' };
        if (days < 0) return { state: 'past', days, big: '0', label: 'days left · set your next date' };
        if (days === 0) return { state: 'today', days, big: 'Today', label: 'is the day. All the best.' };
        if (days === 1) return { state: 'tomorrow', days, big: '1', label: 'day left · it is tomorrow' };
        return { state: 'future', days, big: String(days), label: 'days left' };
    }

    function shortDate(iso) {
        if (!isISODate(iso)) return '';
        const [y, m, d] = iso.split('-').map(Number);
        return d + ' ' + MONTHS[m - 1] + ' ' + y;
    }

    function monthOf(iso) {
        if (!isISODate(iso)) return '';
        const [y, m] = iso.split('-').map(Number);
        return MONTHS_LONG[m - 1] + ' ' + y;
    }

    // ---------- progress ----------
    function statusOf(data, id) {
        const value = data && data.status ? data.status[id] : undefined;
        return STATUSES.includes(value) ? value : 'not-started';
    }

    function summarise(topics, data) {
        let ready = 0;
        let learning = 0;
        topics.forEach(topic => {
            const s = statusOf(data, topic.id);
            if (s === 'ready') ready += 1;
            else if (s === 'learning') learning += 1;
        });
        const total = topics.length;
        return {
            total, ready, learning,
            notStarted: total - ready - learning,
            percent: total ? Math.round((ready / total) * 100) : 0,
            learningPercent: total ? Math.round((learning / total) * 100) : 0,
            started: total ? Math.round(((ready + learning) / total) * 100) : 0,
            complete: total > 0 && ready === total
        };
    }

    function sectionFor(model, domain) {
        return domain ? model.sections.find(section => section.part === 'domain' && section.domain === domain) || null : null;
    }

    /** In order: Core sections, my domain, my second choice, then the written test and GD. */
    function visibleSections(model, myDomain, backupDomain) {
        const core = model.sections.filter(s => s.part === 'core');
        const after = model.sections.filter(s => s.part === 'after');
        const mine = sectionFor(model, myDomain);
        const backup = backupDomain && backupDomain !== myDomain ? sectionFor(model, backupDomain) : null;
        return core.concat(mine ? [mine] : [], backup ? [backup] : [], after);
    }

    function overall(model, data, myDomain, backupDomain) {
        const topics = [];
        visibleSections(model, myDomain, backupDomain).forEach(section => topics.push(...section.topics));
        return summarise(topics, data);
    }

    /** The night-before view: only Core and my domain, only what is not Ready yet; often-asked topics first. */
    function nightBefore(model, data, myDomain) {
        const sections = model.sections.filter(s => s.part === 'core');
        const mine = sectionFor(model, myDomain);
        if (mine) sections.push(mine);
        const groups = sections.map(section => {
            const open = section.topics.filter(topic => statusOf(data, topic.id) !== 'ready');
            return { section, topics: open.filter(topic => topic.most).concat(open.filter(topic => !topic.most)) };
        }).filter(group => group.topics.length);
        return { groups, count: groups.reduce((n, g) => n + g.topics.length, 0) };
    }

    // ---------- My interviews ----------
    function lines(value) {
        return text(value).split(/\r?\n/).map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
    }

    function pick(list, value, fallback) {
        const v = text(value);
        return list.includes(v) ? v : fallback;
    }

    function newId(now) {
        const t = typeof now === 'number' ? now : Date.now();
        return 'iv-' + t.toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    }

    /** Clean one log entry (from the form or from storage). Returns null if it names neither the firm nor its type. */
    function cleanEntry(raw, options) {
        const opts = options || {};
        if (!isPlainObject(raw)) return null;
        const firm = clip(raw.firm, 120);
        const type = pick(FIRM_TYPES, raw.type, '');
        if (!firm && !type) return null;
        const nowMs = typeof opts.now === 'number' ? opts.now : Date.now();
        const normalise = typeof opts.normaliseDomain === 'function' ? opts.normaliseDomain : (v => slug(v) || null);
        return {
            id: /^iv-[a-z0-9-]{3,40}$/.test(text(raw.id)) ? text(raw.id) : newId(nowMs),
            date: isISODate(text(raw.date)) ? text(raw.date) : todayISO(nowMs),
            firm,
            type,
            city: clip(raw.city, 80),
            domain: raw.domain ? normalise(raw.domain) : null,
            backup: raw.backup ? normalise(raw.backup) : null,
            stage: pick(RESULT_STAGES, raw.stage, ''),
            round: pick(ROUNDS, raw.round, 'Technical'),
            mode: pick(MODES, raw.mode, ''),
            length: pick(LENGTHS, raw.length, ''),
            how: pick(HOW_CALLED, raw.how, ''),
            questions: clip(raw.questions, TEXT_MAX),
            missed: clip(raw.missed, TEXT_MAX),
            task: clip(raw.task, 600),
            outcome: pick(OUTCOMES, raw.outcome, 'Waiting'),
            wait: pick(WAITS, raw.wait, ''),
            tip: clip(raw.tip, 400),
            createdAt: Number(raw.createdAt) || nowMs,
            updatedAt: Number(raw.updatedAt) || nowMs,
            sharedAt: Number(raw.sharedAt) || 0
        };
    }

    /** The entry's title: the firm's name, or its type when the name was left out. */
    function entryName(entry) {
        return (entry && (entry.firm || entry.type)) || '';
    }

    function sortedLog(log) {
        return (Array.isArray(log) ? log : []).slice().sort((a, b) =>
            (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
    }

    /** A short, stable id for one line of text (the "Got it now" tick of a missed question). */
    function lineHash(value) {
        let h = 5381;
        const s = text(value).toLowerCase().replace(/\s+/g, ' ');
        for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
        return h.toString(36);
    }

    function missedKey(entryId, line) {
        return text(entryId) + ':' + lineHash(line);
    }

    /**
     * Questions the student could not answer, newest first: they go to the night-before view.
     * With `done` ({ key: true }), lines ticked "Got it now" are left out.
     */
    function missedQuestions(log, done) {
        const out = [];
        const ticked = isPlainObject(done) ? done : {};
        sortedLog(log).forEach(entry => lines(entry.missed).forEach(q => {
            const key = missedKey(entry.id, q);
            if (ticked[key] !== true) out.push({ key, text: q, firm: entryName(entry), date: entry.date, entryId: entry.id });
        }));
        return out;
    }

    /** True when an interview dated on or after `iso` is already logged (the "Log this interview" nudge then hides). */
    function loggedSince(log, iso) {
        if (!isISODate(iso)) return false;
        return (Array.isArray(log) ? log : []).some(entry => entry && isISODate(text(entry.date)) && entry.date >= iso);
    }

    /** Strip anything that could identify a person before a log leaves the device. */
    function redact(value) {
        return text(value)
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
            .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, '[link]')
            .replace(/(?:\+?\d[\d\s-]{8,}\d)/g, match => (match.replace(/\D/g, '').length >= 10 ? '[number]' : match));
    }

    /**
     * What MSC receives: month (not the day), the firm (its name only if the student keeps it in), its type, city,
     * domains, round and the questions. No student details. options: { withFirm: false } leaves the firm's name out.
     */
    function sharePayload(entry, labelForDomain, options) {
        const label = value => (value ? (typeof labelForDomain === 'function' ? labelForDomain(value) : value) || '' : '');
        const withFirm = !(options && options.withFirm === false);
        return {
            month: monthOf(entry.date),
            firm: withFirm ? redact(entry.firm) : '',
            type: entry.type || '',
            city: redact(entry.city),
            domain: label(entry.domain),
            backup: entry.backup && entry.backup !== entry.domain ? label(entry.backup) : '',
            stage: entry.stage || '',
            round: entry.round || '',
            mode: entry.mode || '',
            length: entry.length || '',
            how: entry.how || '',
            questions: lines(redact(entry.questions)).join('\n'),
            missed: lines(redact(entry.missed)).join('\n'),
            task: redact(entry.task),
            outcome: entry.outcome || '',
            wait: entry.wait || '',
            tip: redact(entry.tip)
        };
    }

    /** The interview-day checklist for one mode: sections named for the other mode drop out; no mode = all. */
    function daySections(sections, mode) {
        const list = Array.isArray(sections) ? sections : [];
        if (!DAY_MODES[mode]) return list;
        const other = mode === 'online' ? /^\s*in[- ]person\b/i : /^\s*online\b/i;
        return list.filter(section => !other.test(text(section && section.title)));
    }

    /** The interview-day notes for one mode, by the same rule: a note marked (or titled) for the other mode drops out. */
    function dayNotes(notes, mode) {
        const list = Array.isArray(notes) ? notes : [];
        if (!DAY_MODES[mode]) return list;
        return list.filter(note => {
            const own = note && DAY_MODES[note.mode] ? note.mode : '';
            if (own) return own === mode;
            return daySections([note], mode).length === 1;
        });
    }

    function shareEnabled(config) {
        const cfg = config || SHARE_FORM;
        return /^https:\/\/docs\.google\.com\/forms\/d\/e\/[A-Za-z0-9_-]+\/formResponse$/.test(text(cfg.action)) &&
            Boolean(cfg.fields) && /^entry\.\d+$/.test(text(cfg.fields.questions)) && /^entry\.\d+$/.test(text(cfg.fields.firm));
    }

    /** The urlencoded body the Google Form accepts (only fields that have an entry id). */
    function shareBody(payload, config) {
        const cfg = config || SHARE_FORM;
        const body = new URLSearchParams();
        Object.keys(payload).forEach(key => {
            const entry = text(cfg.fields && cfg.fields[key]);
            if (/^entry\.\d+$/.test(entry) && payload[key]) body.append(entry, payload[key]);
        });
        return body.toString();
    }

    // ---------- merge (two devices changed it since the last sync) ----------
    /** Tombstones older than DELETED_KEEP_DAYS are dropped (they would otherwise grow forever). */
    function pruneDeleted(deleted, nowMs) {
        const cutoff = (typeof nowMs === 'number' ? nowMs : Date.now()) - DELETED_KEEP_DAYS * 86400000;
        const out = {};
        Object.entries(isPlainObject(deleted) ? deleted : {}).forEach(([id, at]) => {
            const t = Number(at) || 0;
            // A tombstone without a usable time is kept once more with today's time, so it ages out like the rest.
            out[id] = t > 0 ? t : (typeof nowMs === 'number' ? nowMs : Date.now());
            if (t > 0 && t < cutoff) delete out[id];
        });
        return out;
    }

    /**
     * One per-key map (status, dates, notes, dayTicks, missedDone) with its "<field>At" times: per key the newer change
     * wins; a key only one side has is kept; with no times (data saved before times existed) this device wins, as before.
     */
    function mergeKeyed(local, remote, field) {
        const lv = isPlainObject(local[field]) ? local[field] : {};
        const rv = isPlainObject(remote[field]) ? remote[field] : {};
        const la = isPlainObject(local[field + 'At']) ? local[field + 'At'] : {};
        const ra = isPlainObject(remote[field + 'At']) ? remote[field + 'At'] : {};
        const values = {};
        const at = {};
        const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
        new Set([...Object.keys(rv), ...Object.keys(lv), ...Object.keys(ra), ...Object.keys(la)]).forEach(key => {
            const lt = Number(la[key]) || 0;
            const rt = Number(ra[key]) || 0;
            const useRemote = has(rv, key) && (!has(lv, key) || rt > lt);
            if (useRemote) values[key] = rv[key];
            else if (has(lv, key)) values[key] = lv[key];
            if (Math.max(lt, rt) > 0) at[key] = Math.max(lt, rt);
        });
        return { values, at };
    }

    /** A single value (interviewDate, dayMode) with its "<field>At" time: the newer wins; no times = the old rule. */
    function mergeValue(local, remote, field, fallback) {
        const lt = Number(local[field + 'At']) || 0;
        const rt = Number(remote[field + 'At']) || 0;
        if (rt > lt) return { value: remote[field], at: rt };
        if (lt > rt) return { value: local[field], at: lt };
        return { value: fallback(local[field], remote[field]), at: lt };
    }

    /**
     * mergeData(local, remote[, now]): the store calls it when two devices both changed the data since the last sync.
     * Per key by time (see mergeKeyed); the log by each entry's updatedAt; a deletion wins and is kept DELETED_KEEP_DAYS.
     */
    function mergeData(localData, remoteData, nowMs) {
        const local = Object.assign({}, DEFAULTS, localData || {});
        const remote = Object.assign({}, DEFAULTS, remoteData || {});
        const allDeleted = {};
        [remote.logDeleted, local.logDeleted].forEach(map => Object.entries(isPlainObject(map) ? map : {}).forEach(([id, t]) => {
            allDeleted[id] = Math.max(Number(allDeleted[id]) || 0, Number(t) || 0);
        }));
        const deleted = pruneDeleted(allDeleted, nowMs);
        const byId = new Map();
        (Array.isArray(remote.log) ? remote.log : []).forEach(entry => { if (entry && entry.id) byId.set(entry.id, entry); });
        (Array.isArray(local.log) ? local.log : []).forEach(entry => {
            if (!entry || !entry.id) return;
            const other = byId.get(entry.id);
            if (!other || (Number(entry.updatedAt) || 0) >= (Number(other.updatedAt) || 0)) byId.set(entry.id, entry);
        });
        const log = sortedLog([...byId.values()].filter(entry => !Object.prototype.hasOwnProperty.call(allDeleted, entry.id))).slice(0, LOG_MAX);
        const out = Object.assign({}, remote, local, { logDeleted: deleted, log });
        KEYED.forEach(field => {
            const merged = mergeKeyed(local, remote, field);
            out[field] = merged.values;
            out[field + 'At'] = merged.at;
        });
        const date = mergeValue(local, remote, 'interviewDate', (l, r) => l || r || '');
        out.interviewDate = date.value || '';
        out.interviewDateAt = date.at;
        const mode = mergeValue(local, remote, 'dayMode', l => l);
        out.dayMode = mode.value || '';
        out.dayModeAt = mode.at;
        return out;
    }

    /** How big the saved data is, against the account's limit: { bytes, max, state: 'ok' | 'near' | 'too-large' }. */
    function sizeState(data, max) {
        const limit = Number(max) > 0 ? Number(max) : 250000;
        let bytes = 0;
        try { bytes = JSON.stringify(data || {}).length; } catch (_) { bytes = 0; }
        return { bytes, max: limit, state: bytes > limit ? 'too-large' : bytes > limit * 0.85 ? 'near' : 'ok' };
    }

    // ---------- DOM ----------
    const ICONS = {
        syllabus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/></svg>',
        night: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
        day: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M8 13l3 3 5-5"/></svg>',
        log: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6M9 18h3"/></svg>',
        plan: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>'
    };
    const TABS = [
        { id: 'syllabus', label: 'Syllabus' },
        { id: 'night', label: 'Night before' },
        { id: 'day', label: 'Interview day' },
        { id: 'log', label: 'My interviews' }
    ];

    function el(doc, tag, className, content) {
        const node = doc.createElement(tag);
        if (className) node.className = className;
        if (content !== undefined && content !== null) node.textContent = content;
        return node;
    }

    function anchor(doc, className, label, href) {
        const a = el(doc, 'a', className, label);
        a.href = href;
        if (isExternal(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        return a;
    }

    function icon(doc, name) {
        const span = el(doc, 'span', 'it-icon');
        span.innerHTML = ICONS[name] || '';
        return span;
    }

    /**
     * Render the tracker into `container`.
     * options: { store, settings: { getMyDomain, getBackupDomain, setMyDomain, subscribe }, lms, now(), fetch,
     *            shareForm, domains: [{ slug, label }], location, history }
     */
    function mount(container, content, options) {
        const opts = options || {};
        const doc = container.ownerDocument || root.document;
        const win = doc.defaultView || root;
        const model = content && content.sections instanceof Array && content.byId instanceof Map ? content : normaliseContent(content);
        const progress = root.MSCArticleshipProgress;
        const store = opts.store || progress.open(TOOL, { defaults: DEFAULTS, merge: mergeData });
        const settings = opts.settings || {
            getMyDomain: () => progress.getMyDomain(),
            getBackupDomain: () => progress.getBackupDomain(),
            setMyDomain: (value, extra) => progress.setMyDomain(value, extra),
            subscribe: listener => progress.onSettingsChange(listener)
        };
        const domains = opts.domains || (progress && progress.DOMAINS) || [];
        const domainLabel = slugValue => (domains.find(d => d.slug === slugValue) || {}).label || '';
        const normaliseDomain = value => (progress && progress.normaliseDomain ? progress.normaliseDomain(value) : slug(value) || null);
        const lms = opts.lms || root.MSCArticleshipLms;
        const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
        const shareForm = opts.shareForm || SHARE_FORM;
        const fetchFn = opts.fetch || (win.fetch ? win.fetch.bind(win) : null);
        const loc = opts.location || win.location || { hash: '' };
        const hist = opts.history || win.history || null;
        const checklistApi = opts.checklist || root.MSCArticleshipChecklist;

        let data = Object.assign({}, DEFAULTS, store.get());
        const ui = { tab: 'syllabus', open: new Set(), plan: new Set(), editing: null, formOpen: false, sharing: null, shareFirm: true,
            confirmDelete: null, confirmClear: false, before: new Map(), showAll: new Set(), logDate: '' };
        const maxBytes = (progress && Number(progress.MAX_BYTES)) || 250000;

        container.textContent = '';
        container.classList.add('it-app');

        // ----- setup card -----
        const setup = el(doc, 'section', 'it-setup ap-card');
        const count = el(doc, 'div', 'it-count');
        const countBig = el(doc, 'span', 'it-count-big');
        const countLabel = el(doc, 'span', 'it-count-label');
        count.append(countBig, countLabel);
        const fields = el(doc, 'div', 'it-fields');
        const domainSelect = el(doc, 'select', 'it-input');
        domainSelect.id = 'it-domain';
        const backupSelect = el(doc, 'select', 'it-input');
        backupSelect.id = 'it-backup';
        const dateInput = el(doc, 'input', 'it-input');
        dateInput.type = 'date';
        dateInput.id = 'it-date';
        [[domainSelect, 'My domain'], [backupSelect, 'Second choice'], [dateInput, 'Interview date']].forEach(([input, label]) => {
            const wrap = el(doc, 'label', 'it-field');
            wrap.setAttribute('for', input.id);
            wrap.appendChild(el(doc, 'span', 'it-label', label));
            wrap.appendChild(input);
            fields.appendChild(wrap);
        });
        const fillDomains = (select, emptyLabel) => {
            select.appendChild(new win.Option(emptyLabel, ''));
            domains.forEach(d => select.appendChild(new win.Option(d.label, d.slug)));
        };
        fillDomains(domainSelect, 'Pick your domain');
        fillDomains(backupSelect, 'None');
        const overallBox = el(doc, 'div', 'it-overall');
        const overallText = el(doc, 'div', 'it-overall-text');
        const overallCount = el(doc, 'span', 'it-overall-count');
        const overallPct = el(doc, 'span', 'it-overall-pct');
        overallText.append(overallCount, overallPct);
        const overallBar = el(doc, 'div', 'it-bar is-big');
        const overallReady = el(doc, 'span', 'is-ready');
        const overallLearning = el(doc, 'span', 'is-learning');
        overallBar.append(overallReady, overallLearning);
        const legend = el(doc, 'div', 'it-legend');
        legend.innerHTML = '<span><i class="is-ready"></i>Ready</span><span><i class="is-learning"></i>Learning</span><span><b class="it-star" aria-hidden="true">★</b>Often asked</span>';
        overallBox.append(overallText, overallBar, legend);
        overallBox.setAttribute('role', 'status');
        overallBox.setAttribute('aria-live', 'polite');
        const nudge = el(doc, 'a', 'ap-btn is-block it-nudge ap-hidden');
        // The account copy has a size limit; past it nothing syncs, so the student is told (and what to do).
        const sizeNote = el(doc, 'p', 'it-size ap-hidden');
        sizeNote.setAttribute('role', 'status');
        const setupTop = el(doc, 'div', 'it-setup-top');
        setupTop.append(count, fields);
        setup.append(setupTop, overallBox, nudge, sizeNote);
        container.appendChild(setup);

        // ----- tabs -----
        const tabbar = el(doc, 'nav', 'it-tabs');
        tabbar.setAttribute('role', 'tablist');
        tabbar.setAttribute('aria-label', 'Tracker views');
        const tabButtons = new Map();
        TABS.forEach(tab => {
            const b = el(doc, 'button', 'it-tab');
            b.type = 'button';
            b.id = 'it-tab-' + tab.id;
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-controls', 'it-panel-' + tab.id);
            b.dataset.tab = tab.id;
            b.appendChild(icon(doc, tab.id));
            b.appendChild(el(doc, 'span', 'it-tab-label', tab.label));
            b.addEventListener('click', () => showTab(tab.id, true));
            tabButtons.set(tab.id, b);
            tabbar.appendChild(b);
        });
        container.appendChild(tabbar);

        const panels = new Map();
        TABS.forEach(tab => {
            const panel = el(doc, 'section', 'it-panel');
            panel.id = 'it-panel-' + tab.id;
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', 'it-tab-' + tab.id);
            panels.set(tab.id, panel);
            container.appendChild(panel);
        });

        // ----- state helpers -----
        function myDomain() { return settings.getMyDomain() || null; }
        function backupDomain() {
            const b = settings.getBackupDomain() || null;
            return b && b !== myDomain() ? b : null;
        }

        function save(change) {
            data = Object.assign({}, DEFAULTS, store.update(d => {
                const next = Object.assign({}, DEFAULTS, d);
                change(next);
                return next;
            }));
            paintSize();
        }

        /** Set one key of a per-key map and stamp its time (mergeData keeps the newer change per key). */
        function put(d, field, key, value) {
            d[field] = Object.assign({}, d[field], { [key]: value });
            d[field + 'At'] = Object.assign({}, d[field + 'At'], { [key]: now() });
        }

        function setStatus(id, value) {
            if (!model.byId.has(id) || !STATUSES.includes(value)) return;
            save(d => { put(d, 'status', id, value); });
            syncTopicNodes(id);
            paintCounts();
        }

        // ----- topic component -----
        const topicNodes = new Map(); // id → Set of { li, radios }

        function topicItem(topic, compact) {
            const li = el(doc, 'li', 'it-topic');
            li.dataset.id = topic.id;
            const head = el(doc, 'div', 'it-topic-head');
            const name = el(doc, 'span', 'it-topic-name', topic.topic);
            if (topic.most) {
                const star = el(doc, 'b', 'it-star', '★');
                star.setAttribute('title', 'Often asked');
                star.setAttribute('aria-label', 'Often asked');
                name.appendChild(star);
            }
            head.appendChild(name);
            const href = readHref(topic.read, model, lms);
            const tools = el(doc, 'span', 'it-topic-tools');
            if (href) {
                const read = anchor(doc, 'it-read', readText(topic.read), href);
                read.setAttribute('aria-label', readLabel(topic.read, model) + ': ' + topic.topic);
                tools.appendChild(read);
            }
            let planBox = null;
            let chip = null;
            if (!compact) {
                const planBtn = el(doc, 'button', 'it-plan-btn');
                planBtn.type = 'button';
                planBtn.appendChild(icon(doc, 'plan'));
                planBtn.setAttribute('aria-label', 'Date and note: ' + topic.topic);
                planBtn.setAttribute('aria-expanded', 'false');
                planBtn.addEventListener('click', () => {
                    const open = !ui.plan.has(topic.id);
                    if (open) ui.plan.add(topic.id); else ui.plan.delete(topic.id);
                    planBtn.setAttribute('aria-expanded', String(open));
                    planBox.classList.toggle('ap-hidden', !open);
                    paintChip(topic.id, chip);
                    if (open) planBox.querySelector('input').focus();
                });
                tools.appendChild(planBtn);
                planBox = el(doc, 'div', 'it-plan' + (ui.plan.has(topic.id) ? '' : ' ap-hidden'));
                const byWrap = el(doc, 'label', 'it-plan-field');
                byWrap.appendChild(el(doc, 'span', 'it-label', 'Ready by'));
                const by = el(doc, 'input', 'it-input');
                by.type = 'date';
                by.value = data.dates[topic.id] || '';
                by.addEventListener('change', () => {
                    const value = isISODate(by.value) ? by.value : '';
                    save(d => { put(d, 'dates', topic.id, value); });
                    paintChip(topic.id, chip);
                });
                byWrap.appendChild(by);
                const noteWrap = el(doc, 'label', 'it-plan-field is-note');
                noteWrap.appendChild(el(doc, 'span', 'it-label', 'Note'));
                const note = el(doc, 'input', 'it-input');
                note.type = 'text';
                note.maxLength = 300;
                note.placeholder = 'What to revise';
                note.value = data.notes[topic.id] || '';
                note.addEventListener('change', () => {
                    save(d => { put(d, 'notes', topic.id, clip(note.value, 300)); });
                    paintChip(topic.id, chip);
                });
                noteWrap.appendChild(note);
                planBox.append(byWrap, noteWrap);
                chip = el(doc, 'p', 'it-chip');
            }
            head.appendChild(tools);
            li.appendChild(head);
            if (topic.know) li.appendChild(el(doc, 'p', 'it-know', topic.know));
            if (chip) li.appendChild(chip);
            if (planBox) li.appendChild(planBox);

            const radios = [];
            let toggle = null;
            if (compact) {
                // The night before there is only one question per topic: can you explain it now?
                toggle = el(doc, 'button', 'it-ready-btn');
                toggle.type = 'button';
                toggle.appendChild(el(doc, 'span', 'it-ready-tick'));
                toggle.appendChild(el(doc, 'span', '', 'Ready'));
                toggle.setAttribute('aria-label', 'Ready: ' + topic.topic);
                toggle.addEventListener('click', () => {
                    if (statusOf(data, topic.id) === 'ready') {
                        setStatus(topic.id, ui.before.get(topic.id) || 'learning');
                    } else {
                        ui.before.set(topic.id, statusOf(data, topic.id));
                        setStatus(topic.id, 'ready');
                    }
                });
                tools.appendChild(toggle);
                if (!topicNodes.has(topic.id)) topicNodes.set(topic.id, new Set());
                const compactRecord = { li, radios, toggle, chip, compact: true };
                topicNodes.get(topic.id).add(compactRecord);
                paintTopic(topic.id, compactRecord);
                return li;
            }
            const group = el(doc, 'div', 'it-status');
            group.setAttribute('role', 'radiogroup');
            group.setAttribute('aria-label', 'Status: ' + topic.topic);
            const groupName = 'st-' + topic.id;
            STATUSES.forEach(value => {
                const label = el(doc, 'label', 'it-seg is-' + value);
                const input = el(doc, 'input');
                input.type = 'radio';
                input.name = groupName;
                input.value = value;
                input.addEventListener('change', () => { if (input.checked) setStatus(topic.id, value); });
                label.append(input, el(doc, 'span', '', STATUS_LABELS[value]));
                group.appendChild(label);
                radios.push(input);
            });
            li.appendChild(group);
            if (!topicNodes.has(topic.id)) topicNodes.set(topic.id, new Set());
            const record = { li, radios, chip, compact: Boolean(compact) };
            topicNodes.get(topic.id).add(record);
            paintTopic(topic.id, record);
            return li;
        }

        function paintChip(id, chip) {
            if (!chip) return;
            const parts = [];
            if (data.dates[id]) parts.push('Ready by ' + shortDate(data.dates[id]));
            if (data.notes[id]) parts.push(data.notes[id]);
            chip.textContent = parts.join(' · ');
            chip.classList.toggle('ap-hidden', !parts.length || ui.plan.has(id));
        }

        function paintTopic(id, record) {
            const s = statusOf(data, id);
            record.radios.forEach(r => { r.checked = r.value === s; });
            if (record.toggle) record.toggle.setAttribute('aria-pressed', String(s === 'ready'));
            record.li.classList.remove('is-not-started', 'is-learning', 'is-ready');
            record.li.classList.add('is-' + s);
            paintChip(id, record.chip);
        }

        function syncTopicNodes(id) {
            (topicNodes.get(id) || []).forEach(record => paintTopic(id, record));
        }

        // ----- section component -----
        const sectionMeters = new Map(); // id → Set of { meta, ready, learning }

        function bar(doc_, big) {
            const b = el(doc_, 'div', 'it-bar' + (big ? ' is-big' : ''));
            const r = el(doc_, 'span', 'is-ready');
            const l = el(doc_, 'span', 'is-learning');
            b.append(r, l);
            return { bar: b, ready: r, learning: l };
        }

        /** Topic ids a long section keeps folded until "Show all": every topic after the first few still to do. */
        function previewHidden(section) {
            const out = new Set();
            if (ui.showAll.has(section.id) || section.topics.length <= PREVIEW_TOPICS + 2) return out;
            const open = section.topics.filter(topic => statusOf(data, topic.id) !== 'ready');
            const shown = new Set((open.length ? open : section.topics).slice(0, PREVIEW_TOPICS).map(topic => topic.id));
            section.topics.forEach(topic => { if (!shown.has(topic.id)) out.add(topic.id); });
            return out;
        }

        function sectionBlock(section, tag) {
            const details = el(doc, 'details', 'it-section');
            details.dataset.section = section.id;
            details.open = ui.open.has(section.id);
            details.addEventListener('toggle', () => {
                if (details.open) ui.open.add(section.id); else ui.open.delete(section.id);
            });
            const summary = el(doc, 'summary', 'it-section-head');
            const titleRow = el(doc, 'span', 'it-section-title');
            titleRow.appendChild(el(doc, 'span', 'it-section-name', section.title));
            if (tag) titleRow.appendChild(el(doc, 'span', 'it-tag', tag));
            const meta = el(doc, 'span', 'it-section-meta');
            const meter = bar(doc);
            summary.append(titleRow, meta, meter.bar);
            details.appendChild(summary);
            const list = el(doc, 'ol', 'it-topics');
            // A long section opens with its first PREVIEW_TOPICS topics not Ready yet; "Show all" brings the rest.
            const hidden = previewHidden(section);
            section.topics.forEach(topic => {
                const li = topicItem(topic, false);
                if (hidden.has(topic.id)) li.hidden = true;
                list.appendChild(li);
            });
            details.appendChild(list);
            if (hidden.size) {
                const more = el(doc, 'button', 'it-show-all', 'Show all ' + section.topics.length + ' topics');
                more.type = 'button';
                more.setAttribute('aria-label', 'Show all ' + section.topics.length + ' topics: ' + section.title);
                more.addEventListener('click', () => {
                    ui.showAll.add(section.id);
                    list.querySelectorAll('.it-topic[hidden]').forEach(li => { li.hidden = false; });
                    const next = list.querySelector('.it-topic[data-id="' + [...hidden][0] + '"] .it-seg input, .it-topic[data-id="' + [...hidden][0] + '"] .it-read');
                    more.remove();
                    if (next && next.focus) next.focus({ preventScroll: true });
                });
                details.appendChild(more);
            }
            const foot = el(doc, 'div', 'it-section-foot');
            const practiseLink = linkHref(section.practise, model, lms);
            const practise = isMockHref(practiseLink)
                ? mockHref({ round: SECTION_ROUNDS[section.id] || (section.part === 'domain' ? 'technical' : 'full'), domain: section.domain }, practiseLink)
                : practiseLink;
            if (practise) foot.appendChild(anchor(doc, 'it-foot-link', section.practise.label, practise));
            if (section.part === 'domain') {
                if (!isMockHref(practiseLink)) {
                    foot.appendChild(anchor(doc, 'it-foot-link', mockLabel(domainLabel(section.domain) || section.title),
                        mockHref({ round: 'technical', domain: section.domain })));
                }
                foot.appendChild(anchor(doc, 'it-foot-link', 'Domain roadmap', '/articleship-program/domain-roadmaps/#' + section.domain));
            }
            if (foot.childNodes.length) details.appendChild(foot);
            if (!sectionMeters.has(section.id)) sectionMeters.set(section.id, new Set());
            sectionMeters.get(section.id).add({ meta, ready: meter.ready, learning: meter.learning, details });
            return details;
        }

        function paintCounts() {
            sectionMeters.forEach((set, id) => {
                const section = model.sections.find(s => s.id === id);
                const sum = summarise(section.topics, data);
                set.forEach(m => {
                    m.meta.textContent = sum.ready + '/' + sum.total + ' ready · ' + sum.percent + '%';
                    m.ready.style.width = sum.percent + '%';
                    m.learning.style.width = sum.learningPercent + '%';
                    m.details.classList.toggle('is-complete', sum.complete);
                });
            });
            const all = overall(model, data, myDomain(), backupDomain());
            overallCount.textContent = all.ready + ' of ' + all.total + ' ready';
            overallPct.textContent = all.percent + '%';
            overallReady.style.width = all.percent + '%';
            overallLearning.style.width = all.learningPercent + '%';
            overallBox.classList.toggle('is-complete', all.complete);
            const nb = nightBefore(model, data, myDomain());
            const nightCount = panels.get('night').querySelector('[data-night-count]');
            if (nightCount) nightCount.textContent = nightLine(nb.count);
            return all;
        }

        function nightLine(n) {
            const d = myDomain();
            const scope = d ? 'Core and ' + domainLabel(d) : 'Core';
            return n ? n + ' ' + scope + (n === 1 ? ' topic is' : ' topics are') + ' not Ready yet. Go through them once, aloud.'
                : 'Every ' + scope + ' topic is Ready. Read your CV twice and sleep on time.';
        }

        // ----- panels -----
        function renderSyllabus() {
            const panel = panels.get('syllabus');
            panel.textContent = '';
            const sticky = el(doc, 'div', 'ap-sticky it-ready-note');
            const strong = el(doc, 'strong', '', 'Ready');
            sticky.appendChild(strong);
            sticky.appendChild(doc.createTextNode(' ' + model.ready.replace(/^Ready\s*/i, '')));
            if (model.order) {
                sticky.appendChild(el(doc, 'br'));
                sticky.appendChild(doc.createTextNode(model.order));
            }
            panel.appendChild(sticky);

            const mine = myDomain();
            const backup = backupDomain();
            const parts = [
                { title: 'Core', sub: 'asked everywhere', sections: model.sections.filter(s => s.part === 'core') },
                { title: 'Your domain', sections: [sectionFor(model, mine), sectionFor(model, backup)].filter(Boolean), domain: true },
                { title: 'Tests and GD', sections: model.sections.filter(s => s.part === 'after') }
            ];
            parts.forEach(part => {
                const h = el(doc, 'h2', 'ap-h2 it-part', part.title);
                if (part.sub) h.appendChild(el(doc, 'span', 'it-part-sub', part.sub));
                panel.appendChild(h);
                if (part.domain && !mine) {
                    const empty = el(doc, 'div', 'ap-card it-empty');
                    empty.appendChild(el(doc, 'p', '', 'Pick your domain to see its topics.'));
                    const pickBtn = el(doc, 'button', 'ap-btn is-secondary', 'Pick my domain');
                    pickBtn.type = 'button';
                    pickBtn.addEventListener('click', () => { domainSelect.focus(); setup.scrollIntoView({ block: 'start' }); });
                    empty.appendChild(pickBtn);
                    panel.appendChild(empty);
                    return;
                }
                part.sections.forEach(section => {
                    const tag = part.domain ? (section.domain === mine ? 'My domain' : 'Second choice') : '';
                    panel.appendChild(sectionBlock(section, tag));
                });
            });
            const next = el(doc, 'a', 'it-next ap-card');
            next.href = '#day';
            next.appendChild(el(doc, 'span', 'it-next-title', 'Interview day'));
            next.appendChild(el(doc, 'span', 'it-next-text', 'The checklist for the day itself'));
            next.addEventListener('click', event => { event.preventDefault(); showTab('day', true); });
            panel.appendChild(next);
        }

        function renderNight() {
            const panel = panels.get('night');
            panel.textContent = '';
            // Drop the old night-view rows so only live nodes repaint.
            topicNodes.forEach(set => set.forEach(record => { if (record.compact) set.delete(record); }));
            panel.appendChild(el(doc, 'h2', 'ap-h2', 'The night before'));
            if (model.nightBefore.steps.length) {
                const card = el(doc, 'div', 'ap-card it-steps');
                card.appendChild(el(doc, 'h3', 'it-card-title', 'Tonight'));
                const ol = el(doc, 'ol', 'it-step-list');
                model.nightBefore.steps.forEach(step => ol.appendChild(el(doc, 'li', '', step)));
                card.appendChild(ol);
                panel.appendChild(card);
            }
            if (model.nightBefore.testWeek) {
                const details = el(doc, 'details', 'it-fold ap-card');
                details.appendChild(el(doc, 'summary', 'it-fold-head', model.nightBefore.testWeek.title || 'A written test this week?'));
                const ol = el(doc, 'ol', 'it-step-list');
                model.nightBefore.testWeek.steps.forEach(step => ol.appendChild(el(doc, 'li', '', step)));
                details.appendChild(ol);
                const practise = model.sections.find(s => s.id === 'written-test');
                const href = practise ? linkHref(practise.practise, model, lms) : '';
                if (href) details.appendChild(anchor(doc, 'it-foot-link', practise.practise.label, href));
                panel.appendChild(details);
            }
            // Lines ticked "Got it now" leave the list the next time it is drawn (a second tap before that undoes it).
            const missed = missedQuestions(data.log, data.missedDone).slice(0, 30);
            if (missed.length) {
                panel.appendChild(el(doc, 'h3', 'it-group-title', 'Questions you couldn\'t answer'));
                const ul = el(doc, 'ul', 'it-missed ap-card');
                missed.forEach(q => {
                    const li = el(doc, 'li', 'it-missed-item');
                    li.dataset.key = q.key;
                    const body = el(doc, 'div', 'it-missed-text');
                    body.appendChild(el(doc, 'span', 'it-missed-q', q.text));
                    body.appendChild(el(doc, 'span', 'it-missed-src', q.firm));
                    const got = el(doc, 'button', 'it-ready-btn it-got');
                    got.type = 'button';
                    got.appendChild(el(doc, 'span', 'it-ready-tick'));
                    got.appendChild(el(doc, 'span', '', 'Got it now'));
                    got.setAttribute('aria-pressed', 'false');
                    got.setAttribute('aria-label', 'Got it now: ' + q.text);
                    got.addEventListener('click', () => {
                        const on = !(data.missedDone && data.missedDone[q.key] === true);
                        save(d => { put(d, 'missedDone', q.key, on); });
                        got.setAttribute('aria-pressed', String(on));
                        li.classList.toggle('is-done', on);
                    });
                    li.append(body, got);
                    ul.appendChild(li);
                });
                panel.appendChild(ul);
            }
            const nb = nightBefore(model, data, myDomain());
            panel.appendChild(el(doc, 'h3', 'it-group-title is-lead', 'Not Ready yet'));
            const line = el(doc, 'p', 'it-sub', nightLine(nb.count));
            line.dataset.nightCount = '';
            panel.appendChild(line);
            nb.groups.forEach(group => {
                panel.appendChild(el(doc, 'h4', 'it-compact-title', group.section.title));
                const list = el(doc, 'ol', 'it-topics is-compact');
                group.topics.forEach(topic => list.appendChild(topicItem(topic, true)));
                panel.appendChild(list);
            });
        }

        let checklist = null;
        function renderDay() {
            const panel = panels.get('day');
            panel.textContent = '';
            panel.appendChild(el(doc, 'h2', 'ap-h2', 'Interview day'));
            const mode = DAY_MODES[data.dayMode] ? data.dayMode : '';
            const sections = daySections(model.interviewDay.sections, mode);
            const all = model.interviewDay.sections;
            const hasModes = Object.keys(DAY_MODES).some(value => daySections(all, value).length < all.length);
            if (hasModes) {
                const switcher = el(doc, 'div', 'it-mode');
                switcher.setAttribute('role', 'group');
                switcher.setAttribute('aria-label', 'This interview is');
                switcher.appendChild(el(doc, 'span', 'it-mode-label', 'This interview is'));
                Object.entries(DAY_MODES).forEach(([value, label]) => {
                    const b = el(doc, 'button', 'it-mode-btn', label);
                    b.type = 'button';
                    b.dataset.mode = value;
                    b.setAttribute('aria-pressed', String(mode === value));
                    b.addEventListener('click', () => {
                        save(d => { d.dayMode = d.dayMode === value ? '' : value; d.dayModeAt = now(); });
                        renderDay();
                    });
                    switcher.appendChild(b);
                });
                panel.appendChild(switcher);
            }
            const host = el(doc, 'div', 'it-day-list');
            panel.appendChild(host);
            if (checklist) checklist.destroy();
            checklist = null;
            if (checklistApi && sections.length) {
                const adapter = {
                    get: () => ({ ticks: Object.fromEntries(Object.entries(data.dayTicks || {}).filter(([, v]) => v === true)) }),
                    update(fn) {
                        const before = Object.assign({}, data.dayTicks || {});
                        const shown = { ticks: Object.fromEntries(Object.entries(before).filter(([, v]) => v === true)) };
                        const result = (typeof fn === 'function' ? fn(shown) : fn) || shown;
                        const nextTicks = result.ticks || {};
                        const merged = {};
                        new Set([...Object.keys(before), ...Object.keys(nextTicks)]).forEach(id => { merged[id] = nextTicks[id] === true; });
                        save(d => {
                            Object.keys(merged).forEach(id => { if ((before[id] === true) !== merged[id]) put(d, 'dayTicks', id, merged[id]); });
                        });
                        listeners.forEach(listener => listener(adapter.get(), { source: 'local' }));
                        paintFresh();
                        return adapter.get();
                    },
                    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
                };
                const listeners = new Set();
                dayAdapterListeners = listeners;
                checklist = checklistApi.mount(host, { items: [], sections }, {
                    store: adapter, numbers: false
                });
            }
            dayNotes(model.interviewDay.notes, mode).forEach(note => {
                const box = el(doc, 'div', 'ap-sticky it-note');
                if (note.title) box.appendChild(el(doc, 'strong', '', note.title));
                if (note.text) box.appendChild(el(doc, 'p', '', note.text));
                const href = linkHref(note.link, model, lms);
                if (href) box.appendChild(anchor(doc, 'it-foot-link', note.link.label, href));
                panel.appendChild(box);
            });
            const fresh = el(doc, 'button', 'ap-btn is-secondary is-block it-fresh', 'Clear ticks for the next interview');
            fresh.type = 'button';
            freshBtn = fresh;
            ui.confirmClear = false;
            // One tap arms it, a second tap within 4 seconds clears every tick (as Delete does in My interviews).
            fresh.addEventListener('click', () => {
                if (!ui.confirmClear) {
                    ui.confirmClear = true;
                    fresh.textContent = 'Tap again to clear every tick';
                    fresh.classList.add('is-armed');
                    win.setTimeout(() => { if (ui.confirmClear && freshBtn === fresh) { ui.confirmClear = false; paintFresh(); } }, 4000);
                    return;
                }
                ui.confirmClear = false;
                save(d => {
                    Object.keys(d.dayTicks || {}).forEach(id => { if (d.dayTicks[id] === true) put(d, 'dayTicks', id, false); });
                });
                if (dayAdapterListeners) dayAdapterListeners.forEach(listener => listener({ ticks: {} }, { source: 'local' }));
                paintFresh();
            });
            panel.appendChild(fresh);
            paintFresh();
        }
        let dayAdapterListeners = null;
        let freshBtn = null;

        function paintFresh() {
            if (!freshBtn) return;
            const any = Object.values(data.dayTicks || {}).some(v => v === true);
            if (!ui.confirmClear) {
                freshBtn.textContent = 'Clear ticks for the next interview';
                freshBtn.classList.remove('is-armed');
            }
            freshBtn.disabled = !any;
        }

        // ----- My interviews -----
        function selectField(label, name, list, value, emptyLabel) {
            const wrap = el(doc, 'label', 'it-field');
            wrap.appendChild(el(doc, 'span', 'it-label', label));
            const select = el(doc, 'select', 'it-input');
            select.name = name;
            if (emptyLabel !== undefined) select.appendChild(new win.Option(emptyLabel, ''));
            list.forEach(item => {
                const option = typeof item === 'string' ? new win.Option(item, item) : new win.Option(item.label, item.value);
                select.appendChild(option);
            });
            select.value = value || '';
            wrap.appendChild(select);
            return wrap;
        }

        function inputField(label, name, value, attrs) {
            const wrap = el(doc, 'label', 'it-field' + (attrs && attrs.wide ? ' is-wide' : ''));
            wrap.appendChild(el(doc, 'span', 'it-label', label));
            const multi = attrs && attrs.multiline;
            const input = el(doc, multi ? 'textarea' : 'input', 'it-input');
            if (!multi) input.type = (attrs && attrs.type) || 'text';
            input.name = name;
            input.value = value || '';
            if (attrs && attrs.placeholder) input.placeholder = attrs.placeholder;
            if (attrs && attrs.required) input.required = true;
            if (multi) input.rows = attrs.rows || 4;
            input.maxLength = (attrs && attrs.max) || 200;
            wrap.appendChild(input);
            return wrap;
        }

        function logForm(entry) {
            const e = entry || {};
            const form = el(doc, 'form', 'it-log-form ap-card');
            form.noValidate = true;
            form.appendChild(el(doc, 'h3', 'it-card-title', entry ? 'Edit interview' : 'Log an interview'));
            const grid = el(doc, 'div', 'it-form-grid');
            grid.appendChild(inputField('Firm', 'firm', e.firm, { max: 120 }));
            grid.appendChild(selectField('Firm type', 'type', FIRM_TYPES, e.type || '', 'Choose'));
            grid.appendChild(inputField('City', 'city', e.city, { max: 80 }));
            // Opened from the "Log this interview" nudge: the interview's own date, not today.
            grid.appendChild(inputField('Date', 'date', e.date || (isISODate(ui.logDate) ? ui.logDate : todayISO(now())), { type: 'date' }));
            grid.appendChild(selectField('Domain', 'domain', domains.map(d => ({ label: d.label, value: d.slug })), e.domain || myDomain() || '', 'Choose'));
            grid.appendChild(selectField('Round', 'round', ROUNDS, e.round || 'Technical'));
            grid.appendChild(selectField('Mode', 'mode', MODES, e.mode || '', 'Choose'));
            grid.appendChild(selectField('Outcome', 'outcome', OUTCOMES, e.outcome || 'Waiting'));
            grid.appendChild(inputField('Questions asked', 'questions', e.questions, { multiline: true, wide: true, max: TEXT_MAX, rows: 5, placeholder: 'One question a line. Leave out people\'s names.' }));
            grid.appendChild(inputField('Couldn\'t answer', 'missed', e.missed, { multiline: true, wide: true, max: TEXT_MAX, rows: 3, placeholder: 'One a line. They show up in Night before.' }));
            form.appendChild(grid);
            const more = el(doc, 'details', 'it-more');
            more.open = Boolean(e.how || e.task || e.tip || e.stage || e.length || e.wait || (entry && e.backup));
            more.appendChild(el(doc, 'summary', 'it-more-head', 'More details'));
            const moreGrid = el(doc, 'div', 'it-form-grid is-more');
            const domainOptions = domains.map(d => ({ label: d.label, value: d.slug }));
            moreGrid.appendChild(selectField('Second preference', 'backup', domainOptions, entry ? (e.backup || '') : (backupDomain() || ''), 'None'));
            moreGrid.appendChild(selectField('Inter result', 'stage', RESULT_STAGES, e.stage || '', 'Choose'));
            moreGrid.appendChild(selectField('Round length', 'length', LENGTHS, e.length || '', 'Choose'));
            moreGrid.appendChild(selectField('How you got the call', 'how', HOW_CALLED, e.how || '', 'Choose'));
            moreGrid.appendChild(selectField('Result came', 'wait', WAITS, e.wait || '', 'Not yet'));
            moreGrid.appendChild(inputField('Test or Excel task', 'task', e.task, { wide: true, max: 600, placeholder: 'What was asked, time given' }));
            moreGrid.appendChild(inputField('Tip for the next student', 'tip', e.tip, { wide: true, max: 400, placeholder: 'Leave out people\'s names' }));
            more.appendChild(moreGrid);
            form.appendChild(more);
            const error = el(doc, 'p', 'it-error ap-hidden', 'Add the firm\'s name or pick its type.');
            error.setAttribute('role', 'alert');
            form.appendChild(error);
            const actions = el(doc, 'div', 'it-form-actions');
            const submit = el(doc, 'button', 'ap-btn', 'Save');
            submit.type = 'submit';
            actions.appendChild(submit);
            if (entry || data.log.length) {
                const cancel = el(doc, 'button', 'ap-btn is-secondary', 'Cancel');
                cancel.type = 'button';
                cancel.addEventListener('click', () => { ui.editing = null; ui.formOpen = false; ui.logDate = ''; renderLog(); });
                actions.appendChild(cancel);
            }
            form.appendChild(actions);
            form.addEventListener('submit', event => {
                event.preventDefault();
                // namedItem, not elements[name]: a field called "length" would read the collection's own count.
                const value = name => {
                    const field = form.elements.namedItem(name);
                    return field && typeof field.value === 'string' ? field.value : '';
                };
                const raw = {
                    id: e.id, createdAt: e.createdAt, sharedAt: e.sharedAt, updatedAt: now(),
                    firm: value('firm'), type: value('type'), city: value('city'), date: value('date'), domain: value('domain'),
                    backup: value('backup'), stage: value('stage'), round: value('round'), mode: value('mode'),
                    length: value('length'), questions: value('questions'), missed: value('missed'), outcome: value('outcome'),
                    wait: value('wait'), how: value('how'), task: value('task'), tip: value('tip')
                };
                const clean = cleanEntry(raw, { now: now(), normaliseDomain });
                if (!clean) {
                    error.classList.remove('ap-hidden');
                    form.elements.namedItem('firm').focus();
                    return;
                }
                clean.updatedAt = now();
                save(d => {
                    const log = (Array.isArray(d.log) ? d.log : []).filter(item => item.id !== clean.id);
                    log.push(clean);
                    d.log = sortedLog(log).slice(0, LOG_MAX);
                });
                ui.editing = null;
                ui.formOpen = false;
                ui.logDate = '';
                renderLog();
                renderNight();
                paintSetup();
                const card = panels.get('log').querySelector('[data-entry="' + clean.id + '"]');
                if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
            });
            return form;
        }

        function entryCard(entry) {
            const card = el(doc, 'article', 'it-entry ap-card');
            card.dataset.entry = entry.id;
            const head = el(doc, 'div', 'it-entry-head');
            const title = el(doc, 'h3', 'it-entry-title', entryName(entry));
            head.appendChild(title);
            head.appendChild(el(doc, 'span', 'it-outcome is-' + slug(entry.outcome), entry.outcome));
            card.appendChild(head);
            const meta = [entry.firm ? entry.type : '', entry.round, entry.mode, entry.length, entry.city, domainLabel(entry.domain),
                shortDate(entry.date)].filter(Boolean).join(' · ');
            card.appendChild(el(doc, 'p', 'it-entry-meta', meta));
            const qs = lines(entry.questions);
            if (qs.length) {
                const ol = el(doc, 'ol', 'it-q-list');
                qs.forEach(q => ol.appendChild(el(doc, 'li', '', q)));
                card.appendChild(ol);
            }
            const missed = lines(entry.missed);
            if (missed.length) {
                card.appendChild(el(doc, 'p', 'it-entry-sub', 'Couldn\'t answer'));
                const ul = el(doc, 'ul', 'it-q-list is-missed');
                missed.forEach(q => ul.appendChild(el(doc, 'li', '', q)));
                card.appendChild(ul);
            }
            const extra = [entry.stage, entry.how ? 'Call via ' + entry.how.toLowerCase() : '', entry.wait ? 'Result: ' + entry.wait.toLowerCase() : '',
                entry.backup && entry.backup !== entry.domain ? 'Second preference: ' + domainLabel(entry.backup) : ''].filter(Boolean).join(' · ');
            if (extra) card.appendChild(el(doc, 'p', 'it-entry-meta', extra));
            if (entry.task) card.appendChild(el(doc, 'p', 'it-entry-extra', 'Task: ' + entry.task));
            if (entry.tip) card.appendChild(el(doc, 'p', 'it-entry-extra', 'Tip: ' + entry.tip));

            const actions = el(doc, 'div', 'it-entry-actions');
            const edit = el(doc, 'button', 'it-text-btn', 'Edit');
            edit.type = 'button';
            edit.addEventListener('click', () => { ui.editing = entry.id; ui.formOpen = true; renderLog(); });
            edit.setAttribute('aria-label', 'Edit: ' + entryName(entry));
            const del = el(doc, 'button', 'it-text-btn is-danger', ui.confirmDelete === entry.id ? 'Tap again to delete' : 'Delete');
            del.type = 'button';
            del.addEventListener('click', () => {
                if (ui.confirmDelete !== entry.id) {
                    ui.confirmDelete = entry.id;
                    del.textContent = 'Tap again to delete';
                    win.setTimeout(() => { if (ui.confirmDelete === entry.id) { ui.confirmDelete = null; del.textContent = 'Delete'; } }, 4000);
                    return;
                }
                ui.confirmDelete = null;
                save(d => {
                    d.log = (d.log || []).filter(item => item.id !== entry.id);
                    d.logDeleted = pruneDeleted(Object.assign({}, d.logDeleted, { [entry.id]: now() }), now());
                    const prefix = entry.id + ':';
                    ['missedDone', 'missedDoneAt'].forEach(field => {
                        d[field] = Object.fromEntries(Object.entries(d[field] || {}).filter(([key]) => !key.startsWith(prefix)));
                    });
                });
                renderLog();
                renderNight();
                paintSetup();
            });
            actions.append(edit, del);
            if (entry.firm) {
                const mock = anchor(doc, 'it-text-btn it-mock', 'Mock this firm again',
                    mockHref({ round: 'full', firm: entry.firm, domain: entry.domain || '' }));
                mock.setAttribute('aria-label', 'Mock this firm again: ' + entry.firm);
                actions.appendChild(mock);
            }
            if (shareEnabled(shareForm)) {
                if (entry.sharedAt) {
                    actions.appendChild(el(doc, 'span', 'it-shared', 'Shared with MSC'));
                } else {
                    const share = el(doc, 'button', 'ap-btn it-share', 'Share with MSC');
                    share.type = 'button';
                    share.addEventListener('click', () => { ui.sharing = entry.id; ui.shareFirm = true; renderLog(); });
                    actions.appendChild(share);
                }
            }
            card.appendChild(actions);
            if (ui.sharing === entry.id && shareEnabled(shareForm)) card.appendChild(sharePanel(entry));
            return card;
        }

        function sharePanel(entry) {
            const box = el(doc, 'div', 'it-share-box');
            box.appendChild(el(doc, 'p', 'it-share-lede', 'This goes to MSC, exactly as below, to help the next student prepare. Leave out people\'s names: if it has any, tap Edit first.'));
            if (entry.firm) {
                const keep = el(doc, 'label', 'it-share-firm');
                const keepName = el(doc, 'input');
                keepName.type = 'checkbox';
                keepName.checked = ui.shareFirm !== false;
                keepName.addEventListener('change', () => { ui.shareFirm = keepName.checked; paintList(); });
                keep.append(keepName, el(doc, 'span', '', 'Include the firm\'s name'));
                box.appendChild(keep);
            }
            const dl = el(doc, 'dl', 'it-share-list');
            function paintList() {
                const payload = sharePayload(entry, domainLabel, { withFirm: ui.shareFirm !== false });
                dl.textContent = '';
                [['Month', payload.month], ['Firm', payload.firm], ['Firm type', payload.type], ['City', payload.city],
                    ['Domain', [payload.domain, payload.backup].filter(Boolean).join(', then ')], ['Inter result', payload.stage],
                    ['Round', [payload.round, payload.mode, payload.length].filter(Boolean).join(', ')], ['Call via', payload.how],
                    ['Questions', payload.questions], ['Couldn\'t answer', payload.missed], ['Task', payload.task],
                    ['Outcome', [payload.outcome, payload.wait].filter(Boolean).join(', ')], ['Tip', payload.tip]]
                    .filter(([, v]) => v)
                    .forEach(([k, v]) => { dl.appendChild(el(doc, 'dt', '', k)); dl.appendChild(el(doc, 'dd', '', v)); });
            }
            paintList();
            box.appendChild(dl);
            const status = el(doc, 'p', 'it-error ap-hidden', 'Could not send. Check your internet and try again.');
            status.setAttribute('role', 'alert');
            box.appendChild(status);
            const actions = el(doc, 'div', 'it-form-actions');
            const send = el(doc, 'button', 'ap-btn', 'Send to MSC');
            send.type = 'button';
            const cancel = el(doc, 'button', 'ap-btn is-secondary', 'Cancel');
            cancel.type = 'button';
            cancel.addEventListener('click', () => { ui.sharing = null; renderLog(); });
            send.addEventListener('click', async () => {
                send.disabled = true;
                send.textContent = 'Sending…';
                status.classList.add('ap-hidden');
                const ok = await shareEntry(entry);
                if (ok) { ui.sharing = null; renderLog(); return; }
                send.disabled = false;
                send.textContent = 'Send to MSC';
                status.classList.remove('ap-hidden');
            });
            actions.append(send, cancel);
            box.appendChild(actions);
            return box;
        }

        async function shareEntry(entry) {
            if (!shareEnabled(shareForm) || !fetchFn) return false;
            try {
                await fetchFn(shareForm.action, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: shareBody(sharePayload(entry, domainLabel, { withFirm: ui.shareFirm !== false }), shareForm)
                });
            } catch (_) {
                return false;
            }
            save(d => {
                d.log = (d.log || []).map(item => (item.id === entry.id ? Object.assign({}, item, { sharedAt: now(), updatedAt: now() }) : item));
            });
            return true;
        }

        function renderLog() {
            const panel = panels.get('log');
            panel.textContent = '';
            panel.appendChild(el(doc, 'h2', 'ap-h2', 'My interviews'));
            const log = sortedLog(data.log);
            const formOpen = ui.formOpen || !log.length;
            if (formOpen && !ui.editing) panel.appendChild(logForm(null));
            if (!formOpen) {
                const add = el(doc, 'button', 'ap-btn is-block it-add', 'Log an interview');
                add.type = 'button';
                add.addEventListener('click', () => {
                    ui.formOpen = true;
                    ui.editing = null;
                    ui.logDate = '';
                    renderLog();
                    const first = panel.querySelector('input[name="firm"]');
                    if (first) first.focus();
                });
                panel.appendChild(add);
            }
            log.forEach(entry => {
                if (ui.editing === entry.id) panel.appendChild(logForm(entry));
                else panel.appendChild(entryCard(entry));
            });
        }

        // ----- setup paint -----
        function paintSetup() {
            const mine = myDomain();
            const backup = backupDomain();
            domainSelect.value = mine || '';
            backupSelect.value = backup || '';
            backupSelect.disabled = !mine;
            Array.from(backupSelect.options).forEach(option => { option.disabled = Boolean(option.value) && option.value === mine; });
            if (doc.activeElement !== dateInput) dateInput.value = data.interviewDate || '';
            paintSize();
            const cd = countdown(data.interviewDate, todayISO(now()));
            count.className = 'it-count is-' + cd.state;
            countBig.textContent = cd.big;
            countLabel.textContent = cd.label;
            const nudges = {
                tomorrow: { label: 'Open the night-before list', tab: 'night' },
                today: { label: 'Open the interview-day checklist', tab: 'day' },
                past: { label: 'Log this interview', tab: 'log' }
            };
            const n = cd.state === 'past' && loggedSince(data.log, data.interviewDate) ? null : nudges[cd.state];
            nudge.classList.toggle('ap-hidden', !n || (n && ui.tab === n.tab));
            if (n) {
                nudge.textContent = n.label;
                nudge.href = '#' + n.tab;
                nudge.dataset.tab = n.tab;
            }
        }

        function paintSize() {
            const size = sizeState(data, maxBytes);
            let remote = '';
            try { remote = store.status ? (store.status() || {}).remote : ''; } catch (_) { remote = ''; }
            const state = remote === 'too-large' ? 'too-large' : size.state;
            sizeNote.classList.toggle('ap-hidden', state === 'ok');
            sizeNote.classList.toggle('is-over', state === 'too-large');
            sizeNote.textContent = state === 'too-large'
                ? 'Your interview log is too long to save to your account, so changes stay on this phone or laptop only. Delete old interviews or shorten long answers in My interviews.'
                : state === 'near' ? 'Your interview log is nearly too long to save to your account. Shorten long answers or delete old interviews in My interviews.' : '';
        }

        nudge.addEventListener('click', event => {
            event.preventDefault();
            const tab = nudge.dataset.tab;
            if (tab === 'log') { ui.formOpen = true; ui.editing = null; ui.logDate = data.interviewDate || ''; }
            showTab(tab, true);
        });

        domainSelect.addEventListener('change', () => {
            const value = domainSelect.value;
            if (!value) return paintSetup();
            settings.setMyDomain(value, { backup: backupDomain() === value ? null : backupDomain() });
            const section = sectionFor(model, value);
            if (section) ui.open.add(section.id);
            renderAll();
        });
        backupSelect.addEventListener('change', () => {
            const mine = myDomain();
            if (!mine) return;
            settings.setMyDomain(mine, { backup: backupSelect.value || null });
            renderAll();
        });
        dateInput.addEventListener('change', () => {
            const value = isISODate(dateInput.value) ? dateInput.value : '';
            save(d => { d.interviewDate = value; d.interviewDateAt = now(); });
            paintSetup();
        });

        // ----- tabs -----
        function showTab(id, push) {
            const tab = TABS.some(t => t.id === id) ? id : 'syllabus';
            ui.tab = tab;
            tabButtons.forEach((b, key) => {
                const on = key === tab;
                b.classList.toggle('is-active', on);
                b.setAttribute('aria-selected', String(on));
                b.tabIndex = on ? 0 : -1;
            });
            panels.forEach((panel, key) => { panel.hidden = key !== tab; });
            if (tab === 'log') renderLog();
            if (tab === 'night') { renderNight(); paintCounts(); }
            if (push && hist && hist.replaceState) {
                try { hist.replaceState(null, '', tab === 'syllabus' ? (loc.pathname || '') + (loc.search || '') : '#' + tab); } catch (_) { /* file:// */ }
            }
            paintSetup();
            if (push) scrollToPanel(panels.get(tab));
        }

        /**
         * After a tab switch from further down, bring the new panel's start to just under the stuck tab bar. Measured
         * from the panel itself (never the setup card, which is a sticky column on desktop); no scroll when it is in view.
         */
        function scrollToPanel(panel) {
            if (!panel || !win.scrollTo || !panel.getBoundingClientRect) return;
            const y = win.pageYOffset || win.scrollY || 0;
            let stuckTop = 56;
            try {
                const top = parseFloat(win.getComputedStyle(tabbar).top);
                if (Number.isFinite(top)) stuckTop = top;
            } catch (_) { /* no layout */ }
            const tabHeight = tabbar.getBoundingClientRect ? tabbar.getBoundingClientRect().height || 0 : 0;
            const target = Math.max(0, Math.round(panel.getBoundingClientRect().top + y - stuckTop - tabHeight - 8));
            if (y > target) win.scrollTo(0, target);
        }

        tabbar.addEventListener('keydown', event => {
            const order = TABS.map(t => t.id);
            const i = order.indexOf(ui.tab);
            let next = null;
            if (event.key === 'ArrowRight') next = order[(i + 1) % order.length];
            if (event.key === 'ArrowLeft') next = order[(i - 1 + order.length) % order.length];
            if (event.key === 'Home') next = order[0];
            if (event.key === 'End') next = order[order.length - 1];
            if (next) {
                event.preventDefault();
                showTab(next, true);
                tabButtons.get(next).focus();
            }
        });

        function firstOpenSection() {
            const visible = visibleSections(model, myDomain(), backupDomain());
            const target = visible.find(section => !summarise(section.topics, data).complete) || visible[0];
            if (target) ui.open.add(target.id);
        }

        function renderAll() {
            topicNodes.clear();
            sectionMeters.clear();
            renderSyllabus();
            renderNight();
            renderDay();
            renderLog();
            paintCounts();
            showTab(ui.tab, false);
        }

        // ----- outside changes (other tab, other device, account switch) -----
        const unsubscribeStore = store.subscribe((next, info) => {
            if (info && info.source === 'local') return;
            data = Object.assign({}, DEFAULTS, next);
            const active = doc.activeElement;
            if (active && container.contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName) && active.type !== 'radio') {
                paintCounts();
                return;
            }
            renderAll();
        });
        const unsubscribeSettings = settings.subscribe ? settings.subscribe(() => { renderAll(); }) : null;
        // A link to #night, #day or #log (the nudge, the course, another tool) opens that view in place.
        const onHash = () => {
            const tab = String(loc.hash || '').replace('#', '');
            if (TABS.some(t => t.id === tab) && tab !== ui.tab) showTab(tab, false);
        };
        if (win.addEventListener) win.addEventListener('hashchange', onHash);
        // A tab left open (a phone, a second laptop tab) picks up the account copy when the student comes back to it,
        // before they change anything, so their next tap builds on the other device's work instead of an old copy.
        let lastPull = 0;
        const onReturn = () => {
            if (doc.visibilityState === 'hidden' || typeof store.pull !== 'function') return;
            const t = Date.now();
            if (t - lastPull < 15000) return;
            lastPull = t;
            Promise.resolve().then(() => store.pull()).catch(() => { /* offline: the device copy stays */ });
        };
        if (doc.addEventListener) doc.addEventListener('visibilitychange', onReturn);
        if (win.addEventListener) win.addEventListener('focus', onReturn);

        firstOpenSection();
        const hashTab = String(loc.hash || '').replace('#', '');
        ui.tab = TABS.some(t => t.id === hashTab) ? hashTab : 'syllabus';
        renderAll();

        return {
            model,
            data: () => Object.assign({}, data),
            summary: () => overall(model, data, myDomain(), backupDomain()),
            nightBefore: () => nightBefore(model, data, myDomain()),
            showTab: id => showTab(id, true),
            setStatus,
            share: entryId => {
                const entry = (data.log || []).find(item => item.id === entryId);
                return entry ? shareEntry(entry) : Promise.resolve(false);
            },
            destroy() {
                if (unsubscribeStore) unsubscribeStore();
                if (unsubscribeSettings) unsubscribeSettings();
                if (win.removeEventListener) win.removeEventListener('hashchange', onHash);
                if (win.removeEventListener) win.removeEventListener('focus', onReturn);
                if (doc.removeEventListener) doc.removeEventListener('visibilitychange', onReturn);
                if (checklist) checklist.destroy();
            }
        };
    }

    /** Page start: gate, load the content, mount. */
    function start(options) {
        const opts = options || {};
        const doc = opts.document || root.document;
        const container = opts.container || doc.getElementById('app');
        const gate = root.MSCArticleshipGate;
        const ready = gate && typeof gate.protect === 'function' ? gate.protect() : Promise.resolve();
        return ready.then(() => (opts.content ? Promise.resolve(opts.content) : root.fetch(opts.url || CONTENT_URL, { credentials: 'same-origin' })
            .then(response => { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })))
            .then(content => mount(container, content, opts))
            .catch(error => {
                if (root.console) root.console.error(error);
                container.textContent = '';
                const card = doc.createElement('div');
                card.className = 'ap-card it-empty';
                const p = doc.createElement('p');
                p.textContent = 'The syllabus did not load. Check your internet and try again.';
                const retry = doc.createElement('button');
                retry.type = 'button';
                retry.className = 'ap-btn';
                retry.textContent = 'Try again';
                retry.addEventListener('click', () => root.location.reload());
                card.append(p, retry);
                container.appendChild(card);
                return null;
            });
    }

    return Object.freeze({
        TOOL, DAY, CONTENT_URL, SHARE_FORM, PAGE_ROWS, pageHref, STATUSES, STATUS_LABELS, ROUNDS, MODES, HOW_CALLED, OUTCOMES, DEFAULTS,
        FIRM_TYPES, RESULT_STAGES, LENGTHS, WAITS, DAY_MODES, daySections, entryName,
        normaliseContent, resolvePages, readHref, linkHref, readLabel, readText, safeHref,
        isISODate, todayISO, daysLeft, countdown, shortDate, monthOf,
        statusOf, summarise, visibleSections, overall, nightBefore,
        lines, cleanEntry, sortedLog, missedQuestions, missedKey, loggedSince, redact, sharePayload, shareEnabled, shareBody,
        mergeData, pruneDeleted, sizeState, dayNotes, mockHref, mockLabel, DELETED_KEEP_DAYS, PREVIEW_TOPICS,
        mount, start
    });
});
