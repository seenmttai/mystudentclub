/**
 * MSC Articleship Program: the LinkedIn profile checklist (row 3.1), /articleship-program/linkedin-checklist/.
 * Twelve profile checks on the shared checklist engine, each with a good example and a link that opens the student's
 * own LinkedIn profile (or the exact LinkedIn page for that check). Ticks save through the progress engine.
 *
 * This file adds the page around the engine: the content load, the "Open my profile" card (and, on a phone, one
 * floating "Open my profile" pill once that card has scrolled away, instead of the same link under every check; from
 * 960 px the sidebar's button is always in view), a one-line "How:" click path under each check, the "Examples for:
 * <my domain> · Change" line under the lede (the shared setting, MSCArticleshipProgress.setMyDomain), examples drawn
 * line by line ("> " lines = sample text in a white box; short "Label:" lead-ins in bold), white Copy boxes (headline
 * formula, About lines, result post, recommendation request) at the top of their fold-outs, the shared "my domain"
 * filled into the Copy boxes and examples, and the notes after the last check.
 *
 * Release flag: WORK_SIMULATION_LIVE (below). While false (release 1 ships without row 1.6), nothing on the page names,
 * links or promises the Work Simulation: lines marked `{ws}` are left out, lines marked `{no-ws}` are shown instead,
 * `copy_ws` is not used, an `also` link with `ws: true` is not drawn, and the worked About example uses `proof_now`.
 * Release 2 flips the flag (the tests check the Work Simulation page is then on the branch).
 *
 * Content JSON (articleship-program/linkedin-checklist/linkedin-checklist.json) = the engine's schema plus optional
 * `intro` (the lede beside a laptop) + `intro_phone` (under 960 px, where the profile can't sit next to the page);
 * `open` { label, href, hint }; per item `how` (one line), `example_label` (the fold-out's name), `copy` + `copy_label`
 * + `copy_aria`, `copy_ws` (the Copy text once the Work Simulation is out and a domain is set: the proof filled in),
 * `also` { label, href, ws } (a second link beside the fix link; `ws: true` = only once the Work Simulation is out);
 * `notes` [{ title, text, link: { label, href } }]; `proofs` { <domain slug>: one About line from that domain's Work
 * Simulation }; `proof_now` (the About line while the Work Simulation is not out: one any student can earn today).
 * Example, copy and note lines may start with `{ws}` or `{no-ws}` (see the release flag). Domain tokens, filled from
 * MSCArticleshipProgress.getMyDomain() and refilled when it changes: `[domain]` (Copy boxes) and
 * `{domain|statutory audit}` (examples: the default until the student has set "my domain"); `{sim|Statutory Audit}` =
 * that domain's Work Simulation name (SIM_NAME, the names in the CV Recommender's Work Simulation lines); `{proof}` =
 * that domain's line from `proofs` (statutory audit's until a domain is set), so the worked About example is one
 * person in one domain.
 *
 * Accessibility: the engine's visible number sits inside each checkbox's label; it is aria-hidden here, so a screen
 * reader reads "A clear head-and-shoulders photo of you", not "1A clear …".
 *
 * Ticks: the progress engine's store with the checklist engine's mergeTicks: when two devices both changed ticks before
 * a sync, the later change wins per check (a tick or an untick), so an untick on one device is not undone by the other.
 *
 * Browser: window.MSCArticleshipLinkedinChecklist (boot() is called by the page).
 * Node (tests): require('./scripts/articleship-linkedin-checklist.js').
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCArticleshipLinkedinChecklist = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict';

    const TOOL = 'linkedin-checklist';
    const CONTENT_URL = '/articleship-program/linkedin-checklist/linkedin-checklist.json';
    // Release 1 ships without the Work Simulation (row 1.6): nothing here points at it until the shared switch
    // (MSCArticleshipProgress.WORK_SIMULATION_LIVE, the one flag every tool reads) is true.
    const WORK_SIMULATION_LIVE = (() => {
        try { return engine('progress').WORK_SIMULATION_LIVE === true; } catch (_) { return false; }
    })();
    const WS_LINE = /^\{ws\}/;
    const NO_WS_LINE = /^\{no-ws\}/;
    /** LinkedIn sends a signed-in member from /in/me/ to their own profile. */
    const DEFAULT_OPEN = Object.freeze({
        label: 'Open my profile',
        href: 'https://www.linkedin.com/in/me/',
        hint: 'Not opening in the app? In LinkedIn, tap your photo, then tap it again.'
    });
    const COPIED = 'Copied. Fill in the [brackets].';
    const EXAMPLE_LABEL = 'Examples';

    /**
     * "My domain" as it reads in a headline or an About line ("Seeking articleship in statutory audit"): the words people
     * search with (the roadmaps' LinkedIn keywords), not the long filter label.
     */
    const DOMAIN_PHRASE = Object.freeze({
        'statutory-audit': 'statutory audit', 'internal-audit': 'internal audit', 'direct-tax': 'direct tax', 'gst': 'GST',
        'bank-audit': 'bank audit', 'transfer-pricing': 'transfer pricing', 'ma-tax': 'M&A tax', 'valuation': 'valuation',
        'fdd': 'due diligence', 'forensic': 'forensic audit', 'consulting': 'consulting', 'accounting': 'accounting & MIS',
        'ib-er': 'equity research'
    });

    function engine(name, options) {
        const key = name === 'checklist' ? 'Checklist' : 'Progress';
        if (options && options[key]) return options[key];
        const globalName = name === 'checklist' ? 'MSCArticleshipChecklist' : 'MSCArticleshipProgress';
        if (root[globalName]) return root[globalName];
        if (typeof require === 'function') {
            return require(name === 'checklist' ? './articleship-checklist.js' : './articleship-progress.js');
        }
        throw new Error(globalName + ' missing');
    }

    function text(value) {
        return value === undefined || value === null ? '' : String(value).trim();
    }

    /** A domain slug (or label) → the words for a headline; '' when unknown. labelFn(slug) gives a label for new slugs. */
    function domainPhrase(value, labelFn) {
        const slug = text(value).toLowerCase();
        if (!slug) return '';
        if (DOMAIN_PHRASE[slug]) return DOMAIN_PHRASE[slug];
        let label = '';
        try { label = typeof labelFn === 'function' ? text(labelFn(slug)) : ''; } catch (_) { label = ''; }
        // "Statutory audit" → "statutory audit"; acronyms ("GST", "IB & …") keep their capitals.
        return label && /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
    }

    /**
     * Each domain's Work Simulation as it is named on a CV and on LinkedIn ("<name> Work Simulation, MSC Articleship
     * Program"): the names in the CV Recommender's situations.json `workSimulation` lines (a test keeps them equal).
     */
    const SIM_NAME = Object.freeze({
        'statutory-audit': 'Statutory Audit', 'internal-audit': 'Internal Audit', 'direct-tax': 'Direct Tax', 'gst': 'GST',
        'bank-audit': 'Bank Audit', 'transfer-pricing': 'Transfer Pricing', 'ma-tax': 'M&A Tax', 'valuation': 'Valuation',
        'fdd': 'FDD', 'forensic': 'Forensic', 'consulting': 'Consulting', 'accounting': 'Accounting', 'ib-er': 'IB & ER'
    });

    /** A domain slug → its Work Simulation name ("Statutory Audit"); a new slug falls back to its label; '' when unknown. */
    function simName(value, labelFn) {
        const slug = text(value).toLowerCase();
        if (!slug) return '';
        if (SIM_NAME[slug]) return SIM_NAME[slug];
        try { return typeof labelFn === 'function' ? text(labelFn(slug)) : ''; } catch (_) { return ''; }
    }

    const DOMAIN_TOKEN = /\{domain(?:\|([^}]*))?\}/g;
    const SIM_TOKEN = /\{sim(?:\|([^}]*))?\}/g;
    const PROOF_TOKEN = /\{proof\}/g;
    const HAS_DOMAIN = /\{(?:domain|sim)(?:\|[^}]*)?\}|\{proof\}|\[domain\]/;
    /** The domain the examples show until the student sets "my domain" (the same as the `{domain|statutory audit}` defaults). */
    const DEFAULT_DOMAIN = 'statutory-audit';
    const PROOF_PLACEHOLDER = '[One thing you have actually done, with a number.]';

    /**
     * Fill "my domain": `{domain|default}` → the phrase (else the default); `{sim|default}` → the domain's Work Simulation
     * name (else the default); `{proof}` → the domain's About line; `[domain]` → the phrase (else kept).
     * `fill` is the phrase, or { phrase, sim, proof }.
     */
    function fillDomain(value, fill, simArg) {
        const f = fill && typeof fill === 'object' ? fill : { phrase: fill, sim: simArg };
        const p = text(f.phrase);
        const s = text(f.sim);
        const proof = text(f.proof);
        return String(value === undefined || value === null ? '' : value)
            .replace(DOMAIN_TOKEN, (_, fallback) => p || text(fallback) || '[domain]')
            .replace(SIM_TOKEN, (_, fallback) => s || text(fallback) || '[Domain]')
            .replace(PROOF_TOKEN, () => proof || PROOF_PLACEHOLDER)
            .replace(/\[domain\]/g, p ? p : '[domain]');
    }

    /**
     * The About proof line for a domain: its own line from `proofs`; a named domain with no line yet gets its Work
     * Simulation name and a bracket to fill (never another domain's work); no domain (or one with no name, where every
     * other token shows its default too) → the default domain's line.
     */
    function proofFor(slug, proofs, labelFn) {
        const map = proofs && typeof proofs === 'object' ? proofs : {};
        const key = text(slug).toLowerCase();
        if (key && text(map[key])) return text(map[key]);
        const sim = key ? simName(key, labelFn) : '';
        if (sim) return 'In my ' + sim + ' Work Simulation I [one task you did, with a number].';
        return text(map[DEFAULT_DOMAIN]);
    }

    /** The release this page draws: { wsLive, proofNow }. Missing → the release flag and no `proof_now`. */
    function releaseOf(release) {
        const r = release && typeof release === 'object' ? release : {};
        return { wsLive: typeof r.wsLive === 'boolean' ? r.wsLive : WORK_SIMULATION_LIVE, proofNow: text(r.proofNow) };
    }

    /**
     * "My domain" slug → { phrase, sim, proof, ws } for fillDomain. With the Work Simulation out, `proof` is the domain's
     * Work Simulation line and `ws` is true once a domain is set (the Copy boxes then use their `copy_ws` text); before
     * it is out, `proof` is `proof_now` for every domain and `ws` is false.
     */
    function domainFill(slug, labelFn, proofs, release) {
        const r = releaseOf(release);
        const phrase = domainPhrase(slug, labelFn);
        const sim = simName(slug, labelFn);
        return {
            phrase,
            sim,
            proof: r.wsLive ? proofFor(slug, proofs, labelFn) : (r.proofNow || PROOF_PLACEHOLDER),
            ws: r.wsLive && !!phrase && !!sim
        };
    }

    /**
     * Keep the lines for this release: `{ws}` lines only once the Work Simulation is out, `{no-ws}` lines only before
     * (the marker is dropped). Arrays stay arrays (blank lines kept); a string is handled line by line.
     */
    function releaseLines(value, wsLive) {
        const keep = line => {
            const s = line === undefined || line === null ? '' : String(line);
            if (WS_LINE.test(s)) return wsLive ? s.replace(WS_LINE, '') : null;
            if (NO_WS_LINE.test(s)) return wsLive ? null : s.replace(NO_WS_LINE, '');
            return s;
        };
        if (Array.isArray(value)) return value.map(keep).filter(line => line !== null);
        if (value === undefined || value === null) return value;
        return String(value).split('\n').map(keep).filter(line => line !== null).join('\n');
    }

    /** The content's `proofs` map, keys lower-cased, empty lines dropped. */
    function readProofs(source) {
        const raw = source && typeof source.proofs === 'object' && !Array.isArray(source.proofs) ? source.proofs : {};
        const out = {};
        Object.keys(raw).forEach(key => { const line = text(raw[key]); if (line) out[key.toLowerCase()] = line; });
        return out;
    }

    /** Lines → one string, keeping "" as a blank line (the engine drops empty array entries). */
    function joinLines(value) {
        if (!Array.isArray(value)) return text(value);
        const lines = value.map(line => (line === undefined || line === null ? '' : String(line).replace(/\s+$/, '')));
        while (lines.length && !lines[0].trim()) lines.shift();
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }

    const FIX_KEYS = ['fix', 'fix_link', 'fixLink', 'link', 'href', 'url'];

    /** Does the item name its own link (in any of the engine's accepted shapes)? */
    function hasFix(item) {
        return FIX_KEYS.some(key => {
            const value = item[key];
            if (value && typeof value === 'object') return text(value.href || value.url || value.link) !== '';
            return text(value) !== '';
        });
    }

    /** The open-my-profile target: the content's own, else LinkedIn's /in/me/. Only https links are used. */
    function openTarget(content, safeHref) {
        const raw = (content && !Array.isArray(content) && content.open) || {};
        const href = safeHref ? safeHref(raw.href) : text(raw.href);
        return {
            label: text(raw.label) || DEFAULT_OPEN.label,
            href: /^https:\/\//i.test(href) ? href : DEFAULT_OPEN.href,
            hint: raw.hint === '' ? '' : (text(raw.hint) || DEFAULT_OPEN.hint)
        };
    }

    /**
     * The content as the engine wants it, for this release (options.workSimulationLive, default the release flag):
     * `{ws}`/`{no-ws}` lines picked, multi-line examples keep their blank lines. A check keeps only the link it names
     * itself (the profile link lives in the open card and, on a phone, the floating pill). Returns { content, model,
     * copies: Map(id → {label, text, wsText, aria}), extras, notes, open, proofs, proofNow, intro, wsLive }.
     */
    function prepare(content, options) {
        const opts = options || {};
        const Checklist = engine('checklist', opts);
        const wsLive = typeof opts.workSimulationLive === 'boolean' ? opts.workSimulationLive : WORK_SIMULATION_LIVE;
        const source = Array.isArray(content) ? { items: content } : Object.assign({}, content || {});
        const open = openTarget(source, Checklist.safeHref);
        const copyById = new Map();
        const extras = new Map();
        const mapItem = raw => {
            const item = typeof raw === 'string' ? { check: raw } : Object.assign({}, raw || {});
            if (item.example !== undefined) item.example = releaseLines(item.example, wsLive);
            if (Array.isArray(item.example)) item.example = joinLines(item.example);
            return item;
        };
        if (Array.isArray(source.items)) source.items = source.items.map(mapItem);
        if (Array.isArray(source.sections)) {
            source.sections = source.sections.map(section => Object.assign({}, section, { items: (section.items || section.checks || []).map(mapItem) }));
        }
        // The engine regroups items by section and de-duplicates ids, so find each copy's item by its check text
        // (in order, so two items with the same text still pair up one to one).
        const model = Checklist.normalise(source);
        const raws = [];
        if (Array.isArray(source.sections)) source.sections.forEach(section => section.items.forEach(item => raws.push(item)));
        if (Array.isArray(source.items)) source.items.forEach(item => raws.push(item));
        const used = new Set();
        raws.forEach(raw => {
            const check = text(raw.check || raw.text || raw.title || raw.label || raw.item);
            const match = model.items.find(item => !used.has(item.id) && item.check === check);
            if (!match) return;
            used.add(match.id);
            const copy = joinLines(releaseLines(raw.copy, wsLive));
            // The Work Simulation's own Copy text: only once it is out (and drawn only once a domain is set).
            const wsText = wsLive ? joinLines(releaseLines(raw.copy_ws || raw.copyWs, true)) : '';
            const label = text(raw.copy_label || raw.copyLabel) || 'Copy this';
            if (copy) copyById.set(match.id, { label, text: copy, wsText, aria: text(raw.copy_aria || raw.copyAria) || 'Copy ' + label.toLowerCase() });
            const how = text(releaseLines(raw.how, wsLive));
            const exampleLabel = text(raw.example_label || raw.exampleLabel);
            const alsoRaw = raw.also && typeof raw.also === 'object' && (wsLive || raw.also.ws !== true) ? raw.also : {};
            const alsoHref = Checklist.safeHref ? Checklist.safeHref(alsoRaw.href || alsoRaw.url) : text(alsoRaw.href || alsoRaw.url);
            const also = alsoHref && text(alsoRaw.label) ? { label: text(alsoRaw.label), href: alsoHref } : null;
            if (how || exampleLabel || also) extras.set(match.id, { how, exampleLabel, also });
        });
        const notes = (Array.isArray(source.notes) ? source.notes : [])
            .map(note => {
                if (typeof note === 'string') return { title: '', text: text(releaseLines(note, wsLive)), link: null };
                const raw = (note && note.link) || {};
                const href = Checklist.safeHref ? Checklist.safeHref(raw.href || raw.url) : text(raw.href || raw.url);
                const label = text(raw.label || raw.text);
                const body = note && (note.text || note.body);
                return { title: text(note && note.title), text: joinLines(releaseLines(body, wsLive)), link: href && label ? { label, href } : null };
            })
            .filter(note => note.text);
        const intro = { wide: text(source.intro), phone: text(source.intro_phone || source.introPhone) };
        const proofNow = text(source.proof_now || source.proofNow);
        return { content: source, model, copies: copyById, extras, notes, open, proofs: readProofs(source), proofNow, intro, wsLive };
    }

    function el(doc, tag, className, content) {
        const node = doc.createElement(tag);
        if (className) node.className = className;
        if (content !== undefined) node.textContent = content;
        return node;
    }

    function externalLink(doc, className, target) {
        const a = el(doc, 'a', className, target.label);
        a.href = target.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        return a;
    }

    /** Copy text to the clipboard; falls back to a hidden textarea where the Clipboard API is missing or blocked. */
    function copyText(value, doc) {
        const d = doc || root.document;
        const nav = d && d.defaultView ? d.defaultView.navigator : root.navigator;
        const fallback = () => {
            if (!d || !d.body) return false;
            const area = d.createElement('textarea');
            area.value = value;
            area.setAttribute('readonly', '');
            area.style.position = 'fixed';
            area.style.top = '-1000px';
            area.style.opacity = '0';
            area.style.fontSize = '16px'; // iOS zooms into smaller text fields
            d.body.appendChild(area);
            area.select();
            // iOS Safari ignores select() on a read-only field; a range selection works there.
            try { area.setSelectionRange(0, value.length); } catch (_) { /* not a text field in this DOM */ }
            let ok = false;
            try { ok = d.execCommand('copy'); } catch (_) { ok = false; }
            d.body.removeChild(area);
            return ok;
        };
        if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
            return nav.clipboard.writeText(value).then(() => true, () => fallback());
        }
        return Promise.resolve(fallback());
    }

    /**
     * Copy failed (no Clipboard API, no execCommand): select the text on the page, so press-and-hold → Copy is one step.
     * Returns true when the selection was made.
     */
    function selectText(node) {
        const doc = node && node.ownerDocument;
        const win = doc && doc.defaultView;
        if (!win || typeof win.getSelection !== 'function' || typeof doc.createRange !== 'function') return false;
        try {
            const range = doc.createRange();
            range.selectNodeContents(node);
            const selection = win.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            return selection.rangeCount > 0;
        } catch (_) {
            return false;
        }
    }

    /**
     * A text node that may carry "my domain": keeps its template so the domain can be refilled later. `wsTemplate` (a
     * Copy box's `copy_ws`) is used instead while `fill.ws` is true.
     */
    function setText(node, template, fill, wsTemplate) {
        const value = String(template === undefined || template === null ? '' : template);
        const wsValue = text(wsTemplate);
        if (HAS_DOMAIN.test(value) || wsValue) node.setAttribute('data-lc-tpl', value);
        if (wsValue) node.setAttribute('data-lc-tpl-ws', wsValue);
        node.textContent = fillDomain(wsValue && fill && fill.ws ? wsValue : value, fill);
        return node;
    }

    /** Refill every domain-bearing text under `container` (after "my domain" changes). */
    function applyDomain(container, fill) {
        if (!container) return;
        container.querySelectorAll('[data-lc-tpl]').forEach(node => {
            const ws = node.getAttribute('data-lc-tpl-ws');
            node.textContent = fillDomain(ws && fill && fill.ws ? ws : node.getAttribute('data-lc-tpl'), fill);
        });
    }

    function copyBox(doc, copy, fill) {
        const box = el(doc, 'div', 'lc-copy');
        const head = el(doc, 'div', 'lc-copy-head');
        head.appendChild(el(doc, 'span', 'lc-copy-label', copy.label));
        const button = el(doc, 'button', 'lc-copy-btn', 'Copy');
        button.type = 'button';
        button.setAttribute('aria-label', copy.aria || 'Copy ' + copy.label.toLowerCase());
        head.appendChild(button);
        box.appendChild(head);
        const body = setText(el(doc, 'p', 'lc-copy-text'), copy.text, fill, copy.wsText);
        box.appendChild(body);
        const status = el(doc, 'p', 'lc-copy-status');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        box.appendChild(status);
        let timer = null;
        button.addEventListener('click', () => {
            const value = body.textContent;
            Promise.resolve(copyText(value, doc)).then(ok => {
                const selected = !ok && selectText(body);
                status.textContent = ok ? (/\[[^\]]+\]/.test(value) ? COPIED : 'Copied.')
                    : (selected ? 'It’s selected: press and hold it, then tap Copy.' : 'Select the text and copy it.');
                button.textContent = ok ? 'Copied' : 'Copy';
                button.classList.toggle('is-done', !!ok);
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => { button.textContent = 'Copy'; button.classList.remove('is-done'); status.textContent = ''; }, 4000);
            });
        });
        return box;
    }

    /** Put each item's Copy box at the top of its fold-out, straight under the toggle (or under the item if it has none). */
    function addCopyBoxes(container, copies, fill) {
        const doc = container.ownerDocument;
        copies.forEach((copy, id) => {
            const li = container.querySelector('.ap-cl-item[data-id="' + id + '"]');
            if (!li) return;
            const box = copyBox(doc, copy, fill);
            const details = li.querySelector('.ap-cl-example');
            if (details) {
                const summary = details.querySelector('summary');
                details.insertBefore(box, summary ? summary.nextSibling : details.firstChild);
            } else {
                (li.querySelector('.ap-cl-extra') || li).appendChild(box);
            }
        });
    }

    /**
     * Per check: the one-line "How:" click path under the check, the fold-out's own name, a lighter style for a check
     * whose own link is just "Open my profile" (the specific ones, such as "Edit my URL", keep the full style), and the
     * `also` link.
     */
    function decorateItems(container, extras, open, fill) {
        const doc = container.ownerDocument;
        container.querySelectorAll('.ap-cl-item').forEach(li => {
            // The number is a visual cue; the checkbox's name is the check alone.
            li.querySelectorAll('.ap-cl-no').forEach(no => no.setAttribute('aria-hidden', 'true'));
            const extra = extras.get(li.getAttribute('data-id')) || {};
            if (extra.how) {
                const how = el(doc, 'p', 'lc-how');
                how.appendChild(el(doc, 'strong', '', 'How:'));
                how.appendChild(doc.createTextNode(' '));
                how.appendChild(setText(el(doc, 'span'), extra.how, fill));
                const check = li.querySelector('.ap-cl-check');
                li.insertBefore(how, check ? check.nextSibling : li.firstChild);
            }
            const summary = li.querySelector('.ap-cl-example > summary');
            if (summary && extra.exampleLabel) summary.textContent = extra.exampleLabel;
            const fix = li.querySelector('.ap-cl-fix');
            if (fix && fix.getAttribute('href') === open.href && fix.textContent === open.label) fix.classList.add('lc-fix-profile');
            if (extra.also) {
                // A second link on one check (e.g. Featured → the Work Simulation work sample). MSC pages stay in the tab.
                const a = el(doc, 'a', 'ap-cl-fix lc-also', extra.also.label);
                a.href = extra.also.href;
                if (/^https:\/\//i.test(extra.also.href) && !/^https:\/\/(www\.|mobile\.)?mystudentclub\.com(\/|$)/i.test(extra.also.href)) {
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                }
                const row = li.querySelector('.ap-cl-extra');
                if (row) row.appendChild(a); else li.appendChild(a);
            }
        });
    }

    /**
     * One example line → { kind, label, text }. kind: 'sample' ("> " lines: the words the student writes), 'good' (✅),
     * 'bad' (❌), 'gap' (blank line) or 'line'. A short lead-in before ": " (at most four words, no double quotes) becomes the
     * label ("How", "Test", "Who can see it").
     */
    function parseLine(raw) {
        const line = raw === undefined || raw === null ? '' : String(raw).replace(/\s+$/, '');
        if (!line.trim()) return { kind: 'gap', label: '', text: '' };
        if (/^>\s?/.test(line)) return { kind: 'sample', label: '', text: line.replace(/^>\s?/, '') };
        const trimmed = line.trim();
        if (/^✅/.test(trimmed)) return { kind: 'good', label: '', text: trimmed };
        if (/^❌/.test(trimmed)) return { kind: 'bad', label: '', text: trimmed };
        const m = /^([^:"“”]{1,30}):\s+(\S[\s\S]*)$/.exec(trimmed);
        if (m && m[1].trim().split(/\s+/).length <= 4) return { kind: 'line', label: m[1].trim(), text: m[2] };
        return { kind: 'line', label: '', text: trimmed };
    }

    /** Group parsed lines into blocks: consecutive sample lines share one block. */
    function exampleBlocks(value) {
        const blocks = [];
        let gap = false;
        String(value || '').split('\n').map(parseLine).forEach(line => {
            if (line.kind === 'gap') { gap = blocks.length > 0; return; }
            const last = blocks[blocks.length - 1];
            if (line.kind === 'sample' && last && last.kind === 'sample' && !gap) last.lines.push(line.text);
            else if (line.kind === 'sample') blocks.push({ kind: 'sample', lines: [line.text], gap });
            else blocks.push(Object.assign({ gap }, line));
            gap = false;
        });
        return blocks;
    }

    /** Re-draw each example fold-out as separate lines (labels bold, sample text in a white box). Text only, never HTML. */
    function formatExamples(container, fill) {
        const doc = container.ownerDocument;
        container.querySelectorAll('.ap-cl-example > p').forEach(p => {
            const box = el(doc, 'div', 'lc-example');
            exampleBlocks(p.textContent).forEach(block => {
                let node;
                if (block.kind === 'sample') {
                    node = el(doc, 'blockquote', 'lc-sample');
                    block.lines.forEach(line => node.appendChild(setText(el(doc, 'p'), line, fill)));
                } else {
                    node = el(doc, 'p', 'lc-line' + (block.kind === 'good' ? ' is-good' : block.kind === 'bad' ? ' is-bad' : ''));
                    if (block.label) {
                        node.appendChild(el(doc, 'strong', '', block.label + ':'));
                        node.appendChild(doc.createTextNode(' '));
                        node.appendChild(setText(el(doc, 'span'), block.text, fill));
                    } else {
                        setText(node, block.text, fill);
                    }
                }
                if (block.gap) node.classList.add('has-gap');
                box.appendChild(node);
            });
            p.replaceWith(box);
        });
    }

    /**
     * The lede: the laptop line and the phone line, each shown by the CSS at its width (a phone can't put the profile
     * next to the page). One line only when the content has one.
     */
    function renderLede(node, intro) {
        if (!node || !intro || (!intro.wide && !intro.phone)) return;
        const doc = node.ownerDocument;
        node.textContent = '';
        if (intro.wide && intro.phone && intro.wide !== intro.phone) {
            node.appendChild(el(doc, 'span', 'lc-on-wide', intro.wide));
            node.appendChild(el(doc, 'span', 'lc-on-phone', intro.phone));
        } else {
            node.textContent = intro.wide || intro.phone;
        }
    }

    function renderOpen(node, open) {
        if (!node) return;
        const doc = node.ownerDocument;
        node.textContent = '';
        node.appendChild(externalLink(doc, 'ap-btn is-block lc-open-btn', open));
        if (open.hint) node.appendChild(el(doc, 'p', 'lc-open-hint', open.hint));
    }

    /**
     * Phones: one floating "Open my profile" pill instead of the same link under every check. The CSS shows it under
     * 960 px, and only while the open card (`watch`) is out of view, so it never sits next to the big button. Without
     * IntersectionObserver it simply stays shown on a phone. Returns the pill (one per page).
     */
    function renderFab(doc, open, watch) {
        if (!doc || !doc.body) return null;
        let fab = doc.querySelector('a.lc-fab');
        if (!fab) {
            fab = el(doc, 'a', 'lc-fab');
            fab.target = '_blank';
            fab.rel = 'noopener noreferrer';
            doc.body.appendChild(fab);
        }
        fab.textContent = open.label;
        fab.href = open.href;
        if (watch && !fab.hasAttribute('data-lc-watching')) {
            fab.setAttribute('data-lc-watching', '');
            const win = doc.defaultView;
            if (win && typeof win.IntersectionObserver === 'function') {
                const observer = new win.IntersectionObserver(entries => {
                    entries.forEach(entry => fab.classList.toggle('is-shown', !entry.isIntersecting));
                });
                observer.observe(watch);
            } else {
                fab.classList.add('is-shown');
            }
        }
        return fab;
    }

    /** The domains for the picker: the progress engine's list ({ slug, label }), else none. */
    function domainList(Progress) {
        const list = Progress && Array.isArray(Progress.DOMAINS) ? Progress.DOMAINS : [];
        return list.map(d => ({ slug: text(d && d.slug), label: text(d && d.label) })).filter(d => d.slug && d.label);
    }

    /**
     * "Examples for: Statutory audit · Change" under the lede: the domain every example uses (my domain; statutory
     * audit's until one is set) and a small picker over the word "Change" that sets the shared "my domain".
     * state: { slug (my domain or null), label (shown), domains [{ slug, label }], onPick(slug) }.
     */
    function renderDomainLine(node, state) {
        if (!node) return;
        const doc = node.ownerDocument;
        node.textContent = '';
        node.appendChild(doc.createTextNode('Examples for: '));
        node.appendChild(el(doc, 'strong', 'lc-domain-name', state.label));
        if (state.domains && state.domains.length && typeof state.onPick === 'function') {
            const dot = el(doc, 'span', 'lc-domain-dot', '·');
            dot.setAttribute('aria-hidden', 'true');
            node.appendChild(dot);
            const label = el(doc, 'label', 'lc-domain-change');
            label.appendChild(el(doc, 'span', '', 'Change'));
            const select = doc.createElement('select');
            select.setAttribute('aria-label', 'My domain');
            const known = state.domains.some(d => d.slug === state.slug);
            if (!known) {
                const none = doc.createElement('option');
                none.value = '';
                none.textContent = 'Pick your domain';
                none.disabled = true;
                none.selected = true;
                select.appendChild(none);
            }
            state.domains.forEach(d => {
                const option = doc.createElement('option');
                option.value = d.slug;
                option.textContent = d.label;
                if (d.slug === state.slug) option.selected = true;
                select.appendChild(option);
            });
            select.addEventListener('change', () => { if (select.value) state.onPick(select.value); });
            label.appendChild(select);
            node.appendChild(label);
        }
        node.classList.remove('ap-hidden');
    }

    function renderNotes(node, notes, fill) {
        if (!node) return;
        const doc = node.ownerDocument;
        node.textContent = '';
        notes.forEach(note => {
            const card = el(doc, 'div', 'ap-sticky lc-note');
            if (note.title) card.appendChild(el(doc, 'strong', '', note.title));
            card.appendChild(setText(el(doc, 'p'), note.text, fill));
            if (note.link) {
                // Programme pages open in the same tab; anything outside MSC opens in a new one.
                const a = el(doc, 'a', 'lc-note-link', note.link.label);
                a.href = note.link.href;
                if (/^https:\/\//i.test(note.link.href) && !/^https:\/\/(www\.|mobile\.)?mystudentclub\.com(\/|$)/i.test(note.link.href)) {
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                }
                card.appendChild(a);
            }
            node.appendChild(card);
        });
        node.classList.toggle('ap-hidden', !notes.length);
    }

    /**
     * Draw the tool. els: { app, open, notes, lede, domain } (elements; all but app optional).
     * options: { store, Checklist, onChange, domain (slug of "my domain"), domainLabel(slug), domains [{ slug, label }]
     * (the picker's list), onPickDomain(slug) (saves "my domain"; returns the saved slug), workSimulationLive }.
     * Returns { list, prepared, setDomain(slug) }.
     */
    function render(els, content, options) {
        const opts = options || {};
        const Checklist = engine('checklist', opts);
        const prepared = prepare(content, opts);
        const release = { wsLive: prepared.wsLive, proofNow: prepared.proofNow };
        const domains = Array.isArray(opts.domains) ? opts.domains : [];
        const labelFor = slug => {
            const key = text(slug).toLowerCase();
            if (!key) return '';
            const found = domains.find(d => d.slug === key);
            if (found) return found.label;
            try { return typeof opts.domainLabel === 'function' ? text(opts.domainLabel(key)) : ''; } catch (_) { return ''; }
        };
        let current = opts.domain || null;
        let fill = domainFill(current, opts.domainLabel, prepared.proofs, release);
        let page = null;
        const drawDomain = () => renderDomainLine(els.domain, {
            slug: current,
            // A domain with no name anywhere shows the defaults on every example, so the line names the default too.
            label: (fill.phrase && labelFor(current)) || labelFor(DEFAULT_DOMAIN) || 'Statutory audit',
            domains,
            onPick(slug) {
                let saved = slug;
                if (typeof opts.onPickDomain === 'function') {
                    try { saved = opts.onPickDomain(slug) || slug; } catch (_) { saved = slug; }
                }
                page.setDomain(saved);
            }
        });
        renderLede(els.lede, prepared.intro);
        renderOpen(els.open, prepared.open);
        renderFab(els.app.ownerDocument, prepared.open, els.open);
        const list = Checklist.mount(els.app, prepared.content, {
            store: opts.store,
            labels: { example: EXAMPLE_LABEL },
            onChange: opts.onChange
        });
        formatExamples(els.app, fill);
        decorateItems(els.app, prepared.extras, prepared.open, fill);
        addCopyBoxes(els.app, prepared.copies, fill);
        renderNotes(els.notes, prepared.notes, fill);
        drawDomain();
        page = {
            list,
            prepared,
            setDomain(slug) {
                current = slug || null;
                fill = domainFill(current, opts.domainLabel, prepared.proofs, release);
                applyDomain(els.app, fill);
                applyDomain(els.notes, fill);
                drawDomain();
                return fill.phrase;
            }
        };
        return page;
    }

    /**
     * The load failed. A network failure asks the student to check the connection; anything else (content that
     * doesn't parse or draw) says only that the checklist didn't load. Both offer "Try again".
     */
    function showError(app, retry, network) {
        const doc = app.ownerDocument;
        app.textContent = '';
        const card = el(doc, 'div', 'ap-card lc-error');
        card.appendChild(el(doc, 'p', '', network ? 'The checklist didn’t load. Check your connection and try again.' : 'The checklist didn’t load.'));
        const button = el(doc, 'button', 'ap-btn', 'Try again');
        button.type = 'button';
        button.addEventListener('click', retry);
        card.appendChild(button);
        app.appendChild(card);
    }

    /** An error that came from the network (no response, or an HTTP error), not from the content. */
    function networkError(cause) {
        const error = new Error(cause && cause.message ? cause.message : String(cause));
        error.lcNetwork = true;
        return error;
    }

    function loadContent(fetchImpl, url) {
        return Promise.resolve()
            .then(() => fetchImpl(url || CONTENT_URL, { cache: 'no-cache' }))
            .then(response => {
                if (!response || !response.ok) throw networkError('HTTP ' + (response ? response.status : 0));
                return response.json();
            }, error => { throw networkError(error); });
    }

    /** The shared "my domain" slug, or null (no setting, or storage blocked). */
    function readDomain(Progress) {
        try { return Progress && typeof Progress.getMyDomain === 'function' ? Progress.getMyDomain() || null : null; } catch (_) { return null; }
    }

    /**
     * Page start: gate, content, store, render, then keep "my domain" filled in.
     * options (tests): { doc, fetch, store, Gate, Checklist, Progress, url, workSimulationLive }.
     */
    function boot(options) {
        const opts = options || {};
        const doc = opts.doc || root.document;
        const els = {
            app: doc.getElementById('app'),
            open: doc.getElementById('lc-open'),
            notes: doc.getElementById('lc-notes'),
            lede: doc.getElementById('lc-lede'),
            domain: doc.getElementById('lc-domain')
        };
        const Gate = opts.Gate || root.MSCArticleshipGate;
        const fetchImpl = opts.fetch || (root.fetch ? root.fetch.bind(root) : null);
        // "My domain" comes from the page's progress engine (or the test's); never opened just for this.
        const Progress = opts.Progress || root.MSCArticleshipProgress || null;
        const domainLabel = slug => (Progress && typeof Progress.domainLabel === 'function' ? Progress.domainLabel(slug) : '');
        const domains = domainList(Progress);
        // The picker saves the shared setting, so every programme tool follows; the page refills either way.
        const onPickDomain = slug => (Progress && typeof Progress.setMyDomain === 'function' ? Progress.setMyDomain(slug) : slug);
        // The open-profile link works before the content arrives.
        renderOpen(els.open, DEFAULT_OPEN);
        renderFab(doc, DEFAULT_OPEN, els.open);
        let watching = false;
        const start = () => loadContent(fetchImpl, opts.url).then(content => {
            const Checklist = engine('checklist', opts);
            const store = opts.store || engine('progress', opts).open(TOOL, { defaults: { ticks: {} }, merge: Checklist.mergeTicks });
            const page = render(els, content, {
                store, Checklist, domain: readDomain(Progress), domainLabel, domains, onPickDomain,
                workSimulationLive: opts.workSimulationLive
            });
            if (!watching && Progress && typeof Progress.onSettingsChange === 'function') {
                try { Progress.onSettingsChange(() => page.setDomain(readDomain(Progress))); watching = true; } catch (_) { /* the domain fill is optional */ }
            }
            return page;
        }).catch(error => { showError(els.app, () => { start(); }, !!(error && error.lcNetwork)); return null; });
        const gate = Gate && typeof Gate.protect === 'function' ? Gate.protect() : Promise.resolve({ state: 'allow' });
        return Promise.resolve(gate).then(start);
    }

    return Object.freeze({
        TOOL, CONTENT_URL, WORK_SIMULATION_LIVE, DEFAULT_OPEN, DOMAIN_PHRASE, SIM_NAME, DEFAULT_DOMAIN, joinLines, openTarget,
        prepare, releaseLines, parseLine, exampleBlocks, domainPhrase, simName, proofFor, domainFill, fillDomain, copyText,
        selectText, render, boot
    });
});
