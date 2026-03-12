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

    // 1. Personal Info
    setHTML('[data-field="name"]', data.personal?.name);
    setHTML('[data-field="tagline"]', data.personal?.tagline);
    setHTML('[data-field="contact"]', data.personal?.contact);
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
    const hasExp = data.experience && data.experience.length > 0;
    updateList('experience-list', data.experience, hasExp, (block, item) => {
        setHTMLIn(block, '[data-field="role"]', item.role);
        setHTMLIn(block, '[data-field="company"]', item.company);
        setHTMLIn(block, '[data-field="dates"]', item.dates);
        setHTMLIn(block, '[data-field="category"]', item.category); // Department/Area like "Business Finance"

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
        setHTMLIn(block, '[data-field="description"]', item.description);

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
    enforceExperienceOnlyLeftLabels();

    // 12. Recalculate Layout (Scale/Shrink)
    // These functions exist in the templates script block
    // Use requestAnimationFrame to ensure DOM is fully updated before recalculating
    requestAnimationFrame(() => {
        if (typeof window.shrinkContentToFit === 'function') {
            window.shrinkContentToFit();
        }
        if (typeof window.scaleToFit === 'function') {
            window.scaleToFit();
        }
    });
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

function renderSimpleList(items, selector) {
    const container = document.querySelector(selector);
    if (!container) return;

    const hasItems = items && items.length > 0;
    toggleSectionElement(container, hasItems);

    if (hasItems) {
        container.innerHTML = items.map(item => `<li>${item}</li>`).join('');
    }
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
    const directMainContainer = Array.from(page.children).find(child => child.classList && child.classList.contains('main-container'));
    if (directMainContainer) return directMainContainer;

    const directContentPadding = Array.from(page.children).find(child => child.classList && child.classList.contains('content-padding'));
    if (directContentPadding) return directContentPadding;

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

    if (phone) {
        const tel = phone.replace(/[^\d+]/g, '');
        items.push(`
            <span class="contact-icon-item" style="display:inline-flex;align-items:center;">
                <span style="${iconStyle}">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.46-1.27a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z"></path>
                    </svg>
                </span>
                <a href="tel:${escapeAttr(tel)}" style="color:inherit;text-decoration:none;border-bottom:1px solid currentColor;">${escapeHTML(phone)}</a>
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
                <a href="mailto:${escapeAttr(email)}" style="color:inherit;text-decoration:none;border-bottom:1px solid currentColor;">${escapeHTML(email)}</a>
            </span>
        `);
    }

    if (linkedin) {
        let href = linkedin;
        if (!/^https?:\/\//i.test(href)) href = 'https://' + href;
        items.push(`
            <span class="contact-icon-item" style="display:inline-flex;align-items:center;">
                <span style="${iconStyle}width:1.14em;height:1.14em;">
                    <svg viewBox="0 0 24 24" width="1.14em" height="1.14em" fill="currentColor" aria-hidden="true">
                        <path d="M6.94 8.5A1.56 1.56 0 1 1 6.94 5.38 1.56 1.56 0 0 1 6.94 8.5zM5.6 9.82h2.67v8.58H5.6V9.82zm4.3 0h2.56v1.17h.04c.36-.67 1.23-1.37 2.53-1.37 2.71 0 3.21 1.79 3.21 4.11v4.67h-2.67v-4.14c0-.99-.02-2.26-1.38-2.26-1.39 0-1.6 1.08-1.6 2.19v4.21H9.9V9.82z"></path>
                    </svg>
                </span>
                <a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none;border-bottom:1px solid currentColor;">${escapeHTML(linkedin)}</a>
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
                <a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none;border-bottom:1px solid currentColor;">${escapeHTML(label)}</a>
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
        return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none;border-bottom:1px solid currentColor;">${escapeHTML(text)}</a>`;
    }

    // Email
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        return `<a href="mailto:${escapeAttr(text)}" style="color:inherit;text-decoration:none;border-bottom:1px solid currentColor;">${escapeHTML(text)}</a>`;
    }

    // Phone-like value
    const compact = text.replace(/[^\d+]/g, '');
    if (/^\+?\d{8,15}$/.test(compact)) {
        return `<a href="tel:${escapeAttr(compact)}" style="color:inherit;text-decoration:none;border-bottom:1px solid currentColor;">${escapeHTML(text)}</a>`;
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
    body.innerHTML = contentHTML;
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
    const labelSelectors = ['.category-label', '.skills-col-label', '.work-label', '.col-left', '.details-label'];
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

    const list = document.createElement('ul');
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
