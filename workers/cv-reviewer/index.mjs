const SUPABASE_URL = 'https://auth.mystudentclub.com';
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0";

// Explicit legacy slugs from the LMS purchase mapping; never accept arbitrary courses.
const COURSE_ALIASES = {
  'industrial-training': 'industrial-training-mastery',
  'ca-industrial-training': 'industrial-training-mastery',
  'msc-industrial-training-program': 'industrial-training-mastery',
  'industrial-training-program': 'industrial-training-mastery',
  'msc-ca-industrial-training': 'industrial-training-mastery',
  'ca-freshers': 'msc-ca-freshers-program',
  'freshers': 'msc-ca-freshers-program',
  'ca-freshers-program': 'msc-ca-freshers-program',
  'msc-ca-freshers': 'msc-ca-freshers-program',
  'msc-ca-fresher-program': 'msc-ca-freshers-program'
};
function isEligibleCourse(course) {
  const value = String(course || '').trim().toLowerCase();
  const canonical = COURSE_ALIASES[value] || value;
  return ['industrial-training-mastery','msc-ca-freshers-program'].includes(canonical) ||
    /^(?:msc-)?(?:ca-)?articleship(?:-mastery|-program)?$/.test(canonical);
}


const ACCESS_VERSION = '2026-09-27-verified-partial-v1';
const PROMPT_VERSION = '2026-11-23-claude-v2';
// The models' own sense of "now" is their training cutoff, so without this they call real
// 2025/2026 dates "future dates" and dock the score. Always tell them today's date in India.
function todayInIndia(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric'}).format(now);
}
// --- Claude models, spend guard and review cache -------------------------------------
// Paid students get Opus, free users Haiku. Prices are US$ per million tokens (input, output).
const ANTHROPIC_VERSION = '2026-10-21';
const CLAUDE = {
  opus:   {model: 'claude-opus-5-5',   effort: 'medium',   price: [4, 20],      fallbacks: true},
  sonnet: {model: 'claude-sonnet-5-5', effort: 'high',   price: [2, 10],      fallbacks: true},
  haiku:  {model: 'claude-haiku-5-5',  effort: 'high',   price: [0.10, 0.50], fallbacks: false}
};
// Padam, 26 Nov 2026: "Paid Students pls do at opus, free students haiku only", then "instead of 10 make it after
// 3 reviews … move it Sonnet": a paid student's first 3 reviews of an India day use Opus, the rest Sonnet; free users
// always Haiku. No monthly downgrade: spend is still counted in KV (cv-review-spend:v1:YYYY-MM) for watching.
const OPUS_DAILY_PER_STUDENT = 3;
const CACHE_TTL_SECONDS = 30 * 86400;
const REPORT_SECTIONS = ['RECRUITER_TIPS', 'MEASURABLE_RESULTS', 'PHRASES_SUGGESTIONS', 'HARD_SKILLS', 'SOFT_SKILLS', 'ACTION_VERBS',
  'GRAMMAR_CHECK', 'FORMATTING_READABILITY', 'EDUCATION_QUALIFICATION', 'ARTICLESHIP_EXPERIENCE', 'INTERVIEW_QUESTIONS',
  'FINAL_RECOMMENDATIONS', 'OVERALL_SCORE'];
// Models sometimes write a section marker with two brackets (copying <<END_POINT>>) or with spaces;
// repair those before checking or sending, so a good review isn't thrown away or shown half-empty.
const MARKER_REPAIR = new RegExp(`<{2,3}\\s*(END_)?(${[...REPORT_SECTIONS, 'OUT_OF_CONTEXT'].join('|')})\\s*>{2,3}`, 'g');
function normalizeReport(text) {
  return String(text || '').replace(MARKER_REPAIR, (_, end, name) => `<<<${end || ''}${name}>>>`);
}
function hasScore(text) {
  const report = String(text || '');
  return report.includes('<<<OUT_OF_CONTEXT>>>') || /<<<OVERALL_SCORE>>>[\s\S]*?Score:\s*\**\s*\d[\s\S]*?<<<END_OVERALL_SCORE>>>/.test(report);
}
function isCompleteReport(text) {
  const report = String(text || '');
  if (report.includes('<<<OUT_OF_CONTEXT>>>')) return true;
  return REPORT_SECTIONS.every(section => report.includes(`<<<${section}>>>`) && report.includes(`<<<END_${section}>>>`));
}
function indiaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
}
const spendKey = () => `cv-review-spend:v1:${indiaDate().slice(0, 7)}`;
const opusKey = userId => `cv-review-opus:v1:${userId}:${indiaDate()}`;
async function kvNumber(env, key) {
  try { return Number(await env.RATE_LIMITS?.get(key)) || 0; } catch { return 0; }
}
async function kvJson(env, key) {
  try { const value = JSON.parse(await env.RATE_LIMITS?.get(key)); return value && typeof value === 'object' ? value : null; } catch { return null; }
}
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function choosePlan(access, env) {
  if (!access.premium) return CLAUDE.haiku;
  if (await kvNumber(env, opusKey(access.userId)) >= OPUS_DAILY_PER_STUDENT) return CLAUDE.sonnet;
  return CLAUDE.opus;
}
// Best-effort bookkeeping in the existing KV (eventually consistent: counts can run slightly low).
async function recordReview(env, access, plan, result, cacheKey) {
  if (!env.RATE_LIMITS?.put) return;
  const writes = [];
  if (result.costUsd > 0) {
    const key = spendKey();
    writes.push(kvNumber(env, key).then(spent => env.RATE_LIMITS.put(key, String(Math.round(spent + result.costUsd * 1e6)), {expirationTtl: 70 * 86400})));
  }
  if (String(result.modelUsed || '').startsWith('claude-opus') && access.userId) {
    const key = opusKey(access.userId);
    writes.push(kvNumber(env, key).then(used => env.RATE_LIMITS.put(key, String(used + 1), {expirationTtl: 2 * 86400})));
  }
  if (result.cacheable && cacheKey) {
    writes.push(env.RATE_LIMITS.put(cacheKey, JSON.stringify({response: result.response, modelUsed: result.modelUsed, at: Date.now()}), {expirationTtl: CACHE_TTL_SECONDS}));
  }
  await Promise.allSettled(writes);
}
async function callClaude(plan, systemPrompt, images, userTextPrompt, env) {
  const content = (images || []).map(img => {
    const match = /^data:(image\/[a-z]+);base64,/.exec(img);
    const data = match ? img.slice(match[0].length) : img;
    // Trust the bytes, not the label: Claude rejects an image whose declared type is wrong.
    const media_type = data.startsWith('/9j/') ? 'image/jpeg' : data.startsWith('iVBOR') ? 'image/png' :
      data.startsWith('R0lGOD') ? 'image/gif' : data.startsWith('UklGR') ? 'image/webp' : (match ? match[1] : 'image/jpeg');
    return {type: 'image', source: {type: 'base64', media_type, data}};
  });
  content.push({type: 'text', text: userTextPrompt});
  const body = {model: plan.model, max_tokens: 32000, stream: true, system: systemPrompt,
    output_config: {effort: plan.effort}, messages: [{role: 'user', content}]};
  const headers = {'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json'};
  if (plan.fallbacks) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
  // Streamed so a long Opus review keeps the connection busy instead of idling for minutes.
  const response = await fetch('https://api.anthropic.com/v1/messages', {method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(240000)});
  if (!response.ok) {
    const error = new Error(`Claude HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    error.noRetry = response.status === 400 || response.status === 401 || response.status === 403;
    throw error;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', text = '', inputTokens = 0, outputTokens = 0, stopReason = null, model = plan.model;
  const handle = event => {
    if (event.type === 'message_start') {
      const usage = event.message?.usage || {};
      inputTokens = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
      model = event.message?.model || model;
    } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      text += event.delta.text;
    } else if (event.type === 'message_delta') {
      stopReason = event.delta?.stop_reason ?? stopReason;
      outputTokens = event.usage?.output_tokens ?? outputTokens;
    } else if (event.type === 'error') {
      throw new Error('Claude stream error: ' + JSON.stringify(event.error || {}).slice(0, 300));
    }
  };
  for (;;) {
    const {done, value} = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), {stream: !done}).replace(/\r\n/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const data = buffer.slice(0, end).split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
      buffer = buffer.slice(end + 2);
      if (!data) continue;
      let event; try { event = JSON.parse(data); } catch { continue; }
      handle(event);
    }
    if (done) break;
  }
  const fail = message => Object.assign(new Error(message), {usage: {inputTokens, outputTokens}});
  if (stopReason === 'refusal') throw fail('Claude declined the request');
  if (stopReason === 'max_tokens') throw fail('Claude report was cut off');
  if (!text.trim()) throw fail('Claude returned no text');
  return {text: normalizeReport(text), inputTokens, outputTokens, model};
}
const FREE_SECTIONS = new Set(['OVERALL_SCORE', 'RECRUITER_TIPS', 'MEASURABLE_RESULTS', 'EDUCATION_QUALIFICATION', 'ARTICLESHIP_EXPERIENCE']);
function json(data, status = 200, extraHeaders = {}) {
  return new Response(status === 204 ? null : JSON.stringify(data), {status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Domain, X-Specialization, Origin',
    'Access-Control-Expose-Headers': 'Retry-After', ...extraHeaders
  }});
}
function accessError(message, status) { return Object.assign(new Error(message), {status}); }
async function verifiedAccess(request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return {userId:null,premium:false};
  if (!/^Bearer [^\s]+$/.test(authorization)) throw accessError('Please sign in again.',401);
  const headers = {apikey:SUPABASE_ANON_KEY,Authorization:authorization};
  try {
    const auth = await fetch(SUPABASE_URL + '/auth/v1/user', {headers,signal:AbortSignal.timeout(15000)});
    if (!auth.ok) throw accessError(auth.status >= 500 ? 'Unable to verify program access. Please try again.' : 'Please sign in again.',auth.status >= 500 ? 503 : 401);
    const user = await auth.json();
    if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) throw accessError('Please sign in again.',401);
    const enrolled = await fetch(SUPABASE_URL + '/rest/v1/enrollment?select=course&uuid=eq.' + encodeURIComponent(user.id), {headers,signal:AbortSignal.timeout(15000)});
    if (!enrolled.ok) throw accessError('Unable to verify program access. Please try again.',503);
    const rows = await enrolled.json();
    if (!Array.isArray(rows)) throw accessError('Unable to verify program access. Please try again.',503);
    return {userId:user.id,premium:rows.some(row => isEligibleCourse(row.course))};
  } catch(error) {
    if (error.status) throw error;
    throw accessError('Unable to verify program access. Please try again.',503);
  }
}
// Only complete, allowlisted sections leave the server for free users. Unknown,
// missing-end and nested sections are omitted instead of returning the raw report.
function partialReport(text) {
  const report = String(text || '');
  if (report.trim().replace(/^\*\*/, '').startsWith('<<<OUT_OF_CONTEXT>>>')) {
    return '<<<OUT_OF_CONTEXT>>> Please upload a CA, finance or accounting resume.';
  }
  const markers = [...report.matchAll(/<<<([A-Z_]+)>>>/g)];
  const sections = [];
  const seen = new Set();
  for (let i = 0; i < markers.length - 1; i++) {
    const marker = markers[i], next = markers[i+1], section = marker[1];
    if (!FREE_SECTIONS.has(section) || seen.has(section) || next[1] !== 'END_' + section) continue;
    const content = report.slice(marker.index + marker[0].length, next.index).trim().replace(/^\*\*\s*/, '').replace(/\s*\*\*$/, '').trim();
    if (!content) continue;
    sections.push(`<<<${section}>>>\n${content}\n<<<END_${section}>>>`);
    seen.add(section);
  }
  if (!sections.length) throw accessError('The review could not be formatted. Please try again.',502);
  return sections.join('\n\n');
}
async function checkRateLimit(request, env) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const tiers = [
    {binding:env.CV_RATE_LIMITER_BURST,seconds:10},
    {binding:env.CV_RATE_LIMITER,seconds:60},
    {binding:env.CV_RATE_LIMITER_DAILY,seconds:86400}
  ].filter(tier => typeof tier.binding?.limit === 'function');
  for (const tier of tiers) {
    const {success} = await tier.binding.limit({key:clientIp});
    if (!success) return json({ok:false,error:'You have reached the review limit. Please try again later.'},429,{'Retry-After':String(tier.seconds)});
  }
  if (tiers.length) return null;
  // The existing deployment binds RATE_LIMITS KV, not the optional rate limiter bindings.
  // KV provides a best-effort IP quota; concurrent cross-region increments are not atomic.
  if (!env.RATE_LIMITS?.get || !env.RATE_LIMITS?.put) throw accessError('Review limits are unavailable. Please try again.',503);
  const max = Math.max(1,Number(env.MAX_REQUESTS_PER_IP) || 50);
  const seconds = Math.max(60,Number(env.RATE_LIMIT_WINDOW) || 3600);
  const now = Math.floor(Date.now()/1000), bucket = Math.floor(now/seconds);
  const key = `cv-review-rate:v1:${clientIp}:${bucket}`;
  const count = Number(await env.RATE_LIMITS.get(key)) || 0;
  if (count >= max) return json({ok:false,error:'You have reached the review limit. Please try again later.'},429,{'Retry-After':String(seconds-now%seconds)});
  await env.RATE_LIMITS.put(key,String(count+1),{expirationTtl:seconds+60});
  return null;
}
export default {
  async fetch(request,env,ctx) {
    if (request.method === 'OPTIONS') return json(null,204);
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') return json({ok:true,version:ACCESS_VERSION,prompt:PROMPT_VERSION,models:{paid:CLAUDE.opus.model,free:CLAUDE.haiku.model},reportAccess:'server-verified'});
    if (request.method !== 'POST') return json({ok:false,error:'Method not allowed'},405);
    try {
      let body;
      try { body = await request.json(); } catch { return json({ok:false,error:'Invalid JSON body'},400); }
      if (!Array.isArray(body?.images) || !body.images.length) return json({ok:false,error:'Images are required'},400);
      const access = await verifiedAccess(request);
      const rateResponse = await checkRateLimit(request,env);
      if (rateResponse) return rateResponse;
      const domain = request.headers.get('X-Domain') || body.domain || 'Finance & Accounting';
      const specialization = request.headers.get('X-Specialization') || body.specialization || 'Accountant';
      const reply = (response,modelUsed,cached) => json({ok:true,response:access.premium ? response : partialReport(response),
        modelUsed,cached,access:{premium:access.premium,partial:!access.premium,version:ACCESS_VERSION}});
      // The same CV gets the same review back: no second charge and no shifting score.
      const cvHash = await sha256Hex([PROMPT_VERSION,domain,specialization,body.pdf_text || '',...body.images].join('|'));
      const premiumKey = `cv-review-cache:v2:${cvHash}:premium`, freeKey = `cv-review-cache:v2:${cvHash}:free`;
      for (const key of access.premium ? [premiumKey] : [premiumKey,freeKey]) {
        const cached = await kvJson(env,key);
        if (typeof cached?.response === 'string' && cached.response) return reply(cached.response,cached.modelUsed,true);
      }
      const plan = await choosePlan(access,env);
      const result = await processCV(body.images,body.pdf_text,domain,specialization,env,plan);
      if (!result.ok) return json({ok:false,error:'Unable to process your CV. Please try again.'},result.status || 502);
      // A review without its score would be saved as 0/100 in the student's history: ask for a retry instead.
      if (!hasScore(result.response)) {
        console.warn('CV review had no score section; model', result.modelUsed);
        const unscored = recordReview(env,access,plan,{...result,cacheable:false},null);
        if (ctx?.waitUntil) ctx.waitUntil(unscored); else await unscored;
        return json({ok:false,error:'We could not finish your review this time. Please try again in a minute.'},502);
      }
      const bookkeeping = recordReview(env,access,plan,result,access.premium ? premiumKey : freeKey);
      if (ctx?.waitUntil) ctx.waitUntil(bookkeeping); else await bookkeeping;
      return reply(result.response,result.modelUsed,false);
    } catch(error) {
      console.error('CV review request failed',error.status || 500);
      return json({ok:false,error:error.status ? error.message : 'Unable to process your CV. Please try again.'},error.status || 500);
    }
  }
};

async function processCV(images, pdfText, domain, specialization, env, plan = CLAUDE.haiku) {
  let ocrTextPrefix = "";
  if (pdfText && pdfText.trim().length > 0) {
      ocrTextPrefix = `**Extracted PDF Text (OCR). The ocr might be inaccurate, as in it might have spelling mistakes, ignore those spelling mistakes. Trust the image sent to you more.:**\n${pdfText}\n\n---\n\n`;
  }

  const today = todayInIndia();
  const systemPrompt = `You are an elite Career Strategist and Forensic Resume Auditor specializing in **${domain}** for **${specialization}** roles (CA/Finance focus).

## **TODAY'S DATE: ${today}**
Today is ${today} (India). Your own idea of the current year is out of date; use this date for every date and duration check.
- Any date on or before ${today} is in the past and valid. Never call it a "future date", a typo or an error, and never deduct points for it.
- "Present", "Current", "Till date" or "Ongoing" means the role runs up to ${today}; work out durations up to ${today}.
- Only flag a date as an issue if it is after ${today} and is not clearly marked as expected or upcoming (e.g. "Expected May 2027", "Appearing Nov 2026"), or if a range ends before it starts.
- Hyphen vs en-dash in date ranges is not an issue (ATS reads both). Mention date format only if the formats genuinely clash (e.g. "Dec 2025" vs "12/2025"), and only as Low severity.

## **YOUR GOAL**
The student will rebuild their CV using only this review. Every issue you raise must come with the exact fix: the exact replacement text, or the exact change to make. A student who applies every fix in this review should end up with a CV you would score 90 or more.

## **CORE DIRECTIVES**
1. **Scope Check:** If the uploaded document is not a CV/resume or is outside CA/Finance/Accounting, output ONLY: \`<<<OUT_OF_CONTEXT>>> [Reason]\`.
2. **Analysis Persona:** Judge resumes by elite Big 4 / top-MNC shortlisting standards. Be direct, specific and constructive.
3. **Accuracy:** Quote the CV exactly when you refer to it. Never say something is missing if it is on the CV. Never invent facts, numbers, clients, firms or achievements. In rewrites, keep the student's real facts; where a number is needed and is not on the CV, use a placeholder such as [X%], [₹X Cr] or [N clients] for the student to fill with the real figure.
4. **Only Real Issues:** Report only what would change a recruiter's shortlisting decision or how an ATS reads the CV. If something is already strong, mark it **[GOOD]** and leave it alone. Do not invent problems to fill a section; a short section is fine. Raise each issue once, in the section where it belongs (Final Recommendations lists every fix again as the fix list).
5. **Markers & Severity:** Use **[GOOD]** for strengths and **[ISSUE - SEVERITY: Critical/High/Moderate/Low]** for weaknesses.
6. **CA Focus:** Check for Ind AS, CARO 2020, Schedule III, Big 4 vs mid-tier articleship scale, client turnover, and tools (SAP, PowerBI vs Tally). Ignore quick CA exam timelines. Ignore spelling/typos completely.
7. **Score Generation:** Evaluate all sections first, then score on this scale: 90-100 ready to send to Big 4 / top-MNC recruiters with nothing material left to fix; 80-89 strong with only small fixes; 65-79 decent but several material fixes; 50-64 weak with major gaps; below 50 needs a rebuild. Deduct for unprofessional email (-5 to -8), visual clutter (-5 to -10), task-based bullets without impact (-8 to -15), missing audit context (-5), and inconsistent formatting (-4). Score the CV itself: the same CV must always get the same score. Use 1 decimal place (e.g. 74.3).

## **OUTPUT FORMAT (Strict Order)**

**<<<RECRUITER_TIPS>>>**
* **Contact Information:** [Analyze email, LinkedIn vanity URL, phone format; give the exact fix for anything wrong]
* **Visual Alignment & Formatting:** [Forensic check: grid alignment, consistent date format, margins, widows/orphans]
* **Word Count & Length:** [Assess density & page count]
* **LinkedIn Profile:** [URL check]
* **Summary/Objective:** [Hook check. If it is generic or missing, write the exact replacement summary (2-3 lines) using only facts on the CV]
* **Professional Email Assessment:** [Verdict on professionalism]
**<<<END_RECRUITER_TIPS>>>**

**<<<MEASURABLE_RESULTS>>>**
Rewrite EVERY bullet point that is not already strong, in the order they appear on the CV. Skip bullets you would mark [GOOD].
<<POINT>>
Original: "[Quote original bullet]"
Critique: "[Analysis of why it's weak]"
Rewrite Suggestion 1: "[Quantified, high-impact rewrite with turnover/metrics, using placeholders for numbers not on the CV]"
Rewrite Suggestion 2: "[Alternative high-impact angle]"
<<END_POINT>>
**<<<END_MEASURABLE_RESULTS>>>**

**<<<PHRASES_SUGGESTIONS>>>**
Identify every weak or cliché phrase that is not already covered above.
<<POINT>>
Original: "[Quote phrase]"
Critique: "[Why it's weak]"
Rewrite Suggestion 1: "[Stronger alternative]"
Rewrite Suggestion 2: "[Stronger alternative]"
<<END_POINT>>
**<<<END_PHRASES_SUGGESTIONS>>>**

**<<<HARD_SKILLS>>>**
* **Skills Highlighted:** [Key technical skills present]
* **Skills Missing/To Strengthen:** [Critical domain gaps for ${specialization}]
* **ATS Keywords for ${specialization} (CA Focus):** [High-value keywords missing from the CV that the student can honestly add]
**<<<END_HARD_SKILLS>>>**

**<<<SOFT_SKILLS>>>**
* **Soft Skills Displayed:** [Implied soft skills]
* **Soft Skills Missing/To Strengthen:** [Leadership, stakeholder management gaps]
**<<<END_SOFT_SKILLS>>>**

**<<<ACTION_VERBS>>>**
* **Effective Use:** [Overused verbs]
* **Suggestions for Enhancement:** [Strong action verbs]
**<<<END_ACTION_VERBS>>>**

**<<<GRAMMAR_CHECK>>>**
* **Well Done:** [Tone check]
* **Areas for Improvement:** [Tense consistency, passive voice, first-person references. DO NOT mention spelling.]
**<<<END_GRAMMAR_CHECK>>>**

**<<<FORMATTING_READABILITY>>>**
* **Critique:** [Layout, grid balance, date alignment, font hierarchy]
* **Suggestions:** [Actionable formatting fixes]
**<<<END_FORMATTING_READABILITY>>>**

**<<<EDUCATION_QUALIFICATION>>>**
* **Critique:** [CA membership number, attempts, location]
* **Suggestions:** [Exact formatting to use]
**<<<END_EDUCATION_QUALIFICATION>>>**

**<<<ARTICLESHIP_EXPERIENCE>>>**
* **Critique:** [Firm tier, turnover, statutory/tax audit standards]
* **Suggestions:** [Quantified improvements]
**<<<END_ARTICLESHIP_EXPERIENCE>>>**

**<<<INTERVIEW_QUESTIONS>>>**
* **Behavioral:** [Question]
* **Technical (Gap-based):** [Question]
* **Resume Specific:** [Question]
* **Domain (${specialization}):** [Question]
* **Regulatory:** [Question]
* **Situational:** [Question]
* **Career Logic:** [Question]
**<<<END_INTERVIEW_QUESTIONS>>>**

**<<<FINAL_RECOMMENDATIONS>>>**
* **Overall Assessment:** [Executive summary of strengths & weaknesses]
* **Market Competitiveness:** [Current percentile vs potential]
* **Targeted Advice:** [Big 4 vs Industry advice]
* **Next Steps (Complete Fix List):** [Every change the student must make to reach 90+, in priority order, one line each, written as an instruction such as "Replace X with Y"]
**<<<END_FINAL_RECOMMENDATIONS>>>**

**<<<OVERALL_SCORE>>>**
Score: [Score]/100
Justification: [2-3 sentence summary explaining the calculated score based on all identified issues above.]
**<<<END_OVERALL_SCORE>>>**
`;

  const userTextPrompt = ocrTextPrefix
    ? `Please review this CV based on the following extracted text:\n\n${ocrTextPrefix}`
    : "Please review the attached CV.";

  let claudeErrorMessage = null;
  let geminiErrorMessage = null;
  let gemmaErrorMessage = null;

  // --- ATTEMPT 1: CLAUDE (Opus for paid students, Haiku for free users) ---
  // A report missing sections is retried once, because the page shows each section on its own.
  // Every paid Claude attempt counts toward the monthly guard, including ones we discard.
  let claudeCostUsd = 0;
  const costOf = usage => (usage?.inputTokens || 0) * plan.price[0] / 1e6 + (usage?.outputTokens || 0) * plan.price[1] / 1e6;
  if (env.ANTHROPIC_API_KEY) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const claude = await callClaude(plan, systemPrompt, images, userTextPrompt, env);
        claudeCostUsd += costOf(claude);
        const complete = isCompleteReport(claude.text);
        if (complete || (attempt === 2 && hasScore(claude.text))) {
          return {ok: true, response: claude.text, status: 200, modelUsed: claude.model, cacheable: complete,
            usage: {input: claude.inputTokens, output: claude.outputTokens},
            costUsd: claudeCostUsd};
        }
        claudeErrorMessage = `Claude report incomplete on attempt ${attempt}`;
      } catch (err) {
        claudeErrorMessage = err.message || String(err);
        claudeCostUsd += costOf(err.usage);
        console.warn(`Claude ${plan.model} attempt ${attempt} failed:`, claudeErrorMessage);
        // A timed-out review is not retried, so a student never waits twice as long.
        if (err.noRetry || err.name === 'TimeoutError' || err.name === 'AbortError') break;
      }
    }
    console.warn("Claude failed, falling back to Gemini Flash Lite:", claudeErrorMessage);
  }

  // --- ATTEMPT 2: GEMINI API (FALLBACK) ---
  try {
    const secondaryModel = "gemini-3.1-flash-lite";
    console.log(`Attempting secondary processing with Gemini model: ${secondaryModel}`);

    const geminiImageParts = (images || []).map((img) => ({
      inline_data: {
        mime_type: "image/jpeg",
        data: img.replace(/^data:image\/\w+;base64,/, ""),
      },
    }));

    const fullPrompt = ocrTextPrefix ? `${ocrTextPrefix}\n\n${systemPrompt}` : systemPrompt;

    const requestPayload = {
      contents: [ { parts: [...geminiImageParts, { text: fullPrompt }] } ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 32768,
        responseMimeType: "text/plain",
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      ]
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${secondaryModel}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    let responseText = null;
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
      responseText = data.candidates[0].content.parts[0].text;
    }

    if (responseText) {
      return {
        ok: true,
        response: normalizeReport(responseText),
        status: 200,
        modelUsed: secondaryModel, costUsd: claudeCostUsd,
        debug_errors: { claude: claudeErrorMessage }
      };
    } else {
       throw new Error(`Gemini returned success but no text. Raw: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    geminiErrorMessage = err.message || String(err);
    console.warn("Gemini API call failed, falling back to Cloudflare Workers AI Gemma:", geminiErrorMessage);
  }

  // --- ATTEMPT 3: FALLBACK TO CLOUDFLARE WORKERS AI (TERTIARY - GEMMA VISION) ---
  try {
    const tertiaryModel = "@cf/google/gemma-4-26b-a4b-it";
    console.log(`Attempting tertiary fallback with Cloudflare AI Gemma model: ${tertiaryModel}`);

    const gemmaImageParts = (images || []).map((img) => {
      const base64Str = img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
      return {
        type: "image_url",
        image_url: { url: base64Str }
      };
    });

    const gemmaMessages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userTextPrompt },
          ...gemmaImageParts
        ]
      }
    ];

    const gemmaResponse = await env.AI.run(tertiaryModel, { messages: gemmaMessages });
    const replyText = gemmaResponse.response || (gemmaResponse.choices && gemmaResponse.choices[0]?.message?.content);

    if (replyText) {
      return {
        ok: true,
        response: normalizeReport(replyText),
        status: 200,
        modelUsed: tertiaryModel, costUsd: claudeCostUsd,
        debug_errors: { claude: claudeErrorMessage, gemini: geminiErrorMessage } // THIS TELLS YOU WHY IT FELL BACK TO GEMMA
      };
    } else {
       throw new Error(`Gemma returned success but no text. Raw: ${JSON.stringify(gemmaResponse)}`);
    }
  } catch (err) {
    gemmaErrorMessage = err.message || String(err);
    console.error("Cloudflare AI Gemma fallback failed:", gemmaErrorMessage);
  }

  // If ALL models fail, return 500 with all error strings
  return {
    ok: false,
    status: 500,
    error: "Failed to process CV across all AI models (Claude, Gemini, and Gemma).",
    debug_errors: {
      claude: claudeErrorMessage,
      gemini: geminiErrorMessage,
      gemma: gemmaErrorMessage
    }
  };
}