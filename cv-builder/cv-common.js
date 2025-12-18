/**
 * Common CV Logic for template rendering
 * Handles 'update-cv' messages from the editor (index.html)
 */

window.addEventListener('message', (event) => {
    // Basic security check: ensure message is data we expect
    const data = event.data;
    if (!data || data.type !== 'update-cv') return;

    renderCV(data.payload);
});

function renderCV(data) {
    if (!data) return;

    // 1. Personal Info
    setHTML('[data-field="name"]', data.personal?.name);
    setHTML('[data-field="contact"]', data.personal?.contact); // Assuming contact is pre-formatted HTML or text

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

    // 4. Experience
    const hasExp = data.experience && data.experience.length > 0;
    updateList('experience-list', data.experience, hasExp, (block, item) => {
        setHTMLIn(block, '[data-field="role"]', item.role);
        setHTMLIn(block, '[data-field="company"]', item.company);
        setHTMLIn(block, '[data-field="dates"]', item.dates);

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
    // Fallback for templates using bullets in a div
    if (data.certifications && data.certifications.length) {
        const certContainer = document.querySelector('[data-list="certifications"]');
        if (certContainer) {
            certContainer.innerHTML = data.certifications.map(c => `<li>${c.name || c} ${c.issuer ? '- ' + c.issuer : ''}</li>`).join('');
            toggleSectionElement(certContainer, true);
        }
    }

    // 6. Achievements (Simple List)
    renderSimpleList(data.achievements, '[data-list="achievements"]');

    // 7. Leadership (Simple List)
    renderSimpleList(data.leadership, '[data-list="leadership"]');

    // 8. Interests (Simple List)
    renderSimpleList(data.interests, '[data-list="interests"]');

    // Extra check for certifications if rendered as simple list
    if (data.certifications && data.certifications.length > 0 && document.querySelector('[data-list="certifications"]')) {
        renderSimpleList(data.certifications.map(c => typeof c === 'string' ? c : `${c.name || ''} ${c.issuer ? '- ' + c.issuer : ''}`), '[data-list="certifications"]');
    }

    // 9. Skills
    const hasSkills = !!(data.skills && data.skills.trim());
    setHTML('[data-field="skills"]', data.skills);
    toggleSectionByContent('[data-field="skills"]', hasSkills);

    // 10. Recalculate Layout (Scale/Shrink)
    // These functions exist in the templates script block
    if (typeof window.shrinkContentToFit === 'function') {
        window.shrinkContentToFit();
    }
    if (typeof window.scaleToFit === 'function') {
        window.scaleToFit();
    }
}

// Helper: Set innerHTML safely
function setHTML(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.innerHTML = value || '';
}

// Helper: Set innerHTML inside a container
function setHTMLIn(container, selector, value) {
    const el = container.querySelector(selector);
    if (el) el.innerHTML = value || '';
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

// Core toggler that finds headers
function toggleSectionElement(element, isVisible) {
    if (!element) return;

    // 1. Toggle the element itself
    element.style.display = isVisible ? '' : 'none';

    // Special Handling: If this element is inside a table row (like in CV2/CV3),
    // and that row is dedicated to this content, hide the row too.
    const parentTd = element.closest('td');
    if (parentTd) {
        const parentTr = parentTd.closest('tr');
        if (parentTr) {
            // Only hide the TR if this element is the main content provider for it
            // Assumption: If data-list is on an element in a TD, that TR is likely just for that list.
            parentTr.style.display = isVisible ? '' : 'none';
        }
    }

    // 2. Find the associated header (Previous Sibling Heuristic)
    // We search backwards for a 'section-header', 'section-title', or similar
    // Note: If we are in a table (like CV2), the header is often outside the table.
    // We shouldn't hide the header if the table still has visible rows.

    let containerForHeaderSearch = element;
    if (parentTd && element.closest('table')) {
        containerForHeaderSearch = element.closest('table');
        // If table has other visible rows, don't hide the table or header
        const table = containerForHeaderSearch;
        const visibleRows = Array.from(table.querySelectorAll('tr')).filter(tr => tr.style.display !== 'none');
        if (visibleRows.length > 0 && !isVisible) return; // Don't hide header if there are other visible rows
    }

    let sibling = containerForHeaderSearch.previousElementSibling;
    let header = null;
    let limit = 5; // Search limit to avoid hiding unrelated things

    while (sibling && limit > 0) {
        // Check for common header classes or tags
        if (
            sibling.classList.contains('section-header') ||
            sibling.classList.contains('section-title') ||
            sibling.tagName === 'H2' ||
            sibling.tagName === 'H3' ||
            (sibling.classList.contains('sub-header') && element.classList.contains('content-padding')) // Template 6 specific
        ) {
            header = sibling;
            break;
        }
        sibling = sibling.previousElementSibling;
        limit--;
    }

    if (header) {
        header.style.display = isVisible ? '' : 'none';
        if (containerForHeaderSearch.tagName === 'TABLE') {
            containerForHeaderSearch.style.display = isVisible ? '' : 'none';
        }
    }
}