(function (root, factory) {
    const catalog = factory();
    if (typeof module === 'object' && module.exports) module.exports = catalog;
    if (root) {
        root.CV_TEMPLATE_CATALOG = catalog;
        root.resolveTemplateFile = catalog.resolveTemplateFile;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const TEMPLATES = [
        { file: 'classic.html', name: 'Classic', accent: '#1e40af', style: 'sans' },
        { file: 'ledger-layout.html', name: 'Ledger Layout', accent: '#0d465f', style: 'ledger' },
        { file: 'structured-grid.html', name: 'Structured Grid', accent: '#2d5294', style: 'royal' },
        { file: 'pill-corporate.html', name: 'Pill Corporate', accent: '#2d5294', style: 'pillcorp' },
        { file: 'hybrid-grid.html', name: 'Hybrid Grid', accent: '#0d465f', style: 'steel' },
        { file: 'corporate-box.html', name: 'Corporate Box', accent: '#003071', style: 'corpbox' },
        { file: 'bordered-grid.html', name: 'Bordered Grid', accent: '#17365d', style: 'corpborder' },
        { file: 'split-ledger.html', name: 'Split Ledger', accent: '#17365d', style: 'serifsplit' },
        { file: 'academic-ledger.html', name: 'Academic Ledger', accent: '#16365d', style: 'academicledger' },
        { file: 'modern-elegant.html', name: 'Modern Elegant', accent: '#4f81bc', style: 'serif' },
        { file: 'grid-layout.html', name: 'Grid Layout', accent: '#059669', style: 'grid' },
        { file: 'professional.html', name: 'Professional', accent: '#374151', style: 'clean' },
        { file: 'corporate.html', name: 'Corporate', accent: '#0369a1', style: 'formal' },
        { file: 'minimalist.html', name: 'Minimalist', accent: '#6b7280', style: 'minimal' },
        { file: 'bold-modern.html', name: 'Bold Modern', accent: '#dc2626', style: 'bold' },
        { file: 'refined-classic.html', name: 'Refined Classic', accent: '#2F557F', style: 'refined' },
        { file: 'modern-bold.html', name: 'Modern Bold', accent: '#2c5d79', style: 'deepblue' },
        { file: 'executive.html', name: 'Executive', accent: '#404040', style: 'dark' },
        { file: 'merit-layout.html', name: 'Merit Layout', accent: '#0f2f63', style: 'merit' },
        { file: 'clean-ledger.html', name: 'Clean Ledger', accent: '#111111', style: 'mono' },
        { file: 'modern-split.html', name: 'Modern Split', accent: '#28535e', style: 'split' },
        { file: 'horizon-split.html', name: 'Horizon Split', accent: '#1f385c', style: 'splitblue' },
        { file: 'professional-banner.html', name: 'Professional Banner', accent: '#155f82', style: 'bluebanner' },
        { file: 'executive-professional.html', name: 'Executive Professional', accent: '#1F4E79', style: 'navypro' },
        { file: 'corporate-grid.html', name: 'Corporate Grid', accent: '#073761', style: 'tealgrid' },
        { file: 'banner-resume.html', name: 'Banner Resume', accent: '#1F487C', style: 'navybanner' },
        { file: 'elegant-grid.html', name: 'Elegant Grid', accent: '#074F6A', style: 'tealserif' },
        { file: 'structured-ledger.html', name: 'Structured Ledger', accent: '#1F487C', style: 'template27' },
        { file: 'classic-ledger.html', name: 'Classic Ledger', accent: '#001F5F', style: 'template28' },
        { file: 'formal-ledger.html', name: 'Formal Ledger', accent: '#1F3760', style: 'template29' },
        { file: 'smart-ledger.html', name: 'Smart Ledger', accent: '#000D53', style: 'template30' },
        { file: 'modern-ledger.html', name: 'Modern Ledger', accent: '#2E5395', style: 'template31' },
        { file: 'standard-ledger.html', name: 'Standard Ledger', accent: '#0E4660', style: 'template32' },
        { file: 'classic-grid.html', name: 'Classic Grid', accent: '#2E5395', style: 'template33' },
        { file: 'profile-sidebar.html', name: 'Profile Sidebar', accent: '#464978', style: 'template34' },
        { file: 'compact-banner.html', name: 'Compact Banner', accent: '#292D2D', style: 'template35' },
        { file: 'dual-columns.html', name: 'Dual Columns', accent: '#292C2C', style: 'template36' },
        { file: 'inset-frame.html', name: 'Inset Frame', accent: '#45497D', style: 'template37' },
        { file: 'clean-rule.html', name: 'Clean Rule', accent: '#0D56C4', style: 'template38' },
        { file: 'continuous-outline.html', name: 'Continuous Outline', accent: '#1F477B', style: 'template39' },
        { file: 'formal-docket.html', name: 'Formal Docket', accent: '#001F5E', style: 'template40' },
        { file: 'open-panel.html', name: 'Open Panel', accent: '#8C8C8C', style: 'template41' },
        { file: 'executive-docket.html', name: 'Executive Docket', accent: '#1B365D', style: 'execdocket' },
        { file: 'tabular-ledger.html', name: 'Tabular Ledger', accent: '#1F4E79', style: 'tabledger' },
        { file: 'grid-docket.html', name: 'Grid Docket', accent: '#002060', style: 'griddocket' },
        { file: 'split-banner.html', name: 'Split Banner', accent: '#002060', style: 'splitbanner' },
        { file: 'wave-grid.html', name: 'Wave Grid', accent: '#002060', style: 'wavegrid' },
        { file: 'side-panel.html', name: 'Side Panel', accent: '#002060', style: 'sidepanel' },
        { file: 'classic-docket.html', name: 'Classic Docket', accent: '#002060', style: 'classicdocket' },
        { file: 'composite-ledger.html', name: 'Composite Ledger', accent: '#002060', style: 'compositeledger' },
        { file: 'dotted-split.html', name: 'Dotted Split', accent: '#002060', style: 'dottedsplit' },
        { file: 'pill-header-split.html', name: 'Pill Header Split', accent: '#0B2046', style: 'pillheader' },
        { file: 'banner-executive-split.html', name: 'Banner Executive Split', accent: '#05436E', style: 'bannerexecutive' },
        { file: 'sidebar-panel-split.html', name: 'Sidebar Panel Split', accent: '#004B87', style: 'sidebarpanel' },
        { file: 'timeline-flow-split.html', name: 'Timeline Flow Split', accent: '#313A4A', style: 'timelineflow' },
        { file: 'executive-header-split.html', name: 'Executive Header Split', accent: '#05436E', style: 'executiveheadersplit' },
        { file: 'bordered-box-ledger.html', name: 'Bordered Box Ledger', accent: '#102B4E', style: 'borderedboxledger' },
        { file: 'matrix-grid-ledger.html', name: 'Matrix Grid Ledger', accent: '#185FA5', style: 'matrixgridledger' },
        { file: 'clean-line-executive.html', name: 'Clean Line Executive', accent: '#0B3052', style: 'cleanlineexecutive' },
        { file: 'minimalist-executive.html', name: 'Minimalist Executive', accent: '#0E2C55', style: 'minimalistexecutive' },
        { file: 'accent-split-summary.html', name: 'Accent Split Summary', accent: '#1A365D', style: 'accentsplitsummary' }
    ];

    const ALIASES = {
        'classic-blue.html': 'classic.html',
        'classic-refined.html': 'refined-classic.html',
        'modern-deep-blue.html': 'modern-bold.html',
        'modern-serif.html': 'modern-elegant.html',
        'monochrome-ledger.html': 'clean-ledger.html',
        'slate-split.html': 'modern-split.html',
        'blue-horizon-split.html': 'horizon-split.html',
        'navy-merit.html': 'merit-layout.html',
        'executive-dark.html': 'executive.html',
        'pill-banner-corporate.html': 'pill-corporate.html',
        'navy-banner-resume.html': 'banner-resume.html',
        'ledger-blue-grid.html': 'ledger-layout.html',
        'steel-blue-grid.html': 'hybrid-grid.html',
        'royal-blue-grid.html': 'structured-grid.html',
        'calibri-blue-ledger.html': 'modern-ledger.html',
        'calibri-navy-ledger.html': 'smart-ledger.html',
        'serif-split-ledger.html': 'split-ledger.html',
        'times-blue-ledger.html': 'standard-ledger.html',
        'serif-blue-grid.html': 'classic-grid.html',
        'teal-serif-grid.html': 'elegant-grid.html',
        'cambria-navy-ledger.html': 'formal-ledger.html'
    };

    const catalog = TEMPLATES.slice();
    catalog.resolveTemplateFile = function (file) {
        const key = String(file || '').trim().toLowerCase();
        return ALIASES[key] || file;
    };

    return catalog;
});
