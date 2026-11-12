// /links layout: turns link rows (the admin's `links` table, or the page's built-in fallback
// anchors) into a programme banner on top plus headed groups (WhatsApp groups, Resources,
// LinkedIn, YouTube…). The admin's "card style" decides the group; a "Default" link goes by
// where it points. Groups appear in the admin's display order, programmes always first.
(function (global) {
  'use strict';

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Head, icon and button word for each group.
  var GROUPS = {
    whatsapp: { head: 'WhatsApp groups', icon: 'fab fa-whatsapp', cta: 'Join' },
    telegram: { head: 'Telegram', icon: 'fab fa-telegram', cta: 'Join' },
    resources: { head: 'Resources', icon: 'fas fa-book-open', cta: 'Open' },
    youtube: { head: 'Watch on YouTube', icon: 'fab fa-youtube', cta: 'Watch' },
    linkedin: { head: 'Follow on LinkedIn', icon: 'fab fa-linkedin', cta: 'Follow' },
    default: { head: 'Latest from MSC', icon: 'fas fa-bullhorn', cta: 'Open' }
  };

  // Banner wording for the three MSC programmes, matched on the link's address. The words come
  // from each programme's own page and carry no price, date or registration status, so they
  // stay true between batches. Any other "Program" link gets a banner with its own title.
  // `look` picks the banner's style in style.css, one per programme so the three tabs differ:
  // "steps" (navy, the points as a numbered path), "blue" (brand blue), "light" (white card).
  var PROGRAMS = [
    { match: /industrial-training-program/i, look: 'steps', eyebrow: 'MSC Industrial Training Program', lead: 'Crack Your', accent: 'Industrial Training', points: ['CV', 'LinkedIn', 'Applications', 'Interviews'] },
    { match: /articleship-program/i, look: 'blue', eyebrow: 'MSC Articleship Program', lead: 'Crack Your', accent: 'Articleship', points: ['CV', 'LinkedIn', 'Applications', 'Interviews'] },
    { match: /fresher-program/i, look: 'light', eyebrow: 'MSC CA Freshers Program', lead: 'Launch Your', accent: 'Dream Career', points: ['CV', 'Applications', 'Interviews'] }
  ];

  /**
   * Web, mail, phone, SMS and WhatsApp links are followed, and so are paths on this site.
   * A bare "www.site.com" gets https://. Any other scheme (javascript:, data: …) becomes "#".
   */
  function safeHref(url) {
    var u = String(url == null ? '' : url).trim();
    if (!u) return '#';
    if (/^(https?:\/\/|mailto:|tel:|sms:|whatsapp:)/i.test(u)) return u;
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([\/?#]|$)/i.test(u) && !/^[^\/?#]*\.html?([?#]|$)/i.test(u)) return 'https://' + u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '#';
    return u;
  }

  function hostOf(url) {
    var m = /^[a-z][a-z0-9+.-]*:\/\/([^\/?#]+)/i.exec(String(url || ''));
    return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
  }

  function siteOf(url) {
    var u = String(url || '').toLowerCase();
    var h = hostOf(safeHref(u));
    if (/(^|\.)whatsapp\.com$/.test(h) || h === 'wa.me' || /^whatsapp:/.test(u)) return 'whatsapp';
    if (h === 't.me' || /(^|\.)telegram\.(me|org)$/.test(h)) return 'telegram';
    if (/(^|\.)youtube\.com$/.test(h) || h === 'youtu.be') return 'youtube';
    if (/(^|\.)linkedin\.com$/.test(h)) return 'linkedin';
    return '';
  }

  /** Which group a link belongs to: "program", or a key of GROUPS. */
  function kindOf(link) {
    var type = String((link && link.card_type) || '').toLowerCase();
    if (type === 'program') return 'program';
    if (type !== 'default' && Object.prototype.hasOwnProperty.call(GROUPS, type)) return type;
    return siteOf(link && link.url) || 'default';
  }

  /** The small grey line under a link's title: what the link opens. */
  function describe(url) {
    var u = String(url || '').trim();
    var low = u.toLowerCase();
    if (/^mailto:/.test(low)) return u.replace(/^mailto:/i, '').split('?')[0];
    if (/^tel:/.test(low)) return u.replace(/^tel:/i, '');
    var h = hostOf(safeHref(low));
    var site = siteOf(low);
    if (site === 'whatsapp') return /\/channel\//.test(low) ? 'WhatsApp channel' : h === 'chat.whatsapp.com' ? 'WhatsApp group' : 'WhatsApp chat';
    if (site === 'telegram') return 'Telegram';
    if (site === 'linkedin') return /\/(company|school|showcase)\//.test(low) ? 'LinkedIn page' : /\/in\//.test(low) ? 'LinkedIn profile' : 'LinkedIn';
    if (site === 'youtube') return /\/watch|youtu\.be\/|\/live\/|\/shorts\//.test(low) ? 'YouTube video' : /playlist/.test(low) ? 'YouTube playlist' : 'YouTube channel';
    if (h === 'forms.gle' || /docs\.google\.com\/forms/.test(low)) return 'Google Form';
    if (!h || /(^|\.)mystudentclub\.com$/.test(h)) return 'mystudentclub.com';
    return h;
  }

  function iconClass(value, fallback) {
    var v = String(value || '').trim();
    return /^[a-z0-9 -]+$/i.test(v) ? v : fallback;
  }

  function linkAttrs(link) {
    var href = safeHref(link.url);
    var attrs = 'href="' + esc(href) + '"';
    if (/^https?:\/\//i.test(href)) attrs += ' target="_blank" rel="noopener noreferrer"';
    if (link.dom_id) attrs += ' id="' + esc(link.dom_id) + '"';
    return attrs;
  }

  function programCopy(link) {
    var url = String(link.url || '');
    for (var i = 0; i < PROGRAMS.length; i += 1) {
      if (PROGRAMS[i].match.test(url)) return PROGRAMS[i];
    }
    return null;
  }

  var BANNER_ART =
    '<span class="pb-art" aria-hidden="true">' +
      '<span class="pb-sheet pb-sheet-back"><span class="pb-dot"></span><span class="pb-line"></span><span class="pb-line"></span><span class="pb-line"></span></span>' +
      '<span class="pb-sheet pb-sheet-front"><span class="pb-sheet-tag">My Student Club</span><span class="pb-sheet-name">Offer Letter</span>' +
        '<span class="pb-line"></span><span class="pb-line"></span><span class="pb-line"></span><span class="pb-line"></span></span>' +
      '<span class="pb-stamp"><span class="fas fa-check"></span>Selected</span>' +
    '</span>';

  function renderProgram(link) {
    var copy = programCopy(link);
    var title = String(link.title || 'MSC Program');
    var body = copy
      ? '<span class="pb-eyebrow">' + esc(copy.eyebrow) + '</span>' +
        '<span class="pb-title">' + esc(copy.lead) + ' <em>' + esc(copy.accent) + '</em></span>' +
        '<span class="pb-points">' + copy.points.map(function (p) {
          return '<span><span class="fas fa-check" aria-hidden="true"></span>' + esc(p) + '</span>';
        }).join('') + '</span>'
      : '<span class="pb-eyebrow">MSC Program</span><span class="pb-title">' + esc(title) + '</span>';
    return '<a class="program-banner" ' + linkAttrs(link) + (copy && copy.look ? ' data-look="' + esc(copy.look) + '"' : '') +
      ' aria-label="' + esc(copy ? copy.eyebrow + ': view program' : title) + '">' +
      '<span class="pb-body">' + body +
        '<span class="pb-cta">View program <span class="fas fa-arrow-right" aria-hidden="true"></span></span>' +
      '</span>' + BANNER_ART +
    '</a>';
  }

  function renderRow(link, kind) {
    var group = GROUPS[kind] || GROUPS.default;
    return '<a class="link-row ' + kind + '" ' + linkAttrs(link) + '>' +
      '<span class="row-icon"><i class="' + esc(iconClass(link.icon, group.icon)) + '" aria-hidden="true"></i></span>' +
      '<span class="row-text"><span class="row-title">' + esc(link.title) + '</span>' +
        '<span class="row-sub">' + esc(describe(link.url)) + '</span></span>' +
      '<span class="row-cta">' + esc(describe(link.url) === 'WhatsApp chat' ? 'Chat' : group.cta) + ' <span class="fas fa-arrow-right" aria-hidden="true"></span></span>' +
    '</a>';
  }

  function isJobsLink(link) {
    return /(^|[\/-])jobs([\/?#]|$)/i.test(String(link.url || ''));
  }

  /** A group's head: { name, icon }. A lone WhatsApp link is named exactly; job-portal links read "Jobs". */
  function groupHead(kind, links) {
    var group = GROUPS[kind] || GROUPS.default;
    if (kind === 'whatsapp') {
      var sorts = links.map(function (l) { return describe(l.url); });
      var same = sorts.every(function (d) { return d === sorts[0]; });
      if (links.length === 1) return { name: sorts[0], icon: group.icon };
      if (same && sorts[0] === 'WhatsApp channel') return { name: 'WhatsApp channels', icon: group.icon };
      if (same && sorts[0] === 'WhatsApp chat') return { name: 'Chat on WhatsApp', icon: group.icon };
    }
    if (kind === 'resources' && links.every(isJobsLink)) return { name: 'Jobs', icon: 'fas fa-briefcase' };
    return { name: group.head, icon: group.icon };
  }

  function renderGroup(kind, links) {
    var head = groupHead(kind, links);
    return '<section class="link-group ' + kind + '">' +
      '<h2 class="group-head"><span class="group-icon"><i class="' + head.icon + '" aria-hidden="true"></i></span>' +
        '<span class="group-name">' + esc(head.name) + '</span></h2>' +
      '<div class="group-links">' + links.map(function (l) { return renderRow(l, kind); }).join('') + '</div>' +
    '</section>';
  }

  /** { programs: [link], groups: [{ kind, links }] }; groups in order of first appearance. */
  function arrange(links) {
    var programs = [];
    var groups = [];
    var byKind = {};
    (links || []).forEach(function (link) {
      if (!link) return;
      var kind = kindOf(link);
      if (kind === 'program') { programs.push(link); return; }
      if (!byKind[kind]) { byKind[kind] = { kind: kind, links: [] }; groups.push(byKind[kind]); }
      byKind[kind].links.push(link);
    });
    return { programs: programs, groups: groups };
  }

  /**
   * Splits the groups into two columns for laptops, in order (so a phone, which stacks the
   * columns, still shows the admin's order), at the point that leaves the columns closest in height.
   */
  function splitColumns(groups) {
    if (groups.length < 2) return groups.length ? [groups] : [];
    var weight = function (g) { return 1 + g.links.length; }; // a head plus its links
    var total = groups.reduce(function (sum, g) { return sum + weight(g); }, 0);
    var best = 1;
    var bestGap = Infinity;
    var left = 0;
    for (var k = 1; k < groups.length; k += 1) {
      left += weight(groups[k - 1]);
      var gap = Math.abs(total - 2 * left);
      if (gap < bestGap) { bestGap = gap; best = k; }
    }
    return [groups.slice(0, best), groups.slice(best)];
  }

  /** The HTML of one tab: programme banners, then the headed groups. */
  function renderTab(links) {
    var a = arrange(links);
    var html = a.programs.map(renderProgram).join('');
    if (a.groups.length) {
      var columns = splitColumns(a.groups);
      html += '<div class="link-groups' + (columns.length === 1 ? ' single' : '') + '">' +
        columns.map(function (col) {
          return '<div class="link-col">' + col.map(function (g) { return renderGroup(g.kind, g.links); }).join('') + '</div>';
        }).join('') + '</div>';
    }
    return html;
  }

  /** The round icons at the foot of the page. */
  function renderSocial(links) {
    return (links || []).map(function (item) {
      return '<a class="social-icon" ' + linkAttrs(item) + ' title="' + esc(item.title) + '" aria-label="' + esc(item.title) + '">' +
        '<i class="' + esc(iconClass(item.icon, 'fas fa-link')) + '" aria-hidden="true"></i></a>';
    }).join('');
  }

  /** Reads a tab's built-in fallback anchors (<a class="link-card whatsapp">) back into link rows. */
  function rowsFromAnchors(container) {
    var types = ['program', 'whatsapp', 'telegram', 'resources', 'linkedin', 'youtube'];
    return Array.prototype.map.call(container.querySelectorAll('a.link-card'), function (a) {
      var icon = a.querySelector('i');
      var label = a.querySelector('span');
      var type = types.filter(function (t) { return a.classList.contains(t); })[0] || 'default';
      return {
        title: (label ? label.textContent : a.textContent).trim(),
        url: a.getAttribute('href'),
        icon: icon ? icon.className : '',
        card_type: type,
        dom_id: a.id || ''
      };
    });
  }

  global.MSCLinksRender = {
    GROUPS: GROUPS, PROGRAMS: PROGRAMS, esc: esc, safeHref: safeHref, kindOf: kindOf, describe: describe,
    arrange: arrange, splitColumns: splitColumns, renderTab: renderTab, renderSocial: renderSocial, rowsFromAnchors: rowsFromAnchors
  };
})(typeof window !== 'undefined' ? window : globalThis);
