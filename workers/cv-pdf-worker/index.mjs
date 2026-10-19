import puppeteer_cloudflare_default from "./runtime.mjs";

const FREE_TEMPLATES = new Set(['bold-modern.html','inset-frame.html','clean-rule.html']);
const TEMPLATES = new Set(["bold-modern.html", "inset-frame.html", "clean-rule.html", "classic.html", "ledger-layout.html", "structured-grid.html", "pill-corporate.html", "hybrid-grid.html", "corporate-box.html", "bordered-grid.html", "split-ledger.html", "academic-ledger.html", "modern-elegant.html", "grid-layout.html", "professional.html", "corporate.html", "minimalist.html", "refined-classic.html", "modern-bold.html", "executive.html", "merit-layout.html", "clean-ledger.html", "modern-split.html", "horizon-split.html", "professional-banner.html", "executive-professional.html", "corporate-grid.html", "banner-resume.html", "elegant-grid.html", "structured-ledger.html", "classic-ledger.html", "formal-ledger.html", "smart-ledger.html", "modern-ledger.html", "standard-ledger.html", "classic-grid.html", "profile-sidebar.html", "compact-banner.html", "dual-columns.html", "continuous-outline.html", "formal-docket.html", "open-panel.html", "executive-docket.html", "tabular-ledger.html", "grid-docket.html", "split-banner.html", "wave-grid.html", "side-panel.html", "classic-docket.html", "composite-ledger.html", "dotted-split.html", "pill-header-split.html", "banner-executive-split.html", "sidebar-panel-split.html", "timeline-flow-split.html", "executive-header-split.html", "bordered-box-ledger.html", "matrix-grid-ledger.html", "clean-line-executive.html", "minimalist-executive.html", "accent-split-summary.html"]);
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

function accessError(message, status) { return Object.assign(new Error(message), {status}); }
async function authorizeExport(request) {
  const declaredSize = Number(request.headers.get('Content-Length') || 0);
  if (declaredSize > 1000000) throw accessError('CV data is too large', 413);
  const raw = await request.text();
  if (raw.length > 1000000) throw accessError('CV data is too large', 413);
  let body;
  try { body = JSON.parse(raw); } catch { throw accessError('Invalid JSON body', 400); }
  if (!body || !TEMPLATES.has(body.template)) throw accessError('Select a valid CV template and retry', 400);
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw accessError('Missing CV data. Reload the CV Builder and retry.', 400);
  // Raw HTML is never rendered: this prevents relabelling a premium design as free.
  if (!FREE_TEMPLATES.has(body.template)) {
    const authorization = request.headers.get('Authorization') || '';
    if (!/^Bearer [^\s]+$/.test(authorization)) throw accessError('Enroll in an MSC program to export premium templates', 403);
    const headers = { apikey: SUPABASE_ANON_KEY, Authorization: authorization };
    let auth, enrollment;
    try {
      auth = await fetch(SUPABASE_URL + '/auth/v1/user', {headers});
      if (!auth.ok) throw accessError('Please sign in again to verify your enrollment', 401);
      const user = await auth.json();
      if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) throw accessError('Please sign in again', 401);
      enrollment = await fetch(SUPABASE_URL + '/rest/v1/enrollment?select=course&uuid=eq.' + encodeURIComponent(user.id), {headers});
      if (!enrollment.ok) throw accessError('Unable to verify enrollment. Please try again.', 503);
      const rows = await enrollment.json();
      const eligible = Array.isArray(rows) && rows.some(row => isEligibleCourse(row.course));
      if (!eligible) throw accessError('Enroll in an MSC program to export premium templates', 403);
    } catch (error) {
      if (error.status) throw error;
      throw accessError('Unable to verify enrollment. Please try again.', 503);
    }
  }
  return { template: body.template, data: body.data, filename: body.filename || 'cv' };
}

const worker = {
  async fetch(request, env2) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    const url = new URL(request.url);
    if (url.pathname === "/pdf") {
      return handlePdfRequest(request, env2);
    }
    if (url.pathname === "/docx") {
      return handleDocxRequest(request, env2);
    }
    if (url.pathname === "/health") {
      return jsonResponse({ ok: true, routes: ["/pdf", "/docx"], version: "2026-09-27-template-entitlements-v2", exportProtocol: "template-data-v1" });
    }
    return jsonResponse({ ok: false, error: "Not found" }, 404);
  }
};
async function handlePdfRequest(request, env2) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "POST required" }, 405);
  }
  let exportData;
  try {
    exportData = await authorizeExport(request);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, error.status || 400);
  }
  const filename = exportData.filename;
  try {
    const pdfBuffer = await generatePdfBuffer(exportData, env2);
    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${sanitizeFilename(filename)}"`,
        ...corsHeaders()
      }
    });
  } catch (error3) {
    console.error("PDF generation error:", error3);
    const status = error3?.message === "Capacity reached. Backing off." ? 429 : 500;
    return jsonResponse({ ok: false, error: error3.message || "PDF generation failed" }, status);
  }
}
async function handleDocxRequest(request, env2) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "POST required" }, 405);
  }
  if (!env2.FREECONVERT_API_KEY) {
    return jsonResponse({ ok: false, error: "FREECONVERT_API_KEY is not configured" }, 500);
  }
  let exportData;
  try {
    exportData = await authorizeExport(request);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, error.status || 400);
  }
  const filename = exportData.filename;
  const pdfFilename = replaceExtension(filename, ".pdf");
  const docxFilename = replaceExtension(filename, ".docx");
  try {
    const pdfBuffer = await generatePdfBuffer(exportData, env2);
    const docxFile = await convertPdfToDocxWithFreeConvert(
      pdfBuffer,
      pdfFilename,
      docxFilename,
      env2.FREECONVERT_API_KEY
    );
    return new Response(docxFile.arrayBuffer, {
      headers: {
        "Content-Type": docxFile.contentType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${sanitizeFilename(docxFilename)}"`,
        ...corsHeaders()
      }
    });
  } catch (error3) {
    console.error("DOCX generation error:", error3);
    const status = error3?.message === "Capacity reached. Backing off." ? 429 : 500;
    return jsonResponse({ ok: false, error: error3.message || "DOCX generation failed" }, status);
  }
}
async function generatePdfBuffer(exportData, env2) {
  let browser;
  let page;
  try {
    browser = await getBrowser(env2);
    page = await browser.newPage();
    await page.setViewport({ width: 1e3, height: 1414 });
    // Render a canonical server-selected template, never caller-supplied HTML.
    // Without this, a premium design could be relabelled as a free template.
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      const allowed = url.protocol === 'data:' || url.protocol === 'about:' ||
        (url.protocol === 'https:' && ['mystudentclub.com', 'www.mystudentclub.com', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname));
      if (allowed) request.continue(); else request.abort();
    });
    await page.goto('https://www.mystudentclub.com/cv-builder/' + exportData.template, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => typeof renderCV === 'function', { timeout: 15000 });
    await page.evaluate(payload => {
      // The editor allows rich text, but data cannot introduce scripts, styles or
      // images that replace the canonical design or trigger external requests.
      const allowedTags = new Set(['B','STRONG','I','EM','U','S','BR','P','UL','OL','LI','SPAN','A','DIV','SUB','SUP']);
      function cleanString(value) {
        const template = document.createElement('template');
        template.innerHTML = value;
        for (const element of [...template.content.querySelectorAll('*')]) {
          if (!allowedTags.has(element.tagName)) {
            if (['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','INPUT','BUTTON'].includes(element.tagName)) element.remove();
            else element.replaceWith(...element.childNodes);
            continue;
          }
          const href = element.getAttribute('href');
          const safeStyles = ['font-weight','font-style','text-decoration','text-align'].map(property => {
            const val = element.style.getPropertyValue(property);
            return /^[a-z0-9 -]{1,40}$/i.test(val) ? `${property}:${val}` : '';
          }).filter(Boolean).join(';');
          for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
          if (safeStyles) element.setAttribute('style',safeStyles);
          if (element.tagName === 'A' && /^(https?:\/\/|mailto:|tel:)/i.test(href || '')) element.setAttribute('href',href);
        }
        return template.innerHTML;
      }
      function clean(value) {
        if (typeof value === 'string') return cleanString(value);
        if (Array.isArray(value)) return value.map(clean);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['__proto__','constructor','prototype'].includes(key)).map(([key,val]) => [key,clean(val)]));
        return value;
      }
      const data = clean(payload);
      data.themeAccent = /^#[a-f0-9]{6}$/i.test(data.themeAccent || '') ? data.themeAccent : '';
      data.themeFont = /^[a-z -]{0,80}$/i.test(data.themeFont || '') ? data.themeFont : '';
      window._hasReceivedData = true;
      renderCV(data);
    }, exportData.data);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    try {
      await Promise.race([
        page.evaluate(() => document.fonts.ready),
        new Promise((resolve) => setTimeout(resolve, 3e3))
      ]);
    } catch (e2) {
      console.warn("Failed to wait for document.fonts.ready:", e2);
    }
    await page.evaluate(() => {
      const cvPage = document.getElementById("cv-page") || document.querySelector(".resume-container") || document.body;
      if (cvPage) {
        cvPage.style.transform = "none";
        cvPage.style.marginBottom = "0";
        cvPage.style.boxShadow = "none";
      }
      const wrapper = document.getElementById("zoom-wrapper");
      if (wrapper) {
        wrapper.style.transform = "none";
        wrapper.style.padding = "0";
        wrapper.style.margin = "0";
        wrapper.style.overflow = "visible";
      }
      if (typeof shrinkContentToFit === "function") {
        shrinkContentToFit();
      }
      document.body.style.opacity = "1";
      document.body.style.transition = "none";
      document.body.style.background = "#ffffff";
      document.body.style.margin = "0";
      document.body.style.padding = "0";
    });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" }
    });
    await page.close();
    browser.disconnect();
    return pdfBuffer;
  } catch (error3) {
    if (page) {
      try {
        await page.close();
      } catch {
      }
    }
    if (browser) {
      try {
        browser.disconnect();
      } catch {
      }
    }
    throw error3;
  }
}
async function getBrowser(env2) {
  let browser;
  const activeSessions = await puppeteer_cloudflare_default.sessions(env2.BROWSER);
  for (const session of activeSessions) {
    try {
      browser = await puppeteer_cloudflare_default.connect(env2.BROWSER, session.sessionId);
      if (browser)
        return browser;
    } catch {
      continue;
    }
  }
  try {
    return await puppeteer_cloudflare_default.launch(env2.BROWSER);
  } catch (error3) {
    const message = String(error3?.message || "").toLowerCase();
    if (message.includes("limit") || message.includes("concurrency") || message.includes("too many")) {
      throw new Error("Capacity reached. Backing off.");
    }
    throw error3;
  }
}
async function convertPdfToDocxWithFreeConvert(pdfBuffer, pdfFilename, docxFilename, apiKey) {
  const apiHeaders = {
    "Accept": "application/json",
    "Authorization": `Bearer ${apiKey}`
  };
  const jobResponse = await fetch("https://api.freeconvert.com/v1/process/jobs", {
    method: "POST",
    headers: {
      ...apiHeaders,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tasks: {
        "import-1": {
          operation: "import/upload"
        },
        "convert-1": {
          operation: "convert",
          input: "import-1",
          input_format: "pdf",
          output_format: "docx"
        },
        "export-1": {
          operation: "export/url",
          input: ["convert-1"],
          filename: docxFilename
        }
      }
    })
  });
  const jobData = await parseJsonOrThrow(jobResponse, "Failed to create FreeConvert job");
  const importTask = findTask(jobData, "import-1");
  if (!importTask?.result?.form?.url || !importTask?.result?.form?.parameters) {
    throw new Error("FreeConvert upload form was not returned");
  }
  const formData = new FormData();
  for (const [key, value] of Object.entries(importTask.result.form.parameters)) {
    formData.append(key, value);
  }
  formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), pdfFilename);
  const uploadResponse = await fetch(importTask.result.form.url, {
    method: "POST",
    body: formData
  });
  if (!uploadResponse.ok) {
    const uploadText = await uploadResponse.text();
    throw new Error(`FreeConvert upload failed (${uploadResponse.status}): ${uploadText.slice(0, 200)}`);
  }
  const exportTaskId = findTask(jobData, "export-1")?.id;
  if (!exportTaskId) {
    throw new Error("FreeConvert export task was not created");
  }
  const completedExportTask = await waitForTaskCompletion(exportTaskId, apiHeaders);
  const downloadUrl = completedExportTask?.result?.url;
  if (!downloadUrl) {
    throw new Error("FreeConvert did not return a DOCX download URL");
  }
  const fileResponse = await fetch(downloadUrl);
  if (!fileResponse.ok) {
    throw new Error(`FreeConvert download failed with status ${fileResponse.status}`);
  }
  return {
    arrayBuffer: await fileResponse.arrayBuffer(),
    contentType: fileResponse.headers.get("content-type")
  };
}
async function waitForTaskCompletion(taskId, headers) {
  const maxAttempts = 40;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`https://api.freeconvert.com/v1/process/tasks/${taskId}`, {
      method: "GET",
      headers
    });
    const task = await parseJsonOrThrow(response, "Failed to fetch FreeConvert task");
    if (task.status === "completed") {
      return task;
    }
    if (task.status === "failed") {
      throw new Error(task?.message || task?.result?.error || "FreeConvert conversion failed");
    }
    await sleep(2e3);
  }
  throw new Error("FreeConvert conversion timed out");
}
async function parseJsonOrThrow(response, fallbackMessage) {
  const data = await response.json().catch(() => null);
  if (response.ok) {
    return data;
  }
  const message = data?.error || data?.message || data?.errors?.[0]?.message || `${fallbackMessage} (${response.status})`;
  throw new Error(message);
}
function findTask(jobData, name) {
  if (!Array.isArray(jobData?.tasks)) {
    return null;
  }
  return jobData.tasks.find((task) => task.name === name) || null;
}
function replaceExtension(filename, extension) {
  const safeName = sanitizeFilename(filename || "cv");
  const normalizedExtension = extension.startsWith(".") ? extension : `.${extension}`;
  return safeName.replace(/\.[^.]+$/, "") + normalizedExtension;
}
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Expose-Headers": "Content-Disposition"
  };
}
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  });
}
function sanitizeFilename(name) {
  return String(name || "cv").replace(/[^a-zA-Z0-9._-]/g, "_");
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export {
  worker as default
};
