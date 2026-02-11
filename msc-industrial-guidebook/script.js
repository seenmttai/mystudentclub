const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

const prevButton = document.getElementById('prev-page');
const nextButton = document.getElementById('next-page');
const pageNumDisplay = document.getElementById('page-num');
const pageCountDisplay = document.getElementById('page-count');
const canvas = document.getElementById('pdf-render');
const ctx = canvas.getContext('2d');
const loadingSpinner = document.getElementById('loading-spinner');
const viewerControls = document.getElementById('viewer-controls');
const canvasContainer = document.getElementById('canvas-container');

const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchPrevBtn = document.getElementById('search-prev');
const searchNextBtn = document.getElementById('search-next');
const searchInfo = document.getElementById('search-info');
const gotoInput = document.getElementById('goto-input');
const gotoBtn = document.getElementById('goto-page-btn');

const zoomOutBtn = document.getElementById('zoom-out');
const zoomInBtn = document.getElementById('zoom-in');

let pdfDoc = null;
let currentPageNum = 1;
let scaleState = 'auto'; // 'auto' (fit width) or number (custom scale)
let pageRendering = false;
let pageNumPending = null;
let searchMatches = [];
let searchIndex = -1;

function showSpinner(show) {
    loadingSpinner.style.display = show ? 'block' : 'none';
}

const pageWrapper = document.getElementById('page-wrapper');

function renderPage(num) {
    pageRendering = true;
    showSpinner(true);
    canvas.style.display = 'none';

    // Clear existing annotations
    const existingLayer = pageWrapper.querySelector('.annotationLayer');
    if (existingLayer) {
        existingLayer.remove();
    }

    pdfDoc.getPage(num).then(function (page) {
        const DYNAMIC_SCALE_PADDING = 0.98;
        const viewportRaw = page.getViewport({ scale: 1 });
        let finalScale = 1;

        if (scaleState === 'auto') {
            if (canvasContainer.clientWidth > 0) {
                finalScale = (canvasContainer.clientWidth * DYNAMIC_SCALE_PADDING) / viewportRaw.width;
            }
        } else {
            finalScale = scaleState;
        }

        const outputScale = finalScale * (window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale: outputScale });
        const annotationViewport = page.getViewport({ scale: finalScale });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
        canvas.style.height = `${viewport.height / (window.devicePixelRatio || 1)}px`;

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        const renderTask = page.render(renderContext);

        renderTask.promise.then(function () {
            pageRendering = false;
            showSpinner(false);
            canvas.style.display = 'block';

            // Setup Annotation Layer
            const annotationLayerDiv = document.createElement('div');
            annotationLayerDiv.className = 'annotationLayer';
            annotationLayerDiv.style.width = canvas.style.width;
            annotationLayerDiv.style.height = canvas.style.height;
            annotationLayerDiv.style.left = '0';
            annotationLayerDiv.style.top = '0';

            pageWrapper.appendChild(annotationLayerDiv);

            page.getAnnotations().then(function (annotations) {
                if (annotations.length > 0) {
                    // console.log("Found annotations:", annotations);
                    pdfjsLib.AnnotationLayer.render({
                        viewport: annotationViewport.clone({ dontFlip: true }),
                        div: annotationLayerDiv,
                        annotations: annotations,
                        page: page,
                        linkService: {
                            getDestinationHash: (dest) => '#',
                            getAnchorUrl: (hash) => hash,
                            setHash: (hash) => { },
                            executeNamedAction: (action) => { },
                            cachePageRef: (ref, pageNumber) => { },
                            isPageVisible: (pageNumber) => true
                        },
                        renderInteractiveForms: false
                    });
                }
            });


            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
            pageNumDisplay.textContent = num;
            updateNavButtons();
        }).catch(function (error) {
            console.error('Error rendering page:', error);
            pageRendering = false;
            showSpinner(false);

        });
    }).catch(function (error) {
        console.error('Error getting page:', error);
        pageRendering = false;
        showSpinner(false);
    });
}

function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

function onPrevPage() {
    if (currentPageNum <= 1) {
        return;
    }
    currentPageNum--;
    queueRenderPage(currentPageNum);
}

function onNextPage() {
    if (!pdfDoc || currentPageNum >= pdfDoc.numPages) {
        return;
    }
    currentPageNum++;
    queueRenderPage(currentPageNum);
}

function updateNavButtons() {
    if (!pdfDoc) {
        prevButton.disabled = true;
        nextButton.disabled = true;
        return;
    }
    prevButton.disabled = (currentPageNum <= 1);
    nextButton.disabled = (currentPageNum >= pdfDoc.numPages);
}

function loadPdfFromUrl(url) {
    showSpinner(true);
    viewerControls.style.visibility = 'hidden';
    pdfjsLib.getDocument(url).promise.then(function (pdf) {
        pdfDoc = pdf;
        pageCountDisplay.textContent = pdfDoc.numPages;
        currentPageNum = 1;
        renderPage(currentPageNum);
        viewerControls.style.visibility = 'visible';
    }).catch(function (error) {
        console.error('Error loading PDF:', error);
        alert('Error loading PDF: ' + (error.message || error));
        showSpinner(false);
    });
}

function updateSearchControls() {
    const hasMatches = searchMatches.length > 0;
    searchPrevBtn.disabled = !hasMatches;
    searchNextBtn.disabled = !hasMatches;
    if (!hasMatches) {
        searchInfo.textContent = '';
    }
}

function updateSearchInfo() {
    if (searchMatches.length > 0 && searchIndex >= 0) {
        searchInfo.textContent = `${searchIndex + 1}/${searchMatches.length}`;
    } else {
        searchInfo.textContent = '';
    }
}

async function searchDocument(term) {
    searchMatches = [];
    searchIndex = -1;
    updateSearchControls();
    if (!pdfDoc || !term) return;
    const lower = term.toLowerCase();

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        try {
            const page = await pdfDoc.getPage(i);
            const txt = await page.getTextContent();
            const str = txt.items.map(it => it.str).join(' ');
            if (str.toLowerCase().includes(lower)) {
                searchMatches.push(i);
            }
        } catch (e) {
            console.error(`Error reading page ${i} text:`, e);
        }
    }
    if (searchMatches.length === 0) {
        alert(`No matches for "${term}"`);
        return;
    }

    searchIndex = 0;
    const targetPage = searchMatches[0];
    currentPageNum = targetPage;
    queueRenderPage(targetPage);
    updateSearchControls();
    updateSearchInfo();
}

function onSearchNext() {
    if (searchMatches.length === 0) return;
    searchIndex = (searchIndex + 1) % searchMatches.length;
    const page = searchMatches[searchIndex];
    currentPageNum = page;
    queueRenderPage(page);
    updateSearchInfo();
}

function onSearchPrev() {
    if (searchMatches.length === 0) return;
    searchIndex = (searchIndex - 1 + searchMatches.length) % searchMatches.length;
    const page = searchMatches[searchIndex];
    currentPageNum = page;
    queueRenderPage(page);
    updateSearchInfo();
}

function onGotoPage() {
    const val = parseInt(gotoInput.value, 10);
    if (isNaN(val) || val < 1 || !pdfDoc || val > pdfDoc.numPages) {
        alert('Invalid page number');
        return;
    }
    currentPageNum = val;
    queueRenderPage(val);
}

function onZoomIn() {
    if (!pdfDoc) return;

    if (scaleState === 'auto') {
        pdfDoc.getPage(currentPageNum).then(page => {
            const viewport = page.getViewport({ scale: 1 });
            const fitScale = (canvasContainer.clientWidth * 0.98) / viewport.width;
            scaleState = fitScale * 1.2;
            queueRenderPage(currentPageNum);
        });
    } else {
        scaleState = scaleState * 1.2;
        queueRenderPage(currentPageNum);
    }
}

function onZoomOut() {
    if (!pdfDoc) return;

    if (scaleState === 'auto') {
        pdfDoc.getPage(currentPageNum).then(page => {
            const viewport = page.getViewport({ scale: 1 });
            const fitScale = (canvasContainer.clientWidth * 0.98) / viewport.width;
            scaleState = fitScale / 1.2;
            queueRenderPage(currentPageNum);
        });
    } else {
        scaleState = scaleState / 1.2;
        queueRenderPage(currentPageNum);
    }
}

if (typeof pdfjsLib === 'undefined') {
    console.error("PDF.js library is not loaded. Check script tags.");
    alert("PDF.js library failed to load. Please check your internet connection or script configuration.");
} else {
    prevButton.addEventListener('click', onPrevPage);
    nextButton.addEventListener('click', onNextPage);
    zoomInBtn.addEventListener('click', onZoomIn);
    zoomOutBtn.addEventListener('click', onZoomOut);

    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            searchDocument(searchInput.value.trim());
        }
    });
    searchBtn.addEventListener('click', () => {
        searchDocument(searchInput.value.trim());
    });
    searchNextBtn.addEventListener('click', onSearchNext);
    searchPrevBtn.addEventListener('click', onSearchPrev);
    gotoBtn.addEventListener('click', onGotoPage);

    updateSearchControls();
}

function addObscureOverlay(canvasElem) {

    let lockOverlay = document.getElementById('obscure-overlay');
    if (!lockOverlay) {
        lockOverlay = document.createElement('div');
        lockOverlay.id = 'obscure-overlay';
        lockOverlay.style.position = 'absolute';
        lockOverlay.style.pointerEvents = 'none';
        lockOverlay.style.top = 0;
        lockOverlay.style.left = 0;
        lockOverlay.style.width = '100%';
        lockOverlay.style.height = '100%';
        lockOverlay.style.userSelect = 'none';
        lockOverlay.style.zIndex = 99;
        lockOverlay.setAttribute('aria-hidden', 'true');
        lockOverlay.title = "Content protected";

        // Attach to the wrapper instead of the canvas parent directly to cover annotations too
        const wrapper = document.getElementById('page-wrapper');
        if (wrapper) {
            wrapper.appendChild(lockOverlay);
        } else {
            canvasElem.parentElement.appendChild(lockOverlay);
        }
    }
}
function removeObscureOverlay() {
    let lockOverlay = document.getElementById('obscure-overlay');
    if (lockOverlay) {
        lockOverlay.remove();
    }
}

const originalRenderPage = renderPage;
renderPage = function (num) {
    removeObscureOverlay();
    originalRenderPage.call(this, num);

    setTimeout(() => addObscureOverlay(canvas), 250);
};

canvas.draggable = false;
canvas.addEventListener('mousedown', e => { e.preventDefault(); }, true);
canvas.addEventListener('dragstart', e => { e.preventDefault(); }, true);

document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
});
document.addEventListener('copy', function (e) {
    e.preventDefault();
});
document.addEventListener('cut', function (e) {
    e.preventDefault();
});
document.addEventListener('dragstart', function (e) {
    e.preventDefault();
});

window.addEventListener('beforeprint', (event) => {
    event.preventDefault();
    alert('Printing this content is disabled for security reasons.');
    return false;
});

async function init() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        window.location.href = '/login.html';
        return;
    }

    const { data: enrollments } = await supabase
        .from('enrollment')
        .select('course')
        .eq('uuid', session.user.id)
        .eq('course', 'industrial-training-mastery');

    if (!enrollments || enrollments.length === 0) {
        alert("Access Denied: You are not enrolled in the CA Industrial Training Program.");
        window.location.href = '/index.html';
        return;
    }

    document.getElementById('auth-loading').style.display = 'none';
    document.getElementById('pdf-viewer-container').style.display = 'block';

    try {
        const { data, error } = await supabase.storage
            .from('industrial-training-mastery-resources')
            .createSignedUrl('MSCIT Guidebook-3.pdf', 300);

        if (error) throw error;

        const proxyUrl = `https://pdf-proxy-viewer.bhansalimanan55.workers.dev/?url=${encodeURIComponent(data.signedUrl)}`;
        loadPdfFromUrl(proxyUrl);
    } catch (e) {
        console.error('Error loading guidebook:', e);
        alert('Failed to load guidebook.');
    }
}

init();
