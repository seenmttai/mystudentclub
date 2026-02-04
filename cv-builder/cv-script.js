        // Constants & Data
        const CA_SKILLS = ["Statutory Audit", "Tax Audit", "Internal Audit", "GST", "TDS", "Ind AS", "Excel", "Tally", "SAP", "Bank Audit"];
        const CA_DEGREES = ["CA Final", "CA Intermediate", "B.Com", "Class XII", "Class X"];
        const AUDIT_VERBS = ["Executed", "Analyzed", "Prepared", "Reviewed", "Led", "Verified"];

        // Template configuration: which sections each template supports
        // Based on actual template file analysis - includes tagline, category, contact fields
        const templateConfig = {
            'cv1.html': ['contact', 'summary', 'achievements', 'leadership', 'interests', 'skills'],
            'cv2.html': ['contact', 'tagline', 'category', 'achievements','certifications', 'leadership', 'interests', 'skills'],
            'cv3.html': ['contact', 'summary', 'category', 'certifications', 'achievements', 'skills'],
            'cv4.html': ['contact', 'certifications', 'achievements', 'leadership', 'interests', 'skills'],
            'cv5.html': ['summary', 'phone', 'email', 'linkedin', 'leadership', 'certifications', 'achievements', 'interests', 'skills'],
            'cv6.html': ['contact', 'achievements', 'certifications', 'skills'],
            'cv7.html': ['contact', 'certifications', 'achievements', 'leadership', 'interests', 'skills'],
            'cv8.html': ['contact', 'tagline', 'summary', 'certifications', 'interests'],
            'cv9.html': ['contact', 'projects','achievements', 'leadership']
        };

        // Update form sections visibility based on selected template
        function updateFormSections() {
            const select = document.getElementById('template-select');
            const currentTemplate = select ? select.value : 'cv1.html';
            const supportedSections = templateConfig[currentTemplate] || [];
            
            // Find all sections with data-section attribute
            document.querySelectorAll('[data-section]').forEach(section => {
                const sectionName = section.getAttribute('data-section');
                if (supportedSections.includes(sectionName)) {
                    section.style.display = '';
                } else {
                    section.style.display = 'none';
                }
            });
        }

        let cvData = {
            personal: { name: "", tagline: "", contact: "", phone: "", email: "", linkedin: "", socialLinks: [] },
            summary: "",
            education: [],
            experience: [],
            projects: [],
            certifications: [],
            achievements: [],
            interests: [],
            leadership: [],
            skills: ""
        };

        const WORKER_URL = "https://cv-maker.bhansalimanan55.workers.dev";
        const HISTORY_KEY = 'cv_maker_history_v1';
        let history = [];

        // Initialization
        window.onload = () => {
            const saved = localStorage.getItem('cv_maker_data');
            if (saved) {
                try { 
                    const parsed = JSON.parse(saved);
                    // Ensure deep merge/compatibility
                    cvData = { ...cvData, ...parsed };
                    if (!cvData.certifications) cvData.certifications = [];
                    if (!cvData.projects) cvData.projects = [];
                }
                catch (e) { console.error('Load failed', e); }
            }
            loadHistory();

            renderEditor();
            updateFormSections();
            updateProgress();

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
        };

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
            document.getElementById('inp-contact').value = cvData.personal.contact || '';
            document.getElementById('inp-phone').value = cvData.personal.phone || '';
            document.getElementById('inp-email').value = cvData.personal.email || '';
            document.getElementById('inp-linkedin').value = cvData.personal.linkedin || '';
            document.getElementById('inp-summary').value = cvData.summary || '';
            document.getElementById('inp-skills').value = cvData.skills || '';

            updateCharCounter('inp-summary', 'summary-counter', 500);
            updateCharCounter('inp-skills', 'skills-counter', 300);

            renderEduInputs();
            renderExpInputs();
            renderProjInputs();
            renderCertInputs();
            renderListInputs('achievements', 'ach-container', 'Achievement');
            renderListInputs('interests', 'int-container', 'Interest');
            renderListInputs('leadership', 'lead-container', 'Leadership Role');
            renderSkillChips();
            renderSocialLinks();
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
                        <textarea class="form-control" style="min-height:60px" oninput="updateListItem('${key}', ${index}, this.value)" placeholder="${placeholder}">${item || ''}</textarea>
                    </div>
                `;
                container.appendChild(div);
            });
        }

        function addListItem(key) {
            if (!cvData[key]) cvData[key] = [];
            cvData[key].push("");
            renderListInputs(key, (key === 'achievements' ? 'ach-container' : key === 'interests' ? 'int-container' : 'lead-container'), key);
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
            cvData.experience.forEach((exp, index) => {
                const div = document.createElement('div');
                div.className = 'list-item';
                div.innerHTML = `
                    <div class="item-actions">
                        <div class="action-btn" onclick="moveExp(${index}, -1)">▲</div>
                        <div class="action-btn" onclick="moveExp(${index}, 1)">▼</div>
                        <div class="action-btn delete" onclick="removeExp(${index})">×</div>
                    </div>
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
                        <textarea id="exp-bullets-${index}" class="form-control" oninput="updateExp(${index}, 'bullets', this.value)" placeholder="One bullet per line">${(exp.bullets || []).join('\n')}</textarea>
                    </div>
                `;
                container.appendChild(div);
            });
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
                        <textarea id="proj-bullets-${index}" class="form-control" oninput="updateProj(${index}, 'bullets', this.value)" placeholder="One bullet per line">${(proj.bullets || []).join('\n')}</textarea>
                    </div>
                `;
                container.appendChild(div);
            });
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
            cvData.personal.contact = document.getElementById('inp-contact').value;
            cvData.personal.phone = document.getElementById('inp-phone').value;
            cvData.personal.email = document.getElementById('inp-email').value;
            cvData.personal.linkedin = document.getElementById('inp-linkedin').value;
            cvData.summary = document.getElementById('inp-summary').value;
            cvData.skills = document.getElementById('inp-skills').value;

            updateCharCounter('inp-summary', 'summary-counter', 500);
            updateCharCounter('inp-skills', 'skills-counter', 300);

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
                cvData.experience[index].bullets = value.split('\n').filter(line => line.trim() !== '');
            } else {
                cvData.experience[index][field] = value;
            }
            postToFrame();
        }

        function appendBullet(index, text) {
            const ta = document.getElementById('exp-bullets-' + index);
            if (ta) {
                const current = ta.value;
                ta.value = current + (current.length && !current.endsWith('\n') ? '\n' : '') + text;
                updateExp(index, 'bullets', ta.value);
            }
        }

        function updateCert(index, field, value) {
            cvData.certifications[index][field] = value;
            postToFrame();
        }

        function addSkill(skill) {
            const field = document.getElementById('inp-skills');
            if (field.value.includes(skill)) return showToast("Already added");
            field.value = field.value ? field.value + ", " + skill : skill;
            updateCV();
        }

        // List Management
        function addEducation() {
            cvData.education.push({ degree: "", institute: "", year: "", marks: "" });
            renderEduInputs();
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
            cvData.experience.push({ role: "", company: "", dates: "", bullets: [] });
            renderExpInputs();
        }
        function removeExp(i) {
            if (confirm("Delete entry?")) { cvData.experience.splice(i, 1); renderExpInputs(); postToFrame(); }
        }
        function moveExp(i, dir) {
            if (i + dir < 0 || i + dir >= cvData.experience.length) return;
            [cvData.experience[i], cvData.experience[i + dir]] = [cvData.experience[i + dir], cvData.experience[i]];
            renderExpInputs(); postToFrame();
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
                cvData.projects[index].bullets = value.split('\n').filter(line => line.trim() !== '');
            } else {
                cvData.projects[index][field] = value;
            }
            postToFrame();
        }
        function addCertification() {
            cvData.certifications.push({ name: "", issuer: "" });
            renderCertInputs();
        }
        function removeCert(i) {
            if (confirm("Delete?")) { cvData.certifications.splice(i, 1); renderCertInputs(); postToFrame(); }
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
                
                return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; color:inherit; border-bottom:1px solid currentColor; opacity:0.9;">${display}</a>`;
            });

            // 2. Emails
            const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
            escaped = escaped.replace(emailRegex, (m) => `<a href="mailto:${m}" style="text-decoration:none; color:inherit; border-bottom:1px solid currentColor; opacity:0.9;">${m}</a>`);

            // 3. Phone numbers (Handles + prefix, spaces, dashes, parentheses)
            // Simplified to look for international or standard domestic patterns
            const phoneRegex = /(?:\+|00)?(?:\d[ \-\(\)\.]{0,2}){8,}\d/g;
            escaped = escaped.replace(phoneRegex, (m) => {
                const clean = m.replace(/[^\d+]/g, '');
                if (clean.length < 8 || clean.length > 16) return m; // Likely not a phone number if too short/long
                return `<a href="tel:${clean}" style="text-decoration:none; color:inherit; border-bottom:1px solid currentColor; opacity:0.9;">${m}</a>`;
            });

            return escaped;
        }

        // Template Sidebar Logic
        const TEMPLATES = [
            { file: 'cv1.html', name: 'Modern Serif', accent: '#4f81bc', style: 'serif' },
            { file: 'cv2.html', name: 'Classic Blue', accent: '#1e40af', style: 'sans' },
            { file: 'cv3.html', name: 'Grid Layout', accent: '#059669', style: 'grid' },
            { file: 'cv4.html', name: 'Professional', accent: '#374151', style: 'clean' },
            { file: 'cv5.html', name: 'Corporate', accent: '#0369a1', style: 'formal' },
            { file: 'cv6.html', name: 'Minimalist', accent: '#6b7280', style: 'minimal' },
            { file: 'cv7.html', name: 'Compact', accent: '#7c3aed', style: 'dense' },
            { file: 'cv8.html', name: 'Bold Modern', accent: '#dc2626', style: 'bold' },
            { file: 'cv9.html', name: 'Executive', accent: '#064e3b', style: 'exec' }
        ];

        function toggleTemplateSidebar(show) {
            const sidebar = document.getElementById('template-sidebar');
            const overlay = document.getElementById('template-sidebar-overlay');
            if (show) {
                sidebar.classList.add('open');
                overlay.classList.add('open');
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

        function injectPreviewData(iframe) {
            try {
                if (iframe.contentWindow) {
                    const payload = JSON.parse(JSON.stringify(cvData));
                    // Apply same contact formatting as postToFrame
                    let contactParts = [];
                    const SEP = '<span class="contact-sep" style="margin: 0 4px; color: inherit;"> | </span>';
                    
                    if (payload.personal.phone) contactParts.push(autoLink(payload.personal.phone));
                    if (payload.personal.email) contactParts.push(autoLink(payload.personal.email));
                    if (payload.personal.linkedin) contactParts.push(autoLink(payload.personal.linkedin));
                    
                    if (Array.isArray(payload.personal.socialLinks)) {
                        payload.personal.socialLinks.forEach(link => {
                            if (link.url) {
                                if (link.label) {
                                    let href = link.url;
                                    if (!/^https?:\/\//i.test(href)) href = 'https://' + href;
                                    contactParts.push(`<a href="${href}" target="_blank" style="text-decoration:none; color:inherit; border-bottom:1px solid currentColor;">${link.label}</a>`);
                                } else {
                                    contactParts.push(autoLink(link.url));
                                }
                            }
                        });
                    }
                    
                    payload.personal.contact = contactParts.join(SEP);
                    
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

        function postToFrame() {
            const frame = document.getElementById('cv-frame');
            if (frame && frame.contentWindow) {
                try {
                    const payload = JSON.parse(JSON.stringify(cvData));
                    const templateFile = document.getElementById('template-select')?.value || 'cv1.html';
                    
                    // We combine Phone, Email, LinkedIn, Social Links, and legacy Contact field
                    let contactParts = [];
                    
                    // Visible separator with spacing
                    const SEP = '<span class="contact-sep" style="margin: 0 4px; color: inherit;"> | </span>';
                    
                    // 1. Phone
                    if (payload.personal.phone) {
                        contactParts.push(autoLink(payload.personal.phone));
                    }
                    
                    // 2. Email
                    if (payload.personal.email) {
                        contactParts.push(autoLink(payload.personal.email));
                    }
                    
                    // 3. LinkedIn (Legacy field)
                    if (payload.personal.linkedin) {
                        contactParts.push(autoLink(payload.personal.linkedin));
                    }
                    
                    // 4. Social Links (New Array)
                    if (Array.isArray(payload.personal.socialLinks)) {
                        payload.personal.socialLinks.forEach(link => {
                            if (link.url) {
                                if (link.label) {
                                    // Custom Label
                                    let href = link.url;
                                    if (!/^https?:\/\//i.test(href)) {
                                        href = 'https://' + (href.startsWith('www.') ? href : href);
                                    }
                                    contactParts.push(`<a href="${href}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; color:inherit; border-bottom:1px solid currentColor; opacity:0.9;">${link.label}</a>`);
                                } else {
                                    // No Label -> Auto Clean
                                    contactParts.push(autoLink(link.url));
                                }
                            }
                        });
                    }
                    
                    // 5. Contact (Legacy/Generic field) 
                    // To prevent duplication, we only include parts of the legacy contact string
                    // that are NOT found in the specific fields we just added.
                    if (payload.personal.contact) {
                        const contactStr = payload.personal.contact;
                        // specific fields for comparison
                        const existingValues = [
                            payload.personal.phone,
                            payload.personal.email,
                            payload.personal.linkedin
                        ].filter(Boolean).map(v => v.toLowerCase().trim());

                        // Split by common separators (| or -) to check individual parts
                        // most imports use ' | ' separator
                        const rawParts = contactStr.split(/\|/);
                        
                        rawParts.forEach(part => {
                            const trimmedPart = part.trim();
                            const lowerPart = trimmedPart.toLowerCase();
                            
                            // Check if this part is substantially similar to any already added field
                            // We check if the part *contains* the existing value or vice-versa
                            const isDuplicate = existingValues.some(existing => 
                                lowerPart.includes(existing) || existing.includes(lowerPart)
                            );
                            
                            if (!isDuplicate && trimmedPart) {
                                contactParts.push(autoLink(trimmedPart));
                            }
                        });
                    }
                    
                    // Join all parts with separator
                    payload.personal.contact = contactParts.join(SEP);
                    
                    frame.contentWindow.postMessage({ type: 'update-cv', payload }, '*');
                } catch (e) {
                    console.error('postToFrame error:', e);
                }
            }
        }

        function changeTemplate() {
            const select = document.getElementById('template-select');
            const frame = document.getElementById('cv-frame');
            
            // Update form sections visibility for new template
            updateFormSections();
            
            document.querySelector('.loading-overlay').classList.add('active');
            frame.src = select.value;
            frame.onload = () => {
                setTimeout(() => {
                    postToFrame();
                    document.querySelector('.loading-overlay').classList.remove('active');
                }, 400);
            };
        }

        function updateProgress() {
            let filled = 0, total = 7;
            if (cvData.personal.name) filled++;
            if (cvData.personal.contact) filled++;
            if (cvData.summary) filled++;
            if (cvData.skills) filled++;
            if (cvData.education.length) filled += 1.5;
            if (cvData.experience.length) filled += 1.5;
            document.getElementById('progress-fill').style.width = Math.min((filled / total) * 100, 100) + '%';
        }

        function updateCharCounter(fieldId, counterId, max) {
            const len = document.getElementById(fieldId).value.length;
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
                    if (!cvData.certifications) cvData.certifications = [];
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
                    personal: { name: "", tagline: "", contact: "", phone: "", email: "", linkedin: "" },
                    summary: "",
                    education: [],
                    experience: [],
                    certifications: [],
                    achievements: [],
                    leadership: [],
                    interests: [],
                    skills: ""
                };
                localStorage.removeItem('cv_maker_data');
                renderEditor();
                updateCV();
                showToast('Form cleared. Saved versions preserved.');
            }
        }

function printCV() {
    const frame = document.getElementById('cv-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document;
    if (!frame || !doc) {
        alert('Preview not ready yet. Please wait a moment and try again.');
        return;
    }
    const element = doc.getElementById('cv-page') || doc.body;
    if (!window.html2pdf || !element) {
        alert('PDF generator library not ready. Please refresh.');
        return;
    }

    // A4 dimensions in pixels at 96 DPI: 794 x 1123
    // Our templates use 1000 x 1414 (scaled reference)
    const A4_WIDTH = 1000;
    const A4_HEIGHT = 1414;

    const opt = {
        margin: [0, 0, 0, 0],
        filename: (cvData.personal?.name || 'cv').replace(/[^a-z0-9]/gi, '_') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            width: A4_WIDTH,
            height: A4_HEIGHT,
            windowWidth: A4_WIDTH,
            windowHeight: A4_HEIGHT,
            onclone: (clonedDoc) => {
                // Copy all stylesheets from the original iframe document
                const originalStyles = doc.querySelectorAll('style, link[rel="stylesheet"]');
                originalStyles.forEach(style => {
                    clonedDoc.head.appendChild(style.cloneNode(true));
                });

                const node = clonedDoc.getElementById('cv-page') || clonedDoc.body;
                if (node) {
                    // Reset all transforms and scaling for clean capture
                    node.style.transform = 'none';
                    node.style.width = A4_WIDTH + 'px';
                    node.style.height = A4_HEIGHT + 'px';
                    node.style.margin = '0';
                    node.style.padding = node.style.padding || '30px';
                    node.style.boxShadow = 'none';
                    node.style.overflow = 'visible';
                    node.style.display = 'block';
                    node.style.position = 'relative';
                    
                    // Reset CSS variable for content scaling
                    clonedDoc.documentElement.style.setProperty('--content-scale', '1');
                }

                // Reset zoom wrapper if it exists
                const wrapper = clonedDoc.getElementById('zoom-wrapper');
                if (wrapper) {
                    wrapper.style.transform = 'none';
                    wrapper.style.padding = '0';
                    wrapper.style.margin = '0';
                }
            }
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    window.html2pdf().from(element).set(opt).save();
}

        // AI & Import Logic
        async function refineSection(fieldType, text) {
            const trimmed = (text || '').trim();
            if (!trimmed) throw new Error('Nothing to refine');

            const templateFile = document.getElementById('template-select')?.value || 'cv1.html';
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
                const refined = await refineSection('summary', cvData.summary);
                cvData.summary = refined;
                const field = document.getElementById('inp-summary');
                if (field) field.value = refined;
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
                const refined = await refineSection('skills', cvData.skills);
                cvData.skills = refined;
                const field = document.getElementById('inp-skills');
                if (field) field.value = refined;
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
            if (!cvData.personal.name && !cvData.summary) return alert("Please fill basic info first.");

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
            if (!cvData.certifications) cvData.certifications = [];
            renderEditor();
            updateProgress();
            postToFrame();
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
                        description: 'Fill in your information here. Tap sections to expand and add experience, education, skills.',
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
                        description: 'Tap Preview to see exactly how your CV looks!',
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
                        description: 'In Preview, tap the Template button to browse 9 professional designs.',
                        side: 'top',
                        align: 'center'
                    }
                });
            } else {
                steps.push({
                    element: '.template-floater',
                    popover: {
                        title: '🎨 Choose Template',
                        description: 'Browse through 9 professional templates. Click to see live previews!',
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