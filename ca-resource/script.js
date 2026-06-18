// ─── Supabase Client & Authentication State ───
const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

let userEmail = '';

// Try parsing userEmail from localStorage immediately as a fast synchronous fallback
try {
    const sbKey = 'sb-izsggdtdiacxdsjjncdq-auth-token';
    const sbData = localStorage.getItem(sbKey);
    if (sbData) {
        const parsed = JSON.parse(sbData);
        if (parsed && parsed.user && parsed.user.email) {
            userEmail = parsed.user.email;
        }
    }
} catch (e) {
    console.warn('Failed to parse synchronous session fallback:', e);
}

// ─── State ───
const urlParams = new URLSearchParams(window.location.search);
const paramPdf = urlParams.get('pdf');
const paramDl = urlParams.get('dl');
const previewMode = urlParams.get('preview');
const PDF_URL = paramPdf ? paramPdf : 'https://www.mystudentclub.com/assets/doc.pdf';

let pdfDoc = null;
let totalPages = 0;
let sidebarOpen = false;
let flipbookReady = false;
let viewMode = 'single';  // 'single' | 'double'
const DEFAULT_INITIAL_ZOOM = 1;
const MAX_RENDER_OUTPUT_SCALE = 3.4;
const MIN_RENDER_OUTPUT_SCALE = 2;

// Search state
let searchMatches = [];     // Array of { page, index, itemIdx, charOffset }
let searchIndex = -1;
let currentSearchTerm = '';

// ─── DOM ───
const _$ = id => document.getElementById(id);
const prevBtn = _$('prev-page');
const nextBtn = _$('next-page');
const pageInput = _$('page-input');
const pageCountEl = _$('page-count');
const searchInput = _$('search-input');
const searchPrevBtn = _$('search-prev');
const searchNextBtn = _$('search-next');
const searchInfo = _$('search-info');
const zoomOutBtn = _$('zoom-out');
const zoomInBtn = _$('zoom-in');
const zoomLevel = _$('zoom-level');
const fitPageBtn = _$('fit-page-btn');
const fitWidthBtn = _$('fit-width-btn');
const sidebarToggle = _$('sidebar-toggle');
const sidebar = _$('sidebar');
const thumbList = _$('thumbnail-list');
const viewerArea = _$('viewer-area');
const flipbookEl = _$('flipbook');
const loadingOverlay = _$('loading-overlay');
const previewModeChip = _$('preview-mode-chip');

// ─── Flipbook Dimensions ───
function getFlipbookDimensions() {
    const style = getComputedStyle(viewerArea);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const availW = viewerArea.clientWidth - padX;
    const availH = viewerArea.clientHeight - padY;
    return { availW, availH };
}

function calcPageSize(pdfPageViewport) {
    const { availW, availH } = getFlipbookDimensions();
    const pdfRatio = pdfPageViewport.width / pdfPageViewport.height;

    let maxPageW, maxPageH;
    if (viewMode === 'single') {
        // Single mode: one page fills the available width
        maxPageW = availW * 0.85;
        maxPageH = availH * 0.92;
    } else {
        // Double mode: each page is half the book width
        maxPageW = availW / 2 * 0.92;
        maxPageH = availH * 0.92;
    }

    let pageW, pageH;
    if (maxPageW / pdfRatio <= maxPageH) {
        pageW = maxPageW;
        pageH = pageW / pdfRatio;
    } else {
        pageH = maxPageH;
        pageW = pageH * pdfRatio;
    }

    // Secure zoom constraint: enforce a minimum page height of 1.25x viewport height
    const minSecureHeight = Math.round(availH * 1.25);
    if (pageH < minSecureHeight) {
        pageH = minSecureHeight;
        pageW = pageH * pdfRatio;
    }

    return { pageW: Math.floor(pageW), pageH: Math.floor(pageH) };
}

// ─── Render PDF page to canvas ───
async function renderPageToCanvas(pageNum, width, height) {
    const page = await pdfDoc.getPage(pageNum);
    const canvas = document.createElement('canvas');
    const deviceScale = window.devicePixelRatio || 1;
    const outputScale = Math.min(MAX_RENDER_OUTPUT_SCALE, Math.max(MIN_RENDER_OUTPUT_SCALE, deviceScale * 1.5));

    const baseViewport = page.getViewport({ scale: 1 });
    const cssScale = width / baseViewport.width;
    const viewport = page.getViewport({ scale: cssScale });
    const cssWidth = Math.round(viewport.width);
    const cssHeight = Math.round(viewport.height);

    canvas.width = Math.ceil(cssWidth * outputScale);
    canvas.height = Math.ceil(cssHeight * outputScale);
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Render the PDF content
    await page.render({
        canvasContext: ctx,
        viewport,
        transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
    }).promise;

    // Draw the secure email watermark
    if (userEmail) {
        drawWatermarkOnCanvas(ctx, canvas.width, canvas.height, outputScale, userEmail);
    }

    // Apply highlights if searching
    if (currentSearchTerm) {
        await drawHighlightsOnCanvas(ctx, page, viewport, outputScale);
    }

    return { canvas, page, viewport };
}

function drawWatermarkOnCanvas(ctx, canvasWidth, canvasHeight, outputScale, email) {
    ctx.save();
    
    // Set font style
    const fontSize = Math.max(10, Math.round(14 * outputScale));
    ctx.font = `bold ${fontSize}px 'Inter', sans-serif`;
    ctx.fillStyle = 'rgba(128, 128, 128, 0.14)'; // light gray with transparency
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Calculate diagonal steps to cover the canvas with a grid of watermarks
    const angle = -30 * Math.PI / 180;
    ctx.rotate(angle);
    
    const stepX = 250 * outputScale;
    const stepY = 180 * outputScale;
    
    // Cover rotated canvas bounds
    const startX = -canvasWidth;
    const endX = canvasWidth * 2;
    const startY = -canvasHeight;
    const endY = canvasHeight * 2;
    
    for (let x = startX; x < endX; x += stepX) {
        for (let y = startY; y < endY; y += stepY) {
            ctx.fillText(email, x, y);
        }
    }
    
    ctx.restore();
}

// ─── Render Annotations Layer (Links) ───
async function renderAnnotationLayer(page, viewport, container) {
    try {
        const annotations = await page.getAnnotations();
        // Remove any existing annotation layer in this page element first
        // to prevent duplicate layers on page resize/re-render.
        const existing = container.querySelector('.pdf-annotation-layer');
        if (existing) {
            existing.remove();
        }

        if (!annotations || annotations.length === 0) return;

        const annotationLayerDiv = document.createElement('div');
        annotationLayerDiv.className = 'pdf-annotation-layer';
        // Size it to the exact cssWidth / cssHeight of the viewport
        annotationLayerDiv.style.width = Math.round(viewport.width) + 'px';
        annotationLayerDiv.style.height = Math.round(viewport.height) + 'px';

        let hasLinks = false;

        annotations.forEach(annotation => {
            if (annotation.subtype === 'Link') {
                const url = annotation.url || annotation.unsafeUrl;
                if (!url) return;

                const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(annotation.rect);
                const rectWidth = Math.abs(x2 - x1);
                const rectHeight = Math.abs(y2 - y1);
                const left = Math.min(x1, x2);
                const top = Math.min(y1, y2);

                const link = document.createElement('a');
                link.href = url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.style.left = left + 'px';
                link.style.top = top + 'px';
                link.style.width = rectWidth + 'px';
                link.style.height = rectHeight + 'px';
                link.title = url;

                annotationLayerDiv.appendChild(link);
                hasLinks = true;
            }
        });

        if (hasLinks) {
            container.appendChild(annotationLayerDiv);
        }
    } catch (e) {
        console.error('Annotation rendering error:', e);
    }
}

// ─── Highlighting Logic ───
async function drawHighlightsOnCanvas(ctx, page, viewport, outputScale) {
    try {
        const textContent = await page.getTextContent();
        const items = textContent.items;
        const term = currentSearchTerm.toLowerCase();

        ctx.save();
        // Scale context if we are using outputScale
        if (outputScale !== 1) {
            ctx.scale(outputScale, outputScale);
        }

        items.forEach((item, itemIdx) => {
            if (!item.str) return;
            const str = item.str.toLowerCase();
            let idx = -1;
            
            while ((idx = str.indexOf(term, idx + 1)) !== -1) {
                // Determine if this is the "active" match
                const isCurrentMatch = searchIndex >= 0 && 
                                     searchMatches[searchIndex] &&
                                     searchMatches[searchIndex].page === page.pageNumber &&
                                     searchMatches[searchIndex].itemIdx === itemIdx &&
                                     searchMatches[searchIndex].charOffset === idx;

                drawMatchHighlight(ctx, item, viewport, idx, term.length, isCurrentMatch);
            }
        });
        ctx.restore();
    } catch (e) {
        console.error('Highlighting error:', e);
    }
}

function drawMatchHighlight(ctx, item, viewport, charOffset, len, isCurrent) {
    // The item.transform is [scaleX, skewX, skewY, scaleY, tx, ty]
    // PDF.js coordinates have origin at bottom-left.
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    
    // fontHeight is approximately the scaleY of the combined transform
    const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
    const fontWidth = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
    
    // Estimate width per character if we don't have individual glyph widths
    // PDF.js items have 'width' which is the total width of the string in PDF units
    const totalWidth = item.width * (fontWidth / (item.transform[0] || fontWidth));
    const charWidth = totalWidth / item.str.length;
    
    const x = tx[4] + (charOffset * charWidth);
    const y = tx[5] - fontHeight; // text baseline is at tx[5], move up to top of font
    const rectWidth = len * charWidth;
    const rectHeight = fontHeight * 1.1; // slight padding

    ctx.fillStyle = isCurrent ? 'rgba(255, 150, 0, 0.6)' : 'rgba(255, 255, 0, 0.4)';
    ctx.fillRect(x, y, rectWidth, rectHeight);
    
    // Add a small border to current match
    if (isCurrent) {
        ctx.strokeStyle = 'rgba(255, 100, 0, 0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, rectWidth, rectHeight);
    }
}

// ─── Build Flipbook ───
async function buildFlipbook() {
    if (!pdfDoc) return;

    const firstPage = await pdfDoc.getPage(1);
    const rawVP = firstPage.getViewport({ scale: 1 });
    const { pageW, pageH } = calcPageSize(rawVP);
    const initialPageW = clampPageWidth(rawVP.width * DEFAULT_INITIAL_ZOOM, rawVP);
    const initialPageH = Math.floor(initialPageW / (rawVP.width / rawVP.height));

    // Create page divs
    for (let i = 1; i <= totalPages; i++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'flipbook-page';
        pageDiv.dataset.page = i;
        
        // Loading placeholder
        const placeholder = document.createElement('div');
        placeholder.className = 'page-loading';
        placeholder.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        pageDiv.appendChild(placeholder);
        
        flipbookEl.appendChild(pageDiv);
    }

    // Initialize turn.js
    const bookWidth = viewMode === 'single' ? initialPageW : initialPageW * 2;

    $(flipbookEl).turn({
        width: bookWidth,
        height: initialPageH,
        autoCenter: true,
        display: viewMode,
        acceleration: false,
        gradients: true,
        elevation: 50,
        duration: 1000,
        when: {
            turning: function(event, page, view) {
                updatePageDisplay(page);
                const size = $(flipbookEl).turn('size');
                const pW = viewMode === 'single' ? size.width : size.width / 2;
                const pH = size.height;
                // Pre-render adjacent pages
                view.forEach(p => { if (p) renderFlipbookPage(p, pW, pH); });
            },
            turned: function(event, page, view) {
                updatePageDisplay(page);
                updateThumbActive(page);
                const size = $(flipbookEl).turn('size');
                const pW = viewMode === 'single' ? size.width : size.width / 2;
                const pH = size.height;
                // Render nearby pages for smooth flipping
                for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 3); p++) {
                    renderFlipbookPage(p, pW, pH);
                }
            }
        }
    });

    flipbookReady = true;

    // Render the first visible page(s) before dropping the global loader.
    const currentPage = $(flipbookEl).turn('page') || 1;
    const initialView = $(flipbookEl).turn('view').filter(Boolean);
    const priorityPages = [...new Set([currentPage, ...initialView])];

    await Promise.allSettled(priorityPages.map(p => renderFlipbookPage(p, initialPageW, initialPageH)));
    refreshFlipbookView(currentPage);
    await waitForNextFrame();
    await waitForNextFrame();

    loadingOverlay.classList.add('hidden');

    // Warm nearby pages in the background after the first view is visible.
    for (let p = 1; p <= Math.min(6, totalPages); p++) {
        renderFlipbookPage(p, initialPageW, initialPageH);
    }

    updatePageDisplay(currentPage);
    updateZoomDisplay(initialPageW, rawVP.width);
    checkOverflow();
    generateThumbnails();
}

// Track which pages have been rendered
const renderedPages = new Set();
const renderingPages = new Map();
let flipbookRefreshFrame = null;

function waitForNextFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

function getTurnPageNodes(pageNum) {
    const nodes = new Set(flipbookEl.querySelectorAll(`[data-page="${pageNum}"]`));
    const turnData = flipbookReady ? $(flipbookEl).data() : null;
    const turnPage = turnData && turnData.pageObjs ? turnData.pageObjs[pageNum] : null;

    if (turnPage && turnPage[0]) {
        nodes.add(turnPage[0]);
    }

    return [...nodes];
}

function refreshFlipbookView(pageNum) {
    if (!flipbookReady) return;

    const view = $(flipbookEl).turn('view').filter(Boolean);
    if (pageNum && !view.includes(pageNum)) return;

    if (flipbookRefreshFrame !== null) {
        cancelAnimationFrame(flipbookRefreshFrame);
    }

    flipbookRefreshFrame = requestAnimationFrame(() => {
        flipbookRefreshFrame = null;

        view.forEach(p => {
            getTurnPageNodes(p).forEach(node => void node.offsetHeight);
        });
        void flipbookEl.offsetHeight;

        $(flipbookEl).turn('update');

        // A second pass on the next task reliably wakes turn.js after async canvas injection.
        setTimeout(() => {
            if (!flipbookReady) return;
            $(flipbookEl).turn('update');
        }, 0);
    });
}

async function renderFlipbookPage(pageNum, pageW, pageH) {
    if (pageNum < 1 || pageNum > totalPages) return;
    if (renderedPages.has(pageNum)) return;
    if (renderingPages.has(pageNum)) return renderingPages.get(pageNum);

    const renderTask = (async () => {
        let pageDivs = getTurnPageNodes(pageNum);
        if (pageDivs.length === 0) {
            await waitForNextFrame();
            pageDivs = getTurnPageNodes(pageNum);
        }
        if (pageDivs.length === 0) {
            await waitForNextFrame();
            pageDivs = getTurnPageNodes(pageNum);
        }
        if (pageDivs.length === 0) return;

        try {
            const { canvas, page, viewport } = await renderPageToCanvas(pageNum, pageW, pageH);
            canvas.style.display = 'block';
            canvas.style.pointerEvents = 'none';
            canvas.draggable = false;

            // turn.js might clone elements for animations; update all instances
            pageDivs.forEach((div, index) => {
                div.innerHTML = '';
                // For the first div, use the canvas directly. For clones, we must draw the image
                // onto a new canvas because standard node cloning doesn't copy canvas pixel data.
                if (index === 0) {
                    div.appendChild(canvas);
                    renderAnnotationLayer(page, viewport, div);
                } else {
                    const cloneCanvas = document.createElement('canvas');
                    cloneCanvas.width = canvas.width;
                    cloneCanvas.height = canvas.height;
                    cloneCanvas.style.width = canvas.style.width;
                    cloneCanvas.style.height = canvas.style.height;
                    cloneCanvas.style.display = 'block';
                    cloneCanvas.style.pointerEvents = 'none';
                    cloneCanvas.draggable = false;
                    const cloneCtx = cloneCanvas.getContext('2d', { alpha: false });
                    cloneCtx.imageSmoothingEnabled = true;
                    cloneCtx.imageSmoothingQuality = 'high';
                    cloneCtx.drawImage(canvas, 0, 0);
                    div.appendChild(cloneCanvas);
                    renderAnnotationLayer(page, viewport, div);
                }
            });

            renderedPages.add(pageNum);
            refreshFlipbookView(pageNum);
        } catch (e) {
            console.error('Failed to render page', pageNum, e);
        } finally {
            renderingPages.delete(pageNum);
        }
    })();

    renderingPages.set(pageNum, renderTask);
    return renderTask;
}

// ─── Navigation ───
async function goToPage(num) {
    if (!flipbookReady) return;
    num = Math.max(1, Math.min(num, totalPages));
    
    // Pre-render the target page and its neighbors before jumping
    // so it doesn't get stuck on the loading spinner
    const size = $(flipbookEl).turn('size');
    const pW = viewMode === 'single' ? size.width : size.width / 2;
    const pH = size.height;
    
    const promises = [];
    for (let p = Math.max(1, num - 1); p <= Math.min(totalPages, num + 2); p++) {
        promises.push(renderFlipbookPage(p, pW, pH));
    }
    await Promise.allSettled(promises);

    $(flipbookEl).turn('page', num);
}

function prevPage() {
    if (!flipbookReady) return;
    $(flipbookEl).turn('previous');
}

function nextPage() {
    if (!flipbookReady) return;
    $(flipbookEl).turn('next');
}

function updatePageDisplay(page) {
    pageInput.value = page;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
}

function updateZoomDisplay(renderedWidth, originalWidth) {
    const pct = Math.round((renderedWidth / originalWidth) * 100);
    zoomLevel.textContent = pct + '%';
}

function getCurrentPageWidth() {
    if (!flipbookReady) return 0;
    const size = $(flipbookEl).turn('size');
    return viewMode === 'single' ? size.width : size.width / 2;
}

function getZoomBounds(baseViewport) {
    const { pageW: minPageW } = calcPageSize(baseViewport);
    return {
        minPageW,
        maxPageW: Math.round(minPageW * 3)
    };
}

function clampPageWidth(pageW, baseViewport) {
    const bounds = getZoomBounds(baseViewport);
    return Math.max(bounds.minPageW, Math.min(bounds.maxPageW, Math.round(pageW)));
}

function resizeFlipbookToPageWidth(targetPageW, options = {}) {
    if (!pdfDoc || !flipbookReady) return Promise.resolve();

    const anchorX = options.anchorX ?? viewerArea.clientWidth / 2;
    const anchorY = options.anchorY ?? viewerArea.clientHeight / 2;

    return pdfDoc.getPage(1).then(page => {
        const vp = page.getViewport({ scale: 1 });
        const pdfRatio = vp.width / vp.height;
        const nextPageW = clampPageWidth(targetPageW, vp);
        const nextPageH = Math.round(nextPageW / pdfRatio);
        const nextBookW = viewMode === 'single' ? nextPageW : nextPageW * 2;

        const currentSize = $(flipbookEl).turn('size');
        const oldBookW = currentSize.width || nextBookW;
        const oldBookH = currentSize.height || nextPageH;
        const oldScrollLeft = viewerArea.scrollLeft;
        const oldScrollTop = viewerArea.scrollTop;
        const oldAnchorX = oldScrollLeft + anchorX;
        const oldAnchorY = oldScrollTop + anchorY;

        $(flipbookEl).turn('size', nextBookW, nextPageH);

        renderedPages.clear();
        const view = $(flipbookEl).turn('view');
        view.forEach(p => { if (p) renderFlipbookPage(p, nextPageW, nextPageH); });

        updateZoomDisplay(nextPageW, vp.width);
        fitPageBtn.classList.remove('active');
        fitWidthBtn.classList.remove('active');

        checkOverflow();

        const widthRatio = oldBookW ? nextBookW / oldBookW : 1;
        const heightRatio = oldBookH ? nextPageH / oldBookH : 1;
        viewerArea.scrollLeft = Math.max(0, Math.round(oldAnchorX * widthRatio - anchorX));
        viewerArea.scrollTop = Math.max(0, Math.round(oldAnchorY * heightRatio - anchorY));

        return { pageW: nextPageW, pageH: nextPageH };
    });
}

// ─── Zoom ───
function zoomIn() {
    // turn.js doesn't natively support zoom, but we can resize
    if (!flipbookReady || !pdfDoc) return;
    resizeFlipbook(1.15);
}

function zoomOut() {
    if (!flipbookReady || !pdfDoc) return;
    resizeFlipbook(1 / 1.15);
}

function resizeFlipbook(factor) {
    const currentPageW = getCurrentPageWidth();
    if (!currentPageW) return;
    resizeFlipbookToPageWidth(currentPageW * factor);
}

// ─── Overflow Detection: disable turn.js drag when zoomed in ───
let isZoomedIn = false;

function checkOverflow() {
    const bookSize = $(flipbookEl).turn('size');
    const { availW, availH } = getFlipbookDimensions();

    const overflows = bookSize.width > availW * 1.02 || bookSize.height > availH * 1.02;

    if (overflows && !isZoomedIn) {
        isZoomedIn = true;
        // Disable turn.js mouse/touch drag
        $(flipbookEl).turn('disable', true);
        // Allow viewer to scroll
        viewerArea.style.overflow = 'auto';
        viewerArea.style.alignItems = 'flex-start';
        viewerArea.style.justifyContent = 'flex-start';
    } else if (!overflows && isZoomedIn) {
        isZoomedIn = false;
        // Re-enable turn.js drag
        $(flipbookEl).turn('disable', false);
        // Reset scroll
        viewerArea.style.overflow = 'auto';
        viewerArea.style.alignItems = 'center';
        viewerArea.style.justifyContent = 'center';
        viewerArea.scrollTop = 0;
        viewerArea.scrollLeft = 0;
    }
}

function fitToPage() {
    if (!flipbookReady || !pdfDoc) return;
    fitPageBtn.classList.add('active');
    fitWidthBtn.classList.remove('active');
    rebuildAtOptimalSize();
}

function fitToWidth() {
    if (!flipbookReady || !pdfDoc) return;
    fitWidthBtn.classList.add('active');
    fitPageBtn.classList.remove('active');

    pdfDoc.getPage(1).then(page => {
        const vp = page.getViewport({ scale: 1 });
        const { availW, availH } = getFlipbookDimensions();
        let pageW = viewMode === 'single' ? Math.floor(availW * 0.9) : Math.floor(availW / 2 * 0.95);
        let pageH = Math.floor(pageW / (vp.width / vp.height));
        
        // Secure zoom constraint: enforce a minimum page height of 1.25x viewport height
        const minSecureHeight = Math.round(availH * 1.25);
        if (pageH < minSecureHeight) {
            pageH = minSecureHeight;
            pageW = Math.round(pageH * (vp.width / vp.height));
        }

        const bookW = viewMode === 'single' ? pageW : pageW * 2;
        $(flipbookEl).turn('size', bookW, pageH);
        renderedPages.clear();
        const view = $(flipbookEl).turn('view');
        view.forEach(p => { if (p) renderFlipbookPage(p, pageW, pageH); });
        updateZoomDisplay(pageW, vp.width);
        checkOverflow();
    });
}

async function rebuildAtOptimalSize() {
    if (!pdfDoc) return;
    const currentPage = flipbookReady ? $(flipbookEl).turn('page') : 1;

    const firstPage = await pdfDoc.getPage(1);
    const rawVP = firstPage.getViewport({ scale: 1 });
    const { pageW, pageH } = calcPageSize(rawVP);
    const bookW = viewMode === 'single' ? pageW : pageW * 2;

    $(flipbookEl).turn('size', bookW, pageH);
    renderedPages.clear();

    // Re-render visible + neighbor pages
    for (let p = Math.max(1, currentPage - 2); p <= Math.min(totalPages, currentPage + 3); p++) {
        await renderFlipbookPage(p, pageW, pageH);
    }

    updateZoomDisplay(pageW, rawVP.width);
    checkOverflow();
}

// ─── Sidebar ───
function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    sidebar.classList.toggle('sidebar-hidden', !sidebarOpen);
    sidebarToggle.classList.toggle('active', sidebarOpen);
    setTimeout(() => {
        if (flipbookReady) rebuildAtOptimalSize();
    }, 280);
}

async function generateThumbnails() {
    thumbList.innerHTML = '';
    if (!pdfDoc) return;

    for (let i = 1; i <= totalPages; i++) {
        const item = document.createElement('div');
        item.className = 'thumb-item' + (i === 1 ? ' active' : '');
        item.dataset.page = i;

        const thumbCanvas = document.createElement('canvas');
        const label = document.createElement('div');
        label.className = 'thumb-label';
        label.textContent = i;

        item.appendChild(thumbCanvas);
        item.appendChild(label);
        item.addEventListener('click', () => goToPage(i));
        thumbList.appendChild(item);

        try {
            const page = await pdfDoc.getPage(i);
            const vp = page.getViewport({ scale: 1 });
            const thumbScale = 160 / vp.width;
            const thumbVP = page.getViewport({ scale: thumbScale });
            thumbCanvas.width = thumbVP.width;
            thumbCanvas.height = thumbVP.height;
            const ctx = thumbCanvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport: thumbVP }).promise;
        } catch (e) {}
    }
}

function updateThumbActive(currentPage) {
    thumbList.querySelectorAll('.thumb-item').forEach(item => {
        const pg = parseInt(item.dataset.page);
        const view = $(flipbookEl).turn('view');
        item.classList.toggle('active', view.includes(pg));
    });
}

function scrollThumbIntoView(pageNum) {
    const item = thumbList.querySelector(`.thumb-item[data-page="${pageNum}"]`);
    if (item) item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── Search ───
async function searchDocument(term) {
    const oldTerm = currentSearchTerm;
    currentSearchTerm = term;
    searchMatches = [];
    searchIndex = -1;
    
    if (!pdfDoc || !term) {
        updateSearchControls();
        if (oldTerm) {
            renderedPages.clear();
            refreshFlipbookView();
        }
        return;
    }

    const lower = term.toLowerCase();
    searchInfo.textContent = 'Searching...';

    for (let i = 1; i <= totalPages; i++) {
        try {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            
            textContent.items.forEach((item, itemIdx) => {
                if (!item.str) return;
                const str = item.str.toLowerCase();
                let idx = -1;
                while ((idx = str.indexOf(lower, idx + 1)) !== -1) {
                    searchMatches.push({
                        page: i,
                        itemIdx: itemIdx,
                        charOffset: idx
                    });
                }
            });
        } catch (e) {
            console.error('Search error on page', i, e);
        }
    }

    if (searchMatches.length === 0) {
        searchInfo.textContent = 'No results';
        setTimeout(() => { 
            if (currentSearchTerm === term) searchInfo.textContent = ''; 
        }, 2000);
        updateSearchControls();
        return;
    }

    searchIndex = 0;
    updateSearchControls();
    updateSearchInfo();
    
    // Jump to first match and force re-render
    renderedPages.clear(); 
    goToPage(searchMatches[0].page);
    refreshFlipbookView();
}

function onSearchNext() {
    if (searchMatches.length === 0) return;
    const oldPage = searchMatches[searchIndex].page;
    searchIndex = (searchIndex + 1) % searchMatches.length;
    const newMatch = searchMatches[searchIndex];
    
    updateSearchInfo();
    
    if (newMatch.page !== oldPage) {
        goToPage(newMatch.page);
    } else {
        // Same page, but we need to update the "current" highlight
        // The easiest way is to re-render the current canvas.
        getTurnPageNodes(newMatch.page).forEach(node => {
            // We can't easily re-render just the highlights without 
            // the whole page logic, so we'll just clear cache for this page.
            renderedPages.delete(newMatch.page);
            const size = $(flipbookEl).turn('size');
            const pW = viewMode === 'single' ? size.width : size.width / 2;
            renderFlipbookPage(newMatch.page, pW, size.height);
        });
    }
}

function onSearchPrev() {
    if (searchMatches.length === 0) return;
    const oldPage = searchMatches[searchIndex].page;
    searchIndex = (searchIndex - 1 + searchMatches.length) % searchMatches.length;
    const newMatch = searchMatches[searchIndex];
    
    updateSearchInfo();
    
    if (newMatch.page !== oldPage) {
        goToPage(newMatch.page);
    } else {
        renderedPages.delete(newMatch.page);
        const size = $(flipbookEl).turn('size');
        const pW = viewMode === 'single' ? size.width : size.width / 2;
        renderFlipbookPage(newMatch.page, pW, size.height);
    }
}

function updateSearchControls() {
    const has = searchMatches.length > 0;
    searchPrevBtn.disabled = !has;
    searchNextBtn.disabled = !has;
    if (!has) searchInfo.textContent = '';
}

function updateSearchInfo() {
    if (searchMatches.length > 0 && searchIndex >= 0) {
        searchInfo.textContent = `${searchIndex + 1}/${searchMatches.length}`;
    }
}

// ─── PDF Loading ───
function loadPdf(url) {
    loadingOverlay.classList.remove('hidden');

    function openPdf(source) {
        pdfjsLib.getDocument(source).promise.then(pdf => {
            pdfDoc = pdf;
            totalPages = pdf.numPages;
            pageCountEl.textContent = totalPages;
            pageInput.max = totalPages;
            pageInput.value = 1;
            buildFlipbook();
        }).catch(err => {
            console.error('PDF load error:', err);
            loadingOverlay.querySelector('.loader-text').textContent = 'Failed to load PDF';
        });
    }

    if (window.__pdfPreFetch) {
        window.__pdfPreFetch.then(buf => {
            if (buf) {
                openPdf({ data: buf });
            } else {
                openPdf({ url, rangeChunkSize: 65536, disableAutoFetch: false, disableStream: false });
            }
        });
    } else {
        openPdf({ url, rangeChunkSize: 65536, disableAutoFetch: false, disableStream: false });
    }
}

// ─── Events ───
prevBtn.addEventListener('click', prevPage);
nextBtn.addEventListener('click', nextPage);
zoomInBtn.addEventListener('click', zoomIn);
zoomOutBtn.addEventListener('click', zoomOut);
fitPageBtn.addEventListener('click', fitToPage);
fitWidthBtn.addEventListener('click', fitToWidth);

// View mode toggle
const viewSingle = _$('view-single');
const viewDual = _$('view-dual');

viewSingle.addEventListener('click', () => {
    if (!flipbookReady || viewMode === 'single') return;
    const currentPageW = getCurrentPageWidth();
    viewMode = 'single';
    viewSingle.classList.add('active');
    viewDual.classList.remove('active');
    $(flipbookEl).turn('display', 'single');
    if (currentPageW) {
        resizeFlipbookToPageWidth(currentPageW);
    } else {
        rebuildAtOptimalSize();
    }
});

viewDual.addEventListener('click', () => {
    if (!flipbookReady || viewMode === 'double') return;
    const currentPageW = getCurrentPageWidth();
    viewMode = 'double';
    viewDual.classList.add('active');
    viewSingle.classList.remove('active');
    $(flipbookEl).turn('display', 'double');
    if (currentPageW) {
        resizeFlipbookToPageWidth(currentPageW);
    } else {
        rebuildAtOptimalSize();
    }
});
sidebarToggle.addEventListener('click', toggleSidebar);

pageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        const val = parseInt(pageInput.value, 10);
        if (!isNaN(val)) goToPage(val);
    }
});

searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') searchDocument(searchInput.value.trim());
});
searchNextBtn.addEventListener('click', onSearchNext);
searchPrevBtn.addEventListener('click', onSearchPrev);

// Keyboard shortcuts
document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    switch (e.key) {
        case 'ArrowLeft': prevPage(); e.preventDefault(); break;
        case 'ArrowRight': nextPage(); e.preventDefault(); break;
        case '+': case '=': zoomIn(); e.preventDefault(); break;
        case '-': zoomOut(); e.preventDefault(); break;
    }
});

// Resize handler
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (flipbookReady) rebuildAtOptimalSize();
    }, 200);
});

// ─── Touch Gestures (Mobile) ───
let touchStartX = 0;
let touchStartY = 0;
let initialPinchDist = 0;
let isPinching = false;
let isTouchPanning = false;
let lastPanX = 0;
let lastPanY = 0;
let touchMoved = false;
let pinchStartPageW = 0;
let pinchAnchorX = 0;
let pinchAnchorY = 0;

function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getTouchAnchor(touches) {
    const rect = viewerArea.getBoundingClientRect();
    const centerX = (touches[0].clientX + touches[1].clientX) / 2;
    const centerY = (touches[0].clientY + touches[1].clientY) / 2;
    return {
        x: centerX - rect.left,
        y: centerY - rect.top
    };
}

viewerArea.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
        isPinching = true;
        isTouchPanning = false;
        initialPinchDist = getTouchDist(e.touches);
        pinchStartPageW = getCurrentPageWidth();
        const anchor = getTouchAnchor(e.touches);
        pinchAnchorX = anchor.x;
        pinchAnchorY = anchor.y;
        e.preventDefault();
    } else if (e.touches.length === 1) {
        isPinching = false;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        lastPanX = touchStartX;
        lastPanY = touchStartY;
        touchMoved = false;
        isTouchPanning = isZoomedIn;
        if (isTouchPanning) {
            e.preventDefault();
        }
    }
}, { passive: false });

viewerArea.addEventListener('touchmove', e => {
    if (isPinching && e.touches.length === 2) {
        touchMoved = true;
        e.preventDefault();
        return;
    }

    if (isTouchPanning && e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = touch.clientX - lastPanX;
        const dy = touch.clientY - lastPanY;

        viewerArea.scrollLeft -= dx;
        viewerArea.scrollTop -= dy;

        lastPanX = touch.clientX;
        lastPanY = touch.clientY;
        touchMoved = true;
        e.preventDefault();
    }
}, { passive: false });

viewerArea.addEventListener('touchend', e => {
    if (isPinching && e.touches.length < 2) {
        // Pinch ended — calculate zoom factor
        if (e.changedTouches.length > 0 && initialPinchDist > 0) {
            // Reconstruct final distance from remaining + changed touches
            const allTouches = [...e.touches, ...e.changedTouches];
            if (allTouches.length >= 2) {
                const finalDist = getTouchDist(allTouches);
                const ratio = finalDist / initialPinchDist;
                if (Math.abs(ratio - 1) > 0.05 && pinchStartPageW > 0) {
                    resizeFlipbookToPageWidth(pinchStartPageW * ratio, {
                        anchorX: pinchAnchorX,
                        anchorY: pinchAnchorY
                    });
                }
            }
        }
        isPinching = false;
        initialPinchDist = 0;
        pinchStartPageW = 0;
        touchMoved = false;
        return;
    }

    // Swipe detection (single finger) — only when not zoomed in
    if (isTouchPanning) {
        isTouchPanning = false;
        touchMoved = false;
        return;
    }

    if (e.changedTouches.length === 1 && !isPinching && !isZoomedIn) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;

        // Only trigger if horizontal swipe is dominant and long enough
        if (!touchMoved && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) {
                nextPage(); // Swipe left = next page
            } else {
                prevPage(); // Swipe right = prev page
            }
        }
    }

    touchMoved = false;
});

viewerArea.addEventListener('touchcancel', () => {
    isPinching = false;
    isTouchPanning = false;
    initialPinchDist = 0;
    pinchStartPageW = 0;
    touchMoved = false;
});

// Content protection
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('copy', e => e.preventDefault());
document.addEventListener('cut', e => e.preventDefault());
document.addEventListener('dragstart', e => e.preventDefault());
window.addEventListener('beforeprint', e => {
    e.preventDefault();
    alert('Printing this content is disabled.');
    return false;
});

// ─── Init ───
updateSearchControls();

// Initialize security overlay & event listeners
setupSecurityListeners();

// Verify user session before loading the PDF
checkAuthAndLoad();

function setupSecurityListeners() {
    // Check if security-blur-overlay already exists
    if (document.getElementById('security-blur-overlay')) return;

    const blurOverlay = document.createElement('div');
    blurOverlay.id = 'security-blur-overlay';
    blurOverlay.style.position = 'fixed';
    blurOverlay.style.inset = '0';
    blurOverlay.style.zIndex = '99999';
    blurOverlay.style.background = 'rgba(15, 23, 42, 0.9)';
    blurOverlay.style.backdropFilter = 'blur(30px)';
    blurOverlay.style.webkitBackdropFilter = 'blur(30px)';
    blurOverlay.style.display = 'none';
    blurOverlay.style.flexDirection = 'column';
    blurOverlay.style.alignItems = 'center';
    blurOverlay.style.justifyContent = 'center';
    blurOverlay.style.color = '#f1f5f9';
    blurOverlay.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
    blurOverlay.style.cursor = 'pointer';
    
    blurOverlay.innerHTML = `
        <div style="text-align: center; padding: 32px; max-width: 400px; background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);">
            <i class="fas fa-eye-slash" style="font-size: 54px; color: #818cf8; margin-bottom: 20px; animation: pulse-glow 2s infinite;"></i>
            <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 10px; letter-spacing: -0.01em;">Content Protected</h2>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 0;">Click here or inside the window to resume reading.</p>
        </div>
        <style>
            @keyframes pulse-glow {
                0% { opacity: 0.7; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.05); }
                100% { opacity: 0.7; transform: scale(1); }
            }
        </style>
    `;
    
    document.body.appendChild(blurOverlay);

    const showBlur = () => {
        blurOverlay.style.display = 'flex';
        document.body.classList.add('blurred');
    };

    const hideBlur = () => {
        blurOverlay.style.display = 'none';
        document.body.classList.remove('blurred');
    };

    // Fast blurring on focus loss
    window.addEventListener('blur', showBlur);
    window.addEventListener('focus', hideBlur);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            showBlur();
        } else {
            hideBlur();
        }
    });

    // Dismiss blur overlay when clicked
    blurOverlay.addEventListener('click', () => {
        window.focus();
        hideBlur();
    });

    // Event listeners to capture Print Screen and Win + Shift + S
    window.addEventListener('keyup', (e) => {
        if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
            showBlur();
            navigator.clipboard.writeText('Screenshots are disabled for this protected content.').catch(() => {});
        }
    });

    window.addEventListener('keydown', (e) => {
        // PrintScreen Key
        if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
            showBlur();
        }
        // Win + Shift + S (Meta + Shift + S) or Cmd + Shift + S
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
            showBlur();
            e.preventDefault();
        }
    });
}

async function checkAuthAndLoad() {
    if (!supabaseClient) {
        showAccessRestrictedOverlay("Authentication library not loaded.");
        return;
    }

    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error || !session || !session.user || !session.user.email) {
            showAccessRestrictedOverlay("You must be logged in to access this resource.");
            return;
        }

        // Successfully authenticated
        userEmail = session.user.email;
        loadPdf(PDF_URL);
    } catch (err) {
        console.error('Session verification failed:', err);
        showAccessRestrictedOverlay("An error occurred during authentication verification.");
    }
}

function showAccessRestrictedOverlay(message) {
    loadingOverlay.classList.remove('hidden');
    loadingOverlay.innerHTML = `
        <div style="text-align: center; padding: 32px; max-width: 440px; background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 20px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5); font-family: 'Inter', -apple-system, sans-serif; color: #f8fafc;">
            <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); color: #ef4444; display: flex; align-items: center; justify-content: center; font-size: 28px; margin: 0 auto 24px; box-shadow: 0 0 20px rgba(239, 68, 68, 0.15); animation: pulse-red 2s infinite;">
                <i class="fas fa-shield-halved"></i>
            </div>
            <h2 style="font-size: 22px; font-weight: 700; color: #f8fafc; margin-bottom: 12px; letter-spacing: -0.02em;">Access Restricted</h2>
            <p style="font-size: 14px; color: #cbd5e1; line-height: 1.6; margin-bottom: 32px;">${message}</p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <a href="https://mystudentclub.com/login" style="
                    display: inline-flex; align-items: center; justify-content: center;
                    padding: 12px 24px; font-size: 15px; font-weight: 600; border-radius: 10px;
                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff;
                    text-decoration: none; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); border: none; outline: none; cursor: pointer; transition: all 0.2s ease;
                " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 16px rgba(79, 70, 229, 0.45)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 12px rgba(79, 70, 229, 0.3)';">
                    <i class="fas fa-sign-in-alt" style="margin-right: 8px;"></i> Login to My Student Club
                </a>
                <a href="https://mystudentclub.com/learning-management-system/" style="
                    display: inline-flex; align-items: center; justify-content: center;
                    padding: 12px 24px; font-size: 15px; font-weight: 600; border-radius: 10px;
                    background: rgba(255, 255, 255, 0.06); color: #e2e8f0; border: 1px solid rgba(255, 255, 255, 0.08);
                    text-decoration: none; cursor: pointer; transition: all 0.2s ease;
                " onmouseover="this.style.background='rgba(255, 255, 255, 0.12)'; this.style.color='#ffffff';" onmouseout="this.style.background='rgba(255, 255, 255, 0.06)'; this.style.color='#e2e8f0';">
                    <i class="fas fa-graduation-cap" style="margin-right: 8px;"></i> Go to Dashboard
                </a>
            </div>
        </div>
        <style>
            @keyframes pulse-red {
                0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                70% { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
                100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
            }
        </style>
    `;
}

if (previewModeChip && previewMode === 'docx') {
    previewModeChip.style.display = 'inline-flex';
    previewModeChip.innerHTML = '<i class="fas fa-circle-info"></i><span>PDF Preview</span>';
    previewModeChip.title = 'You are previewing the PDF version. Use download to get the original DOCX file.';
}

