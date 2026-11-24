// "Application ID" can hold several comma-separated links ("https://a…, https://b…").
// Apply Now must open each one in its own tab, never one tab with both glued together.

// The web links in an Application ID, in order. Emails and plain text are left out.
// Splits only where a new link starts, so a comma inside one link (?loc=Mumbai,Pune) stays.
export function getApplyUrls(applicationId) {
    return String(applicationId || '')
        .split(/,\s*(?=https?:\/\/)/i)
        .map(part => part.trim())
        .filter(part => {
            if (!/^https?:\/\//i.test(part)) return false;
            try { new URL(part); return true; } catch (_) { return false; }
        });
}

function openTab(url) {
    const tab = window.open(url, '_blank');
    if (tab) {
        try { tab.opener = null; } catch (_) { /* cross-origin already */ }
    }
    return Boolean(tab);
}

// Browsers usually allow one new tab per click, so links the browser blocks wait on the
// button: it reads "Open link 2 of 2" and the next click opens the next link.
function queueOnButton(button, urls, total) {
    if (!button) return;
    if (!button.__applyOriginalHtml) button.__applyOriginalHtml = button.innerHTML;
    button.__applyQueue = urls.slice();
    button.__applyTotal = total;
    const next = total - urls.length + 1;
    button.innerHTML = `<i class="fas fa-external-link-alt"></i> Open link ${next} of ${total}`;
}

// Call first in an Apply Now click handler. Returns true when the click only opened the next
// waiting link (the application was already recorded on the first click).
export function openQueuedApplyLink(button) {
    const queue = button && button.__applyQueue;
    if (!queue || queue.length === 0) return false;
    const total = button.__applyTotal || queue.length;
    // Try every waiting link; a browser that allows only one tab per click stops after the first.
    while (queue.length && openTab(queue[0])) queue.shift();
    if (queue.length) {
        queueOnButton(button, queue, total);
    } else {
        button.innerHTML = button.__applyOriginalHtml;
        delete button.__applyQueue;
        delete button.__applyTotal;
        delete button.__applyOriginalHtml;
    }
    return true;
}

// Opens every web link of the Application ID in its own tab. `fallbackLink` is used when the
// field has no web link (e.g. a Google search for a company name).
export function openApplyLinks(applicationId, fallbackLink, button) {
    const urls = getApplyUrls(applicationId);
    if (urls.length === 0) {
        if (fallbackLink && fallbackLink !== '#') openTab(fallbackLink);
        return;
    }
    let index = 0;
    while (index < urls.length && openTab(urls[index])) index += 1;
    if (index < urls.length) queueOnButton(button, urls.slice(index), urls.length);
}
