// Job portal v2: HTML for a vacancy card and the vacancy detail (drawer on the listing pages, the page at /jobs).
// Every value from the database goes through escapeHtml; descriptions through descriptionHtml.
// Buttons carry data-action; portal-app.js and job-details.js decide what each action does.

import {
    applicationTargets,
    applyState,
    canSeeApplyDetails,
    cardHeadline,
    citiesOf,
    cleanText,
    companyName,
    descriptionHtml,
    displayLocation,
    domainOf,
    escapeHtml,
    formatPay,
    formatPayLong,
    FRESH_DAYS,
    isExclusiveJob,
    isFresh,
    isNew,
    isTeamPosted,
    monogram,
    monogramHue,
    postedLabel,
    roleTitle,
    safeHttpUrl,
    shareUrl,
    tagsOf,
} from './jobs-core.js?v=1';

// family: solid | regular | brands (Font Awesome 6, already on every page)
const icon = (name, family = 'solid') => `<i class="fa-${family} fa-${name}" aria-hidden="true"></i>`;

export function logoHtml(job, size = 'md') {
    const name = companyName(job);
    const src = safeHttpUrl(job?.Company_Logo_URL);
    const initials = escapeHtml(monogram(name));
    const img = src
        ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="56" height="56">`
        : '';
    return `<span class="pv2-logo pv2-logo-${size}${src ? ' has-img' : ''}" style="--pv2-hue:${monogramHue(name)}" aria-hidden="true"><span class="pv2-logo-initials">${initials}</span>${img}</span>`;
}

function ratingHtml(rating) {
    if (!rating || !(rating.count > 5) || !Number.isFinite(rating.avg)) return '';
    return `<span class="pv2-rating" title="${rating.count} student reviews">${icon('star')} ${rating.avg.toFixed(1)}<span class="pv2-visually-hidden"> out of 5 from ${rating.count} reviews</span></span>`;
}

/** Badges shared by the card and the detail header. */
export function badgesHtml(job, portal, ctx = {}) {
    const now = ctx.now || new Date();
    const badges = [];
    if (isExclusiveJob(job)) {
        const locked = !canSeeApplyDetails(job, portal, ctx.courses);
        badges.push(`<span class="pv2-badge pv2-badge-exclusive" title="Apply details for ${escapeHtml(portal.programme.name)} students">${icon(locked ? 'lock' : 'crown')} Exclusive</span>`);
    }
    if (ctx.applied) badges.push(`<span class="pv2-badge pv2-badge-applied">${icon('circle-check')} Applied</span>`);
    if (isNew(job, now)) badges.push(`<span class="pv2-badge pv2-badge-new">New</span>`);
    if (isTeamPosted(job)) badges.push(`<span class="pv2-badge pv2-badge-easy" title="Apply with your MSC profile">${icon('bolt')} Easy Apply</span>`);
    return badges.join('');
}

export function cardHtml(job, portal, ctx = {}) {
    const now = ctx.now || new Date();
    const headline = cardHeadline(job, portal);
    const title = roleTitle(job, portal);
    const company = companyName(job);
    const location = displayLocation(job.Location);
    const pay = formatPay(job, portal);
    const fresh = isFresh(job, now);
    const domain = domainOf(job);
    const chips = [domain, cleanText(job['Company Type']), cleanText(job['Firm Type'])]
        .filter((value, index, all) => value && value.toLowerCase() !== 'null' && all.indexOf(value) === index && !headline.title.includes(value) && !headline.subtitle.includes(value))
        .slice(0, 2);
    const classes = ['pv2-card'];
    if (isExclusiveJob(job)) classes.push('is-exclusive');
    if (!fresh) classes.push('is-older');
    if (ctx.applied) classes.push('is-applied');
    const href = shareUrl(job, portal, '');
    const label = `${title} at ${company}, ${location}`;
    return `<article class="${classes.join(' ')}" data-job-id="${escapeHtml(job.id)}">
  ${logoHtml(job)}
  <div class="pv2-card-body">
    <h3 class="pv2-card-title"><a class="pv2-card-link" href="${escapeHtml(href)}" data-action="open" aria-label="${escapeHtml(label)}">${escapeHtml(headline.title)}</a></h3>
    <p class="pv2-card-company"><span>${escapeHtml(headline.subtitle)}</span>${headline.companyFirst ? '' : ratingHtml(ctx.rating)}</p>
    <ul class="pv2-card-meta">
      <li>${icon('location-dot')}<span>${escapeHtml(location)}</span></li>
      ${pay ? `<li class="pv2-pay">${icon('indian-rupee-sign')}<span>${escapeHtml(pay.replace(/^₹/, ''))}</span><span class="pv2-visually-hidden"> ${escapeHtml(portal.payLabel.toLowerCase())}</span></li>` : ''}
      <li class="pv2-posted${fresh ? '' : ' is-old'}">${icon('clock', 'regular')}<span>${escapeHtml(postedLabel(job, now))}</span></li>
    </ul>
    <div class="pv2-card-tags">${badgesHtml(job, portal, ctx)}${chips.map((chip) => `<span class="pv2-chip">${escapeHtml(chip)}</span>`).join('')}</div>
  </div>
  <button type="button" class="pv2-save${ctx.saved ? ' is-saved' : ''}" data-action="save" aria-pressed="${ctx.saved ? 'true' : 'false'}" aria-label="${ctx.saved ? 'Remove from saved' : 'Save'}: ${escapeHtml(label)}">${icon('bookmark', ctx.saved ? 'solid' : 'regular')}</button>
</article>`;
}

export function skeletonCardsHtml(count = 6) {
    const card = `<div class="pv2-card pv2-skeleton" aria-hidden="true"><span class="pv2-logo pv2-logo-md"></span><div class="pv2-card-body"><span class="pv2-sk pv2-sk-title"></span><span class="pv2-sk pv2-sk-line"></span><span class="pv2-sk pv2-sk-meta"></span></div></div>`;
    return Array.from({ length: count }, () => card).join('');
}

function lockPanelHtml(job, portal, ctx) {
    const programme = portal.programme;
    return `<div class="pv2-lock" role="note">
  <div class="pv2-lock-icon">${icon('lock')}</div>
  <div>
    <p class="pv2-lock-eyebrow">Exclusive vacancy</p>
    <h3 class="pv2-lock-title">For ${escapeHtml(programme.name)} students</h3>
    <p class="pv2-lock-text">MSC sourced this vacancy for students in the programme. Enrol to see how to apply, the contact and the original post.</p>
    <div class="pv2-lock-actions">
      <a class="pv2-btn pv2-btn-gold" href="${escapeHtml(programme.href)}" target="_blank" rel="noopener">${icon('graduation-cap')} Explore the programme</a>
      ${ctx.loggedIn ? '' : `<a class="pv2-btn pv2-btn-ghost" href="/login.html?redirect=${encodeURIComponent(ctx.returnUrl || '/')}" data-action="login">Already enrolled? Log in</a>`}
    </div>
  </div>
</div>`;
}

function targetsHtml(targets) {
    if (!targets.length) return '<p class="pv2-muted">No application details were shared for this vacancy.</p>';
    return `<ul class="pv2-targets">${targets.map((t) => {
        const kindIcon = t.kind === 'email' ? 'envelope' : t.kind === 'url' ? 'link' : 'magnifying-glass';
        const value = escapeHtml(t.value);
        const text = t.kind === 'url'
            ? `<a href="${escapeHtml(t.href)}" target="_blank" rel="noopener noreferrer nofollow">${value}</a>`
            : `<span>${value}</span>`;
        return `<li>${icon(kindIcon)}${text}<button type="button" class="pv2-icon-btn" data-action="copy" data-copy="${value}" aria-label="Copy ${value}">${icon('copy', 'regular')}</button></li>`;
    }).join('')}</ul>`;
}

/** The apply block: buttons, the lock panel, or the unlocked application details. */
export function applyHtml(job, portal, ctx = {}) {
    const state = applyState(job, portal, ctx);
    const applied = Boolean(ctx.applied);
    const stale = !isFresh(job, ctx.now || new Date());
    const staleNote = stale
        ? `<p class="pv2-stale">${icon('triangle-exclamation')} Posted ${escapeHtml(postedLabel(job, ctx.now || new Date()))}. Vacancies older than ${FRESH_DAYS} days may already be filled.</p>`
        : '';
    if (state === 'locked') return lockPanelHtml(job, portal, ctx);
    if (state === 'login') {
        return `<div class="pv2-apply">${staleNote}
  <a class="pv2-btn pv2-btn-primary pv2-btn-block" href="/login.html?redirect=${encodeURIComponent(ctx.returnUrl || '/')}" data-action="login">${icon('right-to-bracket')} Log in to apply</a>
  <p class="pv2-apply-note">Free account. See application details, save vacancies and get alerts. <a href="/sign-up.html">Create one</a></p>
</div>`;
    }
    if (state === 'easy') {
        return `<div class="pv2-apply">${staleNote}
  <button type="button" class="pv2-btn pv2-btn-primary pv2-btn-block${applied ? ' is-done' : ''}" data-action="easy-apply">${applied ? `${icon('circle-check')} Applied` : `${icon('bolt')} Easy Apply`}</button>
  <p class="pv2-apply-note">Sends your MSC profile and CV to the hirer dashboard. Needs a complete profile.</p>
</div>`;
    }
    if (state === 'revealed') {
        const targets = applicationTargets(ctx.unlocked.applicationId);
        const first = targets[0];
        const isEmail = first && first.kind === 'email';
        const buttons = isEmail
            ? `<div class="pv2-btn-row">
    <button type="button" class="pv2-btn pv2-btn-primary" data-action="ai-apply">${icon('wand-magic-sparkles')} <span class="btn-text">AI Powered Apply</span><i class="fas fa-spinner fa-spin" style="display:none" aria-hidden="true"></i></button>
    <button type="button" class="pv2-btn pv2-btn-secondary" data-action="simple-apply">${icon('envelope')} Simple Apply</button>
  </div>`
            : first
                ? `<a class="pv2-btn pv2-btn-primary pv2-btn-block" href="${escapeHtml(first.href)}" target="_blank" rel="noopener noreferrer nofollow" data-action="apply-link">${icon('arrow-up-right-from-square')} Apply on ${first.kind === 'url' ? 'company site' : 'the web'}</a>`
                : '';
        return `<div class="pv2-apply">${staleNote}
  ${buttons}
  <h3 class="pv2-subhead">How to apply</h3>
  ${targetsHtml(targets)}
</div>`;
    }
    return `<div class="pv2-apply">${staleNote}
  <button type="button" class="pv2-btn pv2-btn-primary pv2-btn-block${applied ? ' is-done' : ''}" data-action="apply">${icon('paper-plane')} ${applied ? 'Applied · apply again' : 'Apply now'}</button>
  <button type="button" class="pv2-btn pv2-btn-link" data-action="reveal">See how to apply</button>
</div>`;
}

function factsHtml(job, portal) {
    const rows = [
        ['Location', displayLocation(job.Location)],
        [portal.payLabel, formatPayLong(job, portal)],
        ['Domain', domainOf(job)],
        ['Company type', cleanText(job['Company Type'])],
        ['Firm type', cleanText(job['Firm Type'])],
        ['Industry', cleanText(job['Industry Type'])],
        ['Experience', job.yoe !== null && job.yoe !== undefined && job.yoe !== '' && portal.key === 'experienced' ? `${job.yoe}+ years` : ''],
    ].filter(([, value]) => value);
    if (!rows.length) return '';
    return `<dl class="pv2-facts">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
}

/**
 * The whole detail view. ctx: { now, loggedIn, courses, applied, saved, unlocked, rating, returnUrl,
 * canSeePeers, postLink, headingId, descriptionLoading }
 */
export function detailHtml(job, portal, ctx = {}) {
    const now = ctx.now || new Date();
    const headline = cardHeadline(job, portal);
    const company = companyName(job);
    const headingId = ctx.headingId || 'pv2-detail-title';
    const allowed = canSeeApplyDetails(job, portal, ctx.courses);
    const fullDescription = (allowed && ctx.unlocked && ctx.unlocked.description) || job.Description || '';
    // Contacts in the description stay hidden until the BrowserGuard unlock (as before); an exclusive vacancy shows
    // only a short teaser to students outside its programme.
    const unlocked = Boolean(ctx.unlocked && ctx.unlocked.applicationId);
    const description = allowed
        ? descriptionHtml(fullDescription, { mask: !unlocked })
        : descriptionHtml(fullDescription, { mask: true, maxLength: 320 });
    const tags = tagsOf(job).slice(0, 14);
    const pay = formatPayLong(job, portal);
    const cities = citiesOf(job.Location);
    const reviewLinks = portal.key === 'articleship'
        ? (ctx.rating && ctx.rating.count > 0
            ? `<a class="pv2-btn pv2-btn-secondary" href="/articleship-firm-review.html?firm=${encodeURIComponent(company)}" target="_blank" rel="noopener">${icon('comments')} Read reviews</a>`
            : `<a class="pv2-btn pv2-btn-secondary" href="/submit-review.html?firm=${encodeURIComponent(company)}&location=${encodeURIComponent(cleanText(job.Location))}" target="_blank" rel="noopener">${icon('pen-to-square')} Review this firm</a>`)
        : '';
    // The LinkedIn post a vacancy came from: never for logged-out visitors or a locked exclusive vacancy.
    const postLink = allowed && ctx.loggedIn && ctx.postLink ? safeHttpUrl(ctx.postLink) : '';
    return `<article class="pv2-detail${isExclusiveJob(job) ? ' is-exclusive' : ''}" data-job-id="${escapeHtml(job.id)}">
  <header class="pv2-detail-head">
    ${logoHtml(job, 'lg')}
    <div class="pv2-detail-heading">
      <h2 id="${escapeHtml(headingId)}" class="pv2-detail-title">${escapeHtml(headline.title)}</h2>
      <p class="pv2-detail-company">${escapeHtml(headline.subtitle)}${ratingHtml(ctx.rating)}</p>
      <ul class="pv2-detail-meta">
        <li>${icon('location-dot')}${escapeHtml(displayLocation(job.Location))}${cities.length > 1 ? ` <span class="pv2-muted">(${cities.length} cities)</span>` : ''}</li>
        ${pay ? `<li>${icon('indian-rupee-sign')}${escapeHtml(pay.replace(/^₹/, ''))}</li>` : ''}
        <li>${icon('clock', 'regular')}Posted ${escapeHtml(postedLabel(job, now))}</li>
      </ul>
      <div class="pv2-card-tags">${badgesHtml(job, portal, ctx)}</div>
    </div>
  </header>
  <div class="pv2-detail-apply" data-region="apply">${applyHtml(job, portal, ctx)}</div>
  <div class="pv2-detail-actions">
    <button type="button" class="pv2-btn pv2-btn-secondary${ctx.saved ? ' is-saved' : ''}" data-action="save" aria-pressed="${ctx.saved ? 'true' : 'false'}">${icon('bookmark', ctx.saved ? 'solid' : 'regular')} ${ctx.saved ? 'Saved' : 'Save'}</button>
    <button type="button" class="pv2-btn pv2-btn-secondary" data-action="share">${icon('share-nodes')} Share</button>
    ${ctx.canSeePeers === false ? '' : `<a class="pv2-btn pv2-btn-secondary" href="#" data-action="peers">${icon('linkedin', 'brands')} Connect with peers</a>`}
    ${postLink ? `<a class="pv2-btn pv2-btn-secondary" href="${escapeHtml(postLink)}" target="_blank" rel="noopener noreferrer nofollow" data-action="post">${icon('linkedin', 'brands')} Original post</a>` : ''}
    ${reviewLinks}
  </div>
  <section class="pv2-section" aria-labelledby="${escapeHtml(headingId)}-about">
    <h3 id="${escapeHtml(headingId)}-about">About the role</h3>
    <div class="pv2-prose${allowed ? '' : ' is-teaser'}" data-region="description">${description || (ctx.descriptionLoading ? '<p class="pv2-muted">Loading the description…</p>' : '<p class="pv2-muted">The recruiter did not add a description.</p>')}</div>
  </section>
  ${tags.length ? `<section class="pv2-section"><h3>Skills and focus areas</h3><div class="pv2-tag-cloud">${tags.map((tag) => `<span class="pv2-chip">${escapeHtml(tag)}</span>`).join('')}</div></section>` : ''}
  <section class="pv2-section"><h3>At a glance</h3>${factsHtml(job, portal)}</section>
  <p class="pv2-report">Something wrong with this vacancy? <a href="/contact.html">Report it</a></p>
</article>`;
}
