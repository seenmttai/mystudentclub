import puppeteer from "@cloudflare/puppeteer";

export default {
    async fetch(request, env, ctx) {
        // CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders() });
        }

        // Route check — only handle POST /pdf
        const url = new URL(request.url);
        if (url.pathname !== "/pdf") {
            return jsonResponse({ ok: false, error: "Not found" }, 404);
        }

        if (request.method !== "POST") {
            return jsonResponse({ ok: false, error: "POST required" }, 405);
        }

        // Parse request body
        let html, filename;
        try {
            const body = await request.json();
            html = body.html;
            filename = body.filename || "cv.pdf";
        } catch (e) {
            return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
        }

        if (!html || typeof html !== "string") {
            return jsonResponse({ ok: false, error: "Missing or invalid 'html' field" }, 400);
        }

        // Generate PDF with Puppeteer
        let browser;
        let page;
        try {
            // ── Connect & Reuse Browser Sessions to Handle Scale ──
            // 1. Try connecting to an existing idle browser first
            const activeSessions = await puppeteer.sessions(env.BROWSER);
            for (const session of activeSessions) {
                try {
                    browser = await puppeteer.connect(env.BROWSER, session.sessionId);
                    if (browser) break;
                } catch (e) {
                    continue; // session busy or dead, try next
                }
            }

            // 2. If no browsers are free, launch a new one
            if (!browser) {
                try {
                    browser = await puppeteer.launch(env.BROWSER);
                } catch (e) {
                    // Soft-reject if we hit Cloudflare's strict concurrency caps
                    if (e.message.toLowerCase().includes("limit") || 
                        e.message.toLowerCase().includes("concurrency") || 
                        e.message.toLowerCase().includes("too many")) {
                        return jsonResponse({ ok: false, error: "Capacity reached. Backing off." }, 429);
                    }
                    throw e;
                }
            }

            page = await browser.newPage();

            // Match CV template design dimensions (1000×1414 = A4 ratio)
            await page.setViewport({ width: 1000, height: 1414 });

            await page.setContent(html, {
                waitUntil: "networkidle0",
                timeout: 15000,
            });

            // Strip preview-only transforms and prepare for print
            await page.evaluate(() => {
                const cvPage = document.getElementById("cv-page") ||
                    document.querySelector(".resume-container") ||
                    document.body;

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

                // Force body visible — all templates start with opacity:0 + fade transition
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
                margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
            });

            await page.close(); // Close the tab, but NOT the browser
            
            // Explicitly disconnect to free up the session for another incoming request
            browser.disconnect();

            return new Response(pdfBuffer, {
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": `attachment; filename="${sanitizeFilename(filename)}"`,
                    ...corsHeaders(),
                },
            });

        } catch (error) {
            if (page) try { await page.close(); } catch (_) {}
            if (browser) try { browser.disconnect(); } catch (_) {}
            
            console.error("PDF generation error:", error);
            return jsonResponse({ ok: false, error: error.message || "PDF generation failed" }, 500);
        }
    },
};

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
}

function sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
