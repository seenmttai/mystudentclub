/* One resource library for every career stage. Premium discovery is names-only. */
(function (global) {
    'use strict';
    const FRESHER_DIR = '/assets/ca-fresher-resources/';
    const INDUSTRIAL_DIR = '/assets/ca-industrial-resources/';
    const editable = (title, directory, stem, priority) => ({
        title, category: 'cv-prep', sort_order: priority,
        viewUrl: directory + stem + '.pdf', downloadUrl: directory + stem + '.docx',
        fileName: stem.replace(/_/g, ' ') + '.docx', format: 'DOCX',
        description: 'Preview the sample, then download the editable Word document.'
    });
    const pdf = (title, directory, stem, priority) => ({
        title, category: 'interview-guidance', sort_order: priority,
        viewUrl: directory + stem + '.pdf', downloadUrl: directory + stem + '.pdf',
        fileName: stem + '.pdf', format: 'PDF', description: 'Read online or save a copy for your preparation.'
    });
    const fresherResources = [
        editable('CV Template 1', FRESHER_DIR, 'CV Template-1', 1),
        editable('CV Template 2', FRESHER_DIR, 'CV Template-2', 2),
        editable('Cover Letter CA Fresher', FRESHER_DIR, 'Cover Letter CA Fresher', 30),
        pdf('Interview Syllabus', FRESHER_DIR, 'Interview Syllabus', 1),
        pdf('Interview Booklet', FRESHER_DIR, 'Interview Booklet', 2)
    ];
    const industrialResources = [
        editable('CV Template 2', INDUSTRIAL_DIR, 'Industrial_Training_CV_Template_2', 1),
        editable('CV Template 3', INDUSTRIAL_DIR, 'Industrial_Training_CV_Template_1', 2),
        editable('Cover Letter', INDUSTRIAL_DIR, 'Coverletter', 30),
        pdf('Interview Syllabus', INDUSTRIAL_DIR, 'Syllabus', 1),
        pdf('Finance Interview Questions', INDUSTRIAL_DIR, 'Finance-interview', 2),
        {
            title: 'Industrial Training Hiring Companies List', category: 'application-tricks', sort_order: 1,
            viewUrl: 'https://docs.google.com/spreadsheets/d/1yDCBRaadD_qddFyKYRpesyL8h_E91X1dlzA0PfoEdKM/edit?gid=0#gid=0',
            downloadUrl: 'https://docs.google.com/spreadsheets/d/1yDCBRaadD_qddFyKYRpesyL8h_E91X1dlzA0PfoEdKM/export?format=xlsx&gid=0',
            fileName: 'Industrial Training Hiring Companies List.xlsx', format: 'XLSX',
            description: 'Explore hiring companies and plan where to apply.'
        }
    ];
    const programs = {
        'industrial-training': { title: 'MSC Industrial Training Program', url: '/ca-industrial-training-program/', courses: ['industrial-training-mastery', 'industrial-training', 'msc-industrial-training-program'] },
        'ca-fresher': { title: 'MSC CA Fresher Program', url: '/msc-ca-fresher-program/', courses: ['msc-ca-freshers-program', 'msc-ca-fresher-program', 'ca-freshers'] },
        'articleship': { title: 'MSC Articleship Program', url: '/articleship-program/', courses: ['msc-articleship-program', 'articleship-program', 'articleship', 'articleship-mastery', 'msc-articleship-mastery'] }
    };
    const pages = {
        'industrial-training': { resources: industrialResources, premiumProgram: 'industrial-training' },
        'ca-fresher': { resources: fresherResources, premiumProgram: 'ca-fresher' },
        'articleship': { resources: fresherResources.filter(r => r.category === 'cv-prep').map(r => ({ ...r, title: r.title === 'Cover Letter CA Fresher' ? 'Cover Letter' : r.title })), premiumProgram: 'articleship' },
        'semi-qualified': { resources: fresherResources.map(r => ({ ...r, title: r.title === 'Cover Letter CA Fresher' ? 'Cover Letter' : r.title })), premiumProgram: 'ca-fresher' }
    };
    const groups = [
        { id: 'cv-prep', title: 'CV Prep', description: 'Start with your CV, then tailor your cover letter.' },
        { id: 'interview-guidance', title: 'For Interview Guidance', description: 'Build confidence with focused interview preparation.' },
        { id: 'application-tricks', title: 'For Application Tricks', description: 'Find opportunities and improve your applications.' }
    ];

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
                category: groups.some(g => g.id === row.category) ? row.category : 'application-tricks',
                sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 50
            }];
        });
    }
    const exports = { cleanFileName, sanitizeCatalogue, pages, programs, groups };
    if (typeof module !== 'undefined' && module.exports) module.exports = exports;
    global.MSCResourceLibrary = exports;
    if (typeof document === 'undefined') return;

    let config, stage, premiumRows = [], returnFocus;
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
            const viewUrl = url.pathname.toLowerCase().endsWith('.pdf')
                ? '/ca-resource/index.html?pdf=' + encodeURIComponent(url.href) : url.href;
            global.open(viewUrl, '_blank', 'noopener,noreferrer');
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
            const program = programs[resource.program];
            const courses = access?.courses || [];
            const isEnrolled = courses.some(entry => program.courses.includes(String(typeof entry === 'string' ? entry : entry.course).trim().toLowerCase()));
            if (isEnrolled) {
                global.location.href = '/learning-management-system/lms-resources.html';
            } else showEnrollment(resource, trigger);
        } catch (_) { showError('We could not check your program access. Please try again.'); }
        finally { trigger.disabled = false; }
    }
    function renderCard(resource) {
        const card = element('article', 'resource-card' + (resource.premium ? ' resource-premium' : ''));
        const top = element('div', 'resource-card-top');
        top.append(element('span', 'resource-badge', resource.premium ? 'Premium' : 'Free'));
        if (!resource.premium) top.append(element('span', 'resource-format', resource.format));
        card.append(top, element('h3', 'resource-title', resource.title));
        if (!resource.premium) card.append(element('p', 'resource-description', resource.description));
        const actions = element('div', 'resource-actions');
        [false, true].forEach(download => {
            const label = download ? (resource.premium ? 'Download Now' : 'Download ' + resource.format) : 'View Now';
            const button = element('button', 'resource-action' + (download ? ' secondary' : ''), (resource.premium ? '🔒 ' : '') + label);
            button.type = 'button';
            button.setAttribute('aria-label', label + ': ' + resource.title + (resource.premium ? ' (premium resource)' : ''));
            button.addEventListener('click', () => resource.premium ? premiumAction(resource, button) : freeAction(resource, download));
            actions.append(button);
        });
        card.append(actions);
        return card;
    }
    function renderResources() {
        const container = document.getElementById('resources-container');
        container.replaceChildren();
        const resources = [...config.resources, ...premiumRows];
        groups.forEach(group => {
            const section = element('section', 'resource-section');
            const heading = element('h2', '', group.title);
            heading.id = 'resource-' + group.id;
            section.setAttribute('aria-labelledby', heading.id);
            section.append(heading, element('p', 'resource-section-intro', group.description));
            const items = resources.filter(r => r.category === group.id).sort((a, b) => Number(a.premium || false) - Number(b.premium || false) || a.sort_order - b.sort_order || a.title.localeCompare(b.title));
            if (items.length) {
                const grid = element('div', 'resources-list');
                items.forEach(item => grid.append(renderCard(item)));
                section.append(grid);
            } else section.append(element('p', 'resource-empty', 'More resources will appear here as they are added.'));
            container.append(section);
        });
    }
    async function loadCatalogue() {
        const status = document.getElementById('resource-catalog-status');
        status.textContent = 'Loading premium resource titles…';
        try {
            const client = global.supabaseClient || global.getSupabaseClient?.();
            if (!client) throw new Error('Client unavailable');
            const { data, error } = await client.rpc('get_public_resource_catalog', { p_program: config.premiumProgram });
            if (error) throw error;
            premiumRows = sanitizeCatalogue(data, config.premiumProgram);
            renderResources();
            status.textContent = premiumRows.length ? 'Premium resource titles update automatically as materials are added to the program. Enrolled students can access them in My Courses.' : '';
        } catch (_) {
            status.replaceChildren(document.createTextNode('Premium resource titles could not be loaded. Your free resources are available above. '));
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
