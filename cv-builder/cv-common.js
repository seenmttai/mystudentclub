/**
 * Common CV Logic for template rendering
 * Handles 'update-cv' messages from the editor (index.html)
 */

window.addEventListener('message', (event) => {
    // Basic security check: ensure message is data we expect
    const data = event.data;
    if (!data || data.type !== 'update-cv') return;

    window._hasReceivedData = true;
    renderCV(data.payload);
});

// Initialize with empty data on load, but only if we don't get a message immediately
document.addEventListener('DOMContentLoaded', () => {
    // We notify the parent we are ready to receive data
    window.parent.postMessage({ type: 'cv-frame-ready' }, '*');
    
    // Initial blank state - but don't force hide if data might be coming
    setTimeout(() => {
        if (!window._hasReceivedData) {
            renderCV({
                personal: {},
                summary: '',
                education: [],
                experience: [],
                projects: [],
                certifications: [],
                achievements: [],
                leadership: [],
                interests: [],
                skills: '',
                customSections: []
            });
        }
    }, 50);
});

function renderCV(data) {
    if (!data) return;

    ensureRichTextGuards();
    ensureUniversalSections();
    ensureSectionWrappers();
    applyTemplateAccent(data.themeAccent || '');
    syncDocumentTitle(data);

    // 1. Personal Info
    setHTML('[data-field="name"]', data.personal?.name);
    setHTML('[data-field="tagline"]', data.personal?.tagline);
    setHTML('[data-field="contact"]', data.personal?.contact);
    setHTML('[data-field="highlight1"]', data.personal?.highlight1 || 'Top Academic Performer');
    setHTML('[data-field="highlight2"]', data.personal?.highlight2 || 'Article Trainee Experience');
    setHTML('[data-field="highlight3"]', data.personal?.highlight3 || 'Leadership & Awards');
    setHTML('[data-field="phone"]', data.personal?.phone);
    setHTML('[data-field="email"]', data.personal?.email);
    setHTML('[data-field="linkedin"]', data.personal?.linkedin);
    setHTML('[data-field="location"]', data.personal?.location);
    
    // Hide contact-block if all contact details are empty (CV-5 pattern)
    const hasContactDetails = !!(
        data.personal?.phone ||
        data.personal?.email ||
        data.personal?.linkedin ||
        data.personal?.location ||
        (Array.isArray(data.personal?.socialLinks) && data.personal.socialLinks.some(link => (link?.url || '').trim()))
    );
    const contactBlock = document.querySelector('.contact-block');
    if (contactBlock) {
        contactBlock.style.display = hasContactDetails ? '' : 'none';
    }

    // Standardize contact rendering with icons (phone/email/linkedin) across templates.
    renderContactWithIcons(data.personal || {});
    
    // Also hide contact-row items individually when empty
    document.querySelectorAll('.contact-row').forEach(row => {
        const valueEl = row.querySelector('.contact-value');
        if (valueEl) {
            const hasValue = valueEl.innerHTML.trim() !== '';
            row.style.display = hasValue ? '' : 'none';
        }
    });

    // 2. Summary
    const hasSummary = !!(data.summary && data.summary.trim());
    setHTML('[data-field="summary"]', data.summary);
    toggleSectionByContent('[data-field="summary"]', hasSummary);

    // 3. Education
    const hasEdu = data.education && data.education.length > 0;
    updateList('education-list', data.education, hasEdu, (row, item) => {
        setHTMLIn(row, '[data-field="degree"]', item.degree);
        setHTMLIn(row, '[data-field="year"]', item.year);
        // Map both 'institute' and 'institution' field names for compatibility across templates and worker output
        setHTMLIn(row, '[data-field="institution"]', item.institute || item.institution);
        setHTMLIn(row, '[data-field="institute"]', item.institute || item.institution);
        setHTMLIn(row, '[data-field="marks"]', item.marks || item.remarks);
        setHTMLIn(row, '[data-field="remarks"]', item.remarks);
    });
    applyEducationInstituteMerges(data.education || []);
    
    // 3b. Grouped Education (CV8/CV9) - groups entries by institution
    const groupedEduContainer = document.getElementById('education-grouped-list');
    if (groupedEduContainer && hasEdu) {
        // Detect if we're in CV9 (has bullet-list class in the page)
        const isCV9Style = document.querySelector('.section-header-2') !== null;
        
        // Group education entries by institution
        const grouped = {};
        const order = [];
        data.education.forEach(edu => {
            const inst = edu.institute || edu.institution || '';
            if (!grouped[inst]) {
                grouped[inst] = [];
                order.push(inst);
            }
            grouped[inst].push(edu);
        });
        
        // Render grouped entries
        let html = '';
        order.forEach(inst => {
            html += `<div class="edu-item">`;
            if (inst) {
                html += `<div class="edu-institution">${inst}</div>`;
            }
            
            if (isCV9Style) {
                // CV9 style: Each entry shows degree with date, then its marks as bullet points
                const entries = grouped[inst];
                entries.forEach(entry => {
                    const degree = entry.degree || '';
                    const year = entry.year || '';
                    const marks = entry.marks || entry.remarks || '';
                    
                    // Show degree + year line
                    html += `<div class="edu-row">
                        <span class="edu-qual">${degree}</span>
                        <span class="edu-date">${year}</span>
                    </div>`;
                    
                    // Show marks/remarks as bullet points - split by comma if multiple
                    if (marks) {
                        // Split by comma and trim each item
                        const marksList = marks.split(',').map(m => m.trim()).filter(m => m);
                        if (marksList.length > 0) {
                            html += `<ul class="bullet-list">`;
                            marksList.forEach(mark => {
                                html += `<li>${mark}</li>`;
                            });
                            html += `</ul>`;
                        }
                    }
                });
            } else {
                // CV8 style: Each entry inline with | separator (Degree | Marks | Remarks)
                grouped[inst].forEach(edu => {
                    const degree = edu.degree || '';
                    const marks = edu.marks || '';
                    const remarks = edu.remarks || '';
                    const year = edu.year || '';
                    
                    // Build the qualification string with | separators
                    let qualParts = [degree];
                    if (marks) qualParts.push(marks);
                    if (remarks) qualParts.push(remarks);
                    const qualStr = qualParts.join(' | ');
                    
                    html += `<div class="edu-row">
                        <span class="edu-qual">${qualStr}</span>
                        <span class="edu-date">${year}</span>
                    </div>`;
                });
            }
            html += `</div>`;
        });
        groupedEduContainer.innerHTML = html;
    } else if (groupedEduContainer) {
        groupedEduContainer.innerHTML = '';
    }

    // 4. Experience
    const renderedExperience = buildRenderedExperience(data.experience || []);
    const hasExp = renderedExperience.length > 0;
    updateList('experience-list', renderedExperience, hasExp, (block, item) => {
        setHTMLIn(block, '[data-field="role"]', item.role);
        setHTMLIn(block, '[data-field="company"]', item.company);
        setHTMLIn(block, '[data-field="dates"]', item.dates);
        setHTMLIn(block, '[data-field="intro"]', item.intro); // Role/firm intro shown once under the header
        setHTMLIn(block, '[data-field="category"]', item.category); // Department/Area like "Business Finance"
        applyExperienceTitleMergeDisplayV2(block, item);

        const roleEl = block.querySelector('[data-field="role"]');
        if (roleEl) roleEl.style.display = stripTags(item.role || '').trim() ? '' : 'none';
        const categoryEl = block.querySelector('[data-field="category"]');
        if (categoryEl) {
            const categoryEmpty = !stripTags(item.category || '').trim();
            categoryEl.style.display = categoryEmpty ? 'none' : '';
            // When category is hidden, let the bullets column fill the full row width
            const bulletsCell = categoryEl.nextElementSibling;
            if (bulletsCell && /^TD$/i.test(bulletsCell.tagName || '')) {
                if (categoryEmpty) {
                    bulletsCell.setAttribute('colspan', '2');
                    bulletsCell.style.setProperty('width', '100%', 'important');
                } else {
                    bulletsCell.removeAttribute('colspan');
                    bulletsCell.style.removeProperty('width');
                }
            }
        }
        // Intro belongs to the header, so only the primary entry shows it; subsections hide it.
        const introEl = block.querySelector('[data-field="intro"]');
        if (introEl) introEl.style.display = (stripTags(item.intro || '').trim() && !item.titleMergedWithPrevious) ? '' : 'none';
        if (item.titleMergedWithPrevious) {
            if (roleEl) roleEl.style.display = 'none';
            if (introEl) introEl.style.display = 'none';
            const companyEl = block.querySelector('[data-field="company"]');
            const datesEl = block.querySelector('[data-field="dates"]');
            if (companyEl) companyEl.style.display = 'none';
            if (datesEl) datesEl.style.display = 'none';
        }

        const ul = block.querySelector('[data-list="bullets"]');
        if (ul) {
            if (item.bullets && Array.isArray(item.bullets) && item.bullets.length > 0) {
                ul.innerHTML = item.bullets.map(b => `<li>${b}</li>`).join('');
            } else {
                ul.innerHTML = '';
            }
        }
    });

    // 4b. Projects (CV-9)
    const hasProjects = data.projects && data.projects.length > 0;
    updateList('projects-list', data.projects, hasProjects, (block, item) => {
        setHTMLIn(block, '[data-field="title"]', item.title);

        const descSpan = block.querySelector('[data-field="description"]');
        if (descSpan) {
            const descriptionText = item.description || '';
            const normalized = normalizeRichFieldHTML(descriptionText);
            const host = ensureFieldHostSupportsRichContent(descSpan, normalized);
            host.innerHTML = normalized;

            // Find the parent TD containing the description
            const descCell = host.closest('td');
            if (descCell) {
                const descEmpty = !stripTags(descriptionText).trim();
                descCell.style.display = descEmpty ? 'none' : '';
                
                const bulletsCell = descCell.nextElementSibling;
                if (bulletsCell && /^TD$/i.test(bulletsCell.tagName || '')) {
                    if (descEmpty) {
                        bulletsCell.setAttribute('colspan', '2');
                        bulletsCell.style.setProperty('width', '100%', 'important');
                    } else {
                        bulletsCell.removeAttribute('colspan');
                        bulletsCell.style.removeProperty('width');
                    }
                }
            }
        }

        const ul = block.querySelector('[data-list="bullets"]');
        if (ul) {
            if (item.bullets && Array.isArray(item.bullets) && item.bullets.length > 0) {
                ul.innerHTML = item.bullets.map(b => `<li>${b}</li>`).join('');
            } else {
                ul.innerHTML = '';
            }
        }
    });

    // 5. Certifications (Generic List)
    const hasCerts = data.certifications && data.certifications.length > 0;
    updateList('cert-list', data.certifications, hasCerts, (row, item) => {
        // Try simple string or object mapping
        const text = typeof item === 'string' ? item : (item.name + (item.issuer ? ' - ' + item.issuer : ''));
        if (row.tagName === 'LI') row.innerHTML = text;
        else setHTMLIn(row, '[data-field="cert"]', text);
    });
    
    // Handle certifications rendered as simple list (data-list="certifications")
    const certContainer = document.querySelector('[data-list="certifications"]');
    if (certContainer) {
        if (hasCerts) {
            certContainer.innerHTML = data.certifications.map(c => {
                // Handle both string format and object format (name + issuer)
                if (typeof c === 'string') {
                    return `<li>${c}</li>`;
                }
                // Object format: use name, optionally append issuer if it exists and is non-empty
                const name = c.name || '';
                const issuer = c.issuer && c.issuer.trim() ? ' - ' + c.issuer : '';
                return `<li>${name}${issuer}</li>`;
            }).join('');
            toggleSectionElement(certContainer, true);
        } else {
            certContainer.innerHTML = '';
            toggleSectionElement(certContainer, false);
        }
    }

    // 6. Achievements (Simple List)
    renderSimpleList(data.achievements, '[data-list="achievements"]');

    // 7. Leadership (Simple List)
    renderSimpleList(data.leadership, '[data-list="leadership"]');

    // 8. Interests (Simple List)
    renderSimpleList(data.interests, '[data-list="interests"]');

    // 9. Skills
    const skillsHTML = renderSkillsContent(data.skills || '');
    const hasSkills = !!(stripTags(skillsHTML).trim());
    setHTML('[data-field="skills"]', skillsHTML);
    toggleSectionByContent('[data-field="skills"]', hasSkills);

    // 10. Custom sections
    renderCustomSections(data.customSections || []);

    // 11. Section ordering
    applySectionOrder(data.sectionOrder || []);
    normalizeClassicBlueDetailSections();
    const groupingSupported = normalizeSectionGrouping(data.sectionGroups || {}, data.sectionLabels || {});
    try {
        window.parent.postMessage({ type: 'section-grouping-capability', supported: groupingSupported }, '*');
    } catch (e) { /* cross-origin — ignore */ }
    enforceExperienceOnlyLeftLabels();
    stabilizeSectionLayouts();
    applyTableFormatSettings(data.tableSettings || {});

    // 12. Configurable section labels (rename / hide the grey left-label cells)
    applySectionLabels(data.sectionLabels || {});

    // 12. Recalculate Layout (Scale/Shrink)
    // These functions exist in the templates script block
    // Use requestAnimationFrame to ensure DOM is fully updated before recalculating
    requestAnimationFrame(() => {
        applyTemplateAccent(data.themeAccent || '');
        if (typeof window.shrinkContentToFit === 'function') {
            window.shrinkContentToFit();
        }
        if (typeof window.scaleToFit === 'function') {
            window.scaleToFit();
        }
    });
}

function syncDocumentTitle(data) {
    const name = stripTags(data?.personal?.name || '').trim();
    document.title = name ? `${name} CV` : 'My Student Club CV';
}

// Helper: Set innerHTML safely
function setHTML(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    const normalized = normalizeRichFieldHTML(value || '');
    const host = ensureFieldHostSupportsRichContent(el, normalized);
    host.innerHTML = normalized;
}

// Helper: Set innerHTML inside a container
function setHTMLIn(container, selector, value) {
    const el = container.querySelector(selector);
    if (!el) return;
    const normalized = normalizeRichFieldHTML(value || '');
    const host = ensureFieldHostSupportsRichContent(el, normalized);
    host.innerHTML = normalized;
}

function ensureFieldHostSupportsRichContent(el, html) {
    if (!el) return el;
    const raw = String(html || '');
    // Only normalize when incoming content has block-level markup.
    if (!/<(?:ul|ol|li|p|div|table|h[1-6]|blockquote|pre)\b/i.test(raw)) return el;

    const tag = (el.tagName || '').toUpperCase();
    // <p>/<span> hosts are fragile for rich content in print/PDF engines.
    if (tag !== 'P' && tag !== 'SPAN') return el;

    const replacement = document.createElement('div');
    Array.from(el.attributes).forEach(attr => replacement.setAttribute(attr.name, attr.value));
    el.replaceWith(replacement);
    return replacement;
}

function appendInlineStyle(el, styleText) {
    if (!el || !styleText) return;
    const existing = (el.getAttribute('style') || '').trim();
    if (!existing) {
        el.setAttribute('style', styleText);
        return;
    }
    const merged = `${existing}${existing.endsWith(';') ? '' : ';'} ${styleText}`;
    el.setAttribute('style', merged);
}

function normalizeRichFieldHTML(value) {
    const raw = String(value || '');
    if (!raw.trim()) return '';
    if (!/<(ul|ol|li|p|br|strong|em|u|a)\b/i.test(raw)) return raw;

    const tpl = document.createElement('template');
    tpl.innerHTML = raw;

    // Quill/print-safe list rendering with inline style so PDF engines remain consistent.
    tpl.content.querySelectorAll('ul').forEach(ul => {
        appendInlineStyle(ul, 'list-style-type: disc; list-style-position: outside; padding-left: 14px; margin: 2px 0 2px 4px;');
    });
    tpl.content.querySelectorAll('ol').forEach(ol => {
        appendInlineStyle(ol, 'list-style-type: decimal; list-style-position: outside; padding-left: 14px; margin: 2px 0 2px 4px;');
    });
    tpl.content.querySelectorAll('li').forEach(li => {
        appendInlineStyle(li, 'margin: 1px 0;');
    });
    tpl.content.querySelectorAll('p').forEach(p => {
        appendInlineStyle(p, 'margin: 1px 0;');
    });

    return tpl.innerHTML;
}

function enforceExperienceOnlyLeftLabels() {
    const labelSelectors = ['.category-label', '.skills-col-label', '.work-label', '.col-left', '.details-label', '.grey-label'];
    const nonExpSections = document.querySelectorAll('.sortable-section[data-section-id]:not([data-section-id="experience"])');

    nonExpSections.forEach(section => {
        const labelCells = section.querySelectorAll(labelSelectors.map(s => `td${s}, th${s}`).join(', '));
        labelCells.forEach(labelCell => {
            const row = labelCell.closest('tr');
            if (!row) return;
            const contentCell = labelCell.nextElementSibling;
            if (!contentCell || !/^(TD|TH)$/i.test(contentCell.tagName)) {
                labelCell.remove();
                return;
            }

            // If bindings ended up in the label cell, move them to content cell.
            const boundNodes = labelCell.querySelectorAll('[data-list], [data-field]');
            if (boundNodes.length > 0) {
                boundNodes.forEach(node => contentCell.appendChild(node));
            } else {
                // Fallback: move structural lists if content cell is empty.
                const contentEmpty = !contentCell.textContent.trim() && contentCell.children.length === 0;
                if (contentEmpty) {
                    const structural = labelCell.querySelectorAll('ul, ol, div, p');
                    structural.forEach(node => contentCell.appendChild(node));
                }
            }

            labelCell.remove();
        });

        // If section tables have a 2-col colgroup, remove first col so content spans full width.
        section.querySelectorAll('table colgroup').forEach(colgroup => {
            const cols = colgroup.querySelectorAll('col');
            if (cols.length === 2) {
                // Removing only the first col can leave the remaining col at width:80%.
                // Drop the whole colgroup so browser recalculates to full-width.
                colgroup.remove();
            }
        });

        const sectionId = section.getAttribute('data-section-id') || '';
        if (sectionId !== 'education') {
            section.querySelectorAll('table').forEach(table => {
                if (table.classList.contains('section-detail-table') || table.hasAttribute('data-preserve-label-columns')) {
                    return;
                }
                const colCount = Math.max(1, table.querySelectorAll('colgroup col').length);
                table.querySelectorAll('tr').forEach(row => {
                    const cells = Array.from(row.children).filter(el => /^(TD|TH)$/i.test(el.tagName));
                    if (!cells.length) return;
                    if (cells.some(c => Number(c.getAttribute('colspan') || '1') > 1)) return;

                    // Common case causing right-gap: one cell row inside 2-col table.
                    if (cells.length === 1 && colCount > 1) {
                        cells[0].setAttribute('colspan', String(colCount));
                        cells[0].style.setProperty('width', '100%', 'important');
                        return;
                    }

                    if (cells.length !== 2) return;

                    const [first, second] = cells;
                    const firstScore = getCellContentScore(first);
                    const secondScore = getCellContentScore(second);

                    // Prefer keeping the content-rich/right cell if scores tie.
                    const keep = secondScore >= firstScore ? second : first;
                    const drop = keep === first ? second : first;

                    // Preserve any bound nodes if they exist in the dropped cell.
                    const dropBound = drop.querySelectorAll('[data-list], [data-field]');
                    const keepBound = keep.querySelectorAll('[data-list], [data-field]');
                    if (dropBound.length > 0 && keepBound.length === 0) {
                        dropBound.forEach(node => keep.appendChild(node));
                    }

                    keep.setAttribute('colspan', String(Math.max(2, colCount)));
                    keep.style.setProperty('width', '100%', 'important');
                    drop.remove();
                });

                // Final safety: if any non-header row has a single cell, force it full width.
                table.querySelectorAll('tr').forEach(row => {
                    const cells = Array.from(row.children).filter(el => /^(TD|TH)$/i.test(el.tagName));
                    if (cells.length !== 1) return;
                    const onlyCell = cells[0];
                    const hasSectionHeader = onlyCell.classList.contains('section-header');
                    if (!hasSectionHeader) {
                        onlyCell.setAttribute('colspan', onlyCell.getAttribute('colspan') || '99');
                    }
                    onlyCell.style.setProperty('width', '100%', 'important');
                    onlyCell.style.setProperty('max-width', '100%', 'important');
                });
            });
        }
    });
}

function stabilizeSectionLayouts() {
    // Keep table columns fluid so content adapts on zoom and during import-heavy payloads.
    document.querySelectorAll('.sortable-section table').forEach(table => {
        table.style.setProperty('width', '100%', 'important');
        table.style.setProperty('table-layout', 'auto', 'important');
        table.style.setProperty('max-width', '100%', 'important');
    });

    document.querySelectorAll('.sortable-section td, .sortable-section th').forEach(cell => {
        cell.style.setProperty('max-width', '100%', 'important');
        cell.style.setProperty('overflow-wrap', 'anywhere', 'important');
        cell.style.setProperty('word-break', 'break-word', 'important');
        if (cell.style.whiteSpace === 'nowrap') {
            cell.style.setProperty('white-space', 'normal', 'important');
        }
    });

    // Experience-specific hardening for merged stints and zoomed rendering.
    document.querySelectorAll('.sortable-section[data-section-id="experience"] [data-field="company"], .sortable-section[data-section-id="experience"] [data-field="dates"], .sortable-section[data-section-id="experience"] .entry-title, .sortable-section[data-section-id="experience"] .entry-location, .sortable-section[data-section-id="experience"] .entry-dates').forEach(el => {
        el.style.setProperty('max-width', '100%', 'important');
        el.style.setProperty('overflow-wrap', 'anywhere', 'important');
        el.style.setProperty('word-break', 'break-word', 'important');
        el.style.setProperty('white-space', 'normal', 'important');
    });
}

function applyTableFormatSettings(tableSettings) {
    applyEducationTableFormat(tableSettings?.education?.columns || {});
}

/**
 * Apply user-configurable label text and visibility to the grey left-label cells
 * in Certifications, Interests, Skills, Achievements, Leadership sections.
 *
 * Works for ALL templates by detecting label cells heuristically (2-cell table rows
 * where one cell has no data binding and the adjacent one does).
 *
 * Classic Blue special-case: normalizeClassicBlueDetailSections() moves the visible
 * rows into a .classic-blue-detail-group table tagged with data-detail-source, and
 * hides the original sections. We must apply label changes to those rows too.
 */
function applySectionLabels(sectionLabels) {
    const LABEL_SECTIONS = ['certifications', 'interests', 'skills', 'achievements', 'leadership'];

    // Helper: apply text + visibility to a single 2-cell table/div row
    function applyToRow(row, customText, visible) {
        let cells;
        if (row.tagName === 'TR') {
            cells = Array.from(row.children).filter(el => /^(TD|TH)$/i.test(el.tagName));
        } else {
            // For div-based rows (like Serif Split)
            cells = Array.from(row.children).filter(el => /^(DIV|TD|TH)$/i.test(el.tagName) && !el.classList.contains('template'));
        }
        if (cells.length !== 2) return;

        const [first, second] = cells;
        const firstHasBinding = !!(first.querySelector('[data-list], [data-field]'));
        const secondHasBinding = !!(second.querySelector('[data-list], [data-field]'));

        let labelCell, contentCell;
        if (!firstHasBinding && secondHasBinding) {
            labelCell = first;
            contentCell = second;
        } else if (firstHasBinding && !secondHasBinding) {
            labelCell = second;
            contentCell = first;
        } else {
            return; // Both or neither have bindings — skip
        }

        // Apply custom text if provided. Prefer writing into a nested title
        // element (e.g. .section-header-title) so decorative siblings like
        // .section-header-bar aren't destroyed; only fall back to overwriting
        // the whole label cell when it has no such nested title element.
        if (customText !== null && customText !== '') {
            const titleEl = labelCell.querySelector('.section-header-title, .section-header, .section-header-2, .section-title, .gray-bar') || labelCell;
            const currentText = (titleEl.textContent || '').trim();
            if (currentText !== customText) {
                titleEl.textContent = customText;
            }
        }

        // Toggle label visibility
        if (!visible) {
            labelCell.style.display = 'none';
            contentCell.setAttribute('colspan', '2');
            contentCell.style.setProperty('width', '100%', 'important');
        } else {
            labelCell.style.display = '';
            contentCell.removeAttribute('colspan');
            contentCell.style.removeProperty('width');
        }
    }

    // Classic Blue groups certifications/interests/skills/achievements/leadership
    // into a single table with rows tagged data-detail-source="sectionId".
    // These are the VISIBLE rows; the original sections are hidden.
    const classicBlueGroup = document.querySelector('.sortable-section.classic-blue-detail-group');

    // Combine built-in sections + any custom section IDs that have label config
    const customSectionIds = Object.keys(sectionLabels).filter(id => !LABEL_SECTIONS.includes(id));

    // --- Process built-in label sections ---
    LABEL_SECTIONS.forEach(sectionId => {
        const config = sectionLabels[sectionId];
        const customText = config?.text || null;
        const visible = config?.visible !== false; // default visible

        // --- Pass 1: Classic Blue detail group rows (visible in Classic Blue) ---
        if (classicBlueGroup) {
            const detailRow = classicBlueGroup.querySelector(`tr[data-detail-source="${sectionId}"]`);
            if (detailRow) applyToRow(detailRow, customText, visible);
        }

        // --- Pass 2: All other templates — look inside the sortable-section wrapper ---
        // Special case: combined table where sections are inside a single table row rather than separate sortable-sections
        const combinedBoundEl = document.querySelector(`table[data-preserve-label-columns] [data-field="${sectionId}"], table[data-preserve-label-columns] [data-list="${sectionId}"]`);
        if (combinedBoundEl) {
            const combinedRow = combinedBoundEl.closest('tr');
            if (combinedRow) {
                applyToRow(combinedRow, customText, visible);
                return;
            }
        }

        const section = document.querySelector(`.sortable-section[data-section-id="${sectionId}"]`);
        if (!section) return;
        // Skip the section if it is hidden (Classic Blue hides originals after grouping)
        if (section.style.display === 'none') return;

        const rows = section.querySelectorAll('tr');
        if (rows.length > 0) {
            rows.forEach(row => applyToRow(row, customText, visible));
        } else {
            // If there are no tr elements, the section container itself acts as the 2-column row (e.g. Serif Split)
            applyToRow(section, customText, visible);
        }
    });

    // --- Process custom section labels ---
    const LABEL_SELECTORS = ['.category-label', '.skills-col-label', '.work-label', '.col-left', '.details-label', '.section-label', '.category'];

    customSectionIds.forEach(sectionId => {
        const config = sectionLabels[sectionId];
        if (!config) return;
        const customText = config.text || null;
        const visible = config.visible !== false;

        // Classic Blue: custom section rows are keyed as "custom-{id}" in the detail group
        if (classicBlueGroup) {
            const detailRow = classicBlueGroup.querySelector(`tr[data-detail-source="custom-${sectionId}"]`);
            if (detailRow) applyToRow(detailRow, customText, visible);
        }

        // Other templates: find the wrapper by data-custom-section-root attribute
        const wrapper = document.querySelector(`[data-custom-section-root="${sectionId}"]`);
        if (!wrapper || wrapper.style.display === 'none') return;

        // Find label element using the same selectors as setSectionBodyLabel
        let labelEl = null;
        for (const sel of LABEL_SELECTORS) {
            labelEl = wrapper.querySelector(sel);
            if (labelEl) break;
        }
        if (!labelEl) return;

        // Apply custom text
        if (customText !== null && customText !== '') {
            labelEl.textContent = customText;
        }

        // Toggle visibility
        if (!visible) {
            labelEl.style.display = 'none';
            // Try to expand the sibling content cell
            const contentEl = labelEl.nextElementSibling || labelEl.parentElement?.querySelector('[data-list]')?.closest('td, .section-content');
            if (contentEl) {
                if (contentEl.tagName === 'TD' || contentEl.tagName === 'TH') {
                    contentEl.setAttribute('colspan', '2');
                    contentEl.style.setProperty('width', '100%', 'important');
                }
            }
        } else {
            labelEl.style.display = '';
            const contentEl = labelEl.nextElementSibling;
            if (contentEl) {
                contentEl.removeAttribute('colspan');
                contentEl.style.removeProperty('width');
            }
        }
    });
}




function applyEducationTableFormat(columns) {
    const section = document.querySelector('.sortable-section[data-section-id="education"]');
    if (!section) return;

    const defaults = {
        degree: { visible: true, width: 22 },
        year: { visible: true, width: 12 },
        institution: { visible: true, width: 36 },
        marks: { visible: true, width: 14 },
        remarks: { visible: true, width: 16 }
    };
    const limits = {
        degree: { min: 12, max: 42 },
        year: { min: 8, max: 28 },
        institution: { min: 18, max: 50 },
        marks: { min: 10, max: 30 },
        remarks: { min: 10, max: 35 }
    };

    const config = {};
    Object.keys(defaults).forEach((key) => {
        const explicitVisible = columns && Object.prototype.hasOwnProperty.call(columns, key) && Object.prototype.hasOwnProperty.call(columns[key] || {}, 'visible');
        const rawWidth = Number(columns?.[key]?.width);
        const boundedWidth = Number.isFinite(rawWidth)
            ? Math.max(limits[key].min, Math.min(limits[key].max, rawWidth))
            : defaults[key].width;
        config[key] = {
            visible: explicitVisible ? columns?.[key]?.visible !== false : true,
            width: boundedWidth
        };
    });

    ['degree', 'year', 'institution', 'marks', 'remarks'].forEach((field) => {
        section.querySelectorAll(`[data-field="${field}"]`).forEach((el) => {
            el.style.display = config[field].visible ? '' : 'none';
        });
    });

    section.querySelectorAll('table').forEach((table) => {
        const templateRow = table.querySelector('.template') || table.querySelector('tr');
        if (!templateRow) return;
        const sourceRow = templateRow.matches('tr') ? templateRow : templateRow.closest('tr');
        if (!sourceRow) return;

        const indexMap = {};
        ['degree', 'year', 'institution', 'marks', 'remarks'].forEach((field) => {
            const fieldHost = sourceRow.querySelector(`[data-field="${field}"]`);
            if (!fieldHost) return;
            const fieldCell = fieldHost.closest('td, th') || fieldHost;
            const index = Array.from(sourceRow.children).indexOf(fieldCell) + 1;
            if (index < 1) return;
            indexMap[field] = index;
        });

        const visibleEntries = Object.entries(indexMap)
            .filter(([field]) => config[field]?.visible !== false)
            .map(([field, index]) => ({ field, index, width: config[field].width }));
        const totalWidth = visibleEntries.reduce((sum, entry) => sum + entry.width, 0) || 1;

        table.style.setProperty('table-layout', 'fixed', 'important');
        table.style.setProperty('width', '100%', 'important');

        Object.entries(indexMap).forEach(([field, index]) => {
            const isVisible = config[field]?.visible !== false;
            const percent = isVisible ? `${((config[field].width / totalWidth) * 100).toFixed(2)}%` : '0%';
            table.querySelectorAll(`tr > *:nth-child(${index})`).forEach((cell) => {
                cell.style.display = isVisible ? '' : 'none';
                cell.style.setProperty('width', percent, 'important');
                cell.style.setProperty('max-width', percent, 'important');
                cell.style.setProperty('overflow-wrap', 'anywhere', 'important');
                cell.style.setProperty('word-break', 'break-word', 'important');
                cell.style.setProperty('white-space', 'normal', 'important');
            });
        });

        // Keep education header labels readable (avoid vertical letter stacking like "R e m a r k s")
        table.querySelectorAll('thead th').forEach((th) => {
            th.style.setProperty('overflow-wrap', 'normal', 'important');
            th.style.setProperty('word-break', 'normal', 'important');
            th.style.setProperty('white-space', 'nowrap', 'important');
        });
    });
}

function hasMeaningfulCellContent(cell) {
    if (!cell) return false;
    if (cell.querySelector('[data-list], [data-field], ul, ol, p, div, span, a')) return true;
    return !!cell.textContent.trim();
}

function getCellContentScore(cell) {
    if (!cell) return 0;
    let score = 0;
    if (cell.querySelector('[data-list], [data-field]')) score += 4;
    if (cell.querySelector('ul, ol, li, p, div, span, a')) score += 2;
    const textLen = (cell.textContent || '').replace(/\s+/g, ' ').trim().length;
    if (textLen > 0) score += Math.min(3, Math.ceil(textLen / 24));
    return score;
}

function renderSkillsContent(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';

    // If user provided rich content already, preserve it (sanitized upstream)
    if (/<(ul|ol|li|p|br)\b/i.test(raw)) {
        return raw;
    }

    const normalized = raw.replace(/\r\n/g, '\n');
    const lineParts = normalized.split('\n').map(v => v.trim()).filter(Boolean);

    // Newline means explicit bullet-style input
    if (lineParts.length > 1) {
        return `<ul class="cv-skills-list">${lineParts.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`;
    }

    // Comma-separated input: if many tokens, render bullets for better alignment
    const commaParts = normalized.split(',').map(v => v.trim()).filter(Boolean);
    if (commaParts.length >= 3) {
        return `<ul class="cv-skills-list">${commaParts.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`;
    }

    // Fallback to plain text with spacing
    return `<span class="cv-skills-inline">${escapeHTML(raw)}</span>`;
}

function applyTemplateAccent(accent) {
    const color = normalizeHexColor(accent);
    const root = document.documentElement;
    if (!root) return;

    if (!color) {
        ['--blue-header', '--header-bg', '--accent-color', '--blue-deep', '--blue-text', '--section-bg', '--header-bg-dark', '--sub-header-bg', '--sub-bg', '--grey-bg', '--blueshade-color', '--blue-shade']
            .forEach(name => root.style.removeProperty(name));
        clearAccentInlineStyles();
        return;
    }

    const light = mixHex(color, '#FFFFFF', 0.82);
    const softer = mixHex(color, '#FFFFFF', 0.68);
    const deep = mixHex(color, '#000000', 0.18);

    root.style.setProperty('--blue-header', color);
    root.style.setProperty('--header-bg', color);
    root.style.setProperty('--accent-color', color);
    root.style.setProperty('--blue-deep', color);
    root.style.setProperty('--blue-text', color);
    root.style.setProperty('--header-bg-dark', color);
    root.style.setProperty('--section-bg', softer);
    root.style.setProperty('--sub-header-bg', light);
    root.style.setProperty('--sub-bg', light);
    root.style.setProperty('--grey-bg', light);
    root.style.setProperty('--blueshade-color', light);
    root.style.setProperty('--blue-shade', softer);
    applyAccentInlineStyles(color, light, softer, deep);
}

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

function mixHex(base, target, ratio) {
    const a = hexToRgb(base);
    const b = hexToRgb(target);
    if (!a || !b) return base;
    const t = Math.max(0, Math.min(1, Number(ratio) || 0));
    const r = Math.round(a.r + (b.r - a.r) * t);
    const g = Math.round(a.g + (b.g - a.g) * t);
    const bl = Math.round(a.b + (b.b - a.b) * t);
    return `#${[r, g, bl].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function hexToRgb(hex) {
    const normalized = normalizeHexColor(hex);
    if (!normalized) return null;
    return {
        r: parseInt(normalized.slice(1, 3), 16),
        g: parseInt(normalized.slice(3, 5), 16),
        b: parseInt(normalized.slice(5, 7), 16)
    };
}

function applyAccentInlineStyles(color, light, softer, deep) {
    setInlineStyles('.section-header, .section-header-2, .header-name-box', {
        backgroundColor: color,
        color: '#ffffff',
        borderColor: deep
    });
    setInlineStyles('.contact-bar, .work-company-row, .qual-table th, .extra-table td.category, .section-detail-table td.section-label, .role-col, .summary-box, .summary-content, .header-bg-lite, .project-title-row, .work-exp-header, .contact-container .contact-icon-item', {
        backgroundColor: light,
        borderColor: deep
    });
    setInlineStyles('.edu-institution', {
        color: color
    });
}

function clearAccentInlineStyles() {
    clearInlineStyles('.section-header, .section-header-2, .header-name-box', ['backgroundColor', 'color', 'borderColor']);
    clearInlineStyles('.contact-bar, .work-company-row, .qual-table th, .extra-table td.category, .section-detail-table td.section-label, .role-col, .summary-box, .summary-content, .header-bg-lite, .project-title-row, .work-exp-header, .contact-container .contact-icon-item', ['backgroundColor', 'borderColor']);
    clearInlineStyles('.edu-institution', ['color']);
}

function setInlineStyles(selector, styles) {
    document.querySelectorAll(selector).forEach(node => {
        Object.entries(styles).forEach(([key, value]) => {
            node.style[key] = value;
        });
    });
}

function clearInlineStyles(selector, keys) {
    document.querySelectorAll(selector).forEach(node => {
        keys.forEach(key => {
            node.style[key] = '';
        });
    });
}

function buildRenderedExperience(items) {
    const source = Array.isArray(items) ? items : [];
    const groups = [];

    const extractCategoryLines = (value) => {
        const tmp = document.createElement('div');
        tmp.innerHTML = String(value || '').replace(/<br\s*\/?>/gi, '\n');
        return (tmp.textContent || '')
            .replace(/\r/g, '')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);
    };

    source.forEach((entry, index) => {
        const safeEntry = entry && typeof entry === 'object' ? entry : {};
        const mergeIntoPrevious = !!safeEntry.mergedWithPrevious && index > 0 && groups.length > 0;
        if (!mergeIntoPrevious) {
            groups.push([safeEntry]);
            return;
        }
        groups[groups.length - 1].push(safeEntry);
    });

    return groups.map(group => {
        const primary = group[0] || {};
        if (group.length === 1) {
            return {
                ...primary,
                titleMergedWithPrevious: !!primary.titleMergedWithPrevious
            };
        }

        const companyLines = group.map(item => {
            const company = item.company || '';
            const role = item.role || '';
            if (company && role) return `${company} - ${role}`;
            return company || role || '';
        }).filter(Boolean);

        const dateLines = group.map(item => item.dates || '').filter(Boolean);
        const mergedCategories = [];
        group.forEach(item => {
            extractCategoryLines(item.category).forEach(line => {
                if (!mergedCategories.includes(line)) mergedCategories.push(line);
            });
        });
        const mergedBullets = [];
        group.forEach(item => {
            const bullets = Array.isArray(item.bullets) ? item.bullets : [];
            bullets.forEach(bullet => {
                const normalized = String(bullet || '').trim();
                if (!normalized) return;
                if (!mergedBullets.includes(normalized)) mergedBullets.push(normalized);
            });
        });
        const mergedCategoryHTML = mergedCategories.join('<br>');

        return {
            ...primary,
            role: mergedCategoryHTML || '',
            company: companyLines.join('<br>'),
            dates: dateLines.join('<br>'),
            category: mergedCategoryHTML,
            bullets: mergedBullets,
            titleMergedWithPrevious: false
        };
    });
}

function applyExperienceTitleMergeDisplay(block, item) {
    if (!block) return;
    const hideTitle = !!item?.titleMergedWithPrevious;
    block.classList.toggle('experience-title-merged', hideTitle);

    const titleFields = [
        block.querySelector('[data-field="role"]'),
        block.querySelector('[data-field="company"]'),
        block.querySelector('[data-field="dates"]')
    ].filter(Boolean);

    titleFields.forEach(el => {
        el.style.display = hideTitle ? 'none' : '';
    });

    const wrapperSelectors = [
        '.work-exp-header',
        '.sub-header',
        '.sub-header-title',
        '.sub-header-date',
        '.item-main-title',
        '.item-date',
        '.exp-title',
        '.job-header',
        '.job-header-row',
        '.entry-header'
    ];

    wrapperSelectors.forEach(selector => {
        block.querySelectorAll(selector).forEach(el => {
            if (!hideTitle) {
                el.style.display = '';
                return;
            }
            const text = (el.textContent || '').replace(/[\s\|\-–—:\[\]\(\)]/g, '');
            el.style.display = text ? '' : 'none';
        });
    });
}

function applyExperienceTitleMergeDisplayV2(block, item) {
    if (!block) return;
    const hideTitle = !!item?.titleMergedWithPrevious;
    block.classList.toggle('experience-title-merged', hideTitle);

    const titleFields = ['role', 'company', 'dates']
        .map(field => block.querySelector(`[data-field="${field}"]`))
        .filter(Boolean);
    const wrappersToToggle = new Set();

    const addWrapper = (el) => {
        if (el && el !== block) wrappersToToggle.add(el);
    };

    titleFields.forEach(el => {
        el.style.display = hideTitle ? 'none' : '';
        addWrapper(el.closest('.work-exp-header'));
        addWrapper(el.closest('.work-exp-row'));
        addWrapper(el.closest('.sub-header'));
        addWrapper(el.closest('.sub-header-title'));
        addWrapper(el.closest('.sub-header-date'));
        addWrapper(el.closest('.item-main-title'));
        addWrapper(el.closest('.item-date'));
        addWrapper(el.closest('.exp-title'));
        addWrapper(el.closest('.sub-header-cell'));
        addWrapper(el.closest('.job-title-row'));
        addWrapper(el.closest('.job-header'));
        addWrapper(el.closest('.exp-header-details'));
        addWrapper(el.closest('.work-subheader'));
        addWrapper(el.closest('.work-box-header'));
        addWrapper(el.closest('.work-box-header-row'));
    });

    wrappersToToggle.forEach(el => {
        el.style.display = hideTitle ? 'none' : '';
        const row = el.closest('tr');
        if (row && row !== block && row.querySelector('.sub-header-cell')) {
            row.style.display = hideTitle ? 'none' : '';
        }
    });

    block.querySelectorAll('.work-exp-content > div:first-child, .details-grid, .work-box-header + .work-table').forEach(el => {
        if (el.matches('.details-grid')) {
            el.style.borderTop = hideTitle ? 'none' : '';
            return;
        }
        if (el.matches('.work-box-header + .work-table')) {
            el.style.marginTop = hideTitle ? '0' : '';
            return;
        }
        if (!(el.textContent || '').trim()) {
            el.style.display = hideTitle ? 'none' : '';
        }
    });
}

// Helper: Update a list of items based on a template
function updateList(listId, dataArray, hasData, fillFn) {
    const listContainer = document.getElementById(listId);
    if (!listContainer) return;

    // Visibility Toggle Logic for the entire List Section
    // We look for the closest container (Table or Div) and its preceding Header
    let sectionContainer = listContainer.tagName === 'TBODY' ? listContainer.closest('table') : listContainer;
    // Special case for some templates where the list is inside a plain div
    if (sectionContainer.parentNode.classList.contains('section-container')) {
        sectionContainer = sectionContainer.parentNode;
    }

    toggleSectionElement(sectionContainer, hasData);

    if (!hasData) return; // Stop if hidden

    // Existing Logic to render items...
    if (!dataArray || !Array.isArray(dataArray)) return;

    // Find the template item (we mark it with class 'template' or use the first child)
    let template = listContainer.querySelector('.template');

    // If no explicit template class, try to use the first element as a template, 
    // but ensure we haven't already deleted everything.
    if (!template && listContainer.children.length > 0) {
        template = listContainer.children[0];
        template.classList.add('template');
    }

    if (!template) return; // Can't render without a blueprint

    // Make sure template is hidden
    template.style.display = 'none';

    // Remove all NON-template items
    Array.from(listContainer.children).forEach(child => {
        if (child !== template) {
            child.remove();
        }
    });

    // Generate new items
    dataArray.forEach(dataItem => {
        const clone = template.cloneNode(true);
        clone.classList.remove('template');
        clone.style.display = ''; // Reset display

        fillFn(clone, dataItem);
        listContainer.appendChild(clone);
    });
}

function applyEducationInstituteMerges(educationItems) {
    const listContainer = document.getElementById('education-list');
    if (!listContainer) return;

    const rows = Array.from(listContainer.children)
        .filter(row => row.tagName === 'TR' && !row.classList.contains('template'));
    if (rows.length !== educationItems.length) return; // row/data mismatch — leave table untouched

    const instituteCellOf = (row) => {
        const field = row.querySelector('[data-field="institution"], [data-field="institute"]');
        return field ? field.closest('td') : null;
    };

    for (let i = 0; i < rows.length; i++) {
        if (educationItems[i]?.mergedWithPrevious) continue; // handled as part of an earlier run

        // Count how many following rows merge into this one.
        let runEnd = i + 1;
        while (runEnd < rows.length && educationItems[runEnd]?.mergedWithPrevious) runEnd++;
        const span = runEnd - i;
        if (span < 2) continue;

        const anchorCell = instituteCellOf(rows[i]);
        if (!anchorCell) continue; // template doesn't use a table cell for institute — skip

        anchorCell.setAttribute('rowspan', String(span));
        anchorCell.style.verticalAlign = 'middle';

        for (let j = i + 1; j < runEnd; j++) {
            instituteCellOf(rows[j])?.remove();
        }
        i = runEnd - 1;
    }
}

function renderSimpleList(items, selector) {
    const container = document.querySelector(selector);
    if (!container) return;

    const normalizedItems = (Array.isArray(items) ? items : [])
        .map(item => String(item || '').trim())
        .filter(Boolean);
    const hasItems = normalizedItems.length > 0;
    toggleSectionElement(container, hasItems);

    container.innerHTML = hasItems
        ? normalizedItems.map(item => `<li>${item}</li>`).join('')
        : '';
}

// Helper: Toggle visibility of a section based on content presence
function toggleSectionByContent(selector, isVisible) {
    const el = document.querySelector(selector);
    if (!el) return;

    // Walk up to find the main container for this field
    // Usually a p, div, or li
    let container = el;
    // If it's a specific field inside a larger block, we might want to hide the block? 
    // For Summary/Skills, usually the field IS the block or direct child.

    // Find associated Header
    toggleSectionElement(container, isVisible);
}

// Core toggler that finds headers and hides entire sections
function toggleSectionElement(element, isVisible) {
    if (!element) return;

    const sortableWrapper = element.closest('.sortable-section[data-section-id]');
    if (sortableWrapper) {
        if (sortableWrapper.classList.contains('footer-col')) {
            sortableWrapper.style.display = isVisible ? '' : 'none';
            const footerGrid = sortableWrapper.closest('.footer-grid');
            if (footerGrid) rebuildFooterGrid(footerGrid);
        } else {
            sortableWrapper.style.display = isVisible ? '' : 'none';
        }
        return;
    }

    // 1. Toggle the element itself
    element.style.display = isVisible ? '' : 'none';

    // 2. Find the appropriate container to hide
    // Walk up the DOM to find a proper section container
    let containerToHide = element;
    let headerToHide = null;

    // GUARD: If element is inside a footer-col (CV-11 grid layout),
    // only hide the footer-col at most — never walk higher.
    // This prevents hiding .footer-grid or .content-padding when a single
    // grid column's content is empty.
    const footerCol = element.closest('.footer-col');
    if (footerCol) {
        containerToHide = footerCol;
        containerToHide.style.display = isVisible ? '' : 'none';
        
        // Dynamically rebuild the grid based on which columns are visible
        const footerGrid = footerCol.closest('.footer-grid');
        if (footerGrid) {
            rebuildFooterGrid(footerGrid);
        }
        return;
    }

    // Check if element is inside a content-block div (CV-5)
    const contentBlock = element.closest('.content-block');
    if (contentBlock) {
        containerToHide = contentBlock;
    }

    // Check if element is inside a section-content div (CV-7)
    const sectionContent = element.closest('.section-content');
    if (sectionContent) {
        containerToHide = sectionContent;
    }

    // Check if element is inside a content-padding div (CV-6)
    // BUT only if it's ALSO inside a section-container — otherwise this
    // would match the outermost content wrapper and hide everything.
    const contentPadding = element.closest('.content-padding');
    if (contentPadding) {
        // Only use content-padding as containerToHide if the element is
        // directly a child of it (CV-6 pattern) and not nested inside
        // other structural elements like grids or tables.
        const hasSpecificWrapper = element.closest('.section-container, .section, .footer-grid');
        if (!hasSpecificWrapper) {
            containerToHide = contentPadding;
        }
    }

    // Check if element is inside a section-container (CV-6)
    // These wrap both the title and content
    const sectionContainer = element.closest('.section-container');
    if (sectionContainer) {
        containerToHide = sectionContainer;
        // The section-title is inside, so we need to find it
        headerToHide = sectionContainer.querySelector('.section-title');
    }
    
    // Check if element is inside a .section wrapper (CV-8, CV-9)
    // These wrap both the section-header and content
    const sectionWrapper = element.closest('.section');
    if (sectionWrapper) {
        containerToHide = sectionWrapper;
        // The section-header or section-header-2 is inside
        headerToHide = sectionWrapper.querySelector('.section-header, .section-header-2');
    }

    // Check if element is inside a generic styled div wrapper (CV4 pattern)
    // These are divs with inline styles like border, padding that wrap the content
    let parent = element.parentElement;
    if (parent && parent.tagName === 'DIV' && 
        !containerToHide.classList.contains('section-container') &&
        parent.id !== 'cv-page' && 
        !parent.classList.contains('cv-page') &&
        !parent.classList.contains('resume-container') &&
        !parent.classList.contains('main-container') &&
        !parent.classList.contains('page') &&
        !parent.classList.contains('content-block') &&
        !parent.classList.contains('section-content') &&
        !parent.classList.contains('content-padding') &&
        !parent.classList.contains('footer-grid') &&
        !parent.classList.contains('footer-col') &&
        parent.getAttribute('style')) {
        containerToHide = parent;
    }

    // Check if element is inside a table cell
    const parentTd = element.closest('td');
    if (parentTd) {
        const parentTr = parentTd.closest('tr');
        const parentTable = parentTd.closest('table');
        
        if (parentTr && parentTable) {
            // Always set the row visibility first
            parentTr.style.display = isVisible ? '' : 'none';
            
            // If we're SHOWING content, make sure the table and header are also visible
            if (isVisible) {
                parentTable.style.display = '';
                
                // Also find and show the section header
                let tableHeader = parentTable.previousElementSibling;
                let searchCount = 5;
                while (tableHeader && searchCount > 0) {
                    if (
                        tableHeader.classList.contains('section-header') ||
                        tableHeader.classList.contains('section-header-container') ||
                        tableHeader.classList.contains('section-title') ||
                        tableHeader.tagName === 'H2' ||
                        tableHeader.tagName === 'H3'
                    ) {
                        tableHeader.style.display = '';
                        break;
                    }
                    tableHeader = tableHeader.previousElementSibling;
                    searchCount--;
                }
                return;
            }
            
            // If we're HIDING, check if all rows in the table are now hidden
            const tbody = parentTable.querySelector('tbody') || parentTable;
            const allRows = Array.from(tbody.querySelectorAll('tr'));
            const visibleRows = allRows.filter(tr => 
                tr.style.display !== 'none' && !tr.classList.contains('template')
            );
            
            // If no visible rows remain, hide the table and its header
            if (visibleRows.length === 0) {
                containerToHide = parentTable;
            } else {
                // There are still visible rows, don't hide table or header
                return;
            }
        }
    }

    // 3. Find and hide the associated header
    // Walk up to find the container that has a section-header sibling
    let current = containerToHide;
    let searchLimit = 10;
    
    while (current && searchLimit > 0) {
        // Check previous siblings for a header
        let sibling = current.previousElementSibling;
        let siblingLimit = 5;
        
        while (sibling && siblingLimit > 0) {
            if (
                sibling.classList.contains('section-header') ||
                sibling.classList.contains('section-header-2') ||
                sibling.classList.contains('section-header-container') ||
                sibling.classList.contains('section-title') ||
                sibling.classList.contains('gray-bar') ||
                sibling.tagName === 'H2' ||
                sibling.tagName === 'H3'
            ) {
                headerToHide = sibling;
                break;
            }
            sibling = sibling.previousElementSibling;
            siblingLimit--;
        }
        
        if (headerToHide) break;
        
        // Move up to parent, but stop at known CV page containers
        if (current.id === 'cv-page' || 
            current.id === 'zoom-wrapper' ||
            current.classList.contains('cv-page') || 
            current.classList.contains('resume-container') ||
            current.classList.contains('main-container') ||
            current.classList.contains('content-padding') ||
            current.classList.contains('footer-grid') ||
            current.classList.contains('page') ||
            current.tagName === 'BODY') {
            break;
        }
        current = current.parentElement;
        searchLimit--;
    }

    // 4. Apply visibility to container and header
    if (containerToHide && containerToHide !== element) {
        containerToHide.style.display = isVisible ? '' : 'none';
    }
    
    if (headerToHide) {
        headerToHide.style.display = isVisible ? '' : 'none';
        
        // Also check if there's a section-header before the gray-bar/section-title
        // This handles CV-7's pattern: section-header → gray-bar → section-content
        if (headerToHide.classList.contains('gray-bar')) {
            const mainHeader = headerToHide.previousElementSibling;
            if (mainHeader && mainHeader.classList.contains('section-header')) {
                mainHeader.style.display = isVisible ? '' : 'none';
            }
        }
    }
}

/**
 * Rebuilds the footer-grid layout dynamically based on which footer-col
 * children are visible. Hides/shows vertical-border dividers and sets
 * a new grid-template-columns so visible columns share space equally.
 */
function rebuildFooterGrid(grid) {
    const children = Array.from(grid.children);

    // First pass: determine which footer-cols are visible
    const visibleCols = [];
    children.forEach(child => {
        if (child.classList.contains('footer-col')) {
            if (child.style.display !== 'none') {
                visibleCols.push(child);
            }
        }
    });

    // Second pass: hide all vertical borders, then selectively show
    children.forEach(child => {
        if (child.classList.contains('vertical-border')) {
            child.style.display = 'none';
        }
    });

    // Show borders only BETWEEN two visible footer-cols
    for (let i = 0; i < visibleCols.length - 1; i++) {
        // Walk from one visible col to the next, showing the first border found
        let el = visibleCols[i].nextElementSibling;
        while (el && el !== visibleCols[i + 1]) {
            if (el.classList.contains('vertical-border')) {
                el.style.display = '';
                break;
            }
            el = el.nextElementSibling;
        }
    }

    // Build new grid-template-columns for only visible items
    const cols = [];
    children.forEach(child => {
        if (child.style.display === 'none') return;
        if (child.classList.contains('footer-col')) {
            cols.push('minmax(0, 1fr)');
        } else if (child.classList.contains('vertical-border')) {
            cols.push('auto');
        }
    });

    if (cols.length > 0) {
        grid.style.gridTemplateColumns = cols.join(' ');
        grid.style.display = '';
    } else {
        // All columns hidden — hide the entire grid
        grid.style.display = 'none';
    }
}

function getPageContainer() {
    return document.getElementById('cv-page') || document.querySelector('.cv-page') || document.querySelector('.resume-container');
}

function getSectionAppendHost() {
    const page = getPageContainer();
    if (!page) return null;

    // Template-level override: lets split layouts (e.g. 2-column resumes)
    // force injected/custom sections into a specific column container.
    const explicitHost = page.querySelector('[data-section-append-host]');
    if (explicitHost) return explicitHost;

    const directMainContainer = Array.from(page.children).find(child => child.classList && child.classList.contains('main-container'));
    if (directMainContainer) return directMainContainer;

    const directContentPadding = Array.from(page.children).find(child => child.classList && child.classList.contains('content-padding'));
    if (directContentPadding) return directContentPadding;

    const directInnerContent = Array.from(page.children).find(child => child.classList && child.classList.contains('inner-content'));
    if (directInnerContent) return directInnerContent;

    return page;
}

function ensureRichTextGuards() {
    if (document.getElementById('cv-richtext-guard-style')) return;
    const style = document.createElement('style');
    style.id = 'cv-richtext-guard-style';
    style.textContent = `
        [data-field="summary"] {
            max-width: 100%;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        [data-field="summary"] p,
        [data-field="summary"] ul,
        [data-field="summary"] ol {
            margin: 0.25em 0;
            max-width: 100%;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        [data-field="summary"] ul,
        [data-field="summary"] ol {
            padding-left: 1.2em;
            margin-left: 0.2em;
        }
        [data-field="summary"] li {
            margin: 0.15em 0;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        [data-field="skills"] {
            max-width: 100%;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        [data-field="skills"] .cv-skills-list,
        [data-field="skills"] ul,
        [data-field="skills"] ol {
            margin: 0.2em 0;
            padding-left: 1.15em;
            margin-left: 0.25em;
            max-width: 100%;
        }
        [data-field="skills"] li {
            margin: 0.12em 0;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        [data-field="skills"] .cv-skills-inline {
            display: inline-block;
            padding-left: 0.35em;
        }
        /* Global rich text guard: keep nested ul/ol stable in preview + print */
        [data-field] ul,
        [data-field] ol,
        [data-list] li ul,
        [data-list] li ol {
            list-style-position: outside;
            padding-left: 1.2em;
            margin: 0.2em 0 0.2em 0.2em;
            max-width: 100%;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        [data-field] li,
        [data-list] li li {
            margin: 0.12em 0;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        .sortable-section table {
            width: 100%;
            max-width: 100%;
            table-layout: auto;
        }
        .sortable-section td,
        .sortable-section th {
            max-width: 100%;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        .sortable-section[data-section-id="experience"] [data-field="company"],
        .sortable-section[data-section-id="experience"] [data-field="dates"],
        .sortable-section[data-section-id="experience"] .entry-title,
        .sortable-section[data-section-id="experience"] .entry-location,
        .sortable-section[data-section-id="experience"] .entry-dates {
            white-space: normal !important;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        .contact-icon-item {
            display: inline-flex;
            align-items: center;
            gap: 0.28em;
            vertical-align: middle;
            line-height: 1.25;
            max-width: 100%;
        }
        .contact-icon-glyph {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 1.15em;
            min-width: 1.15em;
            height: 1.15em;
            flex: 0 0 1.15em;
            color: currentColor;
            opacity: 0.9;
        }
        .contact-icon-glyph svg {
            display: block;
            width: 100%;
            height: 100%;
        }
        .contact-icon-glyph-linkedin {
            width: 1.2em;
            min-width: 1.2em;
            height: 1.2em;
            flex-basis: 1.2em;
            margin-bottom: 0.20em;
        }
        .contact-icon-text {
            display: inline-flex;
            align-items: center;
            min-width: 0;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        .contact-value .contact-icon-item {
            display: flex;
            align-items: center;
        }
    `;
    document.head.appendChild(style);
}

function renderContactWithIcons(personal) {
    const phone = (personal.phone || '').trim();
    const email = (personal.email || '').trim();
    const linkedin = (personal.linkedin || '').trim();
    const location = (personal.location || '').trim();
    const socialLinks = Array.isArray(personal.socialLinks) ? personal.socialLinks : [];

    const iconStyle = 'display:inline-flex;align-items:center;justify-content:center;width:1em;height:1em;vertical-align:-0.12em;margin-right:0.28em;color:currentColor;opacity:0.9;';
    const sep = '<span class="contact-sep" style="margin:0 0.4em;opacity:0.65;">|</span>';
    const items = [];

    const contactLinkStyle = 'color:#2563eb;text-decoration:none;border-bottom:1px solid rgba(37,99,235,0.45);padding-bottom:1px;font-weight:500;';

    if (phone) {
        const tel = phone.replace(/[^\d+]/g, '');
        items.push(`
            <span class="contact-icon-item" style="display:inline-flex;align-items:center;">
                <span style="${iconStyle}">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.46-1.27a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z"></path>
                    </svg>
                </span>
                <a href="tel:${escapeAttr(tel)}" style="${contactLinkStyle}">${escapeHTML(phone)}</a>
            </span>
        `);
    }

    if (email) {
        items.push(`
            <span class="contact-icon-item" style="display:inline-flex;align-items:center;">
                <span style="${iconStyle}">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path>
                        <path d="m22 6-10 7L2 6"></path>
                    </svg>
                </span>
                <a href="mailto:${escapeAttr(email)}" style="${contactLinkStyle}">${escapeHTML(email)}</a>
            </span>
        `);
    }

    if (linkedin) {
        let href = linkedin;
        if (!/^https?:\/\//i.test(href)) href = 'https://' + href;
        items.push(`
            <span class="contact-icon-item" style="display:inline-flex;align-items:center;">
                <span class="contact-icon-glyph contact-icon-glyph-linkedin">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.34 18H5.96V10.35h2.38V18zM7.15 9.31A1.38 1.38 0 1 1 7.15 6.55a1.38 1.38 0 0 1 0 2.76zM18.04 18h-2.38v-3.72c0-.89-.02-2.03-1.24-2.03-1.24 0-1.43.97-1.43 1.97V18h-2.38V10.35h2.28v1.05h.03c.32-.6 1.09-1.24 2.25-1.24 2.41 0 2.87 1.59 2.87 3.66V18z"></path>
                    </svg>
                </span>
                <a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" style="${contactLinkStyle}">${escapeHTML(linkedin)}</a>
            </span>
        `);
    }

    if (location) {
        items.push(`
            <span class="contact-icon-item" style="display:inline-flex;align-items:center;">
                <span style="${iconStyle}">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 1 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                </span>
                <span>${escapeHTML(location)}</span>
            </span>
        `);
    }

    socialLinks.forEach(link => {
        const rawUrl = (link && link.url ? String(link.url) : '').trim();
        if (!rawUrl) return;
        const href = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
        const label = (link && link.label ? String(link.label).trim() : '') || rawUrl;
        items.push(`
            <span class="contact-icon-item" style="display:inline-flex;align-items:center;">
                <a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" style="${contactLinkStyle}">${escapeHTML(label)}</a>
            </span>
        `);
    });

    const rawContact = stripTags(personal.contact || '');
    const extras = rawContact
        .split('|')
        .map(part => part.trim())
        .filter(Boolean)
        // Structured fields (phone/email/linkedin) are authoritative.
        // Avoid rendering these again from legacy/free-text contact input.
        .filter(part => !isPhoneLike(part) && !isEmailLike(part) && !isLinkedInLike(part))
        .filter(part => {
            const low = part.toLowerCase();
            const checks = [phone, email, linkedin, location, ...socialLinks.map(l => (l && l.url) || ''), ...socialLinks.map(l => (l && l.label) || '')]
                .filter(Boolean)
                .map(v => v.toLowerCase());
            return !checks.some(v => low.includes(v) || v.includes(low));
        });

    extras.forEach(extra => {
        items.push(`<span class="contact-icon-item" style="display:inline-flex;align-items:center;">${linkifyContactText(extra)}</span>`);
    });

    const contactNodes = document.querySelectorAll('[data-field="contact"]');
    contactNodes.forEach(el => {
        el.innerHTML = items.length ? items.join(sep) : '';
    });

    renderStandaloneContactField('phone', phone ? `
        <span class="contact-icon-item">
            <span class="contact-icon-glyph">
                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.46-1.27a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z"></path>
                </svg>
            </span>
            <a class="contact-icon-text" href="tel:${escapeAttr(phone.replace(/[^\d+]/g, ''))}" style="${contactLinkStyle}">${escapeHTML(phone)}</a>
        </span>
    ` : '');
    renderStandaloneContactField('email', email ? `
        <span class="contact-icon-item">
            <span class="contact-icon-glyph">
                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path>
                    <path d="m22 6-10 7L2 6"></path>
                </svg>
            </span>
            <a class="contact-icon-text" href="mailto:${escapeAttr(email)}" style="${contactLinkStyle}">${escapeHTML(email)}</a>
        </span>
    ` : '');
    renderStandaloneContactField('linkedin', linkedin ? `
        <span class="contact-icon-item">
            <span class="contact-icon-glyph contact-icon-glyph-linkedin">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.34 18H5.96V10.35h2.38V18zM7.15 9.31A1.38 1.38 0 1 1 7.15 6.55a1.38 1.38 0 0 1 0 2.76zM18.04 18h-2.38v-3.72c0-.89-.02-2.03-1.24-2.03-1.24 0-1.43.97-1.43 1.97V18h-2.38V10.35h2.28v1.05h.03c.32-.6 1.09-1.24 2.25-1.24 2.41 0 2.87 1.59 2.87 3.66V18z"></path>
                </svg>
            </span>
            <a class="contact-icon-text" href="${escapeAttr(/^https?:\/\//i.test(linkedin) ? linkedin : 'https://' + linkedin)}" target="_blank" rel="noopener noreferrer" style="${contactLinkStyle}">${escapeHTML(linkedin)}</a>
        </span>
    ` : '');
    renderStandaloneContactField('location', location ? `
        <span class="contact-icon-item">
            <span class="contact-icon-glyph">
                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 1 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
            </span>
            <span class="contact-icon-text">${escapeHTML(location)}</span>
        </span>
    ` : '');
}

function renderStandaloneContactField(fieldName, html) {
    document.querySelectorAll(`.contact-value[data-field="${fieldName}"]`).forEach(el => {
        el.innerHTML = html || '';
    });
}

function escapeHTML(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHTML(value);
}

function stripTags(value) {
    return String(value || '').replace(/<[^>]*>/g, ' ');
}

function isEmailLike(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isPhoneLike(value) {
    const compact = String(value || '').trim().replace(/[^\d+]/g, '');
    return /^\+?\d{8,15}$/.test(compact);
}

function isLinkedInLike(value) {
    return /(^|:\/\/|www\.)linkedin\.com/i.test(String(value || '').trim());
}

function linkifyContactText(value) {
    const text = String(value || '').trim();
    if (!text) return '';

    // URL
    if (/^(https?:\/\/|www\.)/i.test(text) || /^(linkedin\.com|github\.com|x\.com|twitter\.com|medium\.com|behance\.net|dribbble\.com)/i.test(text)) {
        const href = /^https?:\/\//i.test(text) ? text : `https://${text}`;
        return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:none;border-bottom:1px solid rgba(37,99,235,0.45);padding-bottom:1px;font-weight:500;">${escapeHTML(text)}</a>`;
    }

    // Email
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        return `<a href="mailto:${escapeAttr(text)}" style="color:#2563eb;text-decoration:none;border-bottom:1px solid rgba(37,99,235,0.45);padding-bottom:1px;font-weight:500;">${escapeHTML(text)}</a>`;
    }

    // Phone-like value
    const compact = text.replace(/[^\d+]/g, '');
    if (/^\+?\d{8,15}$/.test(compact)) {
        return `<a href="tel:${escapeAttr(compact)}" style="color:#2563eb;text-decoration:none;border-bottom:1px solid rgba(37,99,235,0.45);padding-bottom:1px;font-weight:500;">${escapeHTML(text)}</a>`;
    }

    return escapeHTML(text);
}

function getTemplateHeaderClass() {
    const page = getPageContainer();
    if (!page) return 'section-header';
    const header = page.querySelector('.section-header, .section-header-2, .section-title');
    if (!header) return 'section-header';
    if (header.classList.contains('section-header-2')) return 'section-header-2';
    if (header.classList.contains('section-title')) return 'section-title';
    return 'section-header';
}

function isClassicBlueTemplate() {
    return /classic-blue\.html$/i.test(String(window.location.pathname || ''));
}

function isClassicBlueDetailSectionKey(key) {
    return ['achievements', 'certifications', 'leadership', 'interests'].includes(String(key || '').toLowerCase());
}

function buildClassicBlueDetailSection(title, listAttr) {
    const safeTitle = escapeHTML(title || 'Custom Section');
    return `
        <table class="extra-table section-detail-table">
            <tbody>
                <tr>
                    <td class="section-label">${safeTitle}</td>
                    <td class="section-content">
                        <ul class="bullet-list" data-list="${escapeAttr(listAttr)}"></ul>
                    </td>
                </tr>
            </tbody>
        </table>
    `;
}

function toReadableSectionLabel(text) {
    const raw = String(text || '').trim();
    if (!raw) return 'Custom Section';
    const compact = raw.replace(/\s+/g, ' ').trim();
    if (compact === compact.toUpperCase()) {
        return compact.toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());
    }
    return compact;
}

function getSectionHeaderElement(section) {
    return section?.querySelector('.section-header, .section-header-2, .section-title, .gray-bar, h2, h3') || null;
}

function getClassicBlueSectionLabel(section, fallbackTitle) {
    const explicit = section?.getAttribute('data-section-label');
    if (explicit) return explicit;
    const header = getSectionHeaderElement(section);
    const headerText = header?.textContent || '';
    return toReadableSectionLabel(headerText || fallbackTitle);
}

function buildClassicBlueGroupHeader(labels) {
    const cleaned = Array.from(new Set((labels || []).map(label => String(label || '').trim()).filter(Boolean)));
    if (cleaned.length === 0) return 'ADDITIONAL INFORMATION';
    if (cleaned.length === 1) return cleaned[0].toUpperCase();
    if (cleaned.length === 2) return `${cleaned[0]} & ${cleaned[1]}`.toUpperCase();
    return `${cleaned.slice(0, -1).join(', ')} & ${cleaned[cleaned.length - 1]}`.toUpperCase();
}

const GROUPABLE_SECTION_DEFAULT_LABELS = {
    certifications: 'Certifications',
    interests: 'Interests',
    skills: 'Skills',
    achievements: 'Highlights',
    leadership: 'Positions of Responsibility'
};
const GROUPABLE_SECTIONS = Object.keys(GROUPABLE_SECTION_DEFAULT_LABELS);

/**
 * Lets the user merge Certifications/Achievements/Leadership/Interests/Skills sections so
 * they share one heading (mirroring Classic Blue's built-in grouping) instead of each getting
 * its own banner. Driven by cvData.sectionGroups: { [sectionId]: true } means "grouped with
 * whatever groupable section precedes it in the current section order." Reuses the anchor
 * section's own real header element rather than inventing a new one, so the merged heading
 * automatically matches each template's visual style.
 */
function getHeaderToggleTarget(header) {
    // Headers embedded in a table row (colspan banner) must hide the whole <tr>,
    // otherwise an empty row remains. Div-based headers toggle directly.
    return header.closest('tr') || header;
}

/**
 * Grouping is enabled for the Classic template only. It needs each groupable section to have a
 * left-label cell (.section-label) to carry the sub-section name under the shared heading —
 * banner-only templates have no such column, so the editor hides the Group button entirely
 * (via the reported capability) and any stored grouping flags are ignored.
 */
function templateSupportsSectionGrouping() {
    // Match classic.html exactly — not classic-blue/classic-grid/classic-ledger.
    if (!/(^|\/)classic\.html$/i.test(String(window.location.pathname || ''))) return false;
    return GROUPABLE_SECTIONS.some(id => {
        const section = document.querySelector(`.sortable-section[data-section-id="${id}"]`);
        return !!(section && section.querySelector('.section-label'));
    });
}

// Returns true when this template supports grouping (so the editor can show/hide the toggle).
function normalizeSectionGrouping(sectionGroups, sectionLabels) {
    if (!templateSupportsSectionGrouping()) return false;

    const groups = sectionGroups || {};
    const labels = sectionLabels || {};
    // Custom sections have no static default label, so fall back to their own left-label cell
    // (populated by setSectionBodyLabel from the user's section title).
    const labelFor = (member) => {
        const custom = labels[member.id]?.text;
        if (custom && String(custom).trim()) return String(custom).trim();
        if (GROUPABLE_SECTION_DEFAULT_LABELS[member.id]) return GROUPABLE_SECTION_DEFAULT_LABELS[member.id];
        const labelCell = member.section.querySelector('.section-label');
        return toReadableSectionLabel(labelCell?.textContent || 'Custom Section');
    };

    const orderedSections = Array.from(document.querySelectorAll('.sortable-section[data-section-id]'))
        .filter(section => GROUPABLE_SECTIONS.includes(section.getAttribute('data-section-id'))
            || section.hasAttribute('data-custom-section-root'));

    let anchor = null;
    let anchorMembers = [];

    const flushAnchorHeader = () => {
        if (anchor && anchorMembers.length > 1) {
            const header = getSectionHeaderElement(anchor);
            if (header) header.textContent = buildClassicBlueGroupHeader(anchorMembers.map(labelFor));
        }
    };

    orderedSections.forEach(section => {
        const id = section.getAttribute('data-section-id');
        if (section.style.display === 'none') return; // empty sections don't join the chain

        section.classList.remove('section-grouped-continuation');
        const header = getSectionHeaderElement(section);
        if (header) getHeaderToggleTarget(header).style.display = '';

        const grouped = !!groups[id] && !!anchor;
        if (!grouped) {
            flushAnchorHeader();
            anchor = section;
            anchorMembers = [{ section, id }];
            return;
        }

        section.classList.add('section-grouped-continuation');
        if (header) getHeaderToggleTarget(header).style.display = 'none';
        anchorMembers.push({ section, id });
    });
    flushAnchorHeader();
    return true;
}

function hasMeaningfulRenderedContent(node) {
    if (!node) return false;
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return true;
    return !!node.querySelector('li, p, div, span, a, br, ul, ol');
}

function normalizeClassicBlueDetailSections() {
    if (!isClassicBlueTemplate()) return;

    const detailDefs = [
        { key: 'certifications', label: 'Certifications' },
        { key: 'achievements', label: 'Achievements' },
        { key: 'leadership', label: 'Leadership' },
        { key: 'interests', label: 'Interests' },
        { key: 'skills', label: 'Skills' }
    ];
    const labelMap = new Map(detailDefs.map(def => [def.key, def.label]));

    const orderedSourceSections = Array.from(document.querySelectorAll('.sortable-section'))
        .filter(section => {
            if (section.classList.contains('classic-blue-detail-group')) return false;
            const sectionId = section.getAttribute('data-section-id') || '';
            return labelMap.has(sectionId) || section.hasAttribute('data-custom-section-root');
        });

    const anchorSection = orderedSourceSections[0] || null;
    if (!anchorSection) return;

    let group = document.querySelector('.sortable-section.classic-blue-detail-group');
    if (!group) {
        group = document.createElement('div');
        group.className = 'sortable-section classic-blue-detail-group';
        group.setAttribute('data-section-id', 'classic-blue-detail-group');

        const header = document.createElement('div');
        header.className = 'section-header';
        header.textContent = 'ADDITIONAL INFORMATION';
        group.appendChild(header);

        const table = document.createElement('table');
        table.className = 'extra-table section-detail-table';
        table.setAttribute('data-preserve-label-columns', '');

        const tbody = document.createElement('tbody');
        table.appendChild(tbody);
        group.appendChild(table);
    }

    anchorSection.parentElement?.insertBefore(group, anchorSection);
    const tbody = group.querySelector('tbody');
    if (!tbody) return;

    const orderedRows = [];
    const getExistingRow = (key) => group.querySelector(`tr[data-detail-source="${key}"]`);

    const ensureRow = (key, label, bodyType) => {
        let row = getExistingRow(key);
        if (!row) {
            const holder = document.createElement('tbody');
            holder.innerHTML = bodyType === 'skills'
                ? `
                    <tr data-detail-source="${escapeAttr(key)}">
                        <td class="section-label">${escapeHTML(label)}</td>
                        <td class="section-content">
                            <div data-field="skills"></div>
                        </td>
                    </tr>
                `
                : `
                    <tr data-detail-source="${escapeAttr(key)}">
                        <td class="section-label">${escapeHTML(label)}</td>
                        <td class="section-content">
                            <ul class="bullet-list" data-list="${escapeAttr(key)}"></ul>
                        </td>
                    </tr>
                `;
            row = holder.querySelector('tr');
        }
        const labelCell = row.querySelector('.section-label');
        if (labelCell) labelCell.textContent = label;
        return row;
    };

    orderedSourceSections.forEach((section, index) => {
        const customRoot = section.getAttribute('data-custom-section-root');
        const key = customRoot ? `custom-${customRoot || index}` : (section.getAttribute('data-section-id') || '');
        const label = customRoot
            ? getClassicBlueSectionLabel(section, 'Custom Section')
            : getClassicBlueSectionLabel(section, labelMap.get(key) || 'Section');
        const row = ensureRow(key, label, !customRoot && key === 'skills' ? 'skills' : 'list');
        let sourceHasContent = false;

        if (!customRoot && key === 'skills') {
            const sourceField = section.querySelector('[data-field="skills"]');
            const targetField = row.querySelector('[data-field="skills"]');
            if (sourceField && targetField && sourceField !== targetField && sourceField.innerHTML.trim()) {
                targetField.innerHTML = sourceField.innerHTML;
            }
            sourceHasContent = hasMeaningfulRenderedContent(sourceField) || hasMeaningfulRenderedContent(targetField);
        } else {
            const sourceList = customRoot
                ? section.querySelector('[data-list="custom-items"]')
                : section.querySelector(`[data-list="${key}"]`);
            const targetList = row.querySelector(`[data-list="${key}"]`);
            if (sourceList && targetList && sourceList !== targetList && sourceList.innerHTML.trim()) {
                targetList.innerHTML = sourceList.innerHTML;
            }
            sourceHasContent = hasMeaningfulRenderedContent(sourceList) || hasMeaningfulRenderedContent(targetList);
        }
        row.style.display = sourceHasContent ? '' : 'none';
        if (customRoot) row.setAttribute('data-custom-detail-row', 'true');
        orderedRows.push(row);
        if (customRoot) {
            section.remove();
        } else {
            section.style.display = 'none';
        }
    });

    Array.from(tbody.querySelectorAll('tr[data-detail-source]')).forEach(row => {
        if (!orderedRows.includes(row)) row.remove();
    });
    orderedRows.forEach(row => tbody.appendChild(row));

    const visibleRows = orderedRows.filter(row => row.style.display !== 'none');
    const header = group.querySelector('.section-header');
    if (header) {
        const headerLabels = visibleRows.map(row => {
            if (row.hasAttribute('data-custom-detail-row')) return 'Additional';
            return toReadableSectionLabel(row.querySelector('.section-label')?.textContent || '');
        });
        header.textContent = buildClassicBlueGroupHeader(headerLabels);
    }
    group.style.display = visibleRows.length > 0 ? '' : 'none';
}

function createInjectedSection(title, contentHTML, key) {
    const wrapper = document.createElement('div');
    wrapper.className = 'section sortable-section universal-injected';
    wrapper.setAttribute('data-universal-section', key);
    wrapper.setAttribute('data-section-id', key);
    wrapper.style.display = 'none';

    const header = document.createElement('div');
    header.className = getTemplateHeaderClass();
    header.textContent = title.toUpperCase();
    wrapper.appendChild(header);

    const body = document.createElement('div');
    body.innerHTML = isClassicBlueTemplate() && isClassicBlueDetailSectionKey(key)
        ? buildClassicBlueDetailSection(title, key)
        : contentHTML;
    Array.from(body.childNodes).forEach(node => wrapper.appendChild(node));
    return wrapper;
}

const UNIVERSAL_SECTION_SCHEMA = [
    { key: 'summary', anchorSelector: '[data-field="summary"]' },
    { key: 'education', anchorSelector: '#education-list, #education-grouped-list' },
    { key: 'experience', anchorSelector: '#experience-list' },
    { key: 'projects', anchorSelector: '#projects-list' },
    { key: 'certifications', anchorSelector: '#cert-list, [data-list="certifications"]' },
    { key: 'achievements', anchorSelector: '[data-list="achievements"]' },
    { key: 'leadership', anchorSelector: '[data-list="leadership"]' },
    { key: 'interests', anchorSelector: '[data-list="interests"]' },
    { key: 'skills', anchorSelector: '[data-field="skills"]' }
];

function findSectionRoot(anchor) {
    if (!anchor) return null;

    const footerCol = anchor.closest('.footer-col');
    if (footerCol) return footerCol;

    // Table-based sections usually store rows in tbody/div list markers.
    if (anchor.id === 'education-list') return anchor.closest('table') || anchor;
    if (anchor.id === 'experience-list') {
        const table = anchor.closest('table');
        return table || anchor;
    }
    if (anchor.id === 'projects-list') return anchor.closest('.section, .section-container, table') || anchor;
    if (anchor.id === 'cert-list') return anchor.closest('table, .section, .section-container') || anchor;
    if (anchor.matches('[data-field="skills"]')) {
        return anchor.closest('tr, .content-block, .section-content, .summary-section, .summary-box, td, ul, div') || anchor;
    }
    if (anchor.matches('[data-field="summary"]')) {
        return anchor.closest('tr, .summary-section, .summary-box, .content-block, .section-content, td, p, div') || anchor;
    }
    if (anchor.matches('[data-list="achievements"], [data-list="leadership"], [data-list="interests"], [data-list="certifications"]')) {
        return anchor.closest('tr, ul, .section, .section-container, .content-block, .section-content, div') || anchor;
    }

    const directSection = anchor.closest('.sortable-section[data-section-id]');
    if (directSection) return directSection;

    const knownWrappers = anchor.closest('.section, .section-container, .content-block, .section-content, .summary-section, .summary-box, .skills-section, .skills-box');
    if (knownWrappers) return knownWrappers;

    const table = anchor.closest('table');
    if (table) return table;

    const tr = anchor.closest('tr');
    if (tr) return tr;

    return anchor;
}

function findSectionHeaderSibling(root) {
    if (!root || !root.previousElementSibling) return null;
    const prev = root.previousElementSibling;
    if (
        prev.classList.contains('section-header') ||
        prev.classList.contains('section-header-2') ||
        prev.classList.contains('section-header-container') ||
        prev.classList.contains('section-title') ||
        prev.classList.contains('gray-bar') ||
        prev.tagName === 'H2' ||
        prev.tagName === 'H3'
    ) {
        return prev;
    }
    return null;
}

function markSectionWrapper(sectionId, root) {
    if (!root) return;
    root.classList.add('sortable-section');
    root.setAttribute('data-section-id', sectionId);
}

function ensureSectionWrappers() {
    UNIVERSAL_SECTION_SCHEMA.forEach(section => {
        if (document.querySelector(`.sortable-section[data-section-id="${section.key}"]`)) return;

        const anchor = document.querySelector(section.anchorSelector);
        if (!anchor) return;

        const root = findSectionRoot(anchor);
        if (!root) return;

        const nonWrappableContainers = ['cv-page', 'zoom-wrapper'];
        if (
            nonWrappableContainers.includes(root.id) ||
            root.classList.contains('cv-page') ||
            root.classList.contains('resume-container') ||
            root.classList.contains('main-container') ||
            root.classList.contains('content-padding') ||
            root.classList.contains('footer-grid')
        ) {
            markSectionWrapper(section.key, anchor);
            return;
        }

        if (root.classList.contains('footer-col')) {
            markSectionWrapper(section.key, root);
            return;
        }

        const header = findSectionHeaderSibling(root);
        if (header && header.parentNode === root.parentNode) {
            const wrapper = document.createElement('div');
            wrapper.className = 'sortable-section';
            wrapper.setAttribute('data-section-id', section.key);
            root.parentNode.insertBefore(wrapper, header);
            wrapper.appendChild(header);
            wrapper.appendChild(root);
            return;
        }

        markSectionWrapper(section.key, root);
    });
}

function ensureUniversalSections() {
    const host = getSectionAppendHost();
    if (!host) return;

    const sectionDefs = [
        {
            key: 'summary',
            exists: () => !!document.querySelector('[data-field="summary"]'),
            build: () => createStyledUniversalSection('summary', 'Career Objective', 'summary') || createInjectedSection('Career Objective', '<div data-field="summary"></div>', 'summary')
        },
        {
            key: 'projects',
            exists: () => !!document.getElementById('projects-list'),
            build: () => createStyledUniversalSection('projects', 'Projects', 'projects') || createInjectedSection('Projects', `
                <div id="projects-list">
                    <div class="template" style="margin-bottom: 8px;">
                        <div style="display:flex; justify-content:space-between; font-weight:bold;">
                            <span data-field="title"></span>
                        </div>
                        <div style="font-style:italic; font-size:0.9em; margin-bottom:4px;" data-field="description"></div>
                        <ul data-list="bullets" style="margin-top: 4px; padding-left: 20px;"></ul>
                    </div>
                </div>
            `, 'projects')
        },
        {
            key: 'certifications',
            exists: () => !!document.getElementById('cert-list') || !!document.querySelector('[data-list="certifications"]'),
            build: () => createInjectedSection('Certifications', '<ul data-list="certifications"></ul>', 'certifications')
        },
        {
            key: 'achievements',
            exists: () => !!document.querySelector('[data-list="achievements"]'),
            build: () => createInjectedSection('Achievements & Awards', '<ul data-list="achievements"></ul>', 'achievements')
        },
        {
            key: 'leadership',
            exists: () => !!document.querySelector('[data-list="leadership"]'),
            build: () => createInjectedSection('Leadership', '<ul data-list="leadership"></ul>', 'leadership')
        },
        {
            key: 'interests',
            exists: () => !!document.querySelector('[data-list="interests"]'),
            build: () => createInjectedSection('Interests & Hobbies', '<ul data-list="interests"></ul>', 'interests')
        },
        {
            key: 'skills',
            exists: () => !!document.querySelector('[data-field="skills"]'),
            build: () => createInjectedSection('Skills', '<div data-field="skills"></div>', 'skills')
        }
    ];

    sectionDefs.forEach(def => {
        const existingInjected = document.querySelector(`[data-universal-section="${def.key}"]`);
        if (!def.exists() && !existingInjected) {
            host.appendChild(def.build());
        }
    });
}

function renderCustomSections(customSections) {
    document.querySelectorAll('[data-custom-section-root]').forEach(el => el.remove());

    const host = getSectionAppendHost();
    if (!host) return;

    (customSections || []).forEach(section => {
        if (!section) return;
        const items = (section.items || []).map(item => (item || '').trim()).filter(Boolean);
        const wrapper = createStyledCustomSection(section, items) || createFallbackCustomSection(section, items);
        host.appendChild(wrapper);
    });
}

function getUniversalReferenceSection() {
    return (
        getCustomSectionReference() ||
        document.querySelector('.sortable-section[data-section-id="skills"]') ||
        document.querySelector('.sortable-section[data-section-id="experience"]') ||
        document.querySelector('.sortable-section[data-section-id="education"]') ||
        document.querySelector('.sortable-section') ||
        null
    );
}

function getPrimaryBodyHost(root) {
    const listHost = root.querySelector('[data-list]');
    if (listHost) return listHost.parentElement || root;

    const skillField = root.querySelector('[data-field="skills"]');
    if (skillField) return skillField.parentElement || root;

    const contentHost = root.querySelector('.details-content, .content-block, .section-content, .content-padding, .skills-col-content, .col-right, td, .footer-col, p');
    return contentHost || root;
}

function buildProjectsTemplateNode() {
    const projectsRoot = document.createElement('div');
    projectsRoot.id = 'projects-list';

    const row = document.createElement('div');
    row.className = 'template';
    row.style.marginBottom = '8px';
    row.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-weight:bold;">
            <span data-field="title"></span>
        </div>
        <div style="font-style:italic; font-size:0.9em; margin-bottom:4px;" data-field="description"></div>
        <ul data-list="bullets" style="margin-top: 4px; padding-left: 20px;"></ul>
    `;
    projectsRoot.appendChild(row);
    return projectsRoot;
}

function createStyledUniversalSection(key, title, kind) {
    const reference = getUniversalReferenceSection();
    if (!reference) return null;

    const wrapper = reference.cloneNode(true);
    wrapper.classList.add('universal-injected');
    wrapper.setAttribute('data-universal-section', key);
    wrapper.setAttribute('data-section-id', key);
    wrapper.style.display = 'none';

    clearHiddenDisplayStyles(wrapper);
    wrapper.querySelectorAll('.template').forEach(el => el.remove());
    setSectionHeaderText(wrapper, title);
    setSectionBodyLabel(wrapper, title);

    const bodyHost = getPrimaryBodyHost(wrapper);
    if (!bodyHost) return null;

    if (kind === 'summary') {
        bodyHost.innerHTML = '';
        const summary = document.createElement('div');
        summary.setAttribute('data-field', 'summary');
        bodyHost.appendChild(summary);
        return wrapper;
    }

    if (kind === 'projects') {
        bodyHost.innerHTML = '';
        bodyHost.appendChild(buildProjectsTemplateNode());
        return wrapper;
    }

    return null;
}

function getCustomSectionReference() {
    const refIds = ['achievements', 'leadership', 'interests', 'certifications'];
    for (const id of refIds) {
        const ref = document.querySelector(`.sortable-section[data-section-id="${id}"]`);
        if (ref) return ref;
    }
    return null;
}

function clearHiddenDisplayStyles(root) {
    if (root.style && root.style.display === 'none') root.style.display = '';
    root.querySelectorAll('*').forEach(el => {
        if (el.style && el.style.display === 'none') el.style.display = '';
    });
}

function setSectionHeaderText(root, title) {
    const text = (title || 'Custom Section').toUpperCase();
    const selectors = [
        '.section-header',
        '.section-header-2',
        '.section-title',
        '.section-header-title',
        '.gray-bar',
        'td.section-header',
        'th.section-header',
        'h2',
        'h3'
    ];
    for (const selector of selectors) {
        const el = root.querySelector(selector);
        if (el) {
            el.textContent = text;
            return;
        }
    }
}

function setSectionBodyLabel(root, title) {
    const label = title || 'Custom Section';
    const labelSelectors = ['.category-label', '.skills-col-label', '.work-label', '.col-left', '.details-label', '.section-label', '.category'];
    for (const selector of labelSelectors) {
        const el = root.querySelector(selector);
        if (el) {
            el.textContent = label;
            return;
        }
    }
}

function getOrCreateListHost(root) {
    const lists = Array.from(root.querySelectorAll('[data-list]'));
    if (lists.length > 0) {
        const primary = lists[0];
        lists.slice(1).forEach(el => {
            el.innerHTML = '';
            el.removeAttribute('data-list');
        });
        primary.setAttribute('data-list', 'custom-items');
        return primary;
    }

    const container = root.querySelector('.content-block, .section-content, .content-padding, .details, .details-content, td, .footer-col, .summary-box') || root;
    const list = document.createElement('ul');
    list.setAttribute('data-list', 'custom-items');
    container.appendChild(list);
    return list;
}

function createStyledCustomSection(section, items) {
    const reference = getCustomSectionReference();
    if (!reference) return null;

    const wrapper = reference.cloneNode(true);
    wrapper.classList.add('custom-section-injected');
    wrapper.setAttribute('data-custom-section-root', section.id || '');
    wrapper.setAttribute('data-section-id', section.id || '');
    wrapper.style.display = items.length > 0 ? '' : 'none';

    clearHiddenDisplayStyles(wrapper);
    wrapper.querySelectorAll('.template').forEach(el => el.remove());
    setSectionHeaderText(wrapper, section.title || 'Custom Section');
    setSectionBodyLabel(wrapper, section.title || 'Custom Section');

    const listHost = getOrCreateListHost(wrapper);
    const bodyHost = listHost.parentElement || wrapper;
    Array.from(bodyHost.children).forEach(child => {
        if (child !== listHost && !child.classList?.contains('section-header')) child.remove();
    });
    listHost.classList.add('bullet-list');
    listHost.innerHTML = items.map(item => `<li>${item}</li>`).join('');

    return wrapper;
}

function createFallbackCustomSection(section, items) {
    const wrapper = document.createElement('div');
    wrapper.className = 'section sortable-section custom-section-injected';
    wrapper.setAttribute('data-custom-section-root', section.id || '');
    wrapper.setAttribute('data-section-id', section.id || '');
    wrapper.style.display = items.length > 0 ? '' : 'none';

    const header = document.createElement('div');
    header.className = getTemplateHeaderClass();
    header.textContent = (section.title || 'Custom Section').toUpperCase();
    wrapper.appendChild(header);

    if (isClassicBlueTemplate()) {
        const body = document.createElement('div');
        body.innerHTML = buildClassicBlueDetailSection(section.title || 'Custom Section', 'custom-items');
        Array.from(body.childNodes).forEach(node => wrapper.appendChild(node));
        const list = wrapper.querySelector('[data-list="custom-items"]');
        if (list) {
            list.innerHTML = items.map(item => `<li>${item}</li>`).join('');
        }
        return wrapper;
    }

    const list = document.createElement('ul');
    list.className = 'bullet-list';
    list.innerHTML = items.map(item => `<li>${item}</li>`).join('');
    wrapper.appendChild(list);

    return wrapper;
}

function applySectionOrder(sectionOrder) {
    if (!Array.isArray(sectionOrder) || sectionOrder.length === 0) return;

    const wrappers = Array.from(document.querySelectorAll('.sortable-section[data-section-id]'));
    if (wrappers.length === 0) return;

    const orderIndex = new Map(sectionOrder.map((id, idx) => [id, idx]));
    const parentMap = new Map();

    wrappers.forEach((wrapper, originalIndex) => {
        const parent = wrapper.parentElement;
        if (!parent) return;
        if (!parentMap.has(parent)) parentMap.set(parent, []);
        parentMap.get(parent).push({ wrapper, originalIndex });
    });

    parentMap.forEach(items => {
        items.sort((a, b) => {
            const aOrder = orderIndex.has(a.wrapper.getAttribute('data-section-id'))
                ? orderIndex.get(a.wrapper.getAttribute('data-section-id'))
                : Number.MAX_SAFE_INTEGER;
            const bOrder = orderIndex.has(b.wrapper.getAttribute('data-section-id'))
                ? orderIndex.get(b.wrapper.getAttribute('data-section-id'))
                : Number.MAX_SAFE_INTEGER;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.originalIndex - b.originalIndex;
        });

        items.forEach(item => item.wrapper.parentElement.appendChild(item.wrapper));
    });
}
