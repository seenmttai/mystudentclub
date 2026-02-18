import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.SUPABASE_URL || 'https://izsggdtdiacxdsjjncdq.supabase.co';
const SUPABASE_KEY = import.meta.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const TABLE_MAP = {
    'Industrial Training Job Portal': 'industrial',
    'Fresher Jobs': 'fresher',
    'Semi Qualified Jobs': 'semi-qualified',
    'Articleship Jobs': 'articleship'
};

export const JOB_TITLE_MAP = {
    "Industrial Training Job Portal": "Industrial Trainee",
    "Fresher Jobs": "CA Fresher",
    "Semi Qualified Jobs": "Semi Qualified Chartered Accountant",
    "Articleship Jobs": "Articleship Trainee"
};

export const EMAIL_SUBJECT_MAP = {
    "Industrial Training Job Portal": "Application for CA Industrial Training",
    "Fresher Jobs": "Application for CA Fresher",
    "Semi Qualified Jobs": "Application for Semi Qualified CA",
    "Articleship Jobs": "Application for CA Articleship"
};

export function escapeHtml(text: any): string {
    if (text === null || text === undefined || text === '') return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function formatDate(dateString: any): string {
    if (!dateString) return new Date().toISOString();
    const date = new Date(dateString);
    return date.toISOString();
}

export function getDaysAgo(dateString: any): string {
    if (!dateString) return 'Recently';
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now.getTime() - past.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return '1 week ago';
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 60) return '1 month ago';
    return `${Math.floor(diffDays / 30)} months ago`;
}

export function renderMarkdown(markdown: any): string {
    if (!markdown) return '';
    let html = escapeHtml(markdown);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

export function getApplicationLink(applicationId: any): { link: string; isEmail: boolean } {
    if (!applicationId) {
        return { link: '#', isEmail: false };
    }

    const trimmedId = String(applicationId).trim();
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const emailMatch = trimmedId.match(emailPattern);

    if (emailMatch) {
        return { link: emailMatch[0], isEmail: true };
    }

    if (trimmedId.toLowerCase().startsWith('http')) {
        return { link: trimmedId, isEmail: false };
    }

    return {
        link: `https://www.google.com/search?q=${encodeURIComponent(trimmedId + ' careers')}`,
        isEmail: false
    };
}

export function constructMailto(job: any, tableName: string): string {
    const rawLink = job['Application ID'];
    if (!rawLink) return '#';
    const emailMatch = String(rawLink).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) return '#';
    const email = emailMatch[0];
    const subjectBase = EMAIL_SUBJECT_MAP[tableName as keyof typeof EMAIL_SUBJECT_MAP] || `Application for ${job.Category || 'the role'} Position`;
    const subject = `${subjectBase} at ${job.Company} (Ref: My Student Club)`;
    return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

export function generateJsonLd(job: any, jobId: any, categorySlug: any): any {
    const DOMAIN = 'https://www.mystudentclub.com';
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
