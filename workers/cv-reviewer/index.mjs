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
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') return json({ok:true,version:ACCESS_VERSION,reportAccess:'server-verified'});
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
      const result = await processCV(body.images,body.pdf_text,domain,specialization,env);
      if (!result.ok) return json({ok:false,error:'Unable to process your CV. Please try again.'},result.status || 502);
      return json({ok:true,response:access.premium ? result.response : partialReport(result.response),
        modelUsed:result.modelUsed,access:{premium:access.premium,partial:!access.premium,version:ACCESS_VERSION}});
    } catch(error) {
      console.error('CV review request failed',error.status || 500);
      return json({ok:false,error:error.status ? error.message : 'Unable to process your CV. Please try again.'},error.status || 500);
    }
  }
};

async function processCV(images, pdfText, domain, specialization, env) {
  let ocrTextPrefix = "";
  if (pdfText && pdfText.trim().length > 0) {
      ocrTextPrefix = `**Extracted PDF Text (OCR). The ocr might be inaccurate, as in it might have spelling mistakes, ignore those spelling mistakes. Trust the image sent to you more.:**\n${pdfText}\n\n---\n\n`;
  }

  const systemPrompt = `You are an elite Career Strategist and Forensic Resume Auditor specializing in **${domain}** for **${specialization}** roles (CA/Finance focus).

## **CORE DIRECTIVES**
1. **Scope Check:** If the uploaded document is not a CV/resume or is outside CA/Finance/Accounting, output ONLY: \`<<<OUT_OF_CONTEXT>>> [Reason]\`.
2. **Analysis Persona:** Judge resumes by elite Big 4 / McKinsey standards. Be direct and constructive.
3. **Markers & Severity:** Use **[GOOD]** for strengths and **[ISSUE - SEVERITY: Critical/High/Moderate/Low]** for weaknesses.
4. **CA Focus:** Check for Ind AS, CARO 2020, Schedule III, Big 4 vs mid-tier articleship scale, client turnover, and tools (SAP, PowerBI vs Tally). Ignore quick CA exam timelines. Ignore spelling/typos completely.
5. **Score Generation:** Evaluate all sections first before scoring. Deduct points for unprofessional email (-5 to -8), visual clutter (-5 to -10), task-based bullets without impact (-8 to -15), missing audit context (-5), and inconsistent formatting (-4). Use 1 decimal place (e.g. 74.3).

## **OUTPUT FORMAT (Strict Order)**

**<<<RECRUITER_TIPS>>>**
* **Contact Information:** [Analyze email, LinkedIn vanity URL, phone format]
* **Visual Alignment & Formatting:** [Forensic check: grid alignment, dash consistency (en-dashes for dates), margins, widows/orphans]
* **Word Count & Length:** [Assess density & page count]
* **LinkedIn Profile:** [URL check]
* **Summary/Objective:** [Hook check: replace generic objective with professional value proposition]
* **Professional Email Assessment:** [Verdict on professionalism]
**<<<END_RECRUITER_TIPS>>>**

**<<<MEASURABLE_RESULTS>>>**
Identify 2-4 weak bullet points.
<<POINT>>
Original: "[Quote original bullet]"
Critique: "[Analysis of why it's weak]"
Rewrite Suggestion 1: "[Quantified, high-impact rewrite with turnover/metrics]"
Rewrite Suggestion 2: "[Alternative high-impact angle]"
<<END_POINT>>
**<<<END_MEASURABLE_RESULTS>>>**

**<<<PHRASES_SUGGESTIONS>>>**
Identify 2-4 weak/cliché phrases.
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
* **ATS Keywords for ${specialization} (CA Focus):** [8-12 high-value keywords]
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
* **Suggestions:** [Formatting recommendations]
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
* **Next Steps (Immediate Action Items):** [Priority 1, 2, 3]
**<<<END_FINAL_RECOMMENDATIONS>>>**

**<<<OVERALL_SCORE>>>**
Score: [Score]/100
Justification: [2-3 sentence summary explaining the calculated score based on all identified issues above.]
**<<<END_OVERALL_SCORE>>>**
`;

  const userTextPrompt = ocrTextPrefix 
    ? `Please review this CV based on the following extracted text:\n\n${ocrTextPrefix}`
    : "Please review the attached CV.";

  // Variables to hold specific errors for debugging
  let openAiErrorMessage = null;
  let geminiErrorMessage = null;
  let gemmaErrorMessage = null;

  // --- ATTEMPT 1: GPT-5.6-LUNA (PRIMARY - Responses API) ---
  try {
    const primaryModel = "gpt-5.6-luna";
    console.log(`Attempting primary processing with OpenAI model: ${primaryModel}`);

    // FIXED: The new API expects a direct string for image_url, not an object.
    const openaiImageParts = (images || []).map((img) => {
      const base64Str = img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
      return {
        type: "input_image",
        image_url: base64Str
      };
    });

    const openaiPayload = {
      model: primaryModel,
      reasoning: { effort: "high" },
      store: false,
      input: [
        { role: "system", content: systemPrompt },
        { 
          role: "user", 
          content: [ { type: "input_text", text: userTextPrompt }, ...openaiImageParts ]
        }
      ]
    };

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(openaiPayload),
    });

    if (!openaiResponse.ok) {
      throw new Error(`OpenAI HTTP ${openaiResponse.status}: ${await openaiResponse.text()}`);
    }

    const openaiData = await openaiResponse.json();
    
    let responseText = null;
    if (openaiData.output && Array.isArray(openaiData.output)) {
      const messageItem = openaiData.output.find(item => item.type === "message" && item.role === "assistant");
      if (messageItem && messageItem.content) {
        const textItem = messageItem.content.find(c => c.type === "output_text");
        if (textItem) {
          responseText = textItem.text;
        }
      }
    }

    if (responseText) {
      return { ok: true, response: responseText, status: 200, modelUsed: primaryModel };
    } else {
      throw new Error(`OpenAI returned success but no output_text. Raw: ${JSON.stringify(openaiData)}`);
    }
  } catch (err) {
    openAiErrorMessage = err.message || String(err);
    console.warn("OpenAI API call failed, falling back to Gemini Flash Lite:", openAiErrorMessage);
  }

  // --- ATTEMPT 2: GEMINI API (SECONDARY) ---
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
        maxOutputTokens: 8192,
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
        response: responseText, 
        status: 200, 
        modelUsed: secondaryModel,
        debug_errors: { openai: openAiErrorMessage } 
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
        response: replyText, 
        status: 200, 
        modelUsed: tertiaryModel,
        debug_errors: { openai: openAiErrorMessage, gemini: geminiErrorMessage } // THIS TELLS YOU WHY IT FELL BACK TO GEMMA
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
    error: "Failed to process CV across all AI models (GPT, Gemini, and Gemma).",
    debug_errors: {
      openai: openAiErrorMessage,
      gemini: geminiErrorMessage,
      gemma: gemmaErrorMessage
    }
  };
}