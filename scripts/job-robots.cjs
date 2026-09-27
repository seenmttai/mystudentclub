'use strict';

// Keep expired job pages available to visitors while giving crawlers one clear
// directive. Only robots metadata is changed; all visible job data is preserved.
function markJobNoindex(html) {
  const robots = /<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])[^>]*>/gi;
  let replaced = false;
  const updated = html.replace(robots, () => {
    if (replaced) return '';
    replaced = true;
    return '<meta name="robots" content="noindex, follow">';
  });
  if (replaced) return updated;
  return updated.replace(/<head\b[^>]*>/i, '$&\n    <meta name="robots" content="noindex, follow">');
}

function hasNoindex(html) {
  return /<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])(?=[^>]*\bcontent\s*=\s*["'][^"']*\bnoindex\b)[^>]*>/i.test(html);
}

module.exports = { markJobNoindex, hasNoindex };
