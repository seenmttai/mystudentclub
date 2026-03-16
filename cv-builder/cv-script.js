        // Constants & Data
        const CA_SKILLS = ["Statutory Audit", "Tax Audit", "Internal Audit", "GST", "TDS", "Ind AS", "Excel", "Tally", "SAP", "Bank Audit"];
        const CA_DEGREES = ["CA Final", "CA Intermediate", "B.Com", "Class XII", "Class X"];
        const AUDIT_VERBS = ["Executed", "Analyzed", "Prepared", "Reviewed", "Led", "Verified"];
        const BASE_SECTION_ORDER = ['summary', 'education', 'experience', 'projects', 'certifications', 'achievements', 'leadership', 'interests', 'skills'];
        const SECTION_LABELS = {
            summary: 'Career Objective',
            education: 'Education',
            experience: 'Experience / Articleship',
            projects: 'Projects',
            certifications: 'Certifications',
            achievements: 'Achievements & Awards',
            leadership: 'Leadership',
            interests: 'Interests & Hobbies',
            skills: 'Skills'
        };

        let cvData = {
            personal: { name: "", tagline: "", contact: "", phone: "", email: "", linkedin: "", location: "", socialLinks: [] },
            summary: "",
            education: [],
            experience: [],
            projects: [],
            certifications: [],
            achievements: [],
            interests: [],
            leadership: [],
            skills: "",
            themeAccent: "",
            customSections: [],
            sectionOrder: [...BASE_SECTION_ORDER]
        };
        
        const DEMO_PREVIEW_DATA = {
            personal: {
                name: "Padam Bhansali",
                tagline: "CA Intermediate",
                contact: "",
                phone: "+91 7228881182",
                email: "capadambhansali@gmail.com",
                linkedin: "linkedin.com/in/ca-padam-bhansali",
                location: "Kandivali West, Mumbai",
                socialLinks: []
            },
            summary: "Detail-oriented articled trainee with strong exposure to GST compliance, internal controls, and audit support. Looking to contribute in a high-impact finance and compliance role.",
            education: [
                { degree: "CA Intermediate", institute: "The Institute of Chartered Accountants of India", year: "2025", marks: "317/600 (52.83%)", remarks: "Exemption in 2 Subjects" },
                { degree: "CA Foundation", institute: "The Institute of Chartered Accountants of India", year: "2025", marks: "246/400 (61.5%)", remarks: "Exemption in 3 Subjects" },
                { degree: "Bachelor of Commerce", institute: "Shri Bhausaheb Vartak College, Mumbai", year: "2023", marks: "8.14 CGPI (81.25%)", remarks: "Secured 2nd rank" }
            ],
            experience: [
                {
                    role: "Article Trainee",
                    company: "Firm Name",
                    dates: "Aug 2024 - Present",
                    category: "GST & Compliance",
                    bullets: [
                        "Handled preparation and filing of GSTR-1 and GSTR-3B for multi-industry clients with timely compliance.",
                        "Performed monthly ITC reconciliations and maintained inward/outward registers for GSTR-9 and GSTR-9C readiness.",
                        "Supported GST departmental audits with documentation, reconciliations, and notice tracking."
                    ]
                }
            ],
            projects: [
                {
                    title: "Internal Audit Support - Thermal Power Client",
                    description: "Risk-based audit support across key business functions",
                    bullets: [
                        "Reviewed controls across HR, Procurement, Contracts, Supply Chain, and statutory compliances.",
                        "Analyzed SAP financial data and identified process inefficiencies to improve workflows."
                    ]
                }
            ],
            certifications: [
                { name: "JP Morgan Investment Banking Virtual Experience Program Certificate", issuer: "Forage" },
                { name: "Financial Modelling", issuer: "CA Monk" }
            ],
            achievements: [
                "Awarded 'On-the-Spot Award' by BDO India LLP for Jan-Mar 2025 quarter.",
                "Won second prize in Sketching and Drawing Competition conducted by WICASA Vasai Branch."
            ],
            interests: ["Exploring new gen skincare innovations", "Trekking", "Sketching", "Crocheting"],
            leadership: [
                "Part of BDO India LLP team that secured Runner-Up position in internal cricket tournament.",
                "Worked as Assistant Co-ordinator and Chief Co-ordinator of the Commerce Association in college."
            ],
            skills: "MS Excel, Word, PowerPoint, Tally, SAP, Strong communication skills, Detail-oriented, Hardworking, Focused, Independent work, Collaborative teamwork",
            themeAccent: "",
            customSections: [
                { id: "custom_demo_languages", title: "Languages", items: ["English", "Hindi"] }
            ],
            sectionOrder: [...BASE_SECTION_ORDER, "custom_demo_languages"]
        };

        const WORKER_URL = "https://cv-maker.bhansalimanan55.workers.dev";
        // PDF Worker URL — update this after deploying cv-pdf-worker
        const WORKER_PDF_URL = "https://cv-pdf-worker.bhansalimanan55.workers.dev";
        const HISTORY_KEY = 'cv_maker_history_v1';
        let history = [];
        const UNDO_LIMIT = 120;
        let undoStack = [];
        let redoStack = [];
        let lastUndoStateHash = '';
        let isApplyingUndoRedo = false;
        let summaryQuill = null;
        let isSyncingSummaryEditor = false;
        let skillsQuill = null;
        let isSyncingSkillsEditor = false;
        let summaryLinkPopover = null;
        let summaryLinkRange = null;
        const inlineRichEditors = new Map();

        // Initialization
        window.onload = () => {
            if ('scrollRestoration' in window.history) {
                window.history.scrollRestoration = 'manual';
            }

            const saved = localStorage.getItem('cv_maker_data');
            if (saved) {
                try { 
                    const parsed = JSON.parse(saved);
                    // Ensure deep merge/compatibility
                    cvData = { ...cvData, ...parsed };
                    if (!cvData.personal) cvData.personal = { name: "", tagline: "", contact: "", phone: "", email: "", linkedin: "", location: "", socialLinks: [] };
                    if (!cvData.personal.socialLinks) cvData.personal.socialLinks = [];
                    if (!cvData.certifications) cvData.certifications = [];
                    if (!cvData.projects) cvData.projects = [];
                    if (!cvData.customSections) cvData.customSections = [];
                    if (!cvData.sectionOrder) cvData.sectionOrder = [...BASE_SECTION_ORDER];
                }
                catch (e) { console.error('Load failed', e); }
            }
            ensureCvDataShape();
            normalizeSectionOrder();
            loadHistory();

            initSummaryEditor();
            initSkillsEditor();
            renderEditor();
            renderCustomSectionEditors();
            updateProgress();
            initializeUndoRedoHistory();
            initUndoRedoShortcuts();
            updateUndoRedoControls();

            const frame = document.getElementById('cv-frame');
            if (frame) {
                frame.onload = () => setTimeout(postToFrame, 300);
                // Listen for frame saying it's ready (fix for white screen on reload)
                window.addEventListener('message', (e) => {
                    if (e.data && e.data.type === 'cv-frame-ready') {
                        postToFrame();
                    }
                });
                // Fallback attempt
                setTimeout(postToFrame, 1000);
            }

            initResizeHandle();
            resetEditorScrollToTop();
            requestAnimationFrame(() => resetEditorScrollToTop());
        };

        function resetEditorScrollToTop() {
            const editorPane = document.querySelector('.editor-content');
            if (editorPane) editorPane.scrollTop = 0;
            window.scrollTo(0, 0);
        }

        function getEditorScrollTop() {
            const editorPane = document.querySelector('.editor-content');
            return editorPane ? editorPane.scrollTop : 0;
        }

        function setEditorScrollTop(value) {
            const editorPane = document.querySelector('.editor-content');
            if (editorPane) editorPane.scrollTop = Math.max(0, Number(value) || 0);
        }

        function initSummaryEditor() {
            const editorHost = document.getElementById('inp-summary-editor');
            const fallbackTextarea = document.getElementById('inp-summary');
            if (!editorHost || !fallbackTextarea) return;
            if (typeof Quill === 'undefined') return;

            summaryQuill = new Quill('#inp-summary-editor', {
                theme: 'snow',
                placeholder: 'Brief summary of your professional goals...',
                modules: {
                    toolbar: [
                        ['bold', 'italic', 'underline'],
                        [{ list: 'bullet' }, { list: 'ordered' }],
                        ['link', 'clean']
                    ]
                }
            });
            const summaryToolbar = summaryQuill.getModule('toolbar');
            if (summaryToolbar && summaryToolbar.container) {
                summaryToolbar.container.classList.add('summary-rich-toolbar');
            }
            if (summaryQuill.root && summaryQuill.root.parentElement) {
                summaryQuill.root.parentElement.classList.add('summary-rich-container');
            }

            editorHost.style.display = '';
            fallbackTextarea.style.display = 'none';
            bindSummaryToolbarHandlers();
            addSummaryToolbarTooltips();
            ensureSummaryLinkPopover();

            summaryQuill.on('text-change', () => {
                if (isSyncingSummaryEditor) return;
                const textLen = getSummaryPlainText().length;
                if (textLen > 500) {
                    summaryQuill.deleteText(500, textLen);
                }
                syncSummaryFromEditor();
                updateCV();
            });
        }

        function initSkillsEditor() {
            const editorHost = document.getElementById('inp-skills-editor');
            const fallbackTextarea = document.getElementById('inp-skills');
            if (!editorHost || !fallbackTextarea) return;
            if (typeof Quill === 'undefined') return;

            skillsQuill = new Quill('#inp-skills-editor', {
                theme: 'snow',
                placeholder: 'List your key skills...',
                modules: {
                    toolbar: [
                        ['bold', 'italic', 'underline'],
                        [{ list: 'bullet' }, { list: 'ordered' }],
                        ['clean']
                    ]
                }
            });

            const toolbar = skillsQuill.getModule('toolbar');
            if (toolbar && toolbar.container) {
                toolbar.container.classList.add('summary-rich-toolbar');
            }
            if (skillsQuill.root && skillsQuill.root.parentElement) {
                skillsQuill.root.parentElement.classList.add('summary-rich-container');
            }

            editorHost.style.display = '';
            fallbackTextarea.style.display = 'none';
            addToolbarTooltipsForQuill(skillsQuill);

            skillsQuill.on('text-change', () => {
                if (isSyncingSkillsEditor) return;
                const textLen = getSkillsPlainText().length;
                if (textLen > 300) {
                    skillsQuill.deleteText(300, textLen);
                }
                syncSkillsFromEditor();
                updateCV();
            });
        }

        function getSummaryWordRange(index) {
            if (!summaryQuill) return null;
            const text = summaryQuill.getText() || '';
            if (!text.trim()) return null;

            let start = Math.max(0, Math.min(index, text.length - 1));
            let end = start;

            while (start > 0 && /\S/.test(text[start - 1])) start--;
            while (end < text.length && /\S/.test(text[end])) end++;

            if (end <= start) return null;
            return { index: start, length: end - start };
        }

        function applySummaryInlineFormat(formatName) {
            if (!summaryQuill) return;
            const range = summaryQuill.getSelection(true);
            if (!range) return;
            if (range.length === 0) return;
            const current = summaryQuill.getFormat(range)[formatName];
            summaryQuill.formatText(range.index, range.length, formatName, !current, 'user');
        }

        function applySummaryListFormat(listType) {
            if (!summaryQuill) return;
            const range = summaryQuill.getSelection(true);
            if (!range) return;
            if (range.length === 0) return;
            const current = summaryQuill.getFormat(range).list;
            summaryQuill.formatLine(range.index, range.length, 'list', current === listType ? false : listType, 'user');
        }

        function applySummaryLinkFormat() {
            if (!summaryQuill) return;
            const range = summaryQuill.getSelection(true);
            if (!range) return;
            if (range.length === 0) return;
            const existing = summaryQuill.getFormat(range).link || '';
            summaryLinkRange = { index: range.index, length: range.length };
            showSummaryLinkPopover(existing);
        }

        function bindSummaryToolbarHandlers() {
            if (!summaryQuill) return;
            const toolbar = summaryQuill.getModule('toolbar');
            if (!toolbar) return;

            toolbar.addHandler('bold', () => applySummaryInlineFormat('bold'));
            toolbar.addHandler('italic', () => applySummaryInlineFormat('italic'));
            toolbar.addHandler('underline', () => applySummaryInlineFormat('underline'));
            toolbar.addHandler('list', (value) => applySummaryListFormat(value || 'bullet'));
            toolbar.addHandler('link', () => applySummaryLinkFormat());
        }

        function addToolbarTooltipsForQuill(quill) {
            if (!quill) return;
            const toolbar = quill.getModule('toolbar');
            const container = toolbar && toolbar.container ? toolbar.container : null;
            if (!container) return;

            const setTitle = (selector, text) => {
                const btn = container.querySelector(selector);
                if (btn) btn.setAttribute('title', text);
            };

            setTitle('button.ql-bold', 'Bold');
            setTitle('button.ql-italic', 'Italic');
            setTitle('button.ql-underline', 'Underline');
            setTitle('button.ql-list[value="bullet"]', 'Bullet list');
            setTitle('button.ql-list[value="ordered"]', 'Numbered list');
            setTitle('button.ql-link', 'Add or edit link');
            setTitle('button.ql-clean', 'Clear formatting');
        }

        function addSummaryToolbarTooltips() {
            addToolbarTooltipsForQuill(summaryQuill);
        }

        function cleanupInlineRichEditors() {
            inlineRichEditors.forEach((entry, key) => {
                if (!entry || !entry.textarea || !document.body.contains(entry.textarea)) {
                    if (entry && entry.host && entry.host.parentNode) entry.host.parentNode.removeChild(entry.host);
                    inlineRichEditors.delete(key);
                }
            });
        }

        function initInlineRichEditor(textarea, editorKey, onChange, options = {}) {
            if (!textarea || typeof Quill === 'undefined') return;
            if (inlineRichEditors.has(editorKey)) return;
            const allowOrderedList = options.allowOrderedList !== false;

            const host = document.createElement('div');
            host.className = 'summary-rich-editor inline-rich-editor';
            textarea.parentNode.insertBefore(host, textarea);
            textarea.style.display = 'none';

            const quill = new Quill(host, {
                theme: 'snow',
                modules: {
                    toolbar: [
                        ['bold', 'italic', 'underline'],
                        allowOrderedList ? [{ list: 'bullet' }, { list: 'ordered' }] : [{ list: 'bullet' }],
                        ['link', 'clean']
                    ]
                }
            });
            const toolbar = quill.getModule('toolbar');
            if (toolbar && toolbar.container) {
                toolbar.container.classList.add('inline-rich-toolbar');
            }
            if (quill.root && quill.root.parentElement) {
                quill.root.parentElement.classList.add('inline-rich-container');
            }

            addToolbarTooltipsForQuill(quill);

            let isSyncing = true;
            quill.clipboard.dangerouslyPasteHTML(sanitizeSummaryHTML(textarea.value || ''));
            isSyncing = false;

            quill.on('text-change', () => {
                if (isSyncing) return;
                const sanitized = sanitizeSummaryHTML(quill.root.innerHTML);
                textarea.value = sanitized;
                if (typeof onChange === 'function') onChange(sanitized);
            });

            inlineRichEditors.set(editorKey, { textarea, quill, host });
        }

        function initSectionInlineRichEditors() {
            cleanupInlineRichEditors();

            document.querySelectorAll('textarea[data-rich-list-key][data-rich-list-index]').forEach((textarea) => {
                const key = textarea.getAttribute('data-rich-list-key');
                const idx = Number(textarea.getAttribute('data-rich-list-index'));
                if (!key || Number.isNaN(idx)) return;
                initInlineRichEditor(textarea, `list:${key}:${idx}`, (value) => updateListItem(key, idx, value));
            });

            document.querySelectorAll('textarea[data-rich-custom-id][data-rich-custom-index]').forEach((textarea) => {
                const id = textarea.getAttribute('data-rich-custom-id');
                const idx = Number(textarea.getAttribute('data-rich-custom-index'));
                if (!id || Number.isNaN(idx)) return;
                initInlineRichEditor(textarea, `custom:${id}:${idx}`, (value) => updateCustomSectionItem(id, idx, value));
            });

            document.querySelectorAll('textarea[data-rich-exp-index]').forEach((textarea) => {
                const idx = Number(textarea.getAttribute('data-rich-exp-index'));
                if (Number.isNaN(idx)) return;
                initInlineRichEditor(textarea, `exp:${idx}`, (value) => updateExp(idx, 'bullets', value), { allowOrderedList: false });
            });

            document.querySelectorAll('textarea[data-rich-proj-index]').forEach((textarea) => {
                const idx = Number(textarea.getAttribute('data-rich-proj-index'));
                if (Number.isNaN(idx)) return;
                initInlineRichEditor(textarea, `proj:${idx}`, (value) => updateProj(idx, 'bullets', value), { allowOrderedList: false });
            });
        }

        function ensureSummaryLinkPopover() {
            if (summaryLinkPopover) return;
            const editorHost = document.getElementById('inp-summary-editor');
            if (!editorHost) return;

            const popover = document.createElement('div');
            popover.className = 'summary-link-popover';
            popover.innerHTML = `
                <div class="summary-link-popover-title">Add Link</div>
                <input type="text" class="summary-link-input" placeholder="https://example.com/username">
                <div class="summary-link-actions">
                    <button type="button" class="summary-link-btn summary-link-apply">Apply</button>
                    <button type="button" class="summary-link-btn summary-link-remove">Remove</button>
                </div>
            `;
            document.body.appendChild(popover);
            summaryLinkPopover = popover;

            const input = popover.querySelector('.summary-link-input');
            const applyBtn = popover.querySelector('.summary-link-apply');
            const removeBtn = popover.querySelector('.summary-link-remove');

            applyBtn.addEventListener('click', () => {
                if (!summaryQuill || !summaryLinkRange) return;
                let href = (input.value || '').trim();
                if (!href) return;
                if (!/^(https?:\/\/|mailto:|tel:)/i.test(href)) href = `https://${href}`;
                summaryQuill.formatText(summaryLinkRange.index, summaryLinkRange.length, 'link', href, 'user');
                hideSummaryLinkPopover();
                summaryQuill.setSelection(summaryLinkRange.index + summaryLinkRange.length, 0, 'silent');
                updateCV();
            });

            removeBtn.addEventListener('click', () => {
                if (!summaryQuill || !summaryLinkRange) return;
                summaryQuill.formatText(summaryLinkRange.index, summaryLinkRange.length, 'link', false, 'user');
                hideSummaryLinkPopover();
                summaryQuill.setSelection(summaryLinkRange.index + summaryLinkRange.length, 0, 'silent');
                updateCV();
            });

            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    applyBtn.click();
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    hideSummaryLinkPopover();
                }
            });

            document.addEventListener('mousedown', (event) => {
                if (!summaryLinkPopover || summaryLinkPopover.style.display !== 'block') return;
                const linkBtn = getSummaryLinkToolbarButton();
                if (summaryLinkPopover.contains(event.target)) return;
                if (linkBtn && linkBtn.contains(event.target)) return;
                hideSummaryLinkPopover();
            });
        }

        function getSummaryLinkToolbarButton() {
            if (!summaryQuill) return null;
            const toolbar = summaryQuill.getModule('toolbar');
            const container = toolbar && toolbar.container ? toolbar.container : null;
            if (!container) return null;
            return container.querySelector('.ql-link');
        }

        function showSummaryLinkPopover(currentUrl) {
            if (!summaryLinkPopover) return;
            const linkBtn = getSummaryLinkToolbarButton();
            const input = summaryLinkPopover.querySelector('.summary-link-input');
            if (!linkBtn || !input) return;

            const rect = linkBtn.getBoundingClientRect();
            summaryLinkPopover.style.left = `${Math.round(rect.left)}px`;
            summaryLinkPopover.style.top = `${Math.round(rect.bottom + 8)}px`;
            summaryLinkPopover.style.display = 'block';
            input.value = currentUrl || '';
            setTimeout(() => {
                input.focus();
                input.select();
            }, 0);
        }

        function hideSummaryLinkPopover() {
            if (!summaryLinkPopover) return;
            summaryLinkPopover.style.display = 'none';
            summaryLinkRange = null;
        }

        function sanitizeSummaryHTML(value) {
            const html = String(value || '').trim();
            if (!html) return '';

            const template = document.createElement('template');
            template.innerHTML = html;
            template.content.querySelectorAll('script, style, iframe, object, embed').forEach(el => el.remove());

            const allowed = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'A']);

            const walk = (node) => {
                if (!node || !node.childNodes) return;
                Array.from(node.childNodes).forEach(child => {
                    if (child.nodeType === Node.ELEMENT_NODE) {
                        const tag = child.tagName.toUpperCase();
                        if (!allowed.has(tag)) {
                            const frag = document.createDocumentFragment();
                            while (child.firstChild) frag.appendChild(child.firstChild);
                            child.replaceWith(frag);
                            walk(node);
                            return;
                        }

                        Array.from(child.attributes).forEach(attr => {
                            const name = attr.name.toLowerCase();
                            if (tag === 'A' && (name === 'href' || name === 'target' || name === 'rel')) return;
                            child.removeAttribute(attr.name);
                        });

                        if (tag === 'A') {
                            const href = (child.getAttribute('href') || '').trim();
                            if (!href) {
                                child.replaceWith(document.createTextNode(child.textContent || ''));
                                return;
                            }
                            if (!/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
                                child.setAttribute('href', `https://${href}`);
                            }
                            child.setAttribute('target', '_blank');
                            child.setAttribute('rel', 'noopener noreferrer');
                        }
                    }
                    walk(child);
                });
            };

            walk(template.content);
            const sanitized = template.innerHTML.trim();
            return sanitized === '<p><br></p>' ? '' : sanitized;
        }

        function getPlainTextFromHTML(value) {
            const tmp = document.createElement('div');
            tmp.innerHTML = String(value || '');
            return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
        }

        function bulletsToRichHTML(items) {
            const list = Array.isArray(items) ? items.filter(item => String(item || '').trim()) : [];
            if (!list.length) return '';
            return `<ul>${list.map(item => `<li>${sanitizeSummaryHTML(item || '') || ''}</li>`).join('')}</ul>`;
        }

        function richHTMLToBulletArray(value) {
            const sanitized = sanitizeSummaryHTML(value || '');
            if (!sanitized) return [];

            const template = document.createElement('template');
            template.innerHTML = sanitized;

            const listItems = Array.from(template.content.querySelectorAll('li'))
                .map(item => item.innerHTML.trim())
                .filter(Boolean);
            if (listItems.length) return listItems;

            const paragraphs = Array.from(template.content.querySelectorAll('p'))
                .map(item => item.innerHTML.trim())
                .filter(Boolean);
            if (paragraphs.length) return paragraphs;

            const plain = getPlainTextFromHTML(sanitized);
            return plain ? [plain] : [];
        }

        function normalizeExperienceMerges() {
            if (!Array.isArray(cvData.experience)) {
                cvData.experience = [];
                return;
            }
            cvData.experience.forEach((exp, index) => {
                if (!exp || typeof exp !== 'object') cvData.experience[index] = {};
                if (!Array.isArray(cvData.experience[index].bullets)) cvData.experience[index].bullets = [];
                cvData.experience[index].mergedWithPrevious = !!cvData.experience[index].mergedWithPrevious && index > 0;
            });
        }

        function getSummaryPlainText() {
            if (summaryQuill) {
                return (summaryQuill.getText() || '').replace(/\s+/g, ' ').trim();
            }
            const fallback = document.getElementById('inp-summary');
            return (fallback?.value || '').replace(/\s+/g, ' ').trim();
        }

        function getSkillsPlainText() {
            if (skillsQuill) {
                return (skillsQuill.getText() || '').replace(/\s+/g, ' ').trim();
            }
            return getPlainTextFromHTML(document.getElementById('inp-skills')?.value || '');
        }

        function syncSummaryFromEditor() {
            const fallbackTextarea = document.getElementById('inp-summary');
            if (!fallbackTextarea) return;
            if (!summaryQuill) return;

            const sanitized = sanitizeSummaryHTML(summaryQuill.root.innerHTML);
            fallbackTextarea.value = sanitized;
            cvData.summary = sanitized;
        }

        function setSummaryEditorValue(value) {
            const fallbackTextarea = document.getElementById('inp-summary');
            if (fallbackTextarea) fallbackTextarea.value = value || '';

            if (!summaryQuill) return;
            isSyncingSummaryEditor = true;
            const safeHTML = sanitizeSummaryHTML(value || '');
            summaryQuill.clipboard.dangerouslyPasteHTML(safeHTML || '');
            isSyncingSummaryEditor = false;
            syncSummaryFromEditor();
        }

        function syncSkillsFromEditor() {
            const fallbackTextarea = document.getElementById('inp-skills');
            if (!fallbackTextarea) return;
            if (!skillsQuill) return;

            const sanitized = sanitizeSummaryHTML(skillsQuill.root.innerHTML);
            fallbackTextarea.value = sanitized;
            cvData.skills = sanitized;
        }

        function setSkillsEditorValue(value) {
            const fallbackTextarea = document.getElementById('inp-skills');
            if (fallbackTextarea) fallbackTextarea.value = value || '';

            if (!skillsQuill) return;
            isSyncingSkillsEditor = true;
            const safeHTML = sanitizeSummaryHTML(value || '');
            skillsQuill.clipboard.dangerouslyPasteHTML(safeHTML || '');
            isSyncingSkillsEditor = false;
            syncSkillsFromEditor();
        }

        function ensureCvDataShape() {
            if (!cvData || typeof cvData !== 'object') {
                cvData = {
                    personal: { name: "", tagline: "", contact: "", phone: "", email: "", linkedin: "", location: "", socialLinks: [] },
                    summary: "",
                    education: [],
                    experience: [],
                    projects: [],
                    certifications: [],
                    achievements: [],
                    interests: [],
                    leadership: [],
                    skills: "",
                    themeAccent: "",
                    customSections: [],
                    sectionOrder: [...BASE_SECTION_ORDER]
                };
            }
            if (!cvData.personal) cvData.personal = { name: "", tagline: "", contact: "", phone: "", email: "", linkedin: "", location: "", socialLinks: [] };
            if (!Array.isArray(cvData.personal.socialLinks)) cvData.personal.socialLinks = [];
            if (!Array.isArray(cvData.education)) cvData.education = [];
            if (!Array.isArray(cvData.experience)) cvData.experience = [];
            normalizeExperienceMerges();
            if (!Array.isArray(cvData.projects)) cvData.projects = [];
            if (!Array.isArray(cvData.certifications)) cvData.certifications = [];
            if (!Array.isArray(cvData.achievements)) cvData.achievements = [];
            if (!Array.isArray(cvData.interests)) cvData.interests = [];
            if (!Array.isArray(cvData.leadership)) cvData.leadership = [];
            if (!Array.isArray(cvData.customSections)) cvData.customSections = [];
            if (!Array.isArray(cvData.sectionOrder)) cvData.sectionOrder = [...BASE_SECTION_ORDER];
            if (typeof cvData.summary !== 'string') cvData.summary = cvData.summary ? String(cvData.summary) : '';
            if (typeof cvData.skills !== 'string') cvData.skills = cvData.skills ? String(cvData.skills) : '';
            if (typeof cvData.themeAccent !== 'string') cvData.themeAccent = '';
        }

        function getSelectedTemplateFile() {
            return document.getElementById('template-select')?.value || 'cv2.html';
        }

        function syncCurrentTemplateName() {
            const select = document.getElementById('template-select');
            const nameEl = document.getElementById('current-template-name');
            if (!select || !nameEl) return;
            const option = select.options[select.selectedIndex];
            if (option) nameEl.textContent = option.text;
        }

        function serializeState(state) {
            return JSON.stringify(state);
        }

        function toSafeFilename(base) {
            const clean = String(base || 'CV')
                .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
                .replace(/\s+/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_+|_+$/g, '');
            return clean || 'CV';
        }

        function getCurrentEditorState() {
            ensureCvDataShape();
            normalizeSectionOrder();
            return {
                cvData: JSON.parse(JSON.stringify(cvData)),
                templateFile: getSelectedTemplateFile()
            };
        }

        function initializeUndoRedoHistory() {
            const initial = getCurrentEditorState();
            undoStack = [initial];
            redoStack = [];
            lastUndoStateHash = serializeState(initial);
            updateUndoRedoControls();
        }

        function pushUndoStateFromCurrent() {
            if (isApplyingUndoRedo) return;
            const current = getCurrentEditorState();
            const hash = serializeState(current);
            if (hash === lastUndoStateHash) return;

            undoStack.push(current);
            if (undoStack.length > UNDO_LIMIT) undoStack.shift();
            redoStack = [];
            lastUndoStateHash = hash;
            updateUndoRedoControls();
        }

        function updateUndoRedoControls() {
            const undoButtons = document.querySelectorAll('[data-undo-control]');
            const redoButtons = document.querySelectorAll('[data-redo-control]');
            undoButtons.forEach(btn => {
                btn.disabled = undoStack.length <= 1;
            });
            redoButtons.forEach(btn => {
                btn.disabled = redoStack.length === 0;
            });
        }

        function applyStateToEditor(state) {
            if (!state) return;
            isApplyingUndoRedo = true;
            const preservedScrollTop = getEditorScrollTop();

            cvData = JSON.parse(JSON.stringify(state.cvData || {}));
            ensureCvDataShape();
            normalizeSectionOrder();

            const select = document.getElementById('template-select');
            const targetTemplate = state.templateFile || 'cv2.html';
            if (select) select.value = targetTemplate;
            syncCurrentTemplateName();

            renderEditor();
            updateProgress();
            setEditorScrollTop(preservedScrollTop);

            const frame = document.getElementById('cv-frame');
            if (frame && frame.getAttribute('src') !== targetTemplate) {
                const overlay = document.querySelector('.loading-overlay');
                if (overlay) overlay.classList.add('active');
                frame.src = targetTemplate;
                frame.onload = () => {
                    setTimeout(() => {
                        postToFrame({ skipHistory: true });
                        if (overlay) overlay.classList.remove('active');
                        isApplyingUndoRedo = false;
                        setEditorScrollTop(preservedScrollTop);
                    }, 250);
                };
            } else {
                postToFrame({ skipHistory: true });
                isApplyingUndoRedo = false;
                setEditorScrollTop(preservedScrollTop);
            }
        }

        function undoChange() {
            if (undoStack.length <= 1) return;

            const current = undoStack.pop();
            redoStack.push(current);

            const previous = undoStack[undoStack.length - 1];
            lastUndoStateHash = serializeState(previous);
            applyStateToEditor(previous);
            updateUndoRedoControls();
            showToast('Undid change');
        }

        function redoChange() {
            if (!redoStack.length) return;

            const next = redoStack.pop();
            undoStack.push(next);
            lastUndoStateHash = serializeState(next);
            applyStateToEditor(next);
            updateUndoRedoControls();
            showToast('Redid change');
        }

        function initUndoRedoShortcuts() {
            document.addEventListener('keydown', (event) => {
                const key = (event.key || '').toLowerCase();
                const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'z';
                const isRedo = (event.ctrlKey || event.metaKey) && (key === 'y' || (event.shiftKey && key === 'z'));
                if (!isUndo && !isRedo) return;

                const tag = (event.target?.tagName || '').toLowerCase();
                const isTextEditing = tag === 'input' || tag === 'textarea' || event.target?.isContentEditable;
                if (isTextEditing) return;

                event.preventDefault();
                if (isUndo) undoChange();
                if (isRedo) redoChange();
            });
        }

        // Tabs
        function switchTab(tab) {
            if (tab === 'reviewer') {
                if (typeof window.startReviewFromPreview === 'function') {
                    window.startReviewFromPreview();
                } else {
                    toggleReviewer(true);
                }
                return;
            }
            toggleReviewer(false);
            document.body.className = 'view-' + tab;
            document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
            // simple index check won't work with 3 items now, update manually
            if (tab === 'editor') document.querySelectorAll('.nav-tab')[0].classList.add('active');
            if (tab === 'preview') document.querySelectorAll('.nav-tab')[2].classList.add('active');

            if (tab === 'preview') postToFrame();
        }

        function toggleReviewer(show) {
            const overlay = document.getElementById('reviewer-overlay');
            if (show) overlay.classList.add('active');
            else overlay.classList.remove('active');
        }

        // Render Functions
        function renderEditor() {
            document.getElementById('inp-name').value = cvData.personal.name || '';
            document.getElementById('inp-tagline').value = cvData.personal.tagline || '';
            document.getElementById('inp-phone').value = cvData.personal.phone || '';
            document.getElementById('inp-email').value = cvData.personal.email || '';
            document.getElementById('inp-linkedin').value = cvData.personal.linkedin || '';
            document.getElementById('inp-location').value = cvData.personal.location || '';
            setSummaryEditorValue(cvData.summary || '');
            setSkillsEditorValue(cvData.skills || '');

            updateCharCounter('inp-summary', 'summary-counter', 500, getSummaryPlainText().length);
            updateCharCounter('inp-skills', 'skills-counter', 300, getSkillsPlainText().length);

            renderEduInputs();
            renderExpInputs();
            renderProjInputs();
            renderCertInputs();
            renderListInputs('achievements', 'ach-container', 'Achievement');
            renderListInputs('interests', 'int-container', 'Interest');
            renderListInputs('leadership', 'lead-container', 'Leadership Role');
            renderSkillChips();
            renderSocialLinks();
            renderCustomSectionEditors();
            renderSectionOrderEditor();
            initSectionInlineRichEditors();
        }

        function renderListInputs(key, containerId, placeholder) {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';
            (cvData[key] || []).forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.innerHTML = `
                    <div class="item-actions">
                        <div class="action-btn" onclick="moveListItem('${key}', ${index}, -1)">▲</div>
                        <div class="action-btn" onclick="moveListItem('${key}', ${index}, 1)">▼</div>
                        <div class="action-btn delete" onclick="removeListItem('${key}', ${index})">×</div>
                    </div>
                    <div class="form-group" style="margin-bottom:0">
                        <textarea class="form-control" style="min-height:60px" data-rich-list-key="${key}" data-rich-list-index="${index}" oninput="updateListItem('${key}', ${index}, this.value)" placeholder="${placeholder}">${item || ''}</textarea>
                    </div>
                `;
                container.appendChild(div);
            });
            initSectionInlineRichEditors();
        }

        function addListItem(key) {
            if (!cvData[key]) cvData[key] = [];
            cvData[key].push("");
            renderListInputs(key, (key === 'achievements' ? 'ach-container' : key === 'interests' ? 'int-container' : 'lead-container'), key);
            postToFrame();
        }

        function removeListItem(key, index) {
            cvData[key].splice(index, 1);
            renderListInputs(key, (key === 'achievements' ? 'ach-container' : key === 'interests' ? 'int-container' : 'lead-container'), key);
            postToFrame();
        }

        function updateListItem(key, index, value) {
            cvData[key][index] = value;
            postToFrame();
        }

        function moveListItem(key, index, direction) {
            const newIndex = index + direction;
            if (newIndex < 0 || newIndex >= cvData[key].length) return;
            const item = cvData[key].splice(index, 1)[0];
            cvData[key].splice(newIndex, 0, item);
            renderListInputs(key, (key === 'achievements' ? 'ach-container' : key === 'interests' ? 'int-container' : 'lead-container'), key);
            postToFrame();
        }

        function renderSkillChips() {
            const container = document.getElementById('skills-chips');
            container.innerHTML = CA_SKILLS.map(s =>
                `<span class="chip" onclick="addSkill('${s}')">+ ${s}</span>`
            ).join('');
        }

        function renderEduInputs() {
            const container = document.getElementById('edu-container');
            container.innerHTML = '';
            cvData.education.forEach((edu, index) => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.innerHTML = `
                    <div class="item-actions">
                        <div class="action-btn" onclick="moveEdu(${index}, -1)">▲</div>
                        <div class="action-btn" onclick="moveEdu(${index}, 1)">▼</div>
                        <div class="action-btn delete" onclick="removeEdu(${index})">×</div>
                    </div>
                    <div class="form-group">
                        <label>Degree / Exam</label>
                        <div class="chip-container" style="margin-bottom:6px">
                            ${CA_DEGREES.map(d => `<span class="chip" style="font-size:10px; padding:2px 8px;" onclick="updateEdu(${index}, 'degree', '${d}')">${d}</span>`).join('')}
                        </div>
                        <input class="form-control" value="${edu.degree || ''}" oninput="updateEdu(${index}, 'degree', this.value)" placeholder="e.g. CA Intermediate">
                    </div>
                    <div class="form-group">
                        <label>Institute / Board</label>
                        <input class="form-control" value="${edu.institute || ''}" oninput="updateEdu(${index}, 'institute', this.value)" placeholder="e.g. ICAI">
                    </div>
                    <div style="display:flex; gap:10px;">
                        <div class="form-group" style="flex:1">
                            <label>Year</label>
                            <input class="form-control" value="${edu.year || ''}" oninput="updateEdu(${index}, 'year', this.value)" placeholder="2023">
                        </div>
                        <div class="form-group" style="flex:1">
                            <label>Marks / Grade</label>
                            <input class="form-control" value="${edu.marks || ''}" oninput="updateEdu(${index}, 'marks', this.value)" placeholder="65%">
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom:0">
                        <label>Remarks</label>
                        <input class="form-control" value="${edu.remarks || ''}" oninput="updateEdu(${index}, 'remarks', this.value)" placeholder="Optional (e.g. AIR 50)">
                    </div>
                `;
                container.appendChild(div);
            });
        }

        function renderExpInputs() {
            const container = document.getElementById('exp-container');
            container.innerHTML = '';
            normalizeExperienceMerges();
            cvData.experience.forEach((exp, index) => {
                const div = document.createElement('div');
                div.className = 'list-item';
                const isMergedChild = !!exp.mergedWithPrevious;
                const canMergeWithPrevious = index > 0 && !isMergedChild;
                const mergeAction = isMergedChild
                    ? `unmergeExp(${index})`
                    : `mergeExpWithPrevious(${index})`;
                const mergeTitle = isMergedChild
                    ? 'Unmerge this stint'
                    : (canMergeWithPrevious ? 'Merge with previous stint' : 'First stint cannot merge backward');
                const mergeStyle = !isMergedChild && !canMergeWithPrevious ? 'opacity:.35;pointer-events:none;' : '';
                const mergeLabel = isMergedChild ? 'Unmerge' : 'Merge';
                div.innerHTML = `
                    <div class="item-actions">
                        <div class="action-btn" onclick="moveExp(${index}, -1)">&#9650;</div>
                        <div class="action-btn" onclick="moveExp(${index}, 1)">&#9660;</div>
                        <div class="action-btn merge-toggle ${isMergedChild ? 'active' : ''}" onclick="${mergeAction}" title="${mergeTitle}" style="${mergeStyle}">${mergeLabel}</div>
                        <div class="action-btn delete" onclick="removeExp(${index})">&times;</div>
                    </div>
                    ${isMergedChild ? `<div style="margin-bottom:8px; padding:8px 10px; border:1px solid #dbeafe; background:#eff6ff; border-radius:12px; color:#1d4ed8; font-size:12px;">This stint is merged with the experience above in preview and PDF.</div>` : ''}
                    <div class="form-group">
                        <label>Role</label>
                        <input class="form-control" value="${exp.role || ''}" oninput="updateExp(${index}, 'role', this.value)" placeholder="e.g. Articled Assistant">
                    </div>
                    <div class="form-group">
                        <label>Firm / Company</label>
                        <input class="form-control" value="${exp.company || ''}" oninput="updateExp(${index}, 'company', this.value)" placeholder="e.g. ABC & Associates">
                    </div>
                    <div class="form-group">
                        <label>Duration</label>
                        <input class="form-control" value="${exp.dates || ''}" oninput="updateExp(${index}, 'dates', this.value)" placeholder="e.g. Jan 2023 - Present">
                    </div>
                    <div class="form-group" data-section="category">
                        <label>Department / Category (optional)</label>
                        <input class="form-control" value="${exp.category || ''}" oninput="updateExp(${index}, 'category', this.value)" placeholder="e.g. Business Finance, Auditing & Assurance">
                    </div>
                    <div class="form-group" style="margin-bottom:0">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                            <label style="margin-bottom:0;">Key Responsibilities (Bullets)</label>
                            <button type="button" class="btn-mini" onclick="aiRefineExperience(${index})" title="AI refine these bullets">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 3l2.09 4.26L19 8l-3.5 3.4L16.18 17 12 14.8 7.82 17 9 11.4 5 8l4.91-.74L12 3z"></path>
                                </svg>
                                AI refine
                            </button>
                        </div>
                        <div class="chip-container" style="margin-bottom:6px">
                            ${AUDIT_VERBS.map(v => `<span class="chip" style="font-size:10px; padding:2px 8px;" onclick="appendBullet(${index}, '${v} ')">${v}</span>`).join('')}
                        </div>
                        <textarea id="exp-bullets-${index}" class="form-control" data-rich-exp-index="${index}" oninput="updateExp(${index}, 'bullets', this.value)" placeholder="Add bullet points with formatting">${bulletsToRichHTML(exp.bullets || [])}</textarea>
                    </div>
                `;
                container.appendChild(div);
            });
            initSectionInlineRichEditors();
        }

        function renderProjInputs() {
            const container = document.getElementById('proj-container');
            if (!container) return;
            container.innerHTML = '';
            (cvData.projects || []).forEach((proj, index) => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.innerHTML = `
                    <div class="item-actions">
                        <div class="action-btn" onclick="moveProj(${index}, -1)">▲</div>
                        <div class="action-btn" onclick="moveProj(${index}, 1)">▼</div>
                        <div class="action-btn delete" onclick="removeProj(${index})">×</div>
                    </div>
                    <div class="form-group">
                        <label>Project Title</label>
                        <input class="form-control" value="${proj.title || ''}" oninput="updateProj(${index}, 'title', this.value)" placeholder="e.g. Parag Milk Foods Ltd">
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <input class="form-control" value="${proj.description || ''}" oninput="updateProj(${index}, 'description', this.value)" placeholder="e.g. Valued a leading dairy company">
                    </div>
                    <div class="form-group" style="margin-bottom:0">
                        <label>Key Points (Bullets)</label>
                        <textarea id="proj-bullets-${index}" class="form-control" data-rich-proj-index="${index}" oninput="updateProj(${index}, 'bullets', this.value)" placeholder="Add bullet points with formatting">${bulletsToRichHTML(proj.bullets || [])}</textarea>
                    </div>
                `;
                container.appendChild(div);
            });
            initSectionInlineRichEditors();
        }

        function renderCertInputs() {
            const container = document.getElementById('cert-container');
            container.innerHTML = '';
            (cvData.certifications || []).forEach((cert, index) => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.innerHTML = `
                    <div class="item-actions">
                        <div class="action-btn delete" onclick="removeCert(${index})">×</div>
                    </div>
                    <div class="form-group">
                        <label>Certification Name/ Bullet Point</label>
                        <input class="form-control" value="${cert.name || ''}" oninput="updateCert(${index}, 'name', this.value)" placeholder="e.g. Power BI Course/Cleared CFA Level 1 in first attempt ">
                    </div>
                    <div class="form-group" style="margin-bottom:0">
                        <label>Issuer / Date (optional)</label>
                        <input class="form-control" value="${cert.issuer || ''}" oninput="updateCert(${index}, 'issuer', this.value)" placeholder="e.g. CFI/2024">
                    </div>
                `;
                container.appendChild(div);
            });
        }

        // Data Updates
        function updateCV() {
            cvData.personal.name = document.getElementById('inp-name').value;
            cvData.personal.tagline = document.getElementById('inp-tagline').value;
            // Keep legacy free-text contact blank now that separate fields are the source of truth.
            cvData.personal.contact = '';
            cvData.personal.phone = document.getElementById('inp-phone').value;
            cvData.personal.email = document.getElementById('inp-email').value;
            cvData.personal.linkedin = document.getElementById('inp-linkedin').value;
            cvData.personal.location = document.getElementById('inp-location').value;
            if (summaryQuill) {
                syncSummaryFromEditor();
            } else {
                const rawSummary = document.getElementById('inp-summary').value;
                cvData.summary = sanitizeSummaryHTML(rawSummary);
                document.getElementById('inp-summary').value = cvData.summary;
            }
            if (skillsQuill) {
                syncSkillsFromEditor();
            } else {
                const rawSkills = document.getElementById('inp-skills').value;
                cvData.skills = sanitizeSummaryHTML(rawSkills);
                document.getElementById('inp-skills').value = cvData.skills;
            }

            updateCharCounter('inp-summary', 'summary-counter', 500, getSummaryPlainText().length);
            updateCharCounter('inp-skills', 'skills-counter', 300, getSkillsPlainText().length);

            postToFrame();
            updateProgress();
        }

        function updateEdu(index, field, value) {
            cvData.education[index][field] = value;
            postToFrame();
            if (document.activeElement.tagName !== 'INPUT') renderEduInputs(); // Re-render only if clicked chip
        }

        function updateExp(index, field, value) {
            if (field === 'bullets') {
                cvData.experience[index].bullets = richHTMLToBulletArray(value);
            } else if (field === 'mergedWithPrevious') {
                cvData.experience[index].mergedWithPrevious = !!value && index > 0;
            } else {
                cvData.experience[index][field] = value;
            }
            normalizeExperienceMerges();
            postToFrame();
        }

        function appendBullet(index, text) {
            if (!cvData.experience[index]) return;
            if (!Array.isArray(cvData.experience[index].bullets)) cvData.experience[index].bullets = [];
            cvData.experience[index].bullets.push(sanitizeSummaryHTML(text));
            renderExpInputs();
            postToFrame();
        }

        function updateCert(index, field, value) {
            cvData.certifications[index][field] = value;
            postToFrame();
        }

        function addSkill(skill) {
            const currentText = getSkillsPlainText();
            if (currentText.toLowerCase().includes(skill.toLowerCase())) return showToast("Already added");
            const nextText = currentText ? `${currentText}, ${skill}` : skill;
            setSkillsEditorValue(nextText);
            updateCV();
        }

        // List Management
        function addEducation() {
            cvData.education.push({ degree: "", institute: "", year: "", marks: "" });
            renderEduInputs();
            postToFrame();
        }
        function removeEdu(i) {
            if (confirm("Delete entry?")) { cvData.education.splice(i, 1); renderEduInputs(); postToFrame(); }
        }
        function moveEdu(i, dir) {
            if (i + dir < 0 || i + dir >= cvData.education.length) return;
            [cvData.education[i], cvData.education[i + dir]] = [cvData.education[i + dir], cvData.education[i]];
            renderEduInputs(); postToFrame();
        }

        function addExperience() {
            cvData.experience.push({ role: "", company: "", dates: "", category: "", bullets: [], mergedWithPrevious: false });
            normalizeExperienceMerges();
            renderExpInputs();
            postToFrame();
        }
        function removeExp(i) {
            if (confirm("Delete entry?")) { cvData.experience.splice(i, 1); normalizeExperienceMerges(); renderExpInputs(); postToFrame(); }
        }
        function moveExp(i, dir) {
            if (i + dir < 0 || i + dir >= cvData.experience.length) return;
            [cvData.experience[i], cvData.experience[i + dir]] = [cvData.experience[i + dir], cvData.experience[i]];
            normalizeExperienceMerges();
            renderExpInputs(); postToFrame();
        }
        function mergeExpWithPrevious(i) {
            if (i <= 0 || !cvData.experience[i]) return;
            cvData.experience[i].mergedWithPrevious = true;
            normalizeExperienceMerges();
            renderExpInputs();
            postToFrame();
        }
        function unmergeExp(i) {
            if (i <= 0 || !cvData.experience[i]) return;
            cvData.experience[i].mergedWithPrevious = false;
            normalizeExperienceMerges();
            renderExpInputs();
            postToFrame();
        }

        // Social Links Management
        function renderSocialLinks() {
            const container = document.getElementById('social-links-container');
            if (!container) return;
            container.innerHTML = '';
            
            const links = cvData.personal.socialLinks || [];
            links.forEach((link, index) => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.style.display = 'flex';
                div.style.gap = '5px';
                div.style.alignItems = 'center';
                div.innerHTML = `
                    <div style="flex:1">
                        <input type="text" class="form-control" placeholder="URL (e.g. linkedin.com/in/user)" 
                            value="${link.url || ''}" oninput="updateSocialLink(${index}, 'url', this.value)" style="margin-bottom:2px">
                        <input type="text" class="form-control" placeholder="Label (Optional, e.g. LinkedIn)" 
                            value="${link.label || ''}" oninput="updateSocialLink(${index}, 'label', this.value)">
                    </div>
                    <div class="action-btn delete" onclick="removeSocialLink(${index})" style="height:auto; align-self:stretch; display:flex; align-items:center;">×</div>
                `;
                container.appendChild(div);
            });
        }

        function addSocialLink() {
            if (!cvData.personal.socialLinks) cvData.personal.socialLinks = [];
            cvData.personal.socialLinks.push({ url: "", label: "" });
            renderSocialLinks();
            postToFrame();
        }

        function removeSocialLink(index) {
            cvData.personal.socialLinks.splice(index, 1);
            renderSocialLinks();
            postToFrame();
        }

        function updateSocialLink(index, field, value) {
            if (!cvData.personal.socialLinks[index]) return;
            cvData.personal.socialLinks[index][field] = value;
            postToFrame();
        }

        function addProject() {
            if (!cvData.projects) cvData.projects = [];
            cvData.projects.push({ title: "", description: "", bullets: [] });
            renderProjInputs();
            postToFrame();
        }
        function removeProj(i) {
            if (confirm("Delete project?")) { cvData.projects.splice(i, 1); renderProjInputs(); postToFrame(); }
        }
        function moveProj(i, dir) {
            if (i + dir < 0 || i + dir >= cvData.projects.length) return;
            [cvData.projects[i], cvData.projects[i + dir]] = [cvData.projects[i + dir], cvData.projects[i]];
            renderProjInputs(); postToFrame();
        }
        function updateProj(index, field, value) {
            if (field === 'bullets') {
                cvData.projects[index].bullets = richHTMLToBulletArray(value);
            } else {
                cvData.projects[index][field] = value;
            }
            postToFrame();
        }
        function addCertification() {
            cvData.certifications.push({ name: "", issuer: "" });
            renderCertInputs();
            postToFrame();
        }
        function removeCert(i) {
            if (confirm("Delete?")) { cvData.certifications.splice(i, 1); renderCertInputs(); postToFrame(); }
        }

        function addCustomSection() {
            if (!cvData.customSections) cvData.customSections = [];
            cvData.customSections.push({
                id: 'custom_' + Date.now(),
                title: 'Custom Section',
                items: ['']
            });
            normalizeSectionOrder();
            renderCustomSectionEditors();
            renderSectionOrderEditor();
            postToFrame();
            saveLocal();
        }

        function removeCustomSection(id) {
            cvData.customSections = (cvData.customSections || []).filter(section => section.id !== id);
            normalizeSectionOrder();
            renderCustomSectionEditors();
            renderSectionOrderEditor();
            postToFrame();
            saveLocal();
        }

        function updateCustomSectionTitle(id, value) {
            const section = (cvData.customSections || []).find(item => item.id === id);
            if (!section) return;
            section.title = value;
            renderSectionOrderEditor();
            postToFrame();
            saveLocal();
        }

        function addCustomSectionItem(id) {
            const section = (cvData.customSections || []).find(item => item.id === id);
            if (!section) return;
            section.items.push('');
            renderCustomSectionEditors();
            postToFrame();
            saveLocal();
        }

        function removeCustomSectionItem(id, index) {
            const section = (cvData.customSections || []).find(item => item.id === id);
            if (!section) return;
            section.items.splice(index, 1);
            if (section.items.length === 0) section.items.push('');
            renderCustomSectionEditors();
            postToFrame();
            saveLocal();
        }

        function updateCustomSectionItem(id, index, value) {
            const section = (cvData.customSections || []).find(item => item.id === id);
            if (!section) return;
            section.items[index] = value;
            postToFrame();
            saveLocal();
        }

        function renderCustomSectionEditors() {
            const area = document.getElementById('custom-sections-area');
            if (!area) return;
            area.innerHTML = '';
            (cvData.customSections || []).forEach((section) => {
                const details = document.createElement('details');
                details.open = true;
                details.setAttribute('data-section', section.id || '');
                details.innerHTML = `
                    <summary>${section.title || 'Custom Section'}</summary>
                    <div class="section-body">
                        <div class="form-group">
                            <label>Section Title</label>
                            <input type="text" class="form-control" value="${section.title || ''}"
                                oninput="updateCustomSectionTitle('${section.id}', this.value)"
                                placeholder="e.g. Languages, Volunteering">
                        </div>
                        <div>
                            ${(section.items || []).map((item, index) => `
                                <div class="list-item">
                                    <div class="item-actions">
                                        <div class="action-btn delete" onclick="removeCustomSectionItem('${section.id}', ${index})">×</div>
                                    </div>
                                    <div class="form-group" style="margin-bottom:0">
                                        <textarea class="form-control" style="min-height:60px" data-rich-custom-id="${section.id}" data-rich-custom-index="${index}"
                                            oninput="updateCustomSectionItem('${section.id}', ${index}, this.value)"
                                            placeholder="One bullet per line or short item">${item || ''}</textarea>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <button class="btn-dashed" onclick="addCustomSectionItem('${section.id}')">
                            + Add Item
                        </button>
                        <button class="btn-dashed" style="color:#ef4444; border-color:#fecaca; margin-top:6px;"
                            onclick="removeCustomSection('${section.id}')">
                            Delete Section
                        </button>
                    </div>
                `;
                area.appendChild(details);
            });
            initSectionInlineRichEditors();
        }

        function normalizeSectionOrder() {
            const current = Array.isArray(cvData.sectionOrder) ? cvData.sectionOrder : [];
            const customIds = (cvData.customSections || []).map(section => section.id).filter(Boolean);
            const allowed = [...BASE_SECTION_ORDER, ...customIds];

            const normalized = [];
            current.forEach(id => {
                if (allowed.includes(id) && !normalized.includes(id)) normalized.push(id);
            });
            allowed.forEach(id => {
                if (!normalized.includes(id)) normalized.push(id);
            });

            cvData.sectionOrder = normalized;
        }

        function getSectionLabel(sectionId) {
            if (SECTION_LABELS[sectionId]) return SECTION_LABELS[sectionId];
            const customSection = (cvData.customSections || []).find(section => section.id === sectionId);
            if (customSection) return customSection.title || 'Custom Section';
            return sectionId;
        }

        function moveSectionOrder(index, direction) {
            normalizeSectionOrder();
            const nextIndex = index + direction;
            if (nextIndex < 0 || nextIndex >= cvData.sectionOrder.length) return;

            const [item] = cvData.sectionOrder.splice(index, 1);
            cvData.sectionOrder.splice(nextIndex, 0, item);
            renderSectionOrderEditor();
            postToFrame();
            saveLocal();
        }

        function moveSectionById(sectionId, direction) {
            normalizeSectionOrder();
            const index = cvData.sectionOrder.indexOf(sectionId);
            if (index < 0) return;
            const nextIndex = index + direction;
            if (nextIndex < 0 || nextIndex >= cvData.sectionOrder.length) return;

            const [item] = cvData.sectionOrder.splice(index, 1);
            cvData.sectionOrder.splice(nextIndex, 0, item);
            renderSectionOrderEditor();
            postToFrame();
            saveLocal();
        }

        function resetSectionOrder() {
            cvData.sectionOrder = [...BASE_SECTION_ORDER, ...(cvData.customSections || []).map(section => section.id).filter(Boolean)];
            normalizeSectionOrder();
            renderSectionOrderEditor();
            postToFrame();
            saveLocal();
        }

        function reorderSectionByDrop(draggedId, targetId, placeAfter) {
            normalizeSectionOrder();
            if (!draggedId || !targetId || draggedId === targetId) return;

            const draggedIndex = cvData.sectionOrder.indexOf(draggedId);
            const targetIndex = cvData.sectionOrder.indexOf(targetId);
            if (draggedIndex < 0 || targetIndex < 0) return;

            const [item] = cvData.sectionOrder.splice(draggedIndex, 1);
            let insertIndex = targetIndex;
            if (placeAfter) insertIndex = targetIndex + (draggedIndex > targetIndex ? 1 : 0);
            else insertIndex = targetIndex - (draggedIndex < targetIndex ? 1 : 0);
            cvData.sectionOrder.splice(Math.max(0, insertIndex), 0, item);

            renderSectionOrderEditor();
            postToFrame();
            saveLocal();
        }

        function toggleReorderDrawer(show) {
            const drawer = document.getElementById('reorder-drawer');
            const overlay = document.getElementById('reorder-overlay');
            if (!drawer || !overlay) return;

            if (show) {
                drawer.classList.add('open');
                overlay.classList.add('open');
                renderSectionOrderEditor();
            } else {
                drawer.classList.remove('open');
                overlay.classList.remove('open');
            }
        }

        function renderReorderDrawer() {
            const list = document.getElementById('reorder-drawer-list');
            if (!list) return;

            normalizeSectionOrder();
            list.innerHTML = '';
            cvData.sectionOrder.forEach((sectionId, index) => {
                const row = document.createElement('div');
                row.className = 'reorder-item';
                row.draggable = true;
                row.setAttribute('data-section-id', sectionId);
                row.innerHTML = `
                    <span class="reorder-item-handle">::</span>
                    <span class="reorder-item-label">${getSectionLabel(sectionId)}</span>
                    <span class="reorder-mini-actions">
                        <button class="reorder-mini-btn" onclick="moveSectionOrder(${index}, -1)" ${index > 0 ? '' : 'disabled'} title="Move Up">&#9650;</button>
                        <button class="reorder-mini-btn" onclick="moveSectionOrder(${index}, 1)" ${index < cvData.sectionOrder.length - 1 ? '' : 'disabled'} title="Move Down">&#9660;</button>
                    </span>
                `;

                row.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', sectionId);
                });
                row.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    row.classList.add('drag-over');
                });
                row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
                row.addEventListener('drop', (e) => {
                    e.preventDefault();
                    row.classList.remove('drag-over');
                    const draggedId = e.dataTransfer.getData('text/plain');
                    const rect = row.getBoundingClientRect();
                    const placeAfter = e.clientY > (rect.top + rect.height / 2);
                    reorderSectionByDrop(draggedId, sectionId, placeAfter);
                });

                list.appendChild(row);
            });
        }

        // Override legacy list-only renderer: support optional form list + preview drawer.
        function renderInlineSectionReorderControls() {
            normalizeSectionOrder();
            document.querySelectorAll('.editor-content details[data-section]').forEach((details) => {
                const sectionId = details.getAttribute('data-section');
                if (!sectionId || sectionId === 'section-order') return;

                const summary = details.querySelector(':scope > summary');
                if (!summary) return;

                summary.style.display = 'flex';
                summary.style.alignItems = 'center';
                summary.style.gap = '8px';

                let controls = summary.querySelector('.section-reorder-controls');
                if (!controls) {
                    controls = document.createElement('span');
                    controls.className = 'section-reorder-controls';
                    controls.style.marginLeft = 'auto';
                    controls.style.display = 'inline-flex';
                    controls.style.gap = '4px';
                    summary.appendChild(controls);
                }

                const index = cvData.sectionOrder.indexOf(sectionId);
                const canMoveUp = index > 0;
                const canMoveDown = index >= 0 && index < cvData.sectionOrder.length - 1;

                controls.innerHTML = `
                    <button type="button" class="action-btn" onclick="event.stopPropagation(); moveSectionById('${sectionId}', -1)" ${canMoveUp ? '' : 'disabled'} title="Move Up">&#9650;</button>
                    <button type="button" class="action-btn" onclick="event.stopPropagation(); moveSectionById('${sectionId}', 1)" ${canMoveDown ? '' : 'disabled'} title="Move Down">&#9660;</button>
                `;
            });
        }

        function renderSectionOrderEditor() {
            const list = document.getElementById('section-order-list');
            normalizeSectionOrder();

            if (list) {
                list.innerHTML = '';
                cvData.sectionOrder.forEach((sectionId, index) => {
                    const row = document.createElement('div');
                    row.className = 'list-item';
                    row.innerHTML = `
                        <div class="item-actions">
                            <div class="action-btn" onclick="moveSectionOrder(${index}, -1)">&#9650;</div>
                            <div class="action-btn" onclick="moveSectionOrder(${index}, 1)">&#9660;</div>
                        </div>
                        <div class="form-group" style="margin-bottom:0">
                            <label style="margin-bottom:0">${getSectionLabel(sectionId)}</label>
                        </div>
                    `;
                    list.appendChild(row);
                });
            }

            renderInlineSectionReorderControls();
            renderReorderDrawer();
        }

        function prefillCAEducation(e) {
            e.stopPropagation();
            if (confirm("Replace current education with CA path?")) {
                cvData.education = [
                    { degree: "CA Final", institute: "ICAI", year: "", marks: "", remarks: "" },
                    { degree: "CA Intermediate", institute: "ICAI", year: "", marks: "", remarks: "Both Groups" },
                    { degree: "B.Com", institute: "", year: "", marks: "", remarks: "" },
                    { degree: "Class XII", institute: "CBSE", year: "", marks: "", remarks: "" }
                ];
                renderEduInputs(); updateCV();
            }
        }

        // Core Utilities
        /**
         * Converts plain text contact info into versatile HTML links
         * Handles emails, LinkedIn/GitHub/naked domains, and phone numbers with '+'
         */
        function autoLink(text) {
            if (!text) return '';
            // Escape HTML but allow our generated tags later
            let escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            // 1. URLs (including naked professional domains like linkedin.com/in/...)
            // Matches http, https, www, or specific professional domains
            const urlRegex = /\b((?:https?:\/\/|www\.)[^\s<>]+|(?:\w+\.)?(?:linkedin\.com|github\.com|twitter\.com|x\.com|behance\.net|dribbble\.com|medium\.com|portfolio\.me|bit\.ly)[^\s<>]*)\b/gi;
            escaped = escaped.replace(urlRegex, (m) => {
                let href = m;
                if (!/^https?:\/\//i.test(m)) {
                    href = 'https://' + (m.startsWith('www.') ? m : m);
                }
                
                // Clean display text: Remove protocol, www, and trailing slash
                let display = m.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
                if (display.endsWith('/')) display = display.slice(0, -1);
                
                return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; color:#2563eb; border-bottom:1px solid rgba(37,99,235,0.45); padding-bottom:1px; font-weight:500;">${display}</a>`;
            });

            // 2. Emails
            const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
            escaped = escaped.replace(emailRegex, (m) => `<a href="mailto:${m}" style="text-decoration:none; color:#2563eb; border-bottom:1px solid rgba(37,99,235,0.45); padding-bottom:1px; font-weight:500;">${m}</a>`);

            // 3. Phone numbers (Handles + prefix, spaces, dashes, parentheses)
            // Simplified to look for international or standard domestic patterns
            const phoneRegex = /(?:\+|00)?(?:\d[ \-\(\)\.]{0,2}){8,}\d/g;
            escaped = escaped.replace(phoneRegex, (m) => {
                const clean = m.replace(/[^\d+]/g, '');
                if (clean.length < 8 || clean.length > 16) return m; // Likely not a phone number if too short/long
                return `<a href="tel:${clean}" style="text-decoration:none; color:#2563eb; border-bottom:1px solid rgba(37,99,235,0.45); padding-bottom:1px; font-weight:500;">${m}</a>`;
            });

            return escaped;
        }

        // Template Sidebar Logic
        const TEMPLATES = [
            { file: 'cv2.html', name: 'Classic Blue', accent: '#1e40af', style: 'sans' },
            { file: 'cv1.html', name: 'Modern Serif', accent: '#4f81bc', style: 'serif' },
            { file: 'cv3.html', name: 'Grid Layout', accent: '#059669', style: 'grid' },
            { file: 'cv4.html', name: 'Professional', accent: '#374151', style: 'clean' },
            { file: 'cv5.html', name: 'Corporate', accent: '#0369a1', style: 'formal' },
            { file: 'cv6.html', name: 'Minimalist', accent: '#6b7280', style: 'minimal' },
            { file: 'cv7.html', name: 'Compact', accent: '#7c3aed', style: 'dense' },
            { file: 'cv8.html', name: 'Bold Modern', accent: '#dc2626', style: 'bold' },
            { file: 'cv9.html', name: 'Executive', accent: '#064e3b', style: 'exec' },
            { file: 'cv10.html', name: 'Classic Refined', accent: '#2F557F', style: 'refined' },
            { file: 'cv11.html', name: 'Modern Deep Blue', accent: '#2c5d79', style: 'deepblue' },
            { file: 'cv12.html', name: 'Executive Dark', accent: '#404040', style: 'dark' },
            { file: 'cv13.html', name: 'Classic Professional', accent: '#104e70', style: 'formal' }
        ];
        const TEMPLATE_COLOR_PRESETS = ['#2b2b2b', '#0f6cbd', '#155e95', '#1f8f63', '#c0392b', '#7b4db3'];

        function normalizeHexColor(value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            const withHash = raw.startsWith('#') ? raw : `#${raw}`;
            const shortMatch = /^#([0-9a-fA-F]{3})$/.exec(withHash);
            if (shortMatch) {
                return `#${shortMatch[1].split('').map(ch => ch + ch).join('')}`.toUpperCase();
            }
            const fullMatch = /^#([0-9a-fA-F]{6})$/.exec(withHash);
            return fullMatch ? `#${fullMatch[1].toUpperCase()}` : '';
        }

        function getThemeAccent() {
            return normalizeHexColor(cvData.themeAccent || '');
        }

        function renderThemeControls() {
            const swatchHost = document.getElementById('template-theme-swatches');
            const picker = document.getElementById('theme-accent-picker');
            const text = document.getElementById('theme-accent-value');
            const chip = document.getElementById('theme-accent-chip');
            if (!swatchHost || !picker || !text) return;

            const active = getThemeAccent();
            swatchHost.innerHTML = TEMPLATE_COLOR_PRESETS.map(color => `
                <button type="button" class="template-theme-swatch ${active === color.toUpperCase() ? 'active' : ''}" style="background:${color}" title="${color}" onclick="updateThemeAccent('${color}')"></button>
            `).join('');

            const fallbackColor = active || '#2F557F';
            picker.value = fallbackColor;
            text.value = active;
            if (chip) {
                chip.style.color = active || '#64748b';
                chip.style.borderColor = active ? `${active}33` : '#dbe3ef';
                chip.style.background = active ? `${active}14` : '#ffffff';
            }
        }

        function updateThemeAccent(value) {
            const normalized = normalizeHexColor(value);
            if (!normalized) return;
            cvData.themeAccent = normalized;
            renderThemeControls();
            postToFrame();
            renderTemplateCards();
        }

        function updateThemeAccentFromText(value) {
            const normalized = normalizeHexColor(value);
            const text = document.getElementById('theme-accent-value');
            if (text) text.value = value;
            if (!normalized) return;
            updateThemeAccent(normalized);
        }

        function resetThemeAccent() {
            cvData.themeAccent = '';
            renderThemeControls();
            postToFrame();
            renderTemplateCards();
        }

        function toggleTemplateSidebar(show) {
            const sidebar = document.getElementById('template-sidebar');
            const overlay = document.getElementById('template-sidebar-overlay');
            if (show) {
                sidebar.classList.add('open');
                overlay.classList.add('open');
                renderThemeControls();
                renderTemplateCards();
            } else {
                sidebar.classList.remove('open');
                overlay.classList.remove('open');
            }
        }

        function renderTemplateCards() {
            const grid = document.getElementById('template-grid');
            const currentTemplate = document.getElementById('template-select').value;
            
            grid.innerHTML = TEMPLATES.map(t => `
                <div class="template-card ${t.file === currentTemplate ? 'active' : ''}" onclick="selectTemplate('${t.file}', '${t.name}')">
                    <div class="template-card-preview">
                        <iframe data-src="${t.file}" data-template="${t.file}"></iframe>
                        <div class="template-loading" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:12px;color:#9ca3af;">Loading...</div>
                    </div>
                    <div class="template-card-name">${t.name}</div>
                </div>
            `).join('');
            
            // Initialize lazy loading after rendering
            initLazyLoading();
        }

        function initLazyLoading() {
            const grid = document.getElementById('template-grid');
            const iframes = grid.querySelectorAll('iframe[data-src]');
            
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const iframe = entry.target;
                        if (!iframe.src && iframe.dataset.src) {
                            iframe.src = iframe.dataset.src;
                            iframe.onload = function() {
                                injectPreviewData(this);
                                // Hide loading text
                                const loadingEl = this.parentElement.querySelector('.template-loading');
                                if (loadingEl) loadingEl.style.display = 'none';
                            };
                        }
                        observer.unobserve(iframe);
                    }
                });
            }, {
                root: grid,
                rootMargin: '100px', // Pre-load slightly before visible
                threshold: 0.1
            });
            
            iframes.forEach(iframe => observer.observe(iframe));
        }

        function hasContentInList(list) {
            return (list || []).some(item => {
                if (typeof item === 'string') return !!item.trim();
                if (item && typeof item === 'object') {
                    return Object.values(item).some(value => typeof value === 'string' ? !!value.trim() : !!value);
                }
                return !!item;
            });
        }

        function hasUserEnteredData(data) {
            if (!data) return false;
            const p = data.personal || {};
            if ((p.name || '').trim()) return true;
            if ((p.tagline || '').trim()) return true;
            if ((p.contact || '').trim()) return true;
            if ((p.phone || '').trim()) return true;
            if ((p.email || '').trim()) return true;
            if ((p.linkedin || '').trim()) return true;
            if (Array.isArray(p.socialLinks) && p.socialLinks.some(link => (link.url || '').trim() || (link.label || '').trim())) return true;
            if (getPlainTextFromHTML(data.summary || '').trim()) return true;
            if ((data.skills || '').trim()) return true;
            if (hasContentInList(data.education)) return true;
            if (hasContentInList(data.experience)) return true;
            if (hasContentInList(data.projects)) return true;
            if (hasContentInList(data.certifications)) return true;
            if (hasContentInList(data.achievements)) return true;
            if (hasContentInList(data.interests)) return true;
            if (hasContentInList(data.leadership)) return true;
            if (Array.isArray(data.customSections) && data.customSections.some(s => (s.title || '').trim() || hasContentInList(s.items))) return true;
            return false;
        }

        function applyFormattedContact(payload) {
            let contactParts = [];
            const SEP = '<span class="contact-sep" style="margin: 0 4px; color: inherit;"> | </span>';

            if (payload.personal.phone) contactParts.push(autoLink(payload.personal.phone));
            if (payload.personal.email) contactParts.push(autoLink(payload.personal.email));
            if (payload.personal.linkedin) contactParts.push(autoLink(payload.personal.linkedin));
            if (payload.personal.location) contactParts.push(autoLink(payload.personal.location));

            if (Array.isArray(payload.personal.socialLinks)) {
                payload.personal.socialLinks.forEach(link => {
                    if (link.url) {
                        if (link.label) {
                            let href = link.url;
                            if (!/^https?:\/\//i.test(href)) href = 'https://' + (href.startsWith('www.') ? href : href);
                            contactParts.push(`<a href="${href}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; color:#2563eb; border-bottom:1px solid rgba(37,99,235,0.45); padding-bottom:1px; font-weight:500;">${link.label}</a>`);
                        } else {
                            contactParts.push(autoLink(link.url));
                        }
                    }
                });
            }

            if (payload.personal.contact) {
                const existingValues = [payload.personal.phone, payload.personal.email, payload.personal.linkedin, payload.personal.location]
                    .filter(Boolean).map(v => v.toLowerCase().trim());

                payload.personal.contact.split(/\|/).forEach(part => {
                    const trimmedPart = part.trim();
                    const lowerPart = trimmedPart.toLowerCase();
                    const isDuplicate = existingValues.some(existing =>
                        lowerPart.includes(existing) || existing.includes(lowerPart)
                    );
                    if (!isDuplicate && trimmedPart) contactParts.push(autoLink(trimmedPart));
                });
            }

            payload.personal.contact = contactParts.join(SEP);
        }

        function buildPreviewPayload(options = {}) {
            const useDemoFallback = !!options.useDemoFallback;
            normalizeSectionOrder();
            const source = (useDemoFallback && !hasUserEnteredData(cvData)) ? DEMO_PREVIEW_DATA : cvData;
            const payload = JSON.parse(JSON.stringify(source));
            if (!payload.sectionOrder || !payload.sectionOrder.length) payload.sectionOrder = [...BASE_SECTION_ORDER];
            if (!payload.personal) payload.personal = { name: "", tagline: "", contact: "", phone: "", email: "", linkedin: "", location: "", socialLinks: [] };
            if (!payload.personal.socialLinks) payload.personal.socialLinks = [];
            payload.themeAccent = normalizeHexColor(payload.themeAccent || cvData.themeAccent || '');
            applyFormattedContact(payload);
            return payload;
        }

        function injectPreviewData(iframe) {
            try {
                if (iframe.contentWindow) {
                    const payload = buildPreviewPayload({ useDemoFallback: true });
                    iframe.contentWindow.postMessage({ type: 'update-cv', payload }, '*');
                }
            } catch (e) {
                // Silently fail for cross-origin issues
            }
        }

        function selectTemplate(file, name) {
            const select = document.getElementById('template-select');
            const nameSpan = document.getElementById('current-template-name');
            
            select.value = file;
            if (nameSpan) nameSpan.textContent = name;
            
            changeTemplate();
            toggleTemplateSidebar(false);
        }

        function postToFrame(options = {}) {
            const skipHistory = !!options.skipHistory;
            const skipSave = !!options.skipSave;
            const frame = document.getElementById('cv-frame');
            if (frame && frame.contentWindow) {
                try {
                    const payload = buildPreviewPayload({ useDemoFallback: false });
                    frame.contentWindow.postMessage({ type: 'update-cv', payload }, '*');
                } catch (e) {
                    console.error('postToFrame error:', e);
                }
            }
            if (!skipSave) saveLocal();
            if (!skipHistory) pushUndoStateFromCurrent();
            updateUndoRedoControls();
        }

        function changeTemplate(options = {}) {
            const select = document.getElementById('template-select');
            const frame = document.getElementById('cv-frame');
            const skipHistory = !!options.skipHistory;

            document.querySelector('.loading-overlay').classList.add('active');
            frame.src = select.value;
            syncCurrentTemplateName();
            frame.onload = () => {
                setTimeout(() => {
                    postToFrame({ skipHistory });
                    document.querySelector('.loading-overlay').classList.remove('active');
                }, 400);
            };
        }

        function updateProgress() {
            let filled = 0, total = 7;
            if (cvData.personal.name) filled++;
            if ((cvData.personal.phone || '').trim() || (cvData.personal.email || '').trim() || (cvData.personal.linkedin || '').trim() || (cvData.personal.location || '').trim() || (cvData.personal.socialLinks || []).some(link => (link?.url || '').trim())) filled++;
            if (getPlainTextFromHTML(cvData.summary || '')) filled++;
            if (getPlainTextFromHTML(cvData.skills || '')) filled++;
            if (cvData.education.length) filled += 1.5;
            if (cvData.experience.length) filled += 1.5;
            const pct = Math.min((filled / total) * 100, 100);
            document.getElementById('progress-fill').style.width = pct + '%';
            const percentEl = document.getElementById('progress-percent');
            if (percentEl) percentEl.textContent = `${Math.round(pct)}%`;
        }

        function updateCharCounter(fieldId, counterId, max, explicitLen = null) {
            const len = explicitLen !== null ? explicitLen : document.getElementById(fieldId).value.length;
            const el = document.getElementById(counterId);
            el.innerText = `${len}/${max}`;
            el.className = `char-counter ${len > max ? 'over' : (len > max * 0.9 ? 'limit' : '')}`;
        }

        function showToast(msg) {
            const t = document.getElementById('toast');
            t.innerText = msg;
            t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 2000);
        }

        function saveLocal() { localStorage.setItem('cv_maker_data', JSON.stringify(cvData)); }

        function manualSave() {
            saveLocal();
            createSnapshot('manual');
            showToast('Saved');
        }

        function saveJSON() {
            const blob = new Blob([JSON.stringify(cvData, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'cv_data.json';
            a.click();
            showToast("JSON Saved");
        }

        function loadJSON(input) {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    cvData = JSON.parse(e.target.result);
                    if (!cvData.personal) cvData.personal = { name: "", tagline: "", contact: "", phone: "", email: "", linkedin: "", location: "", socialLinks: [] };
                    if (!cvData.personal.socialLinks) cvData.personal.socialLinks = [];
                    if (!cvData.certifications) cvData.certifications = [];
                    if (!cvData.projects) cvData.projects = [];
                    if (!cvData.customSections) cvData.customSections = [];
                    if (!cvData.sectionOrder) cvData.sectionOrder = [...BASE_SECTION_ORDER];
                    normalizeSectionOrder();
                    renderEditor(); updateCV();
                    showToast("Loaded successfully");
                } catch (err) { alert("Invalid File"); }
            };
            reader.readAsText(file);
            input.value = '';
        }

        function resetData() {
            if (confirm("Clear all data?")) {
                cvData = {
                    personal: { name: "", tagline: "", contact: "", phone: "", email: "", linkedin: "", location: "", socialLinks: [] },
                    summary: "",
                    education: [],
                    experience: [],
                    certifications: [],
                    achievements: [],
                    leadership: [],
                    interests: [],
                    skills: "",
                    themeAccent: "",
                    customSections: [],
                    sectionOrder: [...BASE_SECTION_ORDER]
                };
                localStorage.removeItem('cv_maker_data');
                renderEditor();
                updateCV();
                showToast('Form cleared. Saved versions preserved.');
            }
        }

async function printCV() {
    const frame = document.getElementById('cv-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document;

    // Safety check: make sure the iframe preview is loaded
    if (!frame || !doc) {
        alert('Preview not ready yet. Please wait a moment and try again.');
        return;
    }

    // Build a clean filename from user's name
    const filename = `${toSafeFilename(cvData.personal?.name || 'cv')}.pdf`;

    // Show loading spinner so the user knows something is happening
    const overlay = document.querySelector('.loading-overlay');
    overlay?.classList.add('active');

    try {
        // ── Step 1: Extract the FULL HTML from the iframe ─────────────
        // We grab the entire <html>...</html> including <head> (styles/fonts)
        // and <body> (content). This way the Worker's Chromium renders it
        // with the exact same styling the user sees in the preview.
        const fullHTML = '<!DOCTYPE html>' + doc.documentElement.outerHTML;

        // ── Step 2: POST the HTML to our Cloudflare Worker ───────────
        // Includes a retry mechanism to gracefully handle high traffic (429 errors).
        let res;
        let retries = 3;
        
        while (retries > 0) {
            res = await fetch(`${WORKER_PDF_URL}/pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html: fullHTML, filename }),
            });

            if (res.status === 429) {
                retries--;
                if (retries === 0) {
                    throw new Error("Servers are currently experiencing high traffic. Please try again in a minute.");
                }
                // Wait 3 seconds before retrying
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }
            break; // Break the loop if successful or another error occurred
        }

        // ── Step 3: Handle errors from the Worker ────────────────────
        if (!res.ok) {
            let errMsg = 'PDF generation failed';
            try {
                const errJSON = await res.json();
                errMsg = errJSON.error || errMsg;
            } catch (_) {}
            throw new Error(errMsg);
        }

        // ── Step 4: Trigger the download ─────────────────────────────
        // Convert the response to a blob (binary data), create a temporary
        // URL for it, and simulate a link click to start the download.
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        // Cleanup: remove the invisible link and free the blob memory
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('PDF downloaded!');
    } catch (e) {
        console.error('PDF generation error:', e);
        alert('PDF download failed: ' + e.message);
    } finally {
        // Always hide the spinner, even on error
        overlay?.classList.remove('active');
    }
}

        // AI & Import Logic
        async function refineSection(fieldType, text) {
            const trimmed = (text || '').trim();
            if (!trimmed) throw new Error('Nothing to refine');

            const templateFile = document.getElementById('template-select')?.value || 'cv2.html';
            const templateId = 'template_' + templateFile.replace('cv', '').replace('-', '').replace('.html', '');

            const response = await fetch(`${WORKER_URL}/refine-section`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: trimmed, field_type: fieldType, template_id: templateId })
            });
            const res = await response.json();
            if (!res.ok || !res.refined_text) {
                throw new Error(res.error || 'Refine failed');
            }
            return res.refined_text;
        }

        async function aiRefineSummary() {
            try {
                const overlay = document.querySelector('.loading-overlay');
                overlay?.classList.add('active');
                const refined = await refineSection('summary', getSummaryPlainText() || cvData.summary);
                cvData.summary = sanitizeSummaryHTML(refined);
                setSummaryEditorValue(cvData.summary);
                updateCV();
                showToast('Objective refined');
            } catch (e) {
                alert('AI refine failed: ' + e.message);
            } finally {
                const overlay = document.querySelector('.loading-overlay');
                overlay?.classList.remove('active');
            }
        }

        async function aiRefineSkills() {
            try {
                const overlay = document.querySelector('.loading-overlay');
                overlay?.classList.add('active');
                const refined = await refineSection('skills', getSkillsPlainText() || cvData.skills);
                cvData.skills = sanitizeSummaryHTML(refined);
                setSkillsEditorValue(cvData.skills);
                updateCV();
                showToast('Skills refined');
            } catch (e) {
                alert('AI refine failed: ' + e.message);
            } finally {
                const overlay = document.querySelector('.loading-overlay');
                overlay?.classList.remove('active');
            }
        }

        async function aiRefineExperience(index) {
            try {
                if (!cvData.experience || !cvData.experience[index]) throw new Error('Experience not found');
                const bullets = cvData.experience[index].bullets || [];
                const raw = bullets.join('\n');
                const overlay = document.querySelector('.loading-overlay');
                overlay?.classList.add('active');
                const refined = await refineSection('bullets', raw);
                const refinedLines = refined.split('\n').map(l => l.trim()).filter(Boolean);
                cvData.experience[index].bullets = refinedLines;
                renderExpInputs();
                postToFrame();
                showToast('Experience refined');
            } catch (e) {
                alert('AI refine failed: ' + e.message);
            } finally {
                const overlay = document.querySelector('.loading-overlay');
                overlay?.classList.remove('active');
            }
        }

        async function generateAI() {
            if (!cvData.personal.name && !getPlainTextFromHTML(cvData.summary || '')) return alert("Please fill basic info first.");

            const overlay = document.querySelector('.loading-overlay');
            overlay.classList.add('active');

            const templateFile = document.getElementById('template-select').value;
            const templateId = 'template_' + templateFile.replace('cv', '').replace('-', '').replace('.html', '');

            try {
                const response = await fetch(`${WORKER_URL}/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_data: cvData, template_id: templateId })
                });

                const res = await response.json();
                if (res.ok && res.data) {
                    cvData = res.data;
                    if (!cvData.certifications) cvData.certifications = [];
                    renderEditor(); postToFrame(); showToast("AI Enhancement Applied!");
                } else throw new Error(res.error || "Generation failed");
            } catch (e) {
                alert("Error: " + e.message);
            } finally {
                overlay.classList.remove('active');
            }
        }

        async function handleImageUpload(input) {
            if (!input.files[0]) return;
            const overlay = document.querySelector('.loading-overlay');
            overlay.classList.add('active');

            try {
                const file = input.files[0];
                let images = [];

                if (file.type === 'application/pdf') {
                    const pdfjsLib = await import('https://esm.sh/pdfjs-dist@4.8.69');
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.8.69/build/pdf.worker.js';
                    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;

                    // Limit to first 3 pages to avoid payload issues
                    const maxPages = Math.min(pdf.numPages, 3);

                    for (let i = 1; i <= maxPages; i++) {
                        const page = await pdf.getPage(i);
                        const viewport = page.getViewport({ scale: 2 });
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;
                        await page.render({ canvasContext: context, viewport }).promise;
                        images.push(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
                    }
                } else {
                    const base64 = await new Promise((r) => {
                        const reader = new FileReader();
                        reader.onload = () => r(reader.result.split(',')[1]);
                        reader.readAsDataURL(file);
                    });
                    images.push(base64);
                }

                const response = await fetch(`${WORKER_URL}/convert`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ images: images })
                });

                const res = await response.json();
                if (res.ok && res.data) {
                    // Merge new data with structure
                    cvData = { ...cvData, ...res.data };
                    // Ensure arrays
                    ['education', 'experience', 'certifications', 'achievements', 'leadership', 'interests'].forEach(k => {
                        if (!Array.isArray(cvData[k])) cvData[k] = [];
                    });

                    renderEditor();
                    updateProgress();
                    postToFrame();
                    createSnapshot('import');
                    showToast("CV Imported!");
                } else throw new Error(res.error || "Unknown error");
            } catch (e) {
                console.error(e);
                alert("Import failed: " + e.message);
            } finally {
                overlay.classList.remove('active');
                input.value = '';
            }
        }

        // ---- Snapshot History (Local Storage) ----
        function loadHistory() {
            try {
                const raw = localStorage.getItem(HISTORY_KEY);
                if (!raw) {
                    history = [];
                } else {
                    history = JSON.parse(raw) || [];
                }
            } catch (e) {
                console.error('Failed to load history', e);
                history = [];
            }
            renderHistory();
        }

        function saveHistory() {
            try {
                localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
            } catch (e) {
                console.error('Failed to save history', e);
            }
        }

        function createSnapshot(source) {
            const snapshot = {
                id: Date.now(),
                at: new Date().toISOString(),
                source,
                title: cvData.personal.name || 'Untitled CV',
                data: JSON.parse(JSON.stringify(cvData))
            };
            history.unshift(snapshot);
            if (history.length > 25) {
                history = history.slice(0, 25);
            }
            saveHistory();
            renderHistory();
        }

        function renderHistory() {
            const list = document.getElementById('history-list');
            if (!list) return;

            if (!history.length) {
                list.innerHTML = '<div class="history-empty">Snapshots will appear here as you edit.</div>';
                return;
            }

            list.innerHTML = history.map(s => {
                const d = new Date(s.at);
                const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
                    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                const safeTitle = (s.title || 'Untitled CV')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                return `<div class="history-card" data-id="${s.id}" role="button" tabindex="0">
                            <div class="history-main">
                                <div class="history-title">${safeTitle}</div>
                                <div class="history-meta">${label}</div>
                            </div>
                            <button type="button" class="history-delete" data-id="${s.id}" title="Delete this version">×</button>
                        </div>`;
            }).join('');
        }

        function deleteSnapshot(id) {
            const before = history.length;
            history = history.filter(h => h.id !== id);
            if (history.length !== before) {
                saveHistory();
                renderHistory();
                showToast('Snapshot deleted');
            }
        }

        document.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.history-delete');
            if (deleteBtn) {
                const id = Number(deleteBtn.dataset.id);
                if (!isNaN(id)) deleteSnapshot(id);
                return;
            }

            const card = e.target.closest('.history-card');
            if (!card) return;
            const id = Number(card.dataset.id);
            const snap = history.find(h => h.id === id);
            if (!snap) return;

            cvData = JSON.parse(JSON.stringify(snap.data));
            ensureCvDataShape();
            renderEditor();
            updateProgress();
            postToFrame();
            resetEditorScrollToTop();
            showToast('Snapshot loaded');
        });

        // ---- Resizable Columns ----
        function initResizeHandle() {
            const handle = document.getElementById('resize-handle');
            const editor = document.querySelector('.editor');
            if (!handle || !editor) return;

            let startX = 0;
            let startWidth = 0;
            const minWidth = 360;
            const maxWidth = 860;

            const onMove = (event) => {
                const clientX = event.touches ? event.touches[0].clientX : event.clientX;
                const dx = clientX - startX;
                let newWidth = startWidth + dx;
                if (newWidth < minWidth) newWidth = minWidth;
                if (newWidth > maxWidth) newWidth = maxWidth;
                editor.style.width = newWidth + 'px';
                editor.style.flex = `0 0 ${newWidth}px`;
                if (event.cancelable) event.preventDefault();
            };

            const stop = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('mouseup', stop);
                document.removeEventListener('touchend', stop);
            };

            const start = (event) => {
                const clientX = event.touches ? event.touches[0].clientX : event.clientX;
                startX = clientX;
                startWidth = editor.getBoundingClientRect().width;
                document.addEventListener('mousemove', onMove);
                document.addEventListener('touchmove', onMove, { passive: false });
                document.addEventListener('mouseup', stop);
                document.addEventListener('touchend', stop);
                if (event.cancelable) event.preventDefault();
            };

            handle.addEventListener('mousedown', start);
            handle.addEventListener('touchstart', start, { passive: false });
        }

        // ========== GUIDED WALKTHROUGH TOUR ==========
        function startTour() {
            const isMobile = window.innerWidth <= 768;
            
            // Build steps dynamically based on device
            const steps = [
                {
                    popover: {
                        title: '👋 Welcome!',
                        description: 'Let\'s take a quick tour to help you create your professional resume.',
                        side: 'center',
                        align: 'center'
                    }
                },
                {
                    element: '.editor-content',
                    popover: {
                        title: '✏️ Edit Your Details',
                        description: 'Fill in your information here. Tap sections to expand and edit all core and custom sections.',
                        side: isMobile ? 'bottom' : 'right',
                        align: 'start'
                    }
                },
                {
                    element: 'button[onclick="document.getElementById(\'file-upload\').click()"]',
                    popover: {
                        title: '📄 Import Resume',
                        description: 'Already have a CV? Upload an image or PDF to auto-fill using AI.',
                        side: 'bottom',
                        align: 'center'
                    }
                }
            ];
            
            // Preview step - different for mobile vs desktop
            if (isMobile) {
                steps.push({
                    element: '.nav-tab[onclick="switchTab(\'preview\')"]',
                    popover: {
                        title: '👀 Live Preview',
                        description: 'Tap Preview to see your CV live. Template, Layout reorder, and Undo/Redo controls are available there.',
                        side: 'top',
                        align: 'center'
                    }
                });
            } else {
                steps.push({
                    element: '.preview-wrapper',
                    popover: {
                        title: '👀 Live Preview',
                        description: 'See your changes instantly! This is exactly how your CV will look when exported.',
                        side: 'left',
                        align: 'center'
                    }
                });
            }
            
            // Template step - different for mobile
            if (isMobile) {
                steps.push({
                    element: '.nav-tab[onclick="switchTab(\'preview\')"]',
                    popover: {
                        title: '🎨 Choose Template',
                        description: 'In Preview, open Template to browse fully supported designs which you can customize to your needs.',
                        side: 'top',
                        align: 'center'
                    }
                });
            } else {
                steps.push({
                    element: '.template-floater',
                    popover: {
                        title: '🎨 Choose Template',
                        description: 'Browse through all templates and customize the color theme to your liking.',
                        side: 'bottom',
                        align: 'center'
                    }
                });
                steps.push({
                    element: 'button[onclick="toggleReorderDrawer(true)"]',
                    popover: {
                        title: 'Reorder Sections',
                        description: 'Use Layout Reorder to move sections up/down. Your order updates instantly in preview.',
                        side: 'bottom',
                        align: 'center'
                    }
                });
                steps.push({
                    element: '#btn-undo',
                    popover: {
                        title: 'Undo / Redo',
                        description: 'Undo or redo any change globally, including AI enhance, imports, edits, and section order changes.',
                        side: 'bottom',
                        align: 'center'
                    }
                });
            }
            
            // AI Review
            if (isMobile) {
                steps.push({
                    element: '.nav-tab[onclick="switchTab(\'reviewer\')"]',
                    popover: {
                        title: '🤖 AI Review',
                        description: 'Tap Review to get instant AI feedback and score!',
                        side: 'top',
                        align: 'center'
                    }
                });
            } else {
                steps.push({
                    element: 'button[onclick="startReviewFromPreview()"]',
                    popover: {
                        title: '🤖 AI Review',
                        description: 'Get instant AI feedback and suggestions to improve your resume.',
                        side: 'bottom',
                        align: 'center'
                    }
                });
            }
            
            // Export PDF
            steps.push({
                element: 'button[onclick="printCV()"]',
                popover: {
                    title: '📥 Export PDF',
                    description: 'When ready, download your polished CV as a high-quality PDF!',
                    side: 'bottom',
                    align: 'center'
                }
            });
            
            const driverObj = window.driver.js.driver({
                showProgress: true,
                animate: true,
                allowClose: true,
                overlayClickNext: false,
                stagePadding: 10,
                stageRadius: 12,
                popoverClass: 'cv-tour-popover',
                overlayColor: 'rgba(15, 23, 42, 0.75)',
                progressText: '{{current}} of {{total}}',
                nextBtnText: 'Next →',
                prevBtnText: '← Back',
                doneBtnText: 'Done ✓',
                steps: steps,
                onDestroyStarted: () => {
                    localStorage.setItem('cv_tour_completed', 'true');
                    driverObj.destroy();
                }
            });
            
            driverObj.drive();
        }

        // Auto-start tour for first-time visitors
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(() => {
                if (!localStorage.getItem('cv_tour_completed')) {
                    startTour();
                }
            }, 1200); // Delay to ensure page is fully loaded
        });

