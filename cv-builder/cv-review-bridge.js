export const AUTO_REVIEW_KEY = 'cvbuilder_auto_review';

function decodeBase64(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
        return null;
    }

    try {
        const decoded = atob(value);
        return decoded.length > 0 ? decoded : null;
    } catch {
        return null;
    }
}

export function parseAutoReviewPayload(raw) {
    try {
        const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!value || value.source !== 'cv-builder' || !Array.isArray(value.images) || value.images.length === 0) return null;

        const images = value.images.filter(image => {
            const decoded = decodeBase64(image);
            return decoded && decoded.charCodeAt(0) === 0xff && decoded.charCodeAt(1) === 0xd8 && decoded.charCodeAt(2) === 0xff;
        });
        if (images.length !== value.images.length) return null;

        const safeName = typeof value.fileName === 'string'
            ? value.fileName.replace(/[^A-Za-z0-9._ ()-]/g, '').trim().slice(0, 160)
            : '';
        return { source: 'cv-builder', images, fileName: safeName || 'cv-preview.jpg' };
    } catch {
        return null;
    }
}

export function consumeAutoReviewPayload(storage) {
    let raw = null;
    try {
        raw = storage?.getItem(AUTO_REVIEW_KEY);
    } catch {
        // Storage access blocked
    }

    if (!raw && typeof window !== 'undefined') {
        try {
            raw = window.localStorage?.getItem(AUTO_REVIEW_KEY);
            if (raw) window.localStorage.removeItem(AUTO_REVIEW_KEY);
        } catch {}
    }

    if (!raw) return null;

    try {
        storage?.removeItem(AUTO_REVIEW_KEY);
    } catch {
        // Continue with in-memory value
    }
    return parseAutoReviewPayload(raw);
}

export function storeAutoReviewPayload(storage, payload) {
    const serialized = JSON.stringify(payload);
    try {
        storage?.setItem(AUTO_REVIEW_KEY, serialized);
        return true;
    } catch (error) {
        console.warn('sessionStorage failed, attempting localStorage fallback:', error);
        try {
            if (typeof window !== 'undefined') {
                window.localStorage?.setItem(AUTO_REVIEW_KEY, serialized);
                return true;
            }
        } catch (e) {
            console.warn('localStorage fallback failed:', e);
        }
        return false;
    }
}

async function getReadyPreview(targetWindow) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        const frame = targetWindow.document?.getElementById('cv-frame');
        try {
            const frameDocument = frame?.contentDocument || frame?.contentWindow?.document;
            const node = frameDocument?.getElementById('cv-page') || frameDocument?.querySelector?.('.cv-page') || frameDocument?.body;
            if (frame && frameDocument && node && frameDocument.readyState !== 'loading') return { frameDocument, node };
        } catch {
            throw new Error('The live CV preview is not accessible.');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('The live CV preview is still loading. Please try again.');
}

function rememberInlineStyle(element) {
    if (!element) return () => {};
    const original = element.getAttribute?.('style');
    return () => {
        if (original === null || original === undefined) element.removeAttribute?.('style');
        else element.setAttribute?.('style', original);
    };
}

function setStyle(style, property, value, priority = '') {
    if (!style) return;
    if (typeof style?.setProperty === 'function') style.setProperty(property, value, priority);
    else style[property.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
}

async function waitForLayout(targetWindow) {
    const requestFrame = targetWindow.requestAnimationFrame?.bind(targetWindow)
        || (callback => setTimeout(callback, 16));
    await new Promise(resolve => requestFrame(() => requestFrame(resolve)));
}

async function prepareCaptureLayout(targetWindow, frame, node) {
    const preview = frame.closest?.('.preview') || frame.closest?.('.preview-wrapper');
    const restorePreview = rememberInlineStyle(preview);
    const restoreNode = rememberInlineStyle(node);

    if (preview) {
        setStyle(preview.style, 'display', 'flex', 'important');
        setStyle(preview.style, 'transform', 'none', 'important');
        setStyle(preview.style, 'position', 'fixed', 'important');
        setStyle(preview.style, 'left', '-100000px', 'important');
        setStyle(preview.style, 'top', '0', 'important');
    }
    setStyle(node.style, 'transform', 'none', 'important');
    setStyle(node.style, 'transform-origin', 'top left', 'important');
    setStyle(node.style, 'margin-bottom', '0px', 'important');
    setStyle(node.style, 'zoom', '1', 'important');

    await waitForLayout(targetWindow);
    setStyle(node.style, 'transform', 'none', 'important');
    setStyle(node.style, 'margin-bottom', '0px', 'important');

    return () => {
        restoreNode();
        restorePreview();
    };
}

async function ensureHtml2Canvas(targetWindow = window) {
    if (typeof targetWindow.html2canvas === 'function') return targetWindow.html2canvas;
    if (targetWindow.html2canvas?.default) return targetWindow.html2canvas.default;

    return new Promise((resolve, reject) => {
        const existing = targetWindow.document.querySelector('script[src*="html2canvas"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(targetWindow.html2canvas));
            existing.addEventListener('error', reject);
            return;
        }
        const script = targetWindow.document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        script.onload = () => resolve(targetWindow.html2canvas);
        script.onerror = () => reject(new Error('Failed to load canvas capture tools.'));
        targetWindow.document.head.appendChild(script);
    });
}

export function buildPreviewReviewFilename(targetWindow = window) {
    const activeCvData = targetWindow.cvData || (typeof cvData !== 'undefined' ? cvData : null);
    const rawName = (activeCvData?.personal?.name || 'cv-preview').trim();
    const safeName = rawName
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return `${safeName || 'cv-preview'}.pdf`;
}

export async function captureCvPreviewBase64(targetWindow = window) {
    const { frameDocument, node } = await getReadyPreview(targetWindow);
    const frame = targetWindow.document.getElementById('cv-frame');

    const h2c = await ensureHtml2Canvas(targetWindow);
    if (typeof h2c !== 'function') throw new Error('CV capture tools are not ready. Please reload and try again.');

    if (frameDocument.fonts?.ready) await frameDocument.fonts.ready;
    const restoreLayout = await prepareCaptureLayout(targetWindow, frame, node);
    let canvas;
    try {
        const width = Math.max(node.scrollWidth || 0, node.offsetWidth || 0, 800);
        const height = Math.max(node.scrollHeight || 0, node.offsetHeight || 0, 1100);
        canvas = await h2c(node, {
            scale: 2,
            useCORS: true,
            logging: false,
            width,
            height,
            windowWidth: width,
            windowHeight: height,
            onclone: clonedDocument => {
                frameDocument.querySelectorAll?.('style, link[rel="stylesheet"]').forEach(style => {
                    clonedDocument.head?.appendChild(style.cloneNode(true));
                });
            }
        });
    } finally {
        restoreLayout();
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const image = dataUrl.startsWith('data:image/jpeg;base64,') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : '';
    const fileName = buildPreviewReviewFilename(targetWindow);
    return { image, fileName };
}

export function registerBuilderReviewBridge(targetWindow = window) {
    if (!targetWindow?.document?.getElementById('cv-frame')) return false;

    targetWindow.buildPreviewReviewFilename = () => buildPreviewReviewFilename(targetWindow);
    targetWindow.captureCvPreviewBase64 = () => captureCvPreviewBase64(targetWindow);

    targetWindow.startReviewFromPreview = async function startReviewFromPreview() {
        if (targetWindow.cvReviewerEmbedded && typeof targetWindow.cvReviewerEmbedded.openReview === 'function') {
            targetWindow.cvReviewerEmbedded.openReview();
            return;
        }
        if (typeof targetWindow.switchTab === 'function') {
            targetWindow.switchTab('reviewer');
            return;
        }
        targetWindow.location.href = '/cv-reviewer/';
    };
    targetWindow.startReviewFromPreview.isCvBuilderRedirectBridge = false;
    return true;
}

if (typeof window !== 'undefined') {
    registerBuilderReviewBridge(window);
    document.addEventListener('DOMContentLoaded', () => registerBuilderReviewBridge(window), { once: true });
}
