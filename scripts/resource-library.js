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
        'industrial-training': { title: 'MSC Industrial Training Program', url: '/ca-industrial-training-program/', courses: ['industrial-training-mastery', 'industrial-training', 'msc-industrial-training-program', 'ca-industrial-training', 'industrial-training-program', 'msc-ca-industrial-training', 'ca-industrial'] },
        'ca-fresher': { title: 'MSC CA Fresher Program', url: '/msc-ca-fresher-program/', courses: ['msc-ca-freshers-program', 'msc-ca-fresher-program', 'ca-freshers', 'freshers', 'ca-freshers-program', 'msc-ca-freshers'] },
        'articleship': { title: 'MSC Articleship Program', url: '/articleship-program/', courses: ['msc-articleship-program', 'articleship-program', 'articleship', 'articleship-mastery', 'msc-articleship-mastery'] },
        'semi-qualified': { title: 'MSC Industrial Training Program', url: '/ca-industrial-training-program/', courses: ['industrial-training-mastery', 'industrial-training', 'msc-industrial-training-program', 'ca-industrial-training', 'industrial-training-program', 'msc-ca-industrial-training', 'ca-industrial', 'msc-ca-freshers-program', 'msc-ca-fresher-program', 'ca-freshers'] }
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
        'semi-qualified': { resources: fresherResources.map(r => ({ ...r, title: r.title === 'Cover Letter CA Fresher' ? 'Cover Letter' : r.title })), premiumProgram: 'industrial-training' },
        'domain-wise-companies': {
            resources: industrialResources.filter(r => r.category === 'application-tricks').map(r => ({
                ...r, title: 'Hiring Companies List',
                description: 'Companies hiring CA Industrial Trainees, with location and stipend where shared.'
            })),
            premiumProgram: 'industrial-training',
            freeIntro: 'Open the list, shortlist companies in your domain and start applying.'
        }
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
        return resources.filter(resource => {
            const day = Number.isInteger(resource.day_number) ? 'Day ' + resource.day_number : '';
            const text = [resource.title, resource.group_name, inferResourceGroup(resource), day].join(' ').toLocaleLowerCase();
            return terms.every(term => text.includes(term));
        });
    }

    function cleanFileName(name) {
        let value = String(name || 'Resource');
        for (let i = 0; i < 2; i++) { try { const next = decodeURIComponent(value); if (next === value) break; value = next; } catch (_) { break; } }
        return value.replace(/[\\/\x00-\x1f<>:"|?*]/g, '-').trim() || 'Resource';
    }
    const ordinal = value => (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100000 ? Number(value) : null;
    const collectionNames = ['CV Templates', 'Cover Letter Templates', 'CV Guidance', 'Application & Outreach', 'Interview Preparation', 'Excel Practice', 'Hiring Companies', 'Registration & Forms', 'Career Tools', 'WhatsApp Communities', 'More Resources'];
    function inferResourceGroup(resource) {
        const source = String(resource.group_name || '').trim();
        if (source && !/^(general(?: resources)?|resources|others?)$/i.test(source)) {
            if (/^(?:industrial )?(?:cv|resume) templates?$/i.test(source)) return 'CV Templates';
            if (/^cover[ -]?letters?(?: templates?)?$/i.test(source)) return 'Cover Letter Templates';
            return source;
        }
        const title = resource.title.toLocaleLowerCase();
        if (/cover[ -]?letter/.test(title)) return 'Cover Letter Templates';
        if (/(?:cv|resume|résumé) templates?/.test(title)) return 'CV Templates';
        if (/whats\s*app/.test(title)) return 'WhatsApp Communities';
        if (/excel/.test(title)) return 'Excel Practice';
        if (/\b(ai|tool|builder|waalaxy)\b|personal cv review/.test(title)) return 'Career Tools';
        if (/cv|resume|résumé|professional summary/.test(title)) return 'CV Guidance';
        if (/mail|application|connection notes|message template|follow.?up/.test(title)) return 'Application & Outreach';
        if (/interview|syllabus|technical (round|topics)/.test(title)) return 'Interview Preparation';
        if (/compan|hiring|list of .*firms/.test(title)) return 'Hiring Companies';
        if (/registration|stamp paper|form \d|consent letter/.test(title)) return 'Registration & Forms';
        return 'More Resources';
    }
    function sanitizeCatalogue(rows, program) {
        const seen = new Set();
        return (Array.isArray(rows) ? rows : []).flatMap(row => {
            if (!row || typeof row !== 'object' || Array.isArray(row) || row.program_type !== program || typeof row.title !== 'string' || !row.title.trim()) return [];
            const title = row.title.trim().slice(0, 300);
            const day_number = ordinal(row.day_number);
            const group_name = typeof row.group_name === 'string' ? row.group_name.trim().slice(0, 120) : '';
            const key = JSON.stringify([day_number, group_name.toLocaleLowerCase(), title.toLocaleLowerCase()]);
            if (seen.has(key)) return [];
            seen.add(key);
            // Only public names and ordering metadata cross this boundary. Never copy file paths.
            return [{ title, premium: true, program, day_number, group_name,
                session_order: ordinal(row.session_order), group_order: ordinal(row.group_order), resource_order: ordinal(row.resource_order),
                category: categories.includes(row.category) ? row.category : 'application-tricks',
                sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 50
            }];
        });
    }
    function groupPremiumResources(resources) {
        const days = new Map();
        const rank = value => value === null || value === undefined ? Number.MAX_SAFE_INTEGER : value;
        for (const resource of resources) {
            const dayNumber = ordinal(resource.day_number);
            const dayKey = dayNumber === null ? 'library' : String(dayNumber);
            if (!days.has(dayKey)) days.set(dayKey, { key: dayKey, day_number: dayNumber, groups: new Map() });
            const day = days.get(dayKey);
            const title = inferResourceGroup(resource);
            const key = JSON.stringify([dayKey, title.toLocaleLowerCase()]);
            if (!day.groups.has(key)) day.groups.set(key, { key, title, resources: [], order: rank(resource.group_order), session: rank(resource.session_order) });
            const group = day.groups.get(key);
            group.resources.push(resource);
            group.order = Math.min(group.order, rank(resource.group_order));
            group.session = Math.min(group.session, rank(resource.session_order));
        }
        const fallbackRank = title => { const n = collectionNames.indexOf(title); return n < 0 ? collectionNames.length : n; };
        return [...days.values()].sort((a,b) => rank(a.day_number) - rank(b.day_number)).map(day => ({
            key: day.key, day_number: day.day_number,
            groups: [...day.groups.values()].sort((a,b) => a.session - b.session || a.order - b.order || fallbackRank(a.title) - fallbackRank(b.title) || titleCollator.compare(a.title,b.title)).map(group => ({
                key: group.key, title: group.title,
                resources: [...group.resources].sort((a,b) => {
                    // Keep numbered template families easy to scan even when a source array was uploaded out of order.
                    if (/templates?/i.test(group.title)) return compareResourceTitles(a,b);
                    return rank(a.session_order) - rank(b.session_order) || rank(a.resource_order) - rank(b.resource_order) || a.sort_order - b.sort_order || compareResourceTitles(a,b);
                })
            }))
        }));
    }
    const exports = { cleanFileName, sanitizeCatalogue, pages, programs, hasProgramEnrollment, compareResourceTitles, organizeResources, searchResources, inferResourceGroup, groupPremiumResources };
    if (typeof module !== 'undefined' && module.exports) module.exports = exports;
    global.MSCResourceLibrary = exports;
    if (typeof document === 'undefined') return;

    let config, stage, premiumRows = [], returnFocus, catalogueLoaded = false, catalogueError = false, userCourses = [];
    let premiumQuery = '', selectedDay = 'all';
    const expandedGroups = new Set();
    const GROUP_PREVIEW_SIZE = 3;
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
            // Public free resources: open PDFs in the ca-resource reader viewer
            const isPdf = /\.pdf$/i.test(url.pathname) || (url.href.toLowerCase().includes('.pdf') && !url.href.includes('drive.google.com'));
            if (isPdf) {
                global.open('/ca-resource/index.html?pdf=' + encodeURIComponent(url.href), '_blank', 'noopener,noreferrer');
            } else {
                global.open(url.href, '_blank', 'noopener,noreferrer');
            }
        }
    }
    async function freeAction(resource, download) {
        if (userCourses && userCourses.length > 0) {
            return openFree(resource, download);
        }
        if (global.MSCProgramAccess) {
            try {
                const access = await global.MSCProgramAccess.getAccess();
                if (access?.hasAccess || (access?.courses && access.courses.length > 0)) {
                    if (access.courses) userCourses = access.courses;
                    return openFree(resource, download);
                }
            } catch (_) { /* ignore and fallback to collector */ }
        }
        const collector = global.resourceFormCollector;
        if (!collector || typeof collector.checkAndAccess !== 'function') {
            showError('The access form is still loading. Please try again in a moment.'); return;
        }
        try {
            await collector.checkAndAccess(resource.title, download ? resource.downloadUrl : resource.viewUrl, () => openFree(resource, download));
        } catch (_) { showError('We could not open this resource. Please try again.'); }
    }
    function showEnrollment(resource, trigger, access) {
        const programId = stage === 'semi-qualified' ? 'industrial-training' : (resource.program || config.premiumProgram);
        const program = programs[programId] || programs['industrial-training'];
        const modal = document.getElementById('resource-enroll-dialog');
        document.getElementById('resource-enroll-title').textContent = 'Enroll in ' + program.title + ' to Access the Premium Resources';
        document.getElementById('resource-enroll-resource').textContent = resource.title;
        document.getElementById('resource-enroll-link').href = program.url;
        const signInBtn = modal.querySelector('a[href*="/login"]');
        if (signInBtn) {
            signInBtn.hidden = Boolean(access?.loggedIn || access?.user);
        }
        returnFocus = trigger;
        modal.showModal();
    }
    async function checkUserAccess() {
        try {
            if (!global.MSCProgramAccess) return;
            const access = await global.MSCProgramAccess.getAccess();
            if (access && access.courses && access.courses.length > 0) {
                userCourses = access.courses;
                renderPremiumResults();
            }
        } catch (_) { /* ignore */ }
    }
    async function premiumAction(resource, trigger, download = false) {
        trigger.disabled = true;
        try {
            if (!global.MSCProgramAccess) throw new Error('Access check unavailable');
            const access = await global.MSCProgramAccess.getAccess();
            if (access.error) throw access.error;
            if (access.courses) userCourses = access.courses;
            const isEnrolled = hasProgramEnrollment(access?.courses, resource.program, global.MSCProgramAccess.canonicalCourse) ||
                (stage === 'semi-qualified' && (hasProgramEnrollment(access?.courses, 'industrial-training', global.MSCProgramAccess.canonicalCourse) || hasProgramEnrollment(access?.courses, 'ca-fresher', global.MSCProgramAccess.canonicalCourse)));
            if (isEnrolled) {
                const actionParam = download ? '&action=download' : '';
                if (resource.viewUrl || resource.url) {
                    const target = (download && resource.downloadUrl) ? resource.downloadUrl : (resource.viewUrl || resource.url);
                    if (download) {
                        const link = element('a');
                        link.href = target;
                        link.download = cleanFileName(resource.fileName || resource.title);
                        link.dataset.noIntercept = 'true';
                        link.rel = 'noopener noreferrer';
                        link.hidden = true;
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                    } else {
                        global.location.href = '/ca-resource/index.html?pdf=' + encodeURIComponent(target);
                    }
                } else if (resource.fileName) {
                    global.location.href = '/ca-resource/resource/?name=' + encodeURIComponent(resource.fileName) + '&program=' + encodeURIComponent(resource.program || '') + actionParam;
                } else {
                    global.location.href = '/ca-resource/resource/?name=' + encodeURIComponent(resource.title) + '&program=' + encodeURIComponent(resource.program || '') + actionParam;
                }
            } else showEnrollment(resource, trigger, access);
        } catch (_) { showError('We could not check your program access. Please try again.'); }
        finally { trigger.disabled = false; }
    }
    function icon(name) {
        const paths = {
            lock: '<path fill="currentColor" fill-rule="evenodd" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 5a3 3 0 0 1 6 0v3H9V7zm3 6a1.75 1.75 0 0 1 1.75 1.75c0 .64-.34 1.2-.85 1.51l.6 2.24a.5.5 0 0 1-.48.63h-2.04a.5.5 0 0 1-.48-.63l.6-2.24A1.75 1.75 0 0 1 12 13z" clip-rule="evenodd"/>',
            download: '<path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/>',
            file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8m-8 4h5"/>',
            search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>'
        };
        const node = element('span', 'resource-icon');
        node.setAttribute('aria-hidden', 'true');
        node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + '</svg>';
        return node;
    }
    function renderCard(resource, headingLevel = 'h3') {
        const card = element('article', 'resource-card' + (resource.premium ? ' resource-premium' : ''));
        const top = element('div', 'resource-card-top');
        if (resource.premium) {
            const groupType = inferResourceGroup(resource);
            const iconClass = /cv|resume/i.test(groupType) ? 'icon-blue' : /cover/i.test(groupType) ? 'icon-amber' : /excel/i.test(groupType) ? 'icon-green' : /interview/i.test(groupType) ? 'icon-purple' : 'icon-indigo';
            const iconBox = element('div', 'resource-premium-icon ' + iconClass);
            iconBox.append(icon('file'));
            const headerText = element('div', 'resource-premium-header-text');
            headerText.append(element(headingLevel, 'resource-title', resource.title), element('span', 'resource-subtitle', 'Included with Program'));
            top.append(iconBox, headerText);
            card.append(top);

            const programDisplayName = stage === 'semi-qualified'
                ? 'Industrial Training Program'
                : (resource.program || '').toLowerCase().includes('articleship')
                ? 'Articleship Program'
                : (resource.program || '').toLowerCase().includes('semi')
                ? 'Industrial Training Program'
                : (resource.program || '').toLowerCase().includes('fresher')
                ? 'CA Fresher Program'
                : 'Industrial Training Program';

            const isEnrolled = hasProgramEnrollment(userCourses, resource.program, global.MSCProgramAccess?.canonicalCourse) ||
                (stage === 'semi-qualified' && (hasProgramEnrollment(userCourses, 'industrial-training', global.MSCProgramAccess?.canonicalCourse) || hasProgramEnrollment(userCourses, 'ca-fresher', global.MSCProgramAccess?.canonicalCourse)));

            const previewBox = element('div', 'premium-card-preview');
            const previewLines = element('div', 'preview-mock-lines');
            previewLines.innerHTML = '<div class="mock-grid-row"><div class="mock-card-item mock-card-teal"><div class="mock-badge mock-badge-teal"></div><div class="mock-item-body"><div class="mock-avatar"></div><div class="mock-lines"><span></span><span></span></div></div></div><div class="mock-card-item mock-card-doc"><div class="mock-doc-header"><span class="mock-purple-icon"></span><span class="mock-doc-title"></span></div><div class="mock-doc-lines"><span></span><span></span></div></div></div><div class="mock-grid-row"><div class="mock-card-item mock-card-amber"><div class="mock-badge mock-badge-amber"></div><div class="mock-item-body"><div class="mock-avatar amber"></div><div class="mock-lines"><span></span><span></span></div></div></div><div class="mock-card-item mock-card-doc"><div class="mock-doc-lines"><span></span><span></span></div></div></div>';
            const lockOverlay = element('div', 'preview-lock-overlay');

            const actions = element('div', 'resource-actions');
            (resource.downloadUnavailable ? [false] : [true, false]).forEach(download => {
                const label = download ? 'Download Now' : 'Buy Course';
                const visibleLabel = download ? 'Download' : 'View';
                const button = element('button', 'resource-action' + (download ? ' premium-action-download' : ' secondary premium-action-view'));
                if (download) button.append(icon('download'));
                button.append(document.createTextNode(visibleLabel));
                button.type = 'button';
                button.setAttribute('aria-label', label + ': ' + resource.title + ' (premium resource)');
                button.addEventListener('click', () => premiumAction(resource, button, download));
                actions.append(button);
            });

            if (isEnrolled) {
                card.classList.add('premium-unlocked');
                lockOverlay.append(actions);
            } else {
                const lockIconBadge = element('div', 'lock-icon-circle');
                lockIconBadge.append(icon('lock'));
                const lockText = element('div', 'lock-notice-text');
                lockText.innerHTML = '<span>Available with</span><strong>' + programDisplayName + '</strong>';
                lockOverlay.append(lockIconBadge, lockText, actions);
            }
            previewBox.append(previewLines, lockOverlay);
            card.append(previewBox);
        } else {
            const file = element('div', 'resource-file-icon');
            file.append(icon('file'));
            top.append(file, element('span', 'resource-format', resource.downloadUnavailable ? 'GOOGLE SHEET' : resource.format === 'DOCX' ? 'EDITABLE WORD' : resource.format));
            card.append(top, element(headingLevel, 'resource-title', resource.title));
            card.append(element('p', 'resource-description', resource.description));
            const actions = element('div', 'resource-actions');
            (resource.downloadUnavailable ? [false] : [true, false]).forEach(download => {
                const label = resource.downloadUnavailable ? 'Open Google Sheet' : download ? 'Download ' + resource.format : 'Preview';
                const visibleLabel = resource.downloadUnavailable ? 'Open Google Sheet' : download ? 'Download' : 'Preview';
                const button = element('button', 'resource-action' + ((!resource.downloadUnavailable && !download) ? ' secondary' : ''));
                if (download) button.append(icon('download'));
                button.append(document.createTextNode(visibleLabel));
                button.type = 'button';
                button.setAttribute('aria-label', label + ': ' + resource.title);
                button.addEventListener('click', () => freeAction(resource, download));
                actions.append(button);
            });
            card.append(actions);
        }
        return card;
    }
    function sectionHeader(id, title, count, description) {
        const header = element('div', 'resource-section-header');
        const copy = element('div', 'resource-section-copy');
        const titleRow = element('div', 'resource-section-title');
        const heading = element('h2', '', title);
        heading.id = 'resource-' + id;
        const badge = element('span', 'resource-count', String(count));
        badge.id = 'resource-' + id + '-count';
        badge.setAttribute('aria-label', count + ' resources');
        titleRow.append(heading, badge);
        copy.append(titleRow, element('p', 'resource-section-intro', description));
        header.append(copy);
        const actions = element('div', 'resource-section-actions');
        const viewAll = element('a', 'hub-view-link', 'View all →');
        viewAll.href = '#' + (id === 'free' ? 'resource-free' : 'resource-premium');
        actions.append(viewAll);
        header.append(actions);
        return header;
    }
    function renderPremiumResults(focusGroup) {
        const grid = document.getElementById('premium-resources-list');
        if (!grid) return;
        const days = groupPremiumResources(premiumRows);
        const filters = document.getElementById('premium-day-filters');
        const focusedDay = filters.contains(document.activeElement) ? document.activeElement.dataset.day : null;
        const hasDays = days.some(day => day.day_number !== null);
        if (selectedDay !== 'all' && !days.some(day => day.key === selectedDay)) selectedDay = 'all';
        filters.replaceChildren();
        filters.hidden = !hasDays;
        if (hasDays) [{key:'all',label:'All days',count:premiumRows.length}, ...days.map(day => ({key:day.key,label:day.day_number === null ? 'More resources' : 'Day ' + day.day_number,count:day.groups.reduce((sum,group)=>sum+group.resources.length,0)}))].forEach(day => {
            const button = element('button', 'premium-day-filter'); button.type = 'button'; button.dataset.day = day.key;
            button.setAttribute('aria-pressed', String(selectedDay === day.key));
            button.setAttribute('aria-label',day.label + ', ' + day.count + (day.count===1 ? ' resource' : ' resources'));
            button.append(document.createTextNode(day.label),element('span','',String(day.count)));
            button.addEventListener('click',()=>{selectedDay=day.key;renderPremiumResults();});
            filters.append(button);
            if (focusedDay === day.key) button.focus({preventScroll:true});
        });
        const count = document.getElementById('resource-premium-count');
        count.textContent = catalogueLoaded ? String(premiumRows.length) : '—';
        count.setAttribute('aria-label', catalogueLoaded ? premiumRows.length + ' resources' : (catalogueError ? 'Resource count unavailable' : 'Resource count loading'));
        grid.replaceChildren();
        const searching = Boolean(premiumQuery.trim());
        let matches = 0, collectionCount = 0;
        days.filter(day => selectedDay === 'all' || day.key === selectedDay).forEach((day, dayIndex) => {
            const matchingGroups = day.groups.map(group => ({...group, matching:searchResources(group.resources,premiumQuery)})).filter(group => group.matching.length);
            if (!matchingGroups.length) return;
            const section = element('section','premium-day');
            const dayHeading = element('div','premium-day-heading');
            const heading = element('h3','',day.day_number === null ? (hasDays ? 'More resources' : 'Resource collections') : 'Day ' + day.day_number);
            heading.id = 'premium-day-' + day.key;
            section.setAttribute('aria-labelledby',heading.id);
            const dayCount = matchingGroups.reduce((sum,group)=>sum+group.matching.length,0);
            dayHeading.append(heading,element('p','',matchingGroups.length + (matchingGroups.length===1 ? ' collection' : ' collections') + ' · ' + dayCount + (dayCount===1 ? ' resource' : ' resources')));
            section.append(dayHeading);
            matchingGroups.forEach((group,groupIndex) => {
                matches += group.matching.length; collectionCount++;
                const expanded = expandedGroups.has(group.key);
                const shown = searching || expanded ? group.matching : group.matching.slice(0,GROUP_PREVIEW_SIZE);
                const collection = element('section','premium-collection');
                collection.dataset.group = group.key;
                const collectionId = 'premium-collection-' + dayIndex + '-' + groupIndex;
                const header = element('div','premium-collection-header');
                const copy = element('div','premium-collection-copy');
                const groupHeading = element('h4','',group.title); groupHeading.id = collectionId + '-title';
                collection.setAttribute('aria-labelledby',groupHeading.id);
                copy.append(groupHeading,element('p','',searching ? group.matching.length + ' matching · ' + group.resources.length + ' total' : group.resources.length + (group.resources.length===1 ? ' resource' : ' resources')));
                header.append(copy);
                if (!searching && group.resources.length > GROUP_PREVIEW_SIZE) {
                    const toggle = element('button','premium-group-toggle',expanded ? 'Show less' : 'View all ' + group.resources.length);
                    toggle.type='button'; toggle.dataset.groupToggle=group.key;
                    toggle.setAttribute('aria-expanded',String(expanded)); toggle.setAttribute('aria-controls',collectionId);
                    toggle.setAttribute('aria-label',(expanded ? 'Show less: ' : 'View all ' + group.resources.length + ' ') + group.title + (day.day_number===null ? '' : ' for Day ' + day.day_number));
                    toggle.addEventListener('click',()=>{if(expandedGroups.has(group.key))expandedGroups.delete(group.key);else expandedGroups.add(group.key);renderPremiumResults(group.key);});
                    header.append(toggle);
                }
                const list = element('div','resources-list premium-collection-list'); list.id=collectionId;
                shown.forEach(resource=>list.append(renderCard(resource,'h5')));
                collection.append(header,list);section.append(collection);
            });
            grid.append(section);
        });
        const empty = document.getElementById('premium-resources-empty');
        empty.hidden = matches > 0 || !catalogueLoaded;
        empty.textContent = premiumRows.length ? 'No resources match your search. Try another keyword or choose All days.' : 'New program resources will appear here as they are added.';
        const summary = document.getElementById('premium-search-results');
        summary.textContent = !catalogueLoaded ? (catalogueError ? 'Premium library unavailable' : 'Loading resources…') : searching
            ? matches + (matches===1 ? ' match' : ' matches') + (selectedDay==='all' ? '' : ' in ' + (selectedDay==='library' ? 'More resources' : 'Day ' + selectedDay))
            : premiumRows.length ? matches + ' resources · ' + collectionCount + (collectionCount===1 ? ' collection' : ' collections') : 'No premium resources added yet';
        document.querySelector('.resource-search-toolbar').hidden = catalogueLoaded && premiumRows.length === 0;
        if (focusGroup) [...grid.querySelectorAll('[data-group-toggle]')].find(button=>button.dataset.groupToggle===focusGroup)?.focus({preventScroll:true});
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
        const actions = header.querySelector('.resource-section-actions');
        if (actions) {
            actions.append(enroll);
        } else {
            header.append(enroll);
        }
        premium.append(header);
        const toolbar = element('div', 'resource-search-toolbar');
        const searchLabel = element('label', 'resource-search');
        searchLabel.htmlFor = 'premium-resource-search';
        searchLabel.append(icon('search'), element('span', 'resource-visually-hidden', 'Search premium resources'));
        const input = element('input');
        input.id = 'premium-resource-search';
        input.type = 'search';
        input.placeholder = 'Search templates, topics or resources';
        input.autocomplete = 'off';
        input.addEventListener('input', () => {
            premiumQuery = input.value;
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
        const filters = element('div', 'premium-day-filters');
        filters.id = 'premium-day-filters'; filters.setAttribute('role','group'); filters.setAttribute('aria-label','Browse resources by program day'); filters.hidden=true;
        premium.append(filters);
        const grid = element('div', 'premium-resources-list');
        grid.id = 'premium-resources-list';
        const empty = element('p', 'resource-empty');
        empty.id = 'premium-resources-empty';
        empty.hidden = true;
        premium.append(grid, empty);
        container.append(free, premium);
        renderPremiumResults();
    }
    async function loadCatalogue() {
        const status = document.getElementById('resource-catalog-status');
        status.textContent = '';
        try {
            const client = global.supabaseClient || global.getSupabaseClient?.();
            if (!client) throw new Error('Client unavailable');
            let response = await client.rpc('get_public_resource_catalog_v2', { p_program: config.premiumProgram });
            // Older databases keep their existing resource names usable, without invented day labels.
            if (response.error?.code === 'PGRST202') response = await client.rpc('get_public_resource_catalog', { p_program: config.premiumProgram });
            if (response.error) throw response.error;
            premiumRows = sanitizeCatalogue(response.data, config.premiumProgram);
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
        checkUserAccess();
        // A fresh visit/focus picks up materials added in the existing LMS admin.
        let lastRefresh = Date.now();
        global.addEventListener('focus', () => { if (!modal.open && Date.now() - lastRefresh > 60000) { lastRefresh = Date.now(); loadCatalogue(); } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
