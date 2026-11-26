/*
 * CV review renderer: turns the reviewer's markdown into clean HTML for the
 * results page and for the PDF report.
 *
 * The model already writes proper markdown (nested bullets, tables, quotes),
 * so this file only parses it with marked + DOMPurify and adds three things:
 *   1. [GOOD] / [ISSUE - SEVERITY: X] tags become small coloured pills, and a
 *      line holding several tags is split into one bullet per tag.
 *   2. <<POINT>> blocks become Original / Why / Rewrite cards.
 *   3. Tables scroll sideways on phones instead of squashing.
 *
 * Loaded as a classic script before cv-reviewer.js; exposes window.ReviewFormat.
 */
(function (global) {
    'use strict';

    const SECTION_TITLES = [
        ['RECRUITER_TIPS', 'Recruiter Tips'],
        ['MEASURABLE_RESULTS', 'Measurable Results'],
        ['PHRASES_SUGGESTIONS', 'Phrase Suggestions'],
        ['HARD_SKILLS', 'Hard Skills'],
        ['SOFT_SKILLS', 'Soft Skills'],
        ['ACTION_VERBS', 'Action Verbs'],
        ['GRAMMAR_CHECK', 'Grammar & Proofreading'],
        ['FORMATTING_READABILITY', 'Formatting & Readability'],
        ['EDUCATION_QUALIFICATION', 'Education & Qualification'],
        ['ARTICLESHIP_EXPERIENCE', 'Articleship Experience'],
        ['INTERVIEW_QUESTIONS', 'Predicted Interview Questions'],
        ['FINAL_RECOMMENDATIONS', 'Final Recommendations']
    ];
    const POINT_SECTIONS = new Set(['MEASURABLE_RESULTS', 'PHRASES_SUGGESTIONS']);

    // [GOOD], [ISSUE], [ISSUE - SEVERITY: High], optionally wrapped in ** or *.
    const TAG_SOURCE = '\\*{0,2}\\[\\s*(GOOD|ISSUE)\\b([^\\]\\n]*)\\]\\*{0,2}';
    const tagRe = () => new RegExp(TAG_SOURCE, 'gi');
    const TOKEN_RE = /%%RVTAG-(good|issue|critical|high|moderate|low)%%/g;

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function tagToken(kind, rest) {
        if (kind.toUpperCase() === 'GOOD') return '%%RVTAG-good%%';
        const sev = (String(rest).match(/critical|high|moderate|medium|low/i) || [''])[0].toLowerCase();
        if (!sev) return '%%RVTAG-issue%%';
        return `%%RVTAG-${sev === 'medium' ? 'moderate' : sev}%%`;
    }

    const TAG_HTML = {
        good: '<span class="rv-tag rv-good"><i class="fa-solid fa-check" aria-hidden="true"></i>Good</span>',
        issue: '<span class="rv-tag rv-issue"><i class="fa-solid fa-xmark" aria-hidden="true"></i>Fix</span>',
        critical: '<span class="rv-tag rv-critical"><i class="fa-solid fa-xmark" aria-hidden="true"></i>Critical</span>',
        high: '<span class="rv-tag rv-high"><i class="fa-solid fa-xmark" aria-hidden="true"></i>High</span>',
        moderate: '<span class="rv-tag rv-moderate"><i class="fa-solid fa-xmark" aria-hidden="true"></i>Moderate</span>',
        low: '<span class="rv-tag rv-low"><i class="fa-solid fa-xmark" aria-hidden="true"></i>Low</span>'
    };

    // Strip the ** wrappers the model puts round section markers, and stray rules.
    function cleanSection(text) {
        return String(text || '')
            .replace(/\r\n?/g, '\n')
            .replace(/^[ \t]*\*{1,2}[ \t]*$/gm, '')
            .replace(/^\s*(?:---+|\*\*\*+|___+)\s*$/gm, '')
            .trim();
    }

    /*
     * A line such as
     *   * **Word Count:** [GOOD] One page. [ISSUE - SEVERITY: Moderate] Space is badly used.
     * becomes a label bullet with one sub-bullet per tag, so each finding gets its own row.
     */
    function splitTaggedLines(md) {
        const out = [];
        for (const line of md.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('|') || trimmed.startsWith('>')) { out.push(line); continue; }
            const tags = [...line.matchAll(tagRe())];
            if (!tags.length) { out.push(line); continue; }

            const listMatch = line.match(/^(\s*)([*+-]|\d+[.)])\s+/);
            const indent = listMatch ? listMatch[1] : '';
            const bodyStart = listMatch ? listMatch[0].length : (line.length - line.trimStart().length);
            const body = line.slice(bodyStart);
            const bodyTags = [...body.matchAll(tagRe())];
            const head = body.slice(0, bodyTags[0].index).trim();
            const segments = bodyTags.map((m, i) => body.slice(m.index, i + 1 < bodyTags.length ? bodyTags[i + 1].index : body.length).trim());

            // One tag at the very start: nothing to split.
            if (!head && segments.length === 1) { out.push(line); continue; }
            // Text before a single tag that is not a "Label:" (e.g. a sentence ending in a tag): leave it.
            if (head && segments.length === 1 && !/[:：]\**\s*$/.test(head)) { out.push(line); continue; }

            if (listMatch) {
                const childIndent = indent + ' '.repeat(listMatch[2].length + 1);
                if (head) {
                    out.push(`${indent}${listMatch[2]} ${head}`);
                    segments.forEach(s => out.push(`${childIndent}* ${s}`));
                } else {
                    segments.forEach(s => out.push(`${indent}${listMatch[2]} ${s}`));
                }
            } else {
                const lead = line.slice(0, bodyStart);
                if (head) out.push(`${lead}${head}`, '');
                segments.forEach(s => out.push(`${lead}* ${s}`));
                out.push('');
            }
        }
        return out.join('\n');
    }

    function parseMarkdown(md, inline) {
        const lib = global.marked;
        if (!lib) return `<p>${escapeHtml(md).replace(/\n/g, '<br>')}</p>`;
        const opts = { gfm: true, breaks: true };
        return inline ? lib.parseInline(md, opts) : lib.parse(md, opts);
    }

    function sanitize(html) {
        if (global.DOMPurify) {
            return global.DOMPurify.sanitize(html, { ADD_ATTR: ['target'], FORBID_TAGS: ['style', 'form', 'input'] });
        }
        return html;
    }

    function decorate(html) {
        const root = document.createElement('div');
        root.innerHTML = html;

        // Tables scroll sideways on phones.
        root.querySelectorAll('table').forEach(table => {
            const wrap = document.createElement('div');
            wrap.className = 'rv-table rv-avoid';
            table.replaceWith(wrap);
            wrap.appendChild(table);
        });

        // "**Label:**" at the start of a top-level bullet becomes a small heading.
        root.querySelectorAll(':scope > ul > li, :scope > ol > li').forEach(li => {
            let first = li.firstChild;
            while (first && first.nodeType === 3 && !first.textContent.trim()) first = first.nextSibling;
            if (first && first.nodeName === 'P') {
                first = first.firstChild;
                while (first && first.nodeType === 3 && !first.textContent.trim()) first = first.nextSibling;
            }
            if (first && first.nodeName === 'STRONG' && /[:：]\s*$/.test(first.textContent)) {
                first.classList.add('rv-label');
                li.classList.add('rv-labelled');
                li.parentElement.classList.add('rv-label-list');
            }
        });

        // Leaf items never split across PDF pages.
        root.querySelectorAll('li').forEach(li => {
            if (!li.querySelector('ul, ol, table')) li.classList.add('rv-avoid');
        });
        root.querySelectorAll('a[href]').forEach(a => { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); });

        return root.innerHTML;
    }

    function renderMarkdown(text, { inline = false } = {}) {
        const cleaned = cleanSection(String(text || '').replace(/<<\s*(?:END_)?POINT\s*>>/g, ''));
        if (!cleaned) return '';
        const prepared = (inline ? cleaned : splitTaggedLines(cleaned))
            .replace(tagRe(), (_, kind, rest) => tagToken(kind, rest));
        let html = sanitize(parseMarkdown(prepared, inline));
        html = html.replace(TOKEN_RE, (_, k) => TAG_HTML[k]);
        return inline ? html : `<div class="rv-md">${decorate(html)}</div>`;
    }

    function stripQuotes(s) {
        let t = String(s || '').trim().replace(/^\*+|\*+$/g, '').trim();
        const pairs = [['"', '"'], ['“', '”'], ["'", "'"]];
        for (const [a, b] of pairs) {
            if (t.length > 1 && t.startsWith(a) && t.endsWith(b) && t.indexOf(b, 1) === t.length - 1) return t.slice(1, -1).trim();
        }
        return t;
    }

    const FIELD_RE = /^[ \t]*(?:[*+-][ \t]+)?\**[ \t]*(Original(?:[ \t]+(?:phrase|bullet|text))?|Critique|Why|Rewrite[ \t]+Suggestion[ \t]*\d*|Rewrite[ \t]*\d*|Suggestion[ \t]*\d*|Rewritten)[ \t]*\**[ \t]*:[ \t]*\**[ \t]*/gim;

    function parsePoint(block) {
        const fields = { original: '', critique: '', rewrites: [], extra: '' };
        const marks = [...block.matchAll(FIELD_RE)];
        if (!marks.length) { fields.extra = block.trim(); return fields; }
        fields.extra = block.slice(0, marks[0].index).trim();
        marks.forEach((m, i) => {
            const end = i + 1 < marks.length ? marks[i + 1].index : block.length;
            const value = block.slice(m.index + m[0].length, end).trim();
            const name = m[1].toLowerCase();
            if (name.startsWith('original')) fields.original = stripQuotes(value);
            else if (name === 'critique' || name === 'why') fields.critique = stripQuotes(value, true);
            else if (value) fields.rewrites.push(stripQuotes(value));
        });
        return fields;
    }

    function splitPoints(content) {
        const text = String(content || '').replace(/\r\n?/g, '\n');
        if (/<<\s*(?:END_)?POINT\s*>>/.test(text)) {
            return text.split(/<<\s*(?:END_)?POINT\s*>>/).map(s => s.trim()).filter(Boolean);
        }
        if (/^\s*---+\s*$/m.test(text)) return text.split(/^\s*---+\s*$/m).map(s => s.trim()).filter(Boolean);
        return text.split(/\n(?=[ \t]*(?:[*+-][ \t]+)?\**[ \t]*Original\b[^:\n]*:)/i).map(s => s.trim()).filter(Boolean);
    }

    function renderPoints(content, { copyButtons = true } = {}) {
        const blocks = splitPoints(String(content || '').replace(/^[ \t]*\*{1,2}[ \t]*$/gm, ''));
        let n = 0;
        const total = blocks.filter(b => /Original\b[^:\n]*:/i.test(b)).length;
        let html = '';
        blocks.forEach(block => {
            const p = parsePoint(block);
            if (!p.original && !p.critique && !p.rewrites.length) {
                if (p.extra) html += renderMarkdown(p.extra);
                return;
            }
            n += 1;
            html += '<article class="rv-point">';
            if (p.extra) html += `<div class="rv-point-intro">${renderMarkdown(p.extra)}</div>`;
            if (p.original) {
                html += `<div class="rv-original rv-avoid">
                    <div class="rv-point-head"><span class="rv-kicker">Your line</span>${total > 1 ? `<span class="rv-count">${n} of ${total}</span>` : ''}</div>
                    <p>${escapeHtml(p.original)}</p>
                  </div>`;
            }
            if (p.critique) {
                html += `<div class="rv-critique rv-avoid"><span class="rv-kicker">What's wrong</span>${renderMarkdown(p.critique)}</div>`;
            }
            p.rewrites.forEach((r, i) => {
                const plain = r.replace(/\*\*|__|`/g, '').replace(/(^|\s)\*(\S)/g, '$1$2').replace(/(\S)\*(\s|$)/g, '$1$2');
                html += `<div class="rv-rewrite rv-avoid">
                    <span class="rv-kicker">${p.rewrites.length > 1 ? `Rewrite ${i + 1}` : 'Rewrite'}</span>
                    <p>${renderMarkdown(r, { inline: true })}</p>
                    ${copyButtons ? `<button type="button" class="copy-suggestion-btn rv-copy" data-text="${escapeHtml(plain)}" title="Copy rewrite" aria-label="Copy rewrite">
                      <i class="fa-regular fa-copy" aria-hidden="true"></i><span class="copy-success-tooltip">Copied!</span>
                    </button>` : ''}
                  </div>`;
            });
            html += '</article>';
        });
        return html;
    }

    function extract(text, name) {
        const start = text.indexOf(`<<<${name}>>>`);
        if (start === -1) return null;
        const from = start + name.length + 6;
        const end = text.indexOf(`<<<END_${name}>>>`, from);
        if (end !== -1) return text.slice(from, end);
        const next = text.indexOf('<<<', from);
        return next !== -1 ? text.slice(from, next) : text.slice(from);
    }

    function renderSection(text, name) {
        const content = extract(text, name);
        if (content == null || !cleanSection(content)) return '';
        return POINT_SECTIONS.has(name) && /Original\b[^:\n]*:/i.test(content)
            ? renderPoints(content, { copyButtons: false })
            : renderMarkdown(content);
    }

    /* Full report for the PDF. score: number|null, justification: markdown string. */
    function buildReportHtml(text, { score, justification, fileName, dateText } = {}) {
        const band = score == null ? '' : score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Average' : 'Needs work';
        let html = `<div class="rv-pdf">
          <header class="rv-pdf-top">
            <div>
              <div class="rv-pdf-brand">My Student Club &middot; CV Review</div>
              <h1>CV Analysis Report</h1>
              <div class="rv-pdf-meta">${escapeHtml(fileName || '')}${fileName && dateText ? ' &middot; ' : ''}${escapeHtml(dateText || '')}</div>
            </div>
            ${score == null ? '' : `<div class="rv-pdf-score"><b>${escapeHtml(String(score))}</b><span>/100</span><em>${band}</em></div>`}
          </header>`;
        if (justification) html += `<section class="rv-pdf-summary rv-avoid">${renderMarkdown(justification)}</section>`;
        SECTION_TITLES.forEach(([name, title]) => {
            const body = renderSection(text, name);
            if (!body) return;
            html += `<section class="rv-pdf-section">
              <div class="rv-pdf-head rv-avoid"><h2>${escapeHtml(title)}</h2></div>
              ${body}
            </section>`;
        });
        html += '<footer class="rv-pdf-foot">Generated by the My Student Club AI CV Reviewer &middot; mystudentclub.com/cv-reviewer</footer></div>';
        return html;
    }

    global.ReviewFormat = { renderMarkdown, renderPoints, cleanSection, buildReportHtml, escapeHtml, SECTION_TITLES };
})(typeof window !== 'undefined' ? window : globalThis);
