import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.SUPABASE_URL || 'https://auth.mystudentclub.com';
const SUPABASE_KEY = import.meta.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const TABLE_MAP = {
    'Industrial Training Job Portal': 'industrial',
    'Fresher Jobs': 'fresher',
    'Semi Qualified Jobs': 'semi-qualified',
    'Articleship Jobs': 'articleship'
};

export function getPublicJobSelectColumns(tableName: string): string {
    let columns = 'id, Company, Location, Salary, Description, Created_At, Category, posts_link, connect_link, "Primary Domain"';
    if (tableName === 'Fresher Jobs') {
        columns += ', Experience, yoe, "Secondary Domain", Tags, "Company Type", "Industry Type", "CTC Range"';
    } else if (tableName === 'Semi Qualified Jobs') {
        columns += ', Experience, "Secondary Domain", Tags, "Company Type", "Industry Type"';
    } else if (tableName === 'Industrial Training Job Portal') {
        columns += ', "Company Type", "Industry Type", "Stipend Range", "Functional Tags", "Technology Tags", is_exclusive';
    } else if (tableName === 'Articleship Jobs') {
        columns += ', "Exposure Tags", "Firm Type", "Client Exposure Tags", "Stipend Range"';
    }
    return columns;
}

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

export const JOB_EXPIRATION_DAYS = 15;

export function isJobExpired(dateString: any, now = new Date()): boolean {
    if (!dateString) return false;
    const createdAt = new Date(dateString);
    return Number.isFinite(createdAt.getTime()) && now.getTime() - createdAt.getTime() > JOB_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;
}

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

// Pay pill on the job page. Industrial and Articleship store a monthly stipend (20000), Fresher and Semi Qualified
// a yearly CTC (1200000); text values ("₹30,000 per month") are shown as they are.
export function jobPay(job: any, categorySlug: string): { label: string; text: string } {
    const monthly = categorySlug === 'industrial' || categorySlug === 'articleship';
    const label = monthly ? 'Stipend' : 'Salary';
    const raw = job && job.Salary;
    const amount = Number(String(raw ?? '').replace(/[,\s₹]/g, ''));
    if (String(raw ?? '').trim() !== '' && Number.isFinite(amount) && amount > 0) {
        if (monthly) return { label, text: `₹${amount.toLocaleString('en-IN')} / month` };
        if (amount >= 100000) return { label, text: `₹${Math.round(amount / 10000) / 10} LPA` };
        return { label, text: `₹${amount.toLocaleString('en-IN')}` };
    }
    const text = String(raw || (job && (job['Stipend Range'] || job['CTC Range'])) || '').trim();
    if (!text) return { label, text: '' };
    return { label, text: /₹|\brs\.?|\binr\b/i.test(text) ? text : `₹${text}` };
}

export function jobTypeLabel(job: any, categorySlug: string): string {
    if (categorySlug === 'fresher') {
        return String((job && job.Experience) || '').toLowerCase() === 'experienced' ? 'Experienced CA' : 'CA fresher';
    }
    const labels: Record<string, string> = { industrial: 'Industrial training', 'semi-qualified': 'Semi-qualified CA', articleship: 'Articleship' };
    return labels[categorySlug] || 'CA job';
}

// A line that starts with an emoji ("🔹 ...", "📍 ...") or a bullet ("- ", "• ", "1. ").
const EMOJI_START = /^((?:\p{Extended_Pictographic}|[#*0-9]️?⃣)(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u;
const BULLET_START = /^([-*•●▪◦‣–✓]|\d{1,2}[.)])\s+/;

function describeInline(text: string, applyUrl: string): string {
    return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Contacts masked by jobSeo.maskContacts become a chip that opens the vacancy on MSC.
        .replace(/\[(email|link|phone) protected\]/g, (_match, kind) =>
            `<a class="locked" href="${escapeHtml(applyUrl)}"><i class="fas fa-lock" aria-hidden="true"></i> ${kind.charAt(0).toUpperCase()}${kind.slice(1)} shown on MSC</a>`);
}

// The job page's description: blank lines split paragraphs; lines that start with an emoji or a bullet become a list
// (the emoji stays as the bullet); a short line ending in ":" becomes a small heading; "Label: text" items get a
// bold label. A one-line opening becomes the lead. The text is expected to be masked already.
export function renderJobDescription(text: any, applyUrl: string): string {
    const source = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!source) return '<p>No description available.</p>';
    const out: string[] = [];
    let list: string[] = [];
    let para: string[] = [];
    let paraRaw = 0;
    const flushList = () => { if (list.length) out.push(`<ul>${list.join('')}</ul>`); list = []; };
    const flushPara = () => {
        if (!para.length) return;
        const lead = out.length === 0 && para.length === 1 && paraRaw < 200;
        out.push(`<p${lead ? ' class="lead"' : ''}>${para.join('<br>')}</p>`);
        para = [];
        paraRaw = 0;
    };

    source.split('\n').forEach((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) { flushList(); flushPara(); return; }

        const heading = /^#{1,6}\s+(.+)$/.exec(line) || (line.length <= 60 && /^(.*\S)\s*:$/.exec(line));
        if (heading) {
            flushList(); flushPara();
            out.push(`<h3>${describeInline(heading[1], applyUrl)}</h3>`);
            return;
        }

        const emoji = EMOJI_START.exec(line);
        const bullet = emoji ? null : BULLET_START.exec(line);
        // The opening line keeps its emoji as part of the lead ("💼 CA Industrial Trainee at ...").
        if ((emoji && index > 0) || bullet) {
            flushPara();
            const match = (emoji || bullet) as RegExpExecArray;
            const marker = match[1];
            const rest = line.slice(match[0].length);
            const mark = /^[-*•●▪◦‣–]$/.test(marker)
                ? '<span class="mark dot" aria-hidden="true"></span>'
                : `<span class="mark" aria-hidden="true">${escapeHtml(marker)}</span>`;
            const label = /^([^:]{2,50}):\s+(\S.*)$/.exec(rest);
            const body = label && label[1].trim().split(/\s+/).length <= 7 && !/protected|https?$/i.test(label[1])
                ? `<strong>${describeInline(label[1], applyUrl)}:</strong> ${describeInline(label[2], applyUrl)}`
                : describeInline(rest, applyUrl);
            list.push(`<li>${mark}<span>${body}</span></li>`);
            return;
        }

        flushList();
        para.push(describeInline(line, applyUrl));
        paraRaw += line.length;
    });
    flushList();
    flushPara();
    return out.join('\n');
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

// Slugs, titles and Google for Jobs data come from one shared file, so the portal,
// the 404 page and these static pages always agree on a job's URL.
import '../../../scripts/job-seo.js';
export const jobSeo: any = (globalThis as any).MSCJobSeo;

export function generateJobSlug(job: any, categorySlug: string): string {
    return jobSeo.jobSlug(job, categorySlug);
}

export function generateJsonLd(job: any, categorySlug: string): any {
    return jobSeo.jobPostingJsonLd(job, categorySlug);
}
