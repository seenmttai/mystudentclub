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

// Initialize with empty data on load to hide all sections by default
document.addEventListener('DOMContentLoaded', () => {
    renderCV({
        personal: {},
        summary: '',
        education: [],
        experience: [],
        certifications: [],
        achievements: [],
        leadership: [],
        interests: [],
        skills: ''
    });
});

function renderCV(data) {
    if (!data) return;

    // 1. Personal Info
    setHTML('[data-field="name"]', data.personal?.name);
    setHTML('[data-field="tagline"]', data.personal?.tagline);
    setHTML('[data-field="contact"]', data.personal?.contact);
    setHTML('[data-field="phone"]', data.personal?.phone);
    setHTML('[data-field="email"]', data.personal?.email);
    setHTML('[data-field="linkedin"]', data.personal?.linkedin);
    
    // Hide contact-block if phone, email, linkedin are all empty (CV-5 pattern)
    const hasContactDetails = !!(data.personal?.phone || data.personal?.email || data.personal?.linkedin);
    const contactBlock = document.querySelector('.contact-block');
    if (contactBlock) {
        contactBlock.style.display = hasContactDetails ? '' : 'none';
    }
    
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
            certContainer.innerHTML = data.certifications.map(c => `<li>${c.name || c} ${c.issuer ? '- ' + c.issuer : ''}</li>`).join('');
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
    const hasSkills = !!(data.skills && data.skills.trim());
    setHTML('[data-field="skills"]', data.skills);
    toggleSectionByContent('[data-field="skills"]', hasSkills);

    // 10. Recalculate Layout (Scale/Shrink)
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

// Core toggler that finds headers and hides entire sections
function toggleSectionElement(element, isVisible) {
    if (!element) return;

    // 1. Toggle the element itself
    element.style.display = isVisible ? '' : 'none';

    // 2. Find the appropriate container to hide
    // Walk up the DOM to find a proper section container
    let containerToHide = element;
    let headerToHide = null;

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
    const contentPadding = element.closest('.content-padding');
    if (contentPadding) {
        containerToHide = contentPadding;
    }

    // Check if element is inside a section-container (CV-6)
    // These wrap both the title and content
    const sectionContainer = element.closest('.section-container');
    if (sectionContainer) {
        containerToHide = sectionContainer;
        // The section-title is inside, so we need to find it
        headerToHide = sectionContainer.querySelector('.section-title');
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