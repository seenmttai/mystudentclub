// ─── State ───
const urlParams = new URLSearchParams(window.location.search);
const paramPdf = urlParams.get('pdf');
const PDF_URL = paramPdf ? paramPdf : 'https://www.mystudentclub.com/assets/doc.pdf';

let pdfDoc = null;
let totalPages = 0;
let sidebarOpen = false;
let flipbookReady = false;
let viewMode = 'single';  // 'single' | 'double'

// Search state
let searchMatches = [];
let searchIndex = -1;

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

    return { pageW: Math.floor(pageW), pageH: Math.floor(pageH) };
}

// ─── Render PDF page to canvas ───
async function renderPageToCanvas(pageNum, width, height) {
    const page = await pdfDoc.getPage(pageNum);
    const canvas = document.createElement('canvas');
    const dpr = Math.max(2, window.devicePixelRatio || 1);

    const viewport = page.getViewport({ scale: 1 });
    const scale = (width / viewport.width) * dpr;
    const scaledViewport = page.getViewport({ scale });

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    return canvas;
}

// ─── Build Flipbook ───
async function buildFlipbook() {
    if (!pdfDoc) return;

    const firstPage = await pdfDoc.getPage(1);
    const rawVP = firstPage.getViewport({ scale: 1 });
    const { pageW, pageH } = calcPageSize(rawVP);

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
    const bookWidth = viewMode === 'single' ? pageW : pageW * 2;

    $(flipbookEl).turn({
        width: bookWidth,
        height: pageH,
        autoCenter: true,
        display: viewMode,
        acceleration: true,
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

    await Promise.allSettled(priorityPages.map(p => renderFlipbookPage(p, pageW, pageH)));
    refreshFlipbookView(currentPage);
    await waitForNextFrame();
    await waitForNextFrame();

    loadingOverlay.classList.add('hidden');

    // Warm nearby pages in the background after the first view is visible.
    for (let p = 1; p <= Math.min(6, totalPages); p++) {
        renderFlipbookPage(p, pageW, pageH);
    }

    updatePageDisplay(currentPage);
    updateZoomDisplay(pageW, rawVP.width);
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
            const canvas = await renderPageToCanvas(pageNum, pageW, pageH);
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
                } else {
                    const cloneCanvas = document.createElement('canvas');
                    cloneCanvas.width = canvas.width;
                    cloneCanvas.height = canvas.height;
                    cloneCanvas.style.display = 'block';
                    cloneCanvas.style.pointerEvents = 'none';
                    cloneCanvas.draggable = false;
                    cloneCanvas.getContext('2d').drawImage(canvas, 0, 0);
                    div.appendChild(cloneCanvas);
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
        const { availW } = getFlipbookDimensions();
        const pageW = viewMode === 'single' ? Math.floor(availW * 0.9) : Math.floor(availW / 2 * 0.95);
        const pageH = Math.floor(pageW / (vp.width / vp.height));
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
    searchMatches = [];
    searchIndex = -1;
    updateSearchControls();
    if (!pdfDoc || !term) return;

    const lower = term.toLowerCase();
    for (let i = 1; i <= totalPages; i++) {
        try {
            const page = await pdfDoc.getPage(i);
            const txt = await page.getTextContent();
            const str = txt.items.map(it => it.str).join(' ');
            if (str.toLowerCase().includes(lower)) {
                searchMatches.push(i);
            }
        } catch (e) {}
    }

    if (searchMatches.length === 0) {
        searchInfo.textContent = 'No results';
        setTimeout(() => { searchInfo.textContent = ''; }, 2000);
        return;
    }

    searchIndex = 0;
    goToPage(searchMatches[0]);
    updateSearchControls();
    updateSearchInfo();
}

function onSearchNext() {
    if (searchMatches.length === 0) return;
    searchIndex = (searchIndex + 1) % searchMatches.length;
    goToPage(searchMatches[searchIndex]);
    updateSearchInfo();
}

function onSearchPrev() {
    if (searchMatches.length === 0) return;
    searchIndex = (searchIndex - 1 + searchMatches.length) % searchMatches.length;
    goToPage(searchMatches[searchIndex]);
    updateSearchInfo();
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
    viewMode = 'single';
    viewSingle.classList.add('active');
    viewDual.classList.remove('active');
    $(flipbookEl).turn('display', 'single');
    rebuildAtOptimalSize();
});

viewDual.addEventListener('click', () => {
    if (!flipbookReady || viewMode === 'double') return;
    viewMode = 'double';
    viewDual.classList.add('active');
    viewSingle.classList.remove('active');
    $(flipbookEl).turn('display', 'double');
    rebuildAtOptimalSize();
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
loadPdf(PDF_URL);
