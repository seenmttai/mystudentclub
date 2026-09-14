/* Preview-only controls. The editor and desktop template sidebar retain their layout. */
(() => {
    const sheet = document.getElementById('preview-sheet');
    const content = document.getElementById('preview-sheet-content');
    const title = document.getElementById('preview-sheet-title');
    const FONT_OPTIONS = [
        {
            key: '',
            name: 'Default',
            tag: 'Template Native',
            sample: 'Aa Bb ...',
            category: 'all',
            cssFamily: 'inherit'
        },
        {
            key: 'calibri',
            name: 'Calibri',
            tag: 'Modern Corporate',
            sample: 'Aa Bb G...',
            category: 'sans',
            cssFamily: "Calibri, 'Segoe UI', Arial, sans-serif"
        },
        {
            key: 'inter',
            name: 'Inter',
            tag: 'Contemporary UI',
            sample: 'Aa B...',
            category: 'sans',
            cssFamily: "'Inter', sans-serif"
        },
        {
            key: 'roboto',
            name: 'Roboto',
            tag: 'Clean Geometric',
            sample: 'Aa Bb G...',
            category: 'sans',
            cssFamily: "'Roboto', sans-serif"
        },
        {
            key: 'open sans',
            name: 'Open Sans',
            tag: 'Balanced Neutral',
            sample: 'Aa Bb ...',
            category: 'sans',
            cssFamily: "'Open Sans', sans-serif"
        },
        {
            key: 'lato',
            name: 'Lato',
            tag: 'Warm Professional',
            sample: 'Aa B...',
            category: 'sans',
            cssFamily: "'Lato', sans-serif"
        },
        {
            key: 'montserrat',
            name: 'Montserrat',
            tag: 'Modern Architectural',
            sample: 'Aa ...',
            category: 'sans',
            cssFamily: "'Montserrat', sans-serif"
        },
        {
            key: 'poppins',
            name: 'Poppins',
            tag: 'Geometric Clean',
            sample: 'Aa B...',
            category: 'sans',
            cssFamily: "'Poppins', sans-serif"
        },
        {
            key: 'outfit',
            name: 'Outfit',
            tag: 'Premium Tech',
            sample: 'Aa Bb Gg...',
            category: 'sans',
            cssFamily: "'Outfit', sans-serif"
        },
        {
            key: 'nunito',
            name: 'Nunito',
            tag: 'Soft & Friendly',
            sample: 'Aa Bb Gg...',
            category: 'sans',
            cssFamily: "'Nunito', sans-serif"
        },
        {
            key: 'raleway',
            name: 'Raleway',
            tag: 'Modern Artistic',
            sample: 'Aa Bb Gg...',
            category: 'sans',
            cssFamily: "'Raleway', sans-serif"
        },
        {
            key: 'arial',
            name: 'Arial',
            tag: 'Universal Standard',
            sample: 'Aa Bb...',
            category: 'sans',
            cssFamily: "Arial, Helvetica, sans-serif"
        },
        {
            key: 'georgia',
            name: 'Georgia',
            tag: 'Editorial Classic',
            sample: 'Aa Bb...',
            category: 'serif',
            cssFamily: "Georgia, 'Times New Roman', serif"
        },
        {
            key: 'merriweather',
            name: 'Merriweather',
            tag: 'Editorial Serif',
            sample: 'Aa Bb...',
            category: 'serif',
            cssFamily: "'Merriweather', serif"
        },
        {
            key: 'playfair display',
            name: 'Playfair Display',
            tag: 'Luxury Headline',
            sample: 'Aa Bb...',
            category: 'serif',
            cssFamily: "'Playfair Display', Georgia, serif"
        },
        {
            key: 'lora',
            name: 'Lora',
            tag: 'Literary Calligraphic',
            sample: 'Aa Bb...',
            category: 'serif',
            cssFamily: "'Lora', Georgia, serif"
        },
        {
            key: 'libre baskerville',
            name: 'Libre Baskerville',
            tag: 'Traditional Book',
            sample: 'Aa Bb...',
            category: 'serif',
            cssFamily: "'Libre Baskerville', Georgia, serif"
        },
        {
            key: 'pt serif',
            name: 'PT Serif',
            tag: 'Formal Academic',
            sample: 'Aa Bb...',
            category: 'serif',
            cssFamily: "'PT Serif', Georgia, serif"
        },
        {
            key: 'times new roman',
            name: 'Times New Roman',
            tag: 'Classic Formal',
            sample: 'Aa Bb...',
            category: 'serif',
            cssFamily: "'Times New Roman', Times, serif"
        },
        {
            key: 'garamond',
            name: 'Garamond',
            tag: 'Timeless Heritage',
            sample: 'Aa Bb...',
            category: 'serif',
            cssFamily: "Garamond, 'EB Garamond', Georgia, serif"
        },
        {
            key: 'cambria',
            name: 'Cambria',
            tag: 'Executive Serif',
            sample: 'Aa Bb...',
            category: 'serif',
            cssFamily: "Cambria, Georgia, 'Times New Roman', serif"
        }
    ];
    const zoomViewer = document.getElementById('cv-zoom-viewer');
    const zoomScroll = document.getElementById('cv-zoom-scroll');
    const zoomStage = document.getElementById('cv-zoom-stage');
    const zoomFrame = document.getElementById('cv-zoom-frame');
    const zoomPercent = document.getElementById('cv-zoom-percent');
    const zoomPointers = new Map();
    const ZOOM_WIDTH = 794;
    const ZOOM_HEIGHT = 1123;
    let fitZoom = 0.75;
    let zoomScale = fitZoom;
    let pinchStartDistance = 0;
    let pinchStartScale = fitZoom;
    let lastPanPoint = null;
    let movedNode;
    let placeholder;

    function restoreContent() {
        if (movedNode && placeholder) placeholder.replaceWith(movedNode);
        movedNode = null;
        placeholder = null;
        content.replaceChildren();
        delete sheet.dataset.kind;
        const subtitle = document.getElementById('preview-sheet-subtitle');
        if (subtitle) subtitle.style.display = 'none';
        const resetBtn = document.getElementById('preview-sheet-reset-btn');
        if (resetBtn) resetBtn.style.display = 'none';
    }

    function moveIntoSheet(node) {
        placeholder = document.createComment('Preview control home');
        node.before(placeholder);
        movedNode = node;
        content.append(node);
    }

    window.closePreviewSheet = () => {
        if (sheet.open) sheet.close();
        restoreContent();
    };
    sheet.addEventListener('close', () => {
        // A new panel may have opened before the queued close event arrives.
        if (!sheet.open) restoreContent();
    });
    sheet.addEventListener('click', event => {
        const rect = sheet.getBoundingClientRect();
        if (event.target === sheet && (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom)) closePreviewSheet();
        if (sheet.dataset.kind === 'template' && event.target.closest('.template-card')) closePreviewSheet();
    });

    window.syncPreviewControls = () => {
        const accent = getThemeAccent();
        const color = document.getElementById('preview-color-name');
        if (color) {
            color.textContent = accent || 'Default';
            color.parentElement.style.setProperty('--preview-accent', accent || 'var(--primary)');
        }
        const currentFontKey = String(cvData.themeFont || '').toLowerCase();
        const font = FONT_OPTIONS.find(f => f.key === currentFontKey);
        const fontEl = document.getElementById('preview-font-name');
        if (fontEl) {
            fontEl.textContent = font?.key ? font.name : 'Default';
        }
        syncEnlargedPreview();
    };

    function renderFontSheet() {
        ensurePreviewFonts();
        const currentFontKey = String(cvData.themeFont || '').toLowerCase();

        // 1. Category Filter Tabs
        const filtersContainer = document.createElement('div');
        filtersContainer.className = 'preview-font-filters';

        const filterTabs = [
            { id: 'all', label: 'All' },
            { id: 'sans', label: 'Sans-Serif' },
            { id: 'serif', label: 'Serif' }
        ];

        const filterButtons = [];
        const optionButtons = [];

        function setCategory(catId) {
            filterButtons.forEach(({ btn, id }) => {
                btn.classList.toggle('active', id === catId);
            });
            optionButtons.forEach(({ btn, font }) => {
                if (catId === 'all') {
                    btn.style.display = '';
                } else if (font.category === 'all' || font.category === catId) {
                    btn.style.display = '';
                } else {
                    btn.style.display = 'none';
                }
            });
        }

        filterTabs.forEach(tab => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'preview-font-filter-chip' + (tab.id === 'all' ? ' active' : '');
            btn.dataset.filter = tab.id;
            btn.textContent = tab.label;
            btn.addEventListener('click', () => setCategory(tab.id));
            filtersContainer.append(btn);
            filterButtons.push({ btn, id: tab.id });
        });

        // 2. 2-Column Font Grid
        const grid = document.createElement('div');
        grid.className = 'preview-font-grid';

        function highlightFont(selectedKey) {
            const normalized = String(selectedKey || '').toLowerCase();
            optionButtons.forEach(({ btn, font }) => {
                const isMatch = font.key === normalized;
                btn.classList.toggle('active', isMatch);
                btn.setAttribute('aria-pressed', String(isMatch));
            });
        }

        for (const font of FONT_OPTIONS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'preview-font-option';
            btn.dataset.font = font.key;
            btn.dataset.category = font.category;

            const isCurrent = (font.key === currentFontKey);
            if (isCurrent) {
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
            } else {
                btn.setAttribute('aria-pressed', 'false');
            }

            const nameEl = document.createElement('span');
            nameEl.className = 'preview-font-name';
            nameEl.style.fontFamily = font.cssFamily;
            nameEl.textContent = font.name;

            const metaEl = document.createElement('span');
            metaEl.className = 'preview-font-meta';
            metaEl.textContent = `${font.tag} • ${font.sample}`;

            btn.append(nameEl, metaEl);

            btn.addEventListener('click', () => {
                cvData.themeFont = font.key;
                postToFrame();
                syncPreviewControls();
                highlightFont(font.key);
            });

            optionButtons.push({ btn, font });
            grid.append(btn);
        }

        content.append(filtersContainer, grid);

        // 3. Connect Header Reset Button
        const resetBtn = document.getElementById('preview-sheet-reset-btn');
        if (resetBtn) {
            resetBtn.onclick = () => {
                cvData.themeFont = '';
                postToFrame();
                syncPreviewControls();
                highlightFont('');
            };
        }
    }

    window.openPreviewSheet = kind => {
        if (kind === 'template' && !matchMedia('(max-width: 768px)').matches) {
            toggleTemplateSidebar(true);
            return;
        }
        restoreContent();
        sheet.dataset.kind = kind;
        const titles = {
            template: 'Choose a template',
            color: 'CV color',
            font: 'Typography & Font',
            download: 'Download your CV'
        };
        title.textContent = titles[kind] || 'Customize your CV';

        const subtitle = document.getElementById('preview-sheet-subtitle');
        const resetBtn = document.getElementById('preview-sheet-reset-btn');

        if (kind === 'font') {
            if (subtitle) {
                subtitle.textContent = 'Select font or use template default';
                subtitle.style.display = 'block';
            }
            if (resetBtn) {
                resetBtn.textContent = 'Default';
                resetBtn.style.display = 'inline-flex';
            }
            renderFontSheet();
        } else {
            if (subtitle) subtitle.style.display = 'none';
            if (resetBtn) resetBtn.style.display = 'none';
            if (kind === 'template') {
                renderTemplateCards();
                moveIntoSheet(document.getElementById('template-grid'));
            } else if (kind === 'color') {
                renderThemeControls();
                moveIntoSheet(document.querySelector('.template-theme-panel'));
            } else if (kind === 'download') {
                for (const [format, label, description] of [
                    ['pdf', 'Export as PDF', 'Ready to share and apply'],
                    ['docx', 'Export as Word', 'An editable .docx document']
                ]) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'preview-export-option';
                    button.innerHTML = `<span class="preview-file-icon">${format.toUpperCase()}</span><span><strong>${label}</strong><small>${description}</small></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>`;
                    button.addEventListener('click', () => {
                        closePreviewSheet();
                        downloadCvFile(format);
                    });
                    content.append(button);
                }
            }
        }
        syncPreviewControls();
        if (!sheet.open) sheet.showModal();
        content.scrollTop = 0;
    };

    function ensurePreviewFonts() {
        if (document.getElementById('preview-font-samples')) return;
        const link = document.createElement('link');
        link.id = 'preview-font-samples';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600;700&family=Inter:wght@400;600;700&family=Lato:wght@400;700&family=Libre+Baskerville:wght@400;700&family=Lora:wght@400;600&family=Merriweather:wght@400;700&family=Montserrat:wght@500;700&family=Nunito:wght@500;700&family=Open+Sans:wght@400;600;700&family=Outfit:wght@500;700&family=PT+Serif:wght@400;700&family=Playfair+Display:wght@500;700&family=Poppins:wght@500;600;700&family=Raleway:wght@500;700&family=Roboto:wght@400;500;700&display=swap';
        document.head.append(link);
    }

    function sendEnlargedPreviewData() {
        if (!zoomFrame.contentWindow || typeof buildPreviewPayload !== 'function') return;
        zoomFrame.contentWindow.postMessage({ type: 'update-cv', payload: buildPreviewPayload({ useDemoFallback: false }) }, '*');
    }

    function syncEnlargedPreview() {
        if (!zoomViewer.open) return;
        const template = document.getElementById('template-select').value;
        if (zoomFrame.getAttribute('src') !== template) zoomFrame.src = template;
        else sendEnlargedPreviewData();
    }

    function setZoomScale(nextScale, focalPoint = null) {
        const next = CvPreviewZoom.clampScale(nextScale);
        const old = zoomScale;
        const focal = focalPoint || { x: zoomScroll.clientWidth / 2, y: zoomScroll.clientHeight / 2 };
        const nextLeft = CvPreviewZoom.scrollForFocalPoint(zoomScroll.scrollLeft, focal.x, old, next);
        const nextTop = CvPreviewZoom.scrollForFocalPoint(zoomScroll.scrollTop, focal.y, old, next);
        zoomScale = next;
        zoomStage.dataset.scale = String(Number(next.toFixed(3)));
        zoomStage.style.width = `${ZOOM_WIDTH * next}px`;
        zoomStage.style.height = `${ZOOM_HEIGHT * next}px`;
        zoomStage.style.marginLeft = `${Math.max(16, (zoomScroll.clientWidth - (ZOOM_WIDTH * next)) / 2)}px`;
        zoomStage.style.marginRight = zoomStage.style.marginLeft;
        zoomStage.style.marginTop = `${Math.max(16, (zoomScroll.clientHeight - (ZOOM_HEIGHT * next)) / 2)}px`;
        zoomStage.style.marginBottom = zoomStage.style.marginTop;
        zoomFrame.style.transform = `scale(${next})`;
        const percentage = `${Math.round(next * 100)}%`;
        zoomPercent.textContent = Math.abs(next - fitZoom) < 0.005 ? `Fit · ${percentage}` : percentage;
        requestAnimationFrame(() => {
            zoomScroll.scrollLeft = Math.max(0, nextLeft);
            zoomScroll.scrollTop = Math.max(0, nextTop);
        });
    }

    window.openEnlargedPreview = () => {
        const template = document.getElementById('template-select').value;
        zoomFrame.onload = () => setTimeout(sendEnlargedPreviewData, 80);
        if (zoomFrame.getAttribute('src') !== template) zoomFrame.src = template;
        if (!zoomViewer.open) zoomViewer.showModal();
        document.body.classList.add('cv-zoom-open');
        requestAnimationFrame(() => {
            fitZoom = CvPreviewZoom.fitScale(
                zoomScroll.clientWidth,
                zoomScroll.clientHeight,
                ZOOM_WIDTH,
                ZOOM_HEIGHT,
                32
            );
            setZoomScale(fitZoom, { x: 0, y: 0 });
            zoomScroll.scrollLeft = 0;
            zoomScroll.scrollTop = 0;
            sendEnlargedPreviewData();
        });
    };

    window.closeEnlargedPreview = () => {
        if (zoomViewer.open) zoomViewer.close();
        document.body.classList.remove('cv-zoom-open');
        zoomPointers.clear();
        lastPanPoint = null;
    };

    window.adjustPreviewZoom = delta => setZoomScale(zoomScale + delta);
    window.resetPreviewZoom = () => {
        fitZoom = CvPreviewZoom.fitScale(zoomScroll.clientWidth, zoomScroll.clientHeight, ZOOM_WIDTH, ZOOM_HEIGHT, 32);
        setZoomScale(fitZoom, { x: 0, y: 0 });
        requestAnimationFrame(() => {
            zoomScroll.scrollLeft = 0;
            zoomScroll.scrollTop = 0;
        });
    };

    zoomViewer.addEventListener('close', () => {
        document.body.classList.remove('cv-zoom-open');
        zoomPointers.clear();
        lastPanPoint = null;
    });

    zoomScroll.addEventListener('pointerdown', event => {
        zoomPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        try { zoomScroll.setPointerCapture(event.pointerId); } catch (_) {}
        if (zoomPointers.size === 1) lastPanPoint = { x: event.clientX, y: event.clientY };
        if (zoomPointers.size === 2) {
            const [a, b] = [...zoomPointers.values()];
            pinchStartDistance = Math.hypot(b.x - a.x, b.y - a.y);
            pinchStartScale = zoomScale;
        }
        event.preventDefault();
    });

    zoomScroll.addEventListener('pointermove', event => {
        if (!zoomPointers.has(event.pointerId)) return;
        zoomPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (zoomPointers.size === 2) {
            const [a, b] = [...zoomPointers.values()];
            const distance = Math.hypot(b.x - a.x, b.y - a.y);
            const rect = zoomScroll.getBoundingClientRect();
            setZoomScale(CvPreviewZoom.scaleFromPinch(pinchStartScale, pinchStartDistance, distance), {
                x: ((a.x + b.x) / 2) - rect.left,
                y: ((a.y + b.y) / 2) - rect.top
            });
        } else if (lastPanPoint) {
            zoomScroll.scrollLeft -= event.clientX - lastPanPoint.x;
            zoomScroll.scrollTop -= event.clientY - lastPanPoint.y;
            lastPanPoint = { x: event.clientX, y: event.clientY };
        }
        event.preventDefault();
    });

    const endZoomPointer = event => {
        zoomPointers.delete(event.pointerId);
        const remaining = [...zoomPointers.values()][0];
        lastPanPoint = remaining ? { ...remaining } : null;
        if (zoomPointers.size < 2) pinchStartDistance = 0;
    };
    zoomScroll.addEventListener('pointerup', endZoomPointer);
    zoomScroll.addEventListener('pointercancel', endZoomPointer);

    zoomScroll.addEventListener('wheel', event => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        const rect = zoomScroll.getBoundingClientRect();
        setZoomScale(zoomScale + (event.deltaY < 0 ? 0.15 : -0.15), {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        });
    }, { passive: false });

    window.addEventListener('resize', () => {
        if (zoomViewer.open) resetPreviewZoom();
    });

    window.addEventListener('load', syncPreviewControls);
})();
