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
        return null;
    }
    if (!raw) return null;

    try {
        storage.removeItem(AUTO_REVIEW_KEY);
    } catch {
        // Continue with the in-memory value. A later load may retry it if removal is blocked.
    }
    return parseAutoReviewPayload(raw);
}

export function storeAutoReviewPayload(storage, payload) {
    try {
        storage?.setItem(AUTO_REVIEW_KEY, JSON.stringify(payload));
        return true;
    } catch (error) {
        console.warn('Unable to store CV review payload:', error);
        return false;
    }
}

async function getReadyPreview(targetWindow) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        const frame = targetWindow.document?.getElementById('cv-frame');
        try {
            const frameDocument = frame?.contentDocument || frame?.contentWindow?.document;
            const node = frameDocument?.getElementById('cv-page') || frameDocument?.body;
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
    const preview = frame.closest?.('.preview');
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
    // Template resize handlers may restore their screen scale after the preview becomes visible.
    setStyle(node.style, 'transform', 'none', 'important');
    setStyle(node.style, 'margin-bottom', '0px', 'important');

    return () => {
        restoreNode();
        restorePreview();
    };
}

export function registerBuilderReviewBridge(targetWindow = window) {
    if (!targetWindow?.document?.getElementById('cv-frame')) return false;
    if (targetWindow.startReviewFromPreview?.isCvBuilderRedirectBridge) return true;

    const inlineReview = targetWindow.startInlineReviewFromPreview || targetWindow.startReviewFromPreview;
    if (typeof inlineReview === 'function') targetWindow.startInlineReviewFromPreview = inlineReview;

    targetWindow.startReviewFromPreview = async function startReviewFromPreview() {
        try {
            targetWindow.showToast?.('Preparing CV for review…');
            const { frameDocument, node } = await getReadyPreview(targetWindow);
            const frame = targetWindow.document.getElementById('cv-frame');
            const ensureHtml2Canvas = targetWindow.ensureHtml2Canvas;
            if (typeof ensureHtml2Canvas !== 'function') throw new Error('CV capture tools are not ready. Please reload and try again.');

            const html2canvas = await ensureHtml2Canvas();
            if (frameDocument.fonts?.ready) await frameDocument.fonts.ready;
            const restoreLayout = await prepareCaptureLayout(targetWindow, frame, node);
            let canvas;
            try {
                const width = Math.max(node.scrollWidth || 0, node.offsetWidth || 0);
                const height = Math.max(node.scrollHeight || 0, node.offsetHeight || 0);
                canvas = await html2canvas(node, {
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
            const payload = parseAutoReviewPayload({
                source: 'cv-builder',
                images: [image],
                fileName: targetWindow.buildPreviewReviewFilename?.() || 'cv-preview.jpg'
            });
            if (!payload) throw new Error('The CV preview could not be converted to an image.');

            targetWindow.saveCvBuilderLocal?.();
            if (!storeAutoReviewPayload(targetWindow.sessionStorage, payload)) {
                throw new Error('This CV is too large to transfer for review. Try downloading it as PDF and upload it on the reviewer page.');
            }
            targetWindow.location.href = '/cv-reviewer/';
        } catch (error) {
            console.error('Review redirect error:', error);
            targetWindow.alert?.(error?.message || 'Failed to prepare the CV for review.');
        }
    };
    targetWindow.startReviewFromPreview.isCvBuilderRedirectBridge = true;
    return true;
}

if (typeof window !== 'undefined') {
    const registerWhenInlineReviewerIsReady = () => {
        if (typeof window.startReviewFromPreview === 'function' && typeof window.ensureHtml2Canvas === 'function') {
            registerBuilderReviewBridge(window);
        }
    };
    registerWhenInlineReviewerIsReady();
    document.addEventListener('DOMContentLoaded', registerWhenInlineReviewerIsReady, { once: true });
}
