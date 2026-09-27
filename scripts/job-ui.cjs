'use strict';

const portals = {
  industrial: '/',
  fresher: '/ca-fresher-jobs',
  'semi-qualified': '/semi-qualified-ca-jobs',
  articleship: '/ca-articleship-opportunities'
};

function formatJobPostedDate(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/);
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]) return null;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function recordedJobPostedDate(html) {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]);
      const documents = Array.isArray(data) ? data : data['@graph'] || [data];
      for (const document of documents) {
        if (document['@type'] === 'JobPosting') {
          const date = formatJobPostedDate(document.datePosted);
          if (date) return date;
        }
      }
    } catch (_) { /* Preserve the original label if stored metadata is invalid. */ }
  }
  return null;
}

function jobPortalUrl(category, id) {
  if (!Object.hasOwn(portals, category) || !/^(?:\d+|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i.test(String(id))) return null;
  return `${portals[category]}?id=${encodeURIComponent(id)}&type=${encodeURIComponent(category)}`;
}

function improveJobUi(html, category, id) {
  const portal = jobPortalUrl(category, id);
  let result = html;
  const posted = recordedJobPostedDate(html);
  if (posted) result = result.replace(/<span>Posted\s+[^<]*<\/span>/g, `<span>Posted ${posted}</span>`);
  if (portal) {
    const href = portal.replace(/&/g, '&amp;');
    result = result.replace(/<a\b([^>]*\bhref=["'])#(["'][^>]*)>(\s*<i\b[^>]*><\/i>\s*)Apply Now\s*<\/a>/gi,
      (_, before, after, icon) => `<a${before}${href}${after.replace(/\s+target=["']_blank["']/i, '')}>${icon}View application details</a>`);
    result = result.replace(/<span class="apply-link-text">#<\/span>/g, '<span class="apply-link-text">Check the job portal</span>');
    result = result.replace(/<button\b[^>]*onclick="navigator\.clipboard\.writeText\('#'\)"[^>]*>\s*<i\b[^>]*><\/i>\s*<\/button>/g,
      `<a class="copy-btn" href="${href}" aria-label="View application details"><i class="fas fa-arrow-right" aria-hidden="true"></i></a>`);
  }
  result = result.replace(/<button\b([^>]*class="copy-btn"[^>]*)>/g, (match, attrs) =>
    /\baria-label=/.test(attrs) ? match : `<button${attrs} type="button" aria-label="Copy application contact">`);
  result = result.replace(/Apply directly to this opening with verified recruiter contact details\./g, 'View application details and available contact information in the job portal.');
  result = result.replace(/False job vacancy\?/g, 'Problem with this listing?');
  return result;
}

module.exports = { jobPortalUrl, improveJobUi, formatJobPostedDate, recordedJobPostedDate };
