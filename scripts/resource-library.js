/* One resource library for every career stage. Premium discovery is names-only. */
(function (global) {
    'use strict';
    const FRESHER_DIR = '/assets/ca-fresher-resources/';
    const INDUSTRIAL_DIR = '/assets/ca-industrial-resources/';
    const editable = (title, directory, stem, priority) => ({
        title, category: 'cv-prep', sort_order: priority,
        viewUrl: directory + stem + '.pdf', downloadUrl: directory + stem + '.docx',
        fileName: stem.replace(/_/g, ' ') + '.docx', format: 'DOCX',
        description: 'An editable Word template, ready to make your own.'
    });
    const pdf = (title, directory, stem, priority) => ({
        title, category: 'interview-guidance', sort_order: priority,
        viewUrl: directory + stem + '.pdf', downloadUrl: directory + stem + '.pdf',
        fileName: stem + '.pdf', format: 'PDF', description: 'Practical guidance to keep your preparation on track.'
    });
    const fresherResources = [
        editable('CV Template 1', FRESHER_DIR, 'CV Template-1', 1),
        editable('CV Template 2', FRESHER_DIR, 'CV Template-2', 2),
        editable('Cover Letter CA Fresher', FRESHER_DIR, 'Cover Letter CA Fresher', 3),
        pdf('Interview Syllabus', FRESHER_DIR, 'Interview Syllabus', 4),
        pdf('Interview Booklet', FRESHER_DIR, 'Interview Booklet', 5)
    ];
    const industrialResources = [
        editable('CV Template 2', INDUSTRIAL_DIR, 'Industrial_Training_CV_Template_2', 1),
        { ...editable('CV Template 3', INDUSTRIAL_DIR, 'Industrial_Training_CV_Template_1', 2), fileName: 'Industrial Training CV Template 3.docx' },
        editable('Cover Letter', INDUSTRIAL_DIR, 'Coverletter', 3),
        pdf('Interview Syllabus', INDUSTRIAL_DIR, 'Syllabus', 4),
        pdf('Finance Interview Questions', INDUSTRIAL_DIR, 'Finance-interview', 5),
        {
            title: 'Industrial Training Hiring Companies List', category: 'application-tricks', sort_order: 6,
            viewUrl: 'https://docs.google.com/spreadsheets/d/1yDCBRaadD_qddFyKYRpesyL8h_E91X1dlzA0PfoEdKM/edit?gid=0#gid=0',
            downloadUrl: 'https://docs.google.com/spreadsheets/d/1yDCBRaadD_qddFyKYRpesyL8h_E91X1dlzA0PfoEdKM/export?format=xlsx&gid=0',
            fileName: 'Industrial Training Hiring Companies List.xlsx', format: 'XLSX', downloadUnavailable: true,
            description: 'Explore hiring companies. Download availability is managed by the sheet owner.'
        }
    ];
    const programs = {
        'industrial-training': { title: 'MSC Industrial Training Program', url: '/ca-industrial-training-program/', courses: ['industrial-training-mastery', 'industrial-training', 'msc-industrial-training-program'] },
        'ca-fresher': { title: 'MSC CA Fresher Program', url: '/msc-ca-fresher-program/', courses: ['msc-ca-freshers-program', 'msc-ca-fresher-program', 'ca-freshers'] },
        'articleship': { title: 'MSC Articleship Program', url: '/articleship-program/', courses: ['msc-articleship-program', 'articleship-program', 'articleship', 'articleship-mastery', 'msc-articleship-mastery'] }
    };
    function hasProgramEnrollment(courses, programId, canonicalCourse) {
        const program = programs[programId];
        if (!program) return false;
        return (Array.isArray(courses) ? courses : []).some(entry => {
            const course = String(typeof entry === 'string' ? entry : entry?.course || '').trim().toLowerCase();
            const canonical = typeof canonicalCourse === 'function' ? canonicalCourse(course) : course;
            return program.courses.includes(course) || canonical === program.courses[0];
        });
    }
    const pages = {
        'industrial-training': { resources: industrialResources, premiumProgram: 'industrial-training' },
        'ca-fresher': { resources: fresherResources, premiumProgram: 'ca-fresher' },
        'articleship': { resources: fresherResources.filter(r => r.category === 'cv-prep').map(r => ({ ...r, title: r.title === 'Cover Letter CA Fresher' ? 'Cover Letter' : r.title })), premiumProgram: 'articleship' },
        'semi-qualified': { resources: fresherResources.map(r => ({ ...r, title: r.title === 'Cover Letter CA Fresher' ? 'Cover Letter' : r.title })), premiumProgram: 'ca-fresher' }
    };
    const categories = ['cv-prep', 'interview-guidance', 'application-tricks'];
    const titleCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
    const compareResourceTitles = (a, b) => titleCollator.compare(a.title, b.title);
    function organizeResources(freeResources, premiumResources) {
        return {
            free: [...freeResources].sort((a, b) => a.sort_order - b.sort_order || compareResourceTitles(a, b)),
            premium: [...premiumResources].sort((a, b) => a.sort_order - b.sort_order || compareResourceTitles(a, b))
        };
    }
    function searchResources(resources, query) {
        const terms = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        return resources.filter(resource => terms.every(term => resource.title.toLocaleLowerCase().includes(term)));
    }

    function cleanFileName(name) {
        let value = String(name || 'Resource');
        for (let i = 0; i < 2; i++) { try { const next = decodeURIComponent(value); if (next === value) break; value = next; } catch (_) { break; } }
        return value.replace(/[\\/\x00-\x1f<>:"|?*]/g, '-').trim() || 'Resource';
    }
    function sanitizeCatalogue(rows, program) {
        const seen = new Set();
        return (Array.isArray(rows) ? rows : []).flatMap(row => {
            if (row.program_type !== program || typeof row.title !== 'string' || !row.title.trim()) return [];
            const title = row.title.trim().slice(0, 300);
            const key = title.toLocaleLowerCase();
            if (seen.has(key)) return [];
            seen.add(key);
            // Deliberately project only safe fields even if a backend response changes.
            return [{ title, premium: true, program,
                category: categories.includes(row.category) ? row.category : 'application-tricks',
                sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 50
            }];
        });
    }
    const exports = { cleanFileName, sanitizeCatalogue, pages, programs, hasProgramEnrollment, compareResourceTitles, organizeResources, searchResources };
    if (typeof module !== 'undefined' && module.exports) module.exports = exports;
    global.MSCResourceLibrary = exports;
    if (typeof document === 'undefined') return;

    let config, stage, premiumRows = [], returnFocus, catalogueLoaded = false, catalogueError = false;
    let premiumQuery = '', visiblePremiumCount = 24;
    const PREMIUM_PAGE_SIZE = 24;
    const element = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    function showError(message) {
        let status = document.getElementById('resource-access-error');
        if (!status) { status = element('div', 'resource-access-error'); status.id = 'resource-access-error'; status.setAttribute('role', 'alert'); document.body.append(status); }
        status.textContent = message;
        clearTimeout(showError.timer);
        showError.timer = setTimeout(() => { status.textContent = ''; }, 8000);
    }
    async function openFree(resource, download) {
        const url = new URL(download ? resource.downloadUrl : resource.viewUrl, global.location.origin);
        if (download) {
            const link = element('a');
            let objectUrl = null;
            if (url.origin === global.location.origin) {
                // Ignore server Content-Disposition filenames (including encoded names).
                // The browser saves this Blob with the readable filename below.
                try {
                    const response = await fetch(url.href, { credentials: 'same-origin' });
                    if (!response.ok || /text\/html/i.test(response.headers.get('content-type') || '')) throw new Error('Unavailable file');
                    const file = await response.blob();
                    if (!file.size) throw new Error('Empty file');
                    objectUrl = URL.createObjectURL(file);
                } catch (_) {
                    throw new Error('This download could not be completed. Please try again.');
                }
            }
            link.href = objectUrl || url.href;
            link.download = cleanFileName(resource.fileName);
            link.dataset.noIntercept = 'true';
            link.rel = 'noopener noreferrer';
            if (url.origin !== global.location.origin) link.target = '_blank';
            link.hidden = true;
            document.body.appendChild(link); link.click(); link.remove();
            if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        } else {
            // These are public free files. The protected LMS viewer requires a login
            // and would block guests even after they completed the resource intake.
            global.open(url.href, '_blank', 'noopener,noreferrer');
        }
    }
    async function freeAction(resource, download) {
        const collector = global.resourceFormCollector;
        if (!collector || typeof collector.checkAndAccess !== 'function') {
            showError('The access form is still loading. Please try again in a moment.'); return;
        }
        try {
            await collector.checkAndAccess(resource.title, download ? resource.downloadUrl : resource.viewUrl, () => openFree(resource, download));
        } catch (_) { showError('We could not open this resource. Please try again.'); }
    }
    function showEnrollment(resource, trigger) {
        const program = programs[resource.program];
        const modal = document.getElementById('resource-enroll-dialog');
        document.getElementById('resource-enroll-title').textContent = 'Enroll in ' + program.title + ' to Access the Premium Resources';
        document.getElementById('resource-enroll-resource').textContent = resource.title;
        document.getElementById('resource-enroll-link').href = program.url;
        returnFocus = trigger;
        modal.showModal();
    }
    async function premiumAction(resource, trigger) {
        trigger.disabled = true;
        try {
            if (!global.MSCProgramAccess) throw new Error('Access check unavailable');
            const access = await global.MSCProgramAccess.getAccess();
            if (access.error) throw access.error;
            const isEnrolled = hasProgramEnrollment(access?.courses, resource.program, global.MSCProgramAccess.canonicalCourse);
            if (isEnrolled) {
                global.location.href = '/learning-management-system/lms-resources.html';
            } else showEnrollment(resource, trigger);
        } catch (_) { showError('We could not check your program access. Please try again.'); }
        finally { trigger.disabled = false; }
    }
    function icon(name) {
        const paths = {
            lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
            download: '<path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/>',
            file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8m-8 4h5"/>',
            search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>'
        };
        const node = element('span', 'resource-icon');
        node.setAttribute('aria-hidden', 'true');
        node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + '</svg>';
        return node;
    }
    function renderCard(resource) {
        const card = element('article', 'resource-card' + (resource.premium ? ' resource-premium' : ''));
        const top = element('div', 'resource-card-top');
        if (resource.premium) {
            const badge = element('span', 'resource-badge');
            badge.append(icon('lock'), document.createTextNode('Premium'));
            top.append(badge);
        } else {
            const file = element('div', 'resource-file-icon');
            file.append(icon('file'));
            top.append(file, element('span', 'resource-format', resource.downloadUnavailable ? 'GOOGLE SHEET' : resource.format === 'DOCX' ? 'EDITABLE WORD' : resource.format));
        }
        card.append(top, element('h3', 'resource-title', resource.title));
        if (!resource.premium) card.append(element('p', 'resource-description', resource.description));
        const actions = element('div', 'resource-actions');
        (resource.downloadUnavailable ? [false] : resource.premium ? [false, true] : [true, false]).forEach(download => {
            const label = resource.downloadUnavailable ? 'Open Google Sheet' : download ? (resource.premium ? 'Download Now' : 'Download ' + resource.format) : (resource.premium ? 'View Now' : 'Preview');
            const visibleLabel = resource.downloadUnavailable ? 'Open Google Sheet' : resource.premium ? (download ? 'Download' : 'View') : (download ? 'Download ' + resource.format : 'Preview');
            const button = element('button', 'resource-action' + ((!resource.downloadUnavailable && (!download || resource.premium)) ? ' secondary' : ''));
            if (resource.premium || download) button.append(icon(resource.premium ? 'lock' : 'download'));
            button.append(document.createTextNode(visibleLabel));
            button.type = 'button';
            button.setAttribute('aria-label', label + ': ' + resource.title + (resource.premium ? ' (premium resource)' : ''));
            button.addEventListener('click', () => resource.premium ? premiumAction(resource, button) : freeAction(resource, download));
            actions.append(button);
        });
        card.append(actions);
        return card;
    }
    function sectionHeader(id, title, count, description) {
        const header = element('div', 'resource-section-header');
        const copy = element('div');
        const titleRow = element('div', 'resource-section-title');
        const heading = element('h2', '', title);
        heading.id = 'resource-' + id;
        const badge = element('span', 'resource-count', String(count));
        badge.id = 'resource-' + id + '-count';
        badge.setAttribute('aria-label', count + ' resources');
        titleRow.append(heading, badge);
        copy.append(titleRow, element('p', 'resource-section-intro', description));
        header.append(copy);
        return header;
    }
    function renderPremiumResults() {
        const grid = document.getElementById('premium-resources-list');
        if (!grid) return;
        const sorted = organizeResources([], premiumRows).premium;
        const matching = searchResources(sorted, premiumQuery);
        const shown = matching.slice(0, visiblePremiumCount);
        const count = document.getElementById('resource-premium-count');
        count.textContent = catalogueLoaded ? String(premiumRows.length) : '—';
        count.setAttribute('aria-label', catalogueLoaded ? premiumRows.length + ' resources' : (catalogueError ? 'Resource count unavailable' : 'Resource count loading'));
        grid.replaceChildren();
        shown.forEach(resource => grid.append(renderCard(resource)));
        const empty = document.getElementById('premium-resources-empty');
        empty.hidden = shown.length > 0 || !catalogueLoaded;
        empty.textContent = premiumRows.length ? 'No resources match your search. Try another keyword.' : 'New program resources will appear here as they are added.';
        const summary = document.getElementById('premium-search-results');
        summary.textContent = !catalogueLoaded ? (catalogueError ? 'Premium library unavailable' : 'Loading resources…') : premiumQuery.trim()
            ? matching.length + (matching.length === 1 ? ' match' : ' matches') + ' · Showing ' + shown.length
            : premiumRows.length ? 'Showing ' + shown.length + ' of ' + premiumRows.length + ' resources' : 'No premium resources added yet';
        document.querySelector('.resource-search-toolbar').hidden = catalogueLoaded && premiumRows.length === 0;
        const more = document.getElementById('premium-show-more');
        more.hidden = shown.length >= matching.length;
        more.textContent = 'Show ' + Math.min(PREMIUM_PAGE_SIZE, matching.length - shown.length) + ' more resources';
    }
    function renderResources() {
        const container = document.getElementById('resources-container');
        container.replaceChildren();
        const free = element('section', 'resource-section resource-free-section');
        free.setAttribute('aria-labelledby', 'resource-free');
        free.append(sectionHeader('free', 'Free Resources', config.resources.length, 'Make them yours. Preview a resource or download it to get started.'));
        const freeGrid = element('div', 'resources-list');
        organizeResources(config.resources, []).free.forEach(resource => freeGrid.append(renderCard(resource)));
        free.append(freeGrid);

        const premium = element('section', 'resource-section resource-premium-section');
        premium.setAttribute('aria-labelledby', 'resource-premium');
        const program = programs[config.premiumProgram];
        const header = sectionHeader('premium', 'Premium Resources', 0, 'Included with the ' + program.title + '. Enroll to view and download.');
        const enroll = element('a', 'resource-program-link', 'Explore Program →');
        enroll.href = program.url;
        header.append(enroll);
        premium.append(header);
        const toolbar = element('div', 'resource-search-toolbar');
        const searchLabel = element('label', 'resource-search');
        searchLabel.htmlFor = 'premium-resource-search';
        searchLabel.append(icon('search'), element('span', 'resource-visually-hidden', 'Search premium resources'));
        const input = element('input');
        input.id = 'premium-resource-search';
        input.type = 'search';
        input.placeholder = 'Search by resource name';
        input.autocomplete = 'off';
        input.addEventListener('input', () => {
            premiumQuery = input.value;
            visiblePremiumCount = PREMIUM_PAGE_SIZE;
            renderPremiumResults();
        });
        searchLabel.append(input);
        const summary = element('p', 'resource-search-results');
        summary.id = 'premium-search-results';
        summary.setAttribute('role', 'status');
        summary.setAttribute('aria-live', 'polite');
        toolbar.append(searchLabel, summary);
        premium.append(toolbar);
        const status = document.getElementById('resource-catalog-status');
        premium.append(status);
        const grid = element('div', 'resources-list premium-resources-list');
        grid.id = 'premium-resources-list';
        const empty = element('p', 'resource-empty');
        empty.id = 'premium-resources-empty';
        empty.hidden = true;
        const more = element('button', 'resource-action secondary resource-show-more');
        more.id = 'premium-show-more';
        more.type = 'button';
        more.hidden = true;
        more.addEventListener('click', () => {
            const firstNewIndex = visiblePremiumCount;
            visiblePremiumCount += PREMIUM_PAGE_SIZE;
            renderPremiumResults();
            // Keep keyboard users at the next newly revealed resource.
            grid.querySelectorAll('.resource-card')[firstNewIndex]?.querySelector('button')?.focus({ preventScroll: true });
        });
        premium.append(grid, empty, more);
        container.append(free, premium);
        renderPremiumResults();
    }
    async function loadCatalogue() {
        const status = document.getElementById('resource-catalog-status');
        status.textContent = '';
        try {
            const client = global.supabaseClient || global.getSupabaseClient?.();
            if (!client) throw new Error('Client unavailable');
            const { data, error } = await client.rpc('get_public_resource_catalog', { p_program: config.premiumProgram });
            if (error) throw error;
            premiumRows = sanitizeCatalogue(data, config.premiumProgram);
            catalogueLoaded = true;
            catalogueError = false;
            renderPremiumResults();
        } catch (_) {
            catalogueError = true;
            renderPremiumResults();
            status.replaceChildren(document.createTextNode('We could not load the premium library. You can still use every free resource. '));
            const retry = element('button', '', 'Try again');
            retry.type = 'button'; retry.addEventListener('click', loadCatalogue); status.append(retry);
        }
    }
    function init() {
        stage = document.body.dataset.resourceStage;
        config = pages[stage];
        if (!config || !document.getElementById('resources-container')) return;
        renderResources();
        const modal = document.getElementById('resource-enroll-dialog');
        modal.querySelector('.dialog-close').addEventListener('click', () => modal.close());
        modal.addEventListener('click', e => { if (e.target === modal) { const rect = modal.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) modal.close(); } });
        modal.addEventListener('close', () => returnFocus?.focus());
        loadCatalogue();
        // A fresh visit/focus picks up materials added in the existing LMS admin.
        let lastRefresh = Date.now();
        global.addEventListener('focus', () => { if (Date.now() - lastRefresh > 60000) { lastRefresh = Date.now(); loadCatalogue(); } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
