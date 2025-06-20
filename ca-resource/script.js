const PDF_URL = 'https://www.mystudentclub.com/assets/doc.pdf';

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

let pdfDoc = null;
let currentPageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let searchMatches = [];
let searchIndex = -1;

function showSpinner(show) {
    loadingSpinner.style.display = show ? 'block' : 'none';
}

function renderPage(num) {
    pageRendering = true;
    showSpinner(true);
    canvas.style.display = 'none'; 

    pdfDoc.getPage(num).then(function(page) {
        const DYNAMIC_SCALE_PADDING = 0.98; 
        let dynamicScale = 1; 

        if (canvasContainer.clientWidth > 0) {
            const pageWidth = page.getViewport({ scale: 1 }).width;
            dynamicScale = (canvasContainer.clientWidth * DYNAMIC_SCALE_PADDING) / pageWidth;
        }

        const scale = dynamicScale * (window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale: scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        const renderTask = page.render(renderContext);

        renderTask.promise.then(function() {
            pageRendering = false;
            showSpinner(false);
            canvas.style.display = 'block'; 

            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
            pageNumDisplay.textContent = num;
            updateNavButtons();
        }).catch(function(error) {
            console.error('Error rendering page:', error);
            pageRendering = false;
            showSpinner(false);

        });
    }).catch(function(error) {
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
    pdfjsLib.getDocument(url).promise.then(function(pdf) {
        pdfDoc = pdf;
        pageCountDisplay.textContent = pdfDoc.numPages;
        currentPageNum = 1;
        renderPage(currentPageNum);
        viewerControls.style.visibility = 'visible';
    }).catch(function(error) {
        console.error('Error loading PDF:', error);
        alert('Error loading PDF: ' + (error.message || error));
        showSpinner(false);
    });
}

function resetViewer() {
    pdfDoc = null;
    currentPageNum = 1;
    pageNumDisplay.textContent = '0';
    pageCountDisplay.textContent = '0';
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    canvas.style.display = 'none'; 
    viewerControls.style.visibility = 'hidden'; 
    pdfUpload.value = ''; 
    updateNavButtons();
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

if (typeof pdfjsLib === 'undefined') {
    console.error("PDF.js library is not loaded. Check script tags.");
    alert("PDF.js library failed to load. Please check your internet connection or script configuration.");
    pdfUpload.disabled = true;
} else {
    prevButton.addEventListener('click', onPrevPage);
    nextButton.addEventListener('click', onNextPage);
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

    loadPdfFromUrl(PDF_URL);

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
        canvasElem.parentElement.appendChild(lockOverlay);
    }
}
function removeObscureOverlay() {
    let lockOverlay = document.getElementById('obscure-overlay');
    if (lockOverlay) {
        lockOverlay.remove();
    }
}

const originalRenderPage = renderPage;
renderPage = function(num) {
    removeObscureOverlay();
    originalRenderPage.call(this, num);

    setTimeout(() => addObscureOverlay(canvas), 250);
};

canvas.draggable = false;
canvas.addEventListener('mousedown', e => { e.preventDefault(); }, true);
canvas.addEventListener('dragstart', e => { e.preventDefault(); }, true);

document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});
document.addEventListener('copy', function(e) {
    e.preventDefault();
});
document.addEventListener('cut', function(e) {
    e.preventDefault();
});
document.addEventListener('dragstart', function(e) {
    e.preventDefault();
});

window.addEventListener('beforeprint', (event) => {
    event.preventDefault();
    alert('Printing this content is disabled for security reasons.');
    return false; 
});