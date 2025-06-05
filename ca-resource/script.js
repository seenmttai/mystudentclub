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

let pdfDoc = null;
let currentPageNum = 1;
let pageRendering = false;
let pageNumPending = null;

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

        const viewport = page.getViewport({ scale: dynamicScale });
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

(function enhanceSecurity() {

    const secureEvents = [
        ['contextmenu', e => e.preventDefault(), true],
        ['copy', e => { e.preventDefault(); e.stopPropagation(); }],
        ['cut', e => { e.preventDefault(); e.stopPropagation(); }],
        ['paste', e => { e.preventDefault(); e.stopPropagation(); }],
        ['dragstart', e => { e.preventDefault(); e.stopPropagation(); }],
        ['selectstart', e => { e.preventDefault(); e.stopPropagation(); }],
        ['keydown', function(e){

            const forbidden = [

                ['s','S'], ['p','P'], ['n','N'], ['c','C'], ['v','V'], ['a','A'], ['u','U']
            ];
            if ((e.ctrlKey || e.metaKey)) {
                for (let [k1,k2] of forbidden) {
                    if (e.key === k1 || e.key === k2) {
                        e.preventDefault();
                        alert('This action is disabled for security reasons.');
                        return;
                    }
                }
            }

            if (e.key === 'F12' ||
                ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I','i','J','j','C','c'].includes(e.key))
            ) {
                e.preventDefault();
                alert('This action is disabled for security reasons.');
                return;
            }
        }, true]
    ];
    secureEvents.forEach(([event, handler, capture]) =>
        document.addEventListener(event, handler, !!capture)
    );

    window.addEventListener('beforeprint', e => {
        e.preventDefault();
        alert('Printing this content is disabled for security reasons.');
        return false;
    });

    window.addEventListener('keyup', function(e){
        if (e.key === "PrintScreen") {
            document.body.style.filter = "blur(7px)";
            alert('Screenshots are disabled for security reasons. Release Print Screen to continue.');
            setTimeout(() => { document.body.style.filter = ''; }, 1200);
        }
    });

    window.matchMedia('print').addEventListener('change', e => {
        if (e.matches) {
            document.body.innerHTML = '';
            alert('Printing is not allowed.');
        } else {
            location.reload();
        }
    });

    if (window.ResizeObserver) {

        let resizeTimeout;
        new ResizeObserver(() => {
            clearTimeout(resizeTimeout);
            canvas.style.filter = "";  
            resizeTimeout = setTimeout(() => {
                canvas.style.filter = "";
            }, 1200);
        }).observe(document.body);
    }
})();

function addObscureOverlay(canvasElem) {

    let lockOverlay = document.getElementById('obscure-overlay');
    if (!lockOverlay) {
        lockOverlay = document.createElement('div');
        lockOverlay.id = 'obscure-overlay';
        lockOverlay.style.position = 'absolute';
        lockOverlay.style.pointerEvents = 'auto';
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

if (typeof pdfjsLib === 'undefined') {
    console.error("PDF.js library is not loaded. Check script tags.");
    alert("PDF.js library failed to load. Please check your internet connection or script configuration.");
    pdfUpload.disabled = true;
} else {
    prevButton.addEventListener('click', onPrevPage);
    nextButton.addEventListener('click', onNextPage);

    loadPdfFromUrl(PDF_URL);

    canvas.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });

    document.addEventListener('keydown', function(e) {

        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            alert('Saving this content is disabled for security reasons.');
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
            e.preventDefault();
            alert('Printing this content is disabled for security reasons.');
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            alert('Copying this content is disabled for security reasons.');
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
            e.preventDefault();
            alert('Viewing source is disabled for security reasons.');
        }

        if (e.key === 'F12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I','i','J','j','C','c'].includes(e.key))) {
            e.preventDefault();
            alert('This action is disabled for security reasons.');
        }
    });

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
}