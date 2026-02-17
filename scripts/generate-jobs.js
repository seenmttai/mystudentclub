require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://api.mystudentclub.com';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const DOMAIN = 'https://www.mystudentclub.com';

// USER REQUEST: Fetch 500, but keep up to 2500 in folder.
const FETCH_LIMIT = 100;
const FOLDER_LIMIT = 3000;

const TABLE_MAP = {
    'Industrial Training Job Portal': 'industrial',
    'Fresher Jobs': 'fresher',
    'Semi Qualified Jobs': 'semi-qualified',
    'Articleship Jobs': 'articleship'
};

const JOB_TITLE_MAP = {
    "Industrial Training Job Portal": "Industrial Trainee",
    "Fresher Jobs": "CA Fresher",
    "Semi Qualified Jobs": "Semi Qualified Chartered Accountant",
    "Articleship Jobs": "Articleship Trainee"
};

const EMAIL_SUBJECT_MAP = {
    "Industrial Training Job Portal": "Application for CA Industrial Training",
    "Fresher Jobs": "Application for CA Fresher",
    "Semi Qualified Jobs": "Application for Semi Qualified CA",
    "Articleship Jobs": "Application for CA Articleship"
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Helper Functions ---

function escapeHtml(text) {
    if (text === null || text === undefined || text === '') return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(dateString) {
    if (!dateString) return new Date().toISOString().split('T')[0];
    return new Date(dateString).toISOString().split('T')[0];
}

function getDaysAgo(dateString) {
    if (!dateString) return 'Recently';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
}

function renderMarkdown(text) {
    if (!text) return 'No description provided.';
    let html = String(text)
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_(.+?)_/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    return '<p>' + html + '</p>';
}

function getApplicationLink(id) {
    if (!id) return { link: '#', isEmail: false };
    const trimmedId = String(id).trim();

    if (trimmedId.toLowerCase().startsWith('http')) {
        try {
            new URL(trimmedId);
            return { link: trimmedId, isEmail: false };
        } catch (_) { }
    }

    if (trimmedId.includes('@')) {
        const emailMatch = trimmedId.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
            return { link: trimmedId, isEmail: true, email: emailMatch[0] };
        }
    }

    return {
        link: `https://www.google.com/search?q=${encodeURIComponent(trimmedId + ' careers')}`,
        isEmail: false
    };
}

function constructMailto(job, tableName) {
    const rawLink = job['Application ID'];
    if (!rawLink) return '#';
    const emailMatch = String(rawLink).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) return '#';
    const email = emailMatch[0];
    const subjectBase = EMAIL_SUBJECT_MAP[tableName] || `Application for ${job.Category || 'the role'} Position`;
    const subject = `${subjectBase} at ${job.Company} (Ref: My Student Club)`;
    return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

function generateJsonLd(job, jobId, categorySlug) {
    const datePosted = formatDate(job.Created_At);
    const description = job.Description
        ? JSON.stringify(String(job.Description).replace(/\n/g, '\\n').replace(/"/g, '\\"'))
        : '"No description available"';

    return {
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        "title": job.Company || "Job Vacancy",
        "description": description,
        "identifier": {
            "@type": "PropertyValue",
            "name": job.Company,
            "value": jobId
        },
        "datePosted": datePosted,
        "validThrough": new Date(new Date(datePosted).setMonth(new Date(datePosted).getMonth() + 3)).toISOString(),
        "employmentType": "FULL_TIME",
        "hiringOrganization": {
            "@type": "Organization",
            "name": job.Company,
            "sameAs": DOMAIN,
            "logo": `${DOMAIN}/assets/icon-70x70.png`
        },
        "jobLocation": {
            "@type": "Place",
            "address": {
                "@type": "PostalAddress",
                "streetAddress": job.Location || "Remote",
                "addressLocality": job.Location || "Remote",
                "addressRegion": "IN",
                "addressCountry": "IN",
                "postalCode": (job.Location && job.Location.match(/\b\d{6}\b/) ? job.Location.match(/\b\d{6}\b/)[0] : undefined)
            }
        },
        "baseSalary": {
            "@type": "MonetaryAmount",
            "currency": "INR",
            "value": {
                "@type": "QuantitativeValue",
                "value": parseInt(String(job.Salary || '0').replace(/[^0-9]/g, '')) || 0,
                "unitText": "MONTH"
            }
        }
    };
}

const htmlTemplate = (job, jsonLd, categorySlug, jobId, tableName) => {
    const companyName = (job.Company || 'Company Name').trim();
    const companyInitial = companyName.charAt(0).toUpperCase();
    const postedDate = getDaysAgo(job.Created_At);
    const salary = job.Salary ? `₹${job.Salary}` : '';
    const location = job.Location || 'Remote / Unspecified';
    const category = job.Category || 'General';
    const descriptionHtml = renderMarkdown(job.Description);
    const applyInfo = getApplicationLink(job['Application ID']);

    // Connect Link Logic
    let connectLink = job.connect_link || job['connect_link'];
    if (!connectLink || String(connectLink).trim() === '') {
        const searchKeywordSuffix = JOB_TITLE_MAP[tableName] || "Chartered Accountant";
        const query = `${companyName} ${searchKeywordSuffix}`;
        connectLink = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}&origin=SWITCH_SEARCH_VERTICAL`;
    }

    // Apply Button Logic
    let applyButtonsHtml = '';
    if (applyInfo.isEmail) {
        const simpleMailto = constructMailto(job, tableName);
        applyButtonsHtml = `
            <div class="email-apply-buttons">
                <a href="${simpleMailto}" class="btn-large btn-secondary-large" id="simpleApplyBtn">
                    <i class="fas fa-envelope"></i> Simple Apply
                </a>
                <a href="${simpleMailto}" class="btn-large btn-ai-apply">
                   <i class="fas fa-magic"></i> AI Powered Apply
                </a>
            </div>
        `;
    } else {
        applyButtonsHtml = `
            <a href="${applyInfo.link}" target="_blank" class="btn-large btn-primary-large">
                <i class="fas fa-external-link-alt"></i> Apply Now
            </a>
        `;
    }

    // Back Link Logic
    const portalMap = {
        'industrial': { url: '/', label: 'Industrial Training' },
        'fresher': { url: '/fresher.html', label: 'Fresher Jobs' },
        'semi-qualified': { url: '/semi-qualified.html', label: 'Semi Qualified' },
        'articleship': { url: '/articleship.html', label: 'Articleship' }
    };
    const backLinkUrl = portalMap[categorySlug]?.url || '/';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(companyName)} - ${escapeHtml(location)} | My Student Club</title>
    <meta name="description" content="Apply for ${escapeHtml(companyName)} in ${escapeHtml(location)}. Find more CA Industrial Training, Fresher, and Articleship jobs on My Student Club.">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://www.mystudentclub.com/scripts/portal-style.css">
    <link rel="icon" type="image/x-icon" href="https://www.mystudentclub.com/assets/icon-70x70.png">
    <script type="application/ld+json">
    ${JSON.stringify(jsonLd)}
    </script>
    <style>
        /* Professional Job Details Design - Migrated from jobs-test.html */
        :root {
            --primary-color: #2563eb;
            --secondary-color: #1e40af;
            --accent-color: #f59e0b;
            --background-color: #f8fafc;
            --card-bg: #ffffff;
            --text-main: #1e293b;
            --text-secondary: #475569;
            --text-muted: #64748b;
            --border-color: #e2e8f0;
            --shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            --transition: all 0.2s ease;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        html, body {
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
        }

        body {
            background-color: var(--background-color);
            color: var(--text-main);
            font-family: 'Poppins', sans-serif;
            line-height: 1.6;
            display: flex;
            flex-direction: column;
        }

        /* Fixed Header */
        header {
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(10px);
            padding: 1rem 1.25rem;
            box-shadow: var(--shadow);
            z-index: 100;
            flex-shrink: 0;
            position: sticky;
            top: 0;
        }

        .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            max-width: 100%;
        }

        .logo {
            height: 32px;
        }

        .back-link {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            color: var(--secondary-color);
            text-decoration: none;
            font-weight: 500;
            font-size: 0.85rem;
            transition: var(--transition);
        }

        .back-link:hover {
            color: var(--primary-color);
        }

        /* Scrollable Main Content Area */
        .main-content-area {
            flex: 1 !important;
            overflow-y: auto !important;
            padding: 1.25rem !important;
            max-width: none !important;
            margin: 0 !important;
        }

        .job-details-container {
            background: var(--card-bg);
            border-radius: 8px;
            border: 1px solid var(--border-color);
            box-shadow: var(--shadow);
            overflow: hidden;
            width: 100% !important;
            max-width: none !important;
            /* display set to block by default */
        }

        .fade-in {
            animation: fadeIn 0.3s ease-out forwards;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Professional Job Header */
        .job-header-section {
            background: linear-gradient(135deg, #2c53bf 0%, #2c56de 100%);
            color: white;
            padding: 2rem 2rem 1.75rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .job-header-content {
            display: flex;
            gap: 1.5rem;
            align-items: flex-start;
        }

        .company-logo-large {
            width: 64px;
            height: 64px;
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(8px);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.75rem;
            font-weight: 700;
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.2);
            flex-shrink: 0;
        }

        .job-title-block {
            flex: 1;
        }

        .job-title-block h1 {
            font-size: 1.75rem;
            margin: 0 0 0.5rem 0;
            line-height: 1.2;
            font-weight: 600;
        }

        .job-meta-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.75rem 1.25rem;
            font-size: 0.875rem;
            opacity: 0.9;
            margin-top: 0.75rem;
        }

        .job-meta-item {
            display: flex;
            align-items: center;
            gap: 0.4rem;
        }

        .job-meta-item i {
            opacity: 0.8;
        }

        /* Body Layout */
        .job-body {
            padding: 1.75rem 2rem;
            display: grid;
            grid-template-columns: 1fr 340px;
            gap: 2.5rem;
            align-items: start;
        }

        /* Main Column - Scrollable when content exceeds height */
        .main-column {
            max-height: calc(100vh - 100px);
            overflow-y: auto;
            padding-right: 1rem;
        }

        /* Custom scrollbar for main column */
        .main-column::-webkit-scrollbar {
            width: 6px;
        }

        .main-column::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 3px;
        }

        .main-column::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 3px;
        }

        .main-column::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
        }

        /* Action Sidebar - Fixed/Sticky */
        .action-sidebar {
            position: sticky;
            top: 0;
            align-self: start;
            display: flex;
            flex-direction: column;
            gap: 1rem;
            min-width: 0;
        }

        .action-card {
            min-width: 0;
            overflow: hidden;
        }

        /* Dense Info Grid - In Sidebar */
        .info-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 0.75rem;
            margin-bottom: 1.25rem;
            min-width: 0;
            overflow: hidden;
        }

        .info-card {
            background: #f8fafc;
            padding: 1rem;
            border-radius: 6px;
            border: 1px solid var(--border-color);
            transition: all 0.2s;
            min-width: 0;
            overflow: hidden;
        }

        .info-card:hover {
            border-color: var(--primary-color);
            background: #eff6ff;
        }

        .info-label {
            display: block;
            color: var(--text-muted);
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 600;
            margin-bottom: 0.35rem;
        }

        .info-value {
            font-weight: 600;
            color: var(--text-main);
            font-size: 0.95rem;
            display: flex;
            align-items: center;
            gap: 0.4rem;
        }

        .info-value-container {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: #f8fafc;
            border-radius: 6px;
            padding: 0.5rem;
            max-width: 100%;
        }

        .info-value-scroll {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 0.4rem;
            overflow-x: auto;
            overflow-y: hidden;
            white-space: nowrap;
            min-width: 0;
        }

        .info-value-scroll::-webkit-scrollbar {
            height: 4px;
        }

        .info-value-scroll::-webkit-scrollbar-track {
            background: #e2e8f0;
            border-radius: 2px;
        }

        .info-value-scroll::-webkit-scrollbar-thumb {
            background: var(--primary-color);
            border-radius: 2px;
        }

        .apply-link-text {
            font-weight: 600;
            color: var(--text-main);
            font-size: 0.95rem;
        }

        .copy-btn {
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 4px;
            padding: 0.4rem 0.6rem;
            cursor: pointer;
            transition: all 0.2s;
            flex-shrink: 0;
        }

        .copy-btn:hover {
            background: #1e40af;
            transform: scale(1.05);
        }

        .copy-btn i {
            font-size: 0.9rem;
        }

        .info-value i {
            color: var(--primary-color);
            font-size: 1rem;
        }

        /* Markdown Description Styling */
        .description-content {
            line-height: 1.7;
        }

        .description-content p {
            margin-bottom: 1rem;
        }

        .description-content h1,
        .description-content h2,
        .description-content h3 {
            margin-top: 1.5rem;
            margin-bottom: 0.75rem;
            font-weight: 600;
        }

        .description-content h1 {
            font-size: 1.5rem;
        }

        .description-content h2 {
            font-size: 1.25rem;
        }

        .description-content h3 {
            font-size: 1.1rem;
        }

        .description-content strong {
            font-weight: 600;
            color: var(--text-main);
        }

        .description-content em {
            font-style: italic;
        }

        .description-content a {
            color: var(--primary-color);
            text-decoration: underline;
        }

        .description-content a:hover {
            color: #1e40af;
        }

        /* Description */
        .description-section {
            background: white;
        }

        .description-section h2 {
            font-size: 1.15rem;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--text-main);
            font-weight: 600;
        }

        .description-section h2 i {
            color: var(--primary-color);
            font-size: 1rem;
        }

        .description-content {
            line-height: 1.7;
            color: var(--text-secondary);
            white-space: pre-wrap;
            font-size: 0.925rem;
        }

        /* Action Card */
        .action-card {
            background: #f8fafc;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1.25rem;
        }

        .action-card h3 {
            font-size: 1rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            color: var(--text-main);
        }

        .action-card > p {
            color: var(--text-muted);
            margin-bottom: 1rem;
            font-size: 0.825rem;
            line-height: 1.5;
        }

        .btn-large {
            display: flex;
            width: 100%;
            padding: 0.75rem 1rem;
            border-radius: 6px;
            font-weight: 600;
            justify-content: center;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
            font-size: 0.875rem;
            text-decoration: none;
            margin-bottom: 0.75rem;
        }

        .btn-primary-large {
            background: var(--primary-color);
            color: white;
            box-shadow: 0 1px 2px rgba(37, 99, 235, 0.2);
        }

        .btn-primary-large:hover {
            background: var(--secondary-color);
            transform: translateY(-1px);
            box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.25);
        }

        /* Secondary button for Simple Apply */
        .btn-secondary-large {
            background: #f1f5f9;
            color: var(--text-main);
            border: 1px solid var(--border-color);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .btn-secondary-large:hover {
            background: #e2e8f0;
            transform: translateY(-1px);
        }

        /* AI Powered Apply button with gradient */
        .btn-ai-apply {
            background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
            color: white;
            box-shadow: 0 2px 4px rgba(124, 58, 237, 0.3);
        }

        .btn-ai-apply:hover {
            background: linear-gradient(135deg, #6d28d9 0%, #1d4ed8 100%);
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(124, 58, 237, 0.4);
        }

        .btn-ai-apply .btn-text {
            flex: 1;
        }

        .btn-ai-apply .fa-spinner {
            display: none;
        }

        .btn-ai-apply.loading .btn-text {
            opacity: 0.7;
        }

        .btn-ai-apply.loading .fa-spinner {
            display: inline-block;
        }

        .btn-linkedin {
            background: #0077b5;
            color: white;
            box-shadow: 0 1px 2px rgba(0, 119, 181, 0.2);
        }

        .btn-linkedin:hover {
            background: #006097;
            transform: translateY(-1px);
            box-shadow: 0 4px 6px -1px rgba(0, 119, 181, 0.25);
        }

        /* Email action buttons container */
        .email-apply-buttons {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            margin-bottom: 0.75rem;
        }

        .action-card-footer {
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 1rem;
            padding-top: 1rem;
            border-top: 1px solid var(--border-color);
            text-align: center;
        }

        .action-card-footer a {
            color: var(--primary-color);
            text-decoration: none;
            font-weight: 500;
        }

        .action-card-footer a:hover {
            text-decoration: underline;
        }

        /* Loading State */
        .skeleton {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
            background: #e2e8f0;
            border-radius: 8px;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
        }

        .loading-container {
            max-width: 100%;
            padding: 2rem;
            background: white;
            border-radius: 8px;
        }

        /* Mobile Apply Button - Hidden by default on desktop */
        .mobile-apply-btn {
            display: none;
        }

        /* Responsive Design */
        @media (max-width: 968px) {
            .job-body {
                grid-template-columns: 1fr;
                gap: 1.5rem;
            }

            .main-column {
                max-height: none;
                overflow-y: visible;
                padding-right: 0;
            }

            .action-sidebar {
                position: static;
            }
        }

        @media (max-width: 640px) {
            header {
                padding: 0.75rem 1rem;
            }

            .logo {
                height: 28px;
            }

            .back-link {
                font-size: 0.75rem;
                gap: 0.3rem;
            }

            .main-content-area {
                padding: 0.75rem !important;
            }

            .job-header-section {
                padding: 1.5rem 1rem;
            }

            .job-header-content {
                flex-direction: column;
                align-items: center;
                text-align: center;
                gap: 1rem;
            }

            .job-meta-row {
                justify-content: center;
                font-size: 0.8rem;
            }

            .job-body {
                padding: 1.25rem 1rem;
            }

            .description-section h2 {
                font-size: 1rem;
            }

            .description-content {
                font-size: 0.875rem;
            }

            .btn-large {
                padding: 0.65rem 0.75rem;
                font-size: 0.8rem;
            }

            .mobile-apply-btn {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
                margin-top: 1rem;
            }

            .mobile-apply-btn .btn-large {
                width: 100%;
                justify-content: center;
                background: white !important;
                color: var(--primary-color) !important;
                border: 2px solid white !important;
                font-weight: 600;
            }

            .mobile-apply-btn .btn-ai-apply {
                background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%) !important;
                color: white !important;
                border: 2px solid rgba(255,255,255,0.3) !important;
            }
        }
    </style>
</head>
<body>

    <header>
        <div class="header-container">
            <a href="/">
                <img src="https://www.mystudentclub.com/assets/logo.png" alt="My Student Club" class="logo">
            </a>
            <a href="${backLinkUrl}" class="back-link">
                <i class="fas fa-arrow-left"></i>
                <span>Back to Jobs</span>
            </a>
        </div>
    </header>

    <main class="main-content-area">
        <div class="job-details-container">
             <div class="job-header-section">
                <div class="job-header-content">
                  <div class="company-logo-large">${companyInitial}</div>
                  <div class="job-title-block">
                    <h1>${escapeHtml(companyName)}</h1>
                    <div class="job-meta-row">
                        <div class="job-meta-item">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>${escapeHtml(location)}</span>
                        </div>
                        ${salary ? `
                        <div class="job-meta-item">
                            <span>Stipend: ${salary}</span>
                        </div>
                        ` : ''}
                        <div class="job-meta-item">
                            <i class="far fa-clock"></i>
                            <span>Posted ${postedDate}</span>
                        </div>
                        <div class="job-meta-item">
                            <i class="fas fa-tag"></i>
                            <span>${escapeHtml(category)}</span>
                        </div>
                    </div>
                    
                    <div class="mobile-apply-btn">
                        ${applyButtonsHtml}
                    </div>
                  </div>
                </div>
              </div>

              <div class="job-body">
                <div class="main-column">
                    <div class="description-section">
                        <h2><i class="fas fa-file-lines"></i> Job Description</h2>
                        <div class="description-content">${descriptionHtml}</div>
                    </div>
                </div>

                <aside class="action-sidebar">
                    <div class="action-card">
                        <h3>Apply here</h3>
                        
                        <div class="info-grid">
                            <div class="info-card">
                                <div>
                                    <span class="info-label">${applyInfo.isEmail ? 'Email' : 'Apply Link'}</span>
                                    <div class="info-value-container">
                                        <div class="info-value-scroll">
                                            <i class="fas ${applyInfo.isEmail ? 'fa-envelope' : 'fa-link'}"></i>
                                            <span class="apply-link-text">${applyInfo.isEmail ? applyInfo.email : job['Application ID'] || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <h3 style="margin-top: 1rem;">Interested?</h3>
                        <p>Apply now or connect with peers at this company.</p>
                        
                        ${applyButtonsHtml}

                        <a href="${connectLink}" target="_blank" class="btn-large btn-linkedin">
                            <i class="fab fa-linkedin"></i> Connect to Peers
                        </a>
                        
                        <div class="action-card-footer">
                            False job vacancy? <a href="/contact.html">Report it</a>
                        </div>
                    </div>
                </aside>
              </div>
        </div>
    </main>
    <script src="https://www.googletagmanager.com/gtag/js?id=G-1450NCVE65" async></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        gtag('js', new Date());
        gtag('config', 'G-1450NCVE65');
    </script>
</body>
</html>
`;
};

// --- Main Logic ---

async function generateJobs() {
    console.log(`Starting job page generation (Fetch Limit: ${FETCH_LIMIT}, Folder Limit: ${FOLDER_LIMIT})...`);

    const jobsDir = path.join(__dirname, '..', 'jobs');
    if (!fs.existsSync(jobsDir)) fs.mkdirSync(jobsDir);

    const SYNC_STATE_FILE = path.join(jobsDir, 'sync-state.json');

    // Load Sync State
    let syncState = {};
    if (fs.existsSync(SYNC_STATE_FILE)) {
        try {
            syncState = JSON.parse(fs.readFileSync(SYNC_STATE_FILE, 'utf8'));
        } catch (e) {
            console.warn('Failed to parse sync-state.json, starting fresh.', e);
        }
    }

    for (const [tableName, folderName] of Object.entries(TABLE_MAP)) {
        console.log(`Processing: ${tableName} -> jobs/${folderName}`);

        const folderPath = path.join(jobsDir, folderName);
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);

        // Step 1: Determine last known job timestamp
        let lastJobCreatedAt = syncState[tableName] || null;

        // Fallback: If no state, try to infer from files (ONLY for Integer ID tables)
        if (!lastJobCreatedAt && tableName !== 'Semi Qualified Jobs') {
            const existingFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.html'));
            if (existingFiles.length > 0) {
                const ids = existingFiles.map(f => parseInt(f.replace('.html', '')));
                const validIds = ids.filter(id => !isNaN(id));

                if (validIds.length > 0) {
                    const maxId = Math.max(...validIds);
                    console.log(`No sync state. Found max ID ${maxId} in folder. Fetching its timestamp...`);

                    const { data: lastJobData, error: lastJobError } = await supabase
                        .from(tableName)
                        .select('Created_At')
                        .eq('id', maxId)
                        .single();

                    if (!lastJobError && lastJobData) {
                        lastJobCreatedAt = lastJobData.Created_At;
                        console.log(`Inferred last timestamp: ${lastJobCreatedAt}`);
                    }
                }
            }
        }

        // Step 2: Fetch jobs
        let query = supabase
            .from(tableName)
            .select('*')
            .order('Created_At', { ascending: false });

        if (lastJobCreatedAt) {
            console.log(`Fetching jobs created after ${lastJobCreatedAt}...`);
            query = query.gt('Created_At', lastJobCreatedAt);
        } else {
            console.log(`No previous state found. Fetching latest ${FETCH_LIMIT} jobs...`);
            query = query.limit(FETCH_LIMIT);
        }

        const { data: jobs, error } = await query;

        if (error) {
            console.error(`Error fetching ${tableName}:`, error);
            continue;
        }

        console.log(`Fetched ${jobs.length} jobs. Updating pages...`);

        if (jobs.length > 0) {
            // Update Sync State with the NEWEST job's timestamp (first in array due to desc order)
            // But we need to be careful: if we fetched multiple, the first one is the newest.
            // We should pick the MAX Created_At from the fetched jobs to be safe.
            const newestJob = jobs.reduce((max, job) => new Date(job.Created_At) > new Date(max.Created_At) ? job : max, jobs[0]);
            syncState[tableName] = newestJob.Created_At;
        }

        // Write/Overwrite files. 
        // Files written here will have their 'mtime' (modification time) updated to NOW.
        for (const job of jobs) {
            const fileName = `${job.id}.html`;
            const filePath = path.join(folderPath, fileName);

            const jsonLd = generateJsonLd(job, job.id, folderName);
            const htmlContent = htmlTemplate(job, jsonLd, folderName, job.id, tableName);

            fs.writeFileSync(filePath, htmlContent);
        }

        let allFiles = fs.readdirSync(folderPath).map(file => {
            return {
                name: file,
                path: path.join(folderPath, file),
                mtime: fs.statSync(path.join(folderPath, file)).mtime
            };
        });

        // Filter only HTML files to avoid deleting system files if any
        allFiles = allFiles.filter(f => f.name.endsWith('.html'));

        // Sort desc (newest first) to check limit
        allFiles.sort((a, b) => b.mtime - a.mtime);

        if (allFiles.length > FOLDER_LIMIT) {
            console.log(`Folder limit exceeded (${allFiles.length} > ${FOLDER_LIMIT}). Initiating bulk cleanup...`);

            // 1. Identify the oldest file (last in the sorted array)
            const oldestFile = allFiles[allFiles.length - 1];
            const oldestDate = new Date(oldestFile.mtime);

            console.log(`Oldest file found: ${oldestFile.name} (Dated: ${oldestDate.toISOString()})`);

            // 2. Calculate the purge cutoff date (Oldest Date + 7 Days)
            // We want to delete everything from the "oldest date" up to "oldest date + 7 days"
            // effectively clearing a week's worth of the oldest data.
            const purgeCutoff = new Date(oldestDate);
            purgeCutoff.setDate(purgeCutoff.getDate() + 7);

            console.log(`Purging files older than or equal to: ${purgeCutoff.toISOString()} (7-day buffer)`);

            // 3. Filter files to delete: Any file OLDER than the cutoff (mtime < purgeCutoff)
            // Note: Since 'allFiles' contains everything, we just act on the full list.
            const filesToDelete = allFiles.filter(f => f.mtime <= purgeCutoff);

            console.log(`Identified ${filesToDelete.length} files to delete.`);

            for (const file of filesToDelete) {
                try {
                    fs.unlinkSync(file.path);
                } catch (err) {
                    console.error(`Failed to delete ${file.name}:`, err);
                }
            }
            console.log(`Bulk cleanup complete. Deleted ${filesToDelete.length} files.`);
        } else {
            console.log(`Folder check passed: ${allFiles.length} files (Limit: ${FOLDER_LIMIT}).`);
        }

        console.log(`Finished ${folderName}.`);
    }

    // Save Sync State
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(syncState, null, 2));

    // --- Sitemap Generation ---
    await generateSitemap(jobsDir);

    console.log('Job generation complete!');
}

async function generateSitemap(jobsDir) {
    console.log('Generating jobs-sitemap.xml...');
    const sitemapPath = path.join(__dirname, '..', 'jobs-sitemap.xml');
    let sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    const today = new Date().toISOString().split('T')[0];

    // Calculate cutoff date (3 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 3);
    console.log(`Sitemap cutoff date: ${cutoffDate.toISOString().split('T')[0]} (Only including jobs posted/created after this)`);

    let totalExpired = 0;

    for (const [tableName, folderName] of Object.entries(TABLE_MAP)) {
        const folderPath = path.join(jobsDir, folderName);
        if (fs.existsSync(folderPath)) {
            const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.html'));
            let addedCount = 0;
            let expiredCount = 0;

            for (const file of files) {
                const filePath = path.join(folderPath, file);

                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    // Extract datePosted from JSON-LD
                    const dateMatch = content.match(/"datePosted":\s*"(\d{4}-\d{2}-\d{2})"/);

                    if (dateMatch && dateMatch[1]) {
                        const jobDate = new Date(dateMatch[1]);

                        // Compare job posted date with cutoff
                        if (jobDate > cutoffDate) {
                            // Fresh job - add to sitemap
                            const url = `${DOMAIN}/jobs/${folderName}/${file}`;
                            sitemapContent += `   <url>\n      <loc>${url}</loc>\n      <lastmod>${today}</lastmod>\n      <changefreq>daily</changefreq>\n      <priority>0.7</priority>\n   </url>\n`;
                            addedCount++;
                        } else {
                            // Job is expired - remove JSON-LD and inject noindex meta
                            // Check if JSON-LD still exists or if noindex meta is missing
                            const hasJsonLd = content.includes('<script type="application/ld+json">');
                            const hasNoindexMeta = content.includes('<meta name="robots" content="noindex');

                            if (hasJsonLd || !hasNoindexMeta) {
                                // Get original file stats to preserve mtime
                                const stats = fs.statSync(filePath);
                                const originalMtime = stats.mtime;
                                const originalAtime = stats.atime;

                                let updatedContent = content;

                                // Remove JSON-LD block if exists
                                if (hasJsonLd) {
                                    updatedContent = updatedContent.replace(
                                        /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
                                        ''
                                    );
                                }

                                // Inject noindex meta tag if not present
                                if (!hasNoindexMeta) {
                                    // Insert after the viewport meta tag (or first meta tag)
                                    updatedContent = updatedContent.replace(
                                        /(<meta name="viewport"[^>]*>)/,
                                        '$1\n    <meta name="robots" content="noindex, follow">'
                                    );
                                }

                                // Write updated content
                                fs.writeFileSync(filePath, updatedContent);

                                // Restore original timestamps
                                fs.utimesSync(filePath, originalAtime, originalMtime);

                                expiredCount++;
                            }
                            // Skip adding to sitemap (expired)
                        }
                    } else {
                        // No JSON-LD found (already processed or invalid)
                        // Check file mtime as fallback
                        const stats = fs.statSync(filePath);
                        if (stats.mtime > cutoffDate) {
                            const url = `${DOMAIN}/jobs/${folderName}/${file}`;
                            sitemapContent += `   <url>\n      <loc>${url}</loc>\n      <lastmod>${today}</lastmod>\n      <changefreq>daily</changefreq>\n      <priority>0.7</priority>\n   </url>\n`;
                            addedCount++;
                        }
                        // If old and no JSON-LD, it's already been processed - skip
                    }
                } catch (err) {
                    console.error(`Error processing file ${file}:`, err);
                }
            }
            console.log(`${folderName}: Added ${addedCount} to sitemap, Removed JSON-LD from ${expiredCount} expired jobs (Total files: ${files.length})`);
            totalExpired += expiredCount;
        }
    }

    if (totalExpired > 0) {
        console.log(`Total expired jobs processed (JSON-LD removed): ${totalExpired}`);
    }

    sitemapContent += `</urlset>`;
    fs.writeFileSync(sitemapPath, sitemapContent);
    console.log(`Sitemap generated at ${sitemapPath}`);
}

generateJobs();
