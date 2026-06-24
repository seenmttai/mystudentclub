// Profill Worker — portal-type-aware CV extraction
// Deploy at: https://profile.mystudentclub.com (Cloudflare Worker)

const PORTAL_CONTEXTS = {
    industrial: {
        label: 'CA Industrial Training candidate',
        focus: `CA Final is NOT yet cleared — they are still in articleship and seeking industrial training.
Extract CA Inter (cleared), CA Foundation (cleared), and CA Final APPEARANCE (upcoming attempt) details.
Do NOT extract ca_final_clear_month or ca_final_clear_year — they haven't cleared CA Final.
Extract articleship details (firm, type, domain) and industrial_training_company if present.
Do NOT extract emp_company_name/emp_job_title/emp_job_profile — these candidates have no post-qualification employment.`,
        skipFields: ['ca_final_clear_month','ca_final_clear_year','ca_final_air','emp_company_name','emp_job_title','emp_job_profile','emp_join_year','emp_join_month'],
    },
    articleship: {
        label: 'CA Articleship candidate',
        focus: `CA Inter is cleared. CA Final is NOT yet cleared. Candidate is seeking articleship.
Extract CA Inter (cleared), CA Foundation (cleared), and CA Final APPEARANCE (upcoming attempt) details.
Do NOT extract ca_final_clear_month or ca_final_clear_year.
Extract articleship details if they have any prior stint.
Do NOT extract emp_company_name/emp_job_title — no post-qualification employment.`,
        skipFields: ['ca_final_clear_month','ca_final_clear_year','ca_final_air','emp_company_name','emp_job_title','emp_job_profile','emp_join_year','emp_join_month'],
    },
    fresher_fresher: {
        label: 'CA Fresher (no post-qualification work experience)',
        focus: `CA Final is cleared. Candidate has NO post-qualification work experience.
Extract full CA Final details (course, attempts, clear month/year, AIR).
Extract CA Inter and CA Foundation details.
Extract articleship details and industrial_training_company if present.
Do NOT extract emp_company_name/emp_job_title/emp_job_profile — this is a fresher with no employment.`,
        skipFields: ['emp_company_name','emp_job_title','emp_job_profile','emp_join_year','emp_join_month','ca_final_app_month','ca_final_app_year'],
    },
    fresher_experienced: {
        label: 'CA Fresher (with post-qualification work experience)',
        focus: `CA Final is cleared. Candidate HAS post-qualification work experience.
Extract full CA Final details (course, attempts, clear month/year, AIR).
Extract CA Inter and CA Foundation details.
Extract articleship details, industrial_training_company if present.
Also extract current/most recent employer details into emp_company_name, emp_job_title, emp_job_profile, emp_join_year, emp_join_month.`,
        skipFields: ['ca_final_app_month','ca_final_app_year'],
    },
    semi_fresher: {
        label: 'Semi-Qualified CA (no or limited work experience)',
        focus: `CA Inter is cleared but CA Final is NOT yet cleared (or still appearing).
Extract CA Inter details (cleared), CA Foundation details.
Extract CA Final APPEARANCE/attempt details (ca_final_app_month, ca_final_app_year) if upcoming attempt is mentioned.
Do NOT extract ca_final_clear_month or ca_final_clear_year unless explicitly stated as cleared.
Extract articleship details if present.
Extract emp_company_name, emp_job_title, emp_job_profile if any employment found.`,
        skipFields: [],
    },
    semi_experienced: {
        label: 'Semi-Qualified CA (with work experience)',
        focus: `CA Inter is cleared but CA Final is NOT yet cleared.
Extract CA Inter details (cleared), CA Foundation details.
Extract CA Final APPEARANCE details if upcoming attempt mentioned.
Extract articleship details if present.
Extract current employment: emp_company_name, emp_job_title, emp_job_profile, emp_join_year, emp_join_month.`,
        skipFields: [],
    },
};

export default {
    async fetch(request, env, ctx) {
        const addCorsHeaders = (response) => {
            const headers = new Headers(response.headers);
            headers.set("Access-Control-Allow-Origin", "*");
            headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
            headers.set("Access-Control-Allow-Headers", "Content-Type, X-Domain, X-Specialization, Origin");
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: headers
            });
        };

        if (request.method === "OPTIONS") {
            return addCorsHeaders(new Response(null, { status: 204 }));
        }

        if (request.method !== "POST") {
            return addCorsHeaders(new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } }));
        }

        try {
            const requestData = await request.json();
            const images = requestData.images;
            const pdfText = requestData.pdf_text || "";
            const portalType = requestData.portal_type || "fresher_fresher";

            if ((!images || images.length === 0) && !pdfText) {
                return addCorsHeaders(new Response(JSON.stringify({ ok: false, error: "No content provided (images or text)" }), { status: 400, headers: { "Content-Type": "application/json" } }));
            }

            const apiResponse = await processCV(images, pdfText, portalType, env);

            return addCorsHeaders(
                new Response(JSON.stringify(apiResponse), {
                    status: apiResponse.ok ? 200 : apiResponse.status || 500,
                    headers: { "Content-Type": "application/json" },
                })
            );

        } catch (error) {
            console.error("Worker error:", error);
            return addCorsHeaders(new Response(JSON.stringify({ ok: false, error: "Internal server error: " + error.message }), { status: 500, headers: { "Content-Type": "application/json" } }));
        }
    },
};

async function processCV(images, pdfText, portalType, env) {
    const ctx = PORTAL_CONTEXTS[portalType] || PORTAL_CONTEXTS.fresher_fresher;

    const portalBlock = `## PORTAL CONTEXT
You are extracting a resume for a **${ctx.label}** on the My Student Club job portal.

### Portal-specific extraction rules:
${ctx.focus}

---
`;

    const systemPrompt = portalBlock + `You are an intelligent Resume Parser and Data Extraction assistant. Your task is to extract structured information from a resume to auto-fill a user profile on "My Student Club" job portal. The user is a Chartered Accountant (CA) or CA student.

Return STRICT JSON only — no markdown, no \`\`\`json wrappers.

### Field Mapping:

1.  **name**: Full Name.
2.  **contact_number**: Phone number (digits, keep country code if present).
3.  **linkedin_url**: Full LinkedIn Profile URL.
4.  **current_location**: City they are currently in.
5.  **gender**: "Male", "Female", or "Other" if mentioned.
6.  **date_of_birth**: Date of birth in YYYY-MM-DD format if mentioned.
7.  **profile_summary**: 2–3 sentence professional summary (compose from resume content if not explicitly stated).
8.  **languages_json**: Comma-separated string: "Language | Proficiency | Read (1/0) | Write (1/0) | Speak (1/0)". Default "Professional | 1 | 1 | 1" if not specified.
9.  **key_skills**: Comma-separated list of skills mentioned.
10. **achievements**: Brief summary of academic achievements, ranks, or high marks.

### CA Final Details (extract only if relevant to portal — see portal context above):
11. **ca_final_course**: "CA Final (Both Groups)", "CA Final G1", or "CA Final G2" — only if cleared or registered.
12. **ca_final_attempts_type**: "First Attempt" or "Other".
13. **ca_final_attempts**: Integer number of attempts.
14. **ca_final_clear_month**: Month cleared (e.g. "Jan", "May", "Nov") — ONLY if actually cleared.
15. **ca_final_clear_year**: 4-digit year cleared — ONLY if actually cleared.
16. **ca_final_air**: AIR integer, or null.
17. **ca_final_app_month**: Expected appearance month — ONLY if not yet cleared and upcoming attempt exists.
18. **ca_final_app_year**: Expected appearance year — ONLY if not yet cleared.

### CA Inter Details:
19. **ca_inter_course**: "CA Inter (Both Groups)", "CA Inter G1", or "CA Inter G2".
20. **ca_inter_attempts_type**: "First Attempt" or "Other".
21. **ca_inter_attempts**: Integer.
22. **ca_inter_clear_month**: Month cleared.
23. **ca_inter_clear_year**: 4-digit year.
24. **ca_inter_air**: AIR integer, or null.

### CA Foundation Details:
25. **ca_found_course**: "CA Foundation" if cleared.
26. **ca_found_attempts_type**: "First Attempt" or "Other".
27. **ca_found_attempts**: Integer.
28. **ca_found_clear_month**: Month cleared.
29. **ca_found_clear_year**: 4-digit year.

### Graduation:
30. **grad_degree**: "B.Com", "BBA", "BA", etc.
31. **grad_university**: University/Institute name.
32. **grad_year**: Passing year.
33. **grad_percentage**: Percentage or CGPA.

### Class XII:
34. **class12_board**: "CBSE", "ICSE / ISC", "State Board", etc.
35. **class12_school**: School name.
36. **class12_year**: Passing year.
37. **class12_percentage**: Percentage.

### Class X:
38. **class10_board**: "CBSE", "ICSE", "State Board", etc.
39. **class10_school**: School name.
40. **class10_year**: Passing year.
41. **class10_percentage**: Percentage.

### Articleship:
42. **articleship_firm_type**: "Big 4", "Big 6", "Big 10", "Mid Size Firm", "Small Size Firm", or "None".
43. **articleship_firm_name**: Name of the articleship CA firm.
44. **articleship_domain**: "Statutory Audit", "Internal Audit", "Direct Tax", "Indirect Tax", "Overall Exposure", or "Other".

### Industrial Training:
45. **industrial_training_company**: Company name if industrial training is mentioned.

### Employment (post-qualification jobs only — see portal context):
46. **is_current_employment**: "Yes" or "No".
47. **employment_type**: "Full-time", "Part-time", "Contract", "Internship", or "Freelance".
48. **emp_company_name**: Current/most-recent employer.
49. **emp_job_title**: Job title.
50. **emp_job_profile**: Full paragraph summarising all responsibilities and achievements for this role.
51. **emp_join_year**: Year started.
52. **emp_join_month**: Month started.

### Critical Rules:
- **Strict duplication prevention**: Articleship → articleship fields only. Industrial training → industrial_training_company only. Regular employment → emp_* fields only.
- **Attempt extraction**: Check "Remarks", "Achievements", "Attempts" columns. "Passed in 1st attempt" → attempts_type = "First Attempt", attempts = 1.
- **AIR implies first attempt**: If a rank is mentioned, set attempts = 1.
- **Follow portal context rules above** — skip fields listed as not relevant for this portal type.
- Return all numeric fields (attempts, AIR) as integers, not strings.
- Return empty string "" for fields not found — do not omit keys.
`;

    const primaryModel = "gemini-3.1-flash-lite";

    try {
        const imageParts = (images || []).map((imageData) => ({
            inline_data: { mime_type: "image/jpeg", data: imageData },
        }));

        const requestPayload = {
            contents: [{
                parts: [
                    ...imageParts,
                    { text: systemPrompt },
                    { text: pdfText ? `\n\n**Extracted Text from PDF:**\n${pdfText}` : '' }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 2500,
                responseMimeType: "application/json",
            }
        };

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${env.GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestPayload),
            }
        );

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Gemini API error: ${errorBody}`);
        }

        const data = await response.json();
        let responseText = null;

        if (data.candidates?.[0]?.content?.parts) {
            responseText = data.candidates[0].content.parts[0].text;
        }

        if (!responseText) throw new Error("No content returned from Gemini.");

        return { ok: true, response: responseText, status: 200 };

    } catch (primaryError) {
        console.warn("Primary model failed, falling back to Cloudflare Workers AI:", primaryError.message);

        try {
            let userMessageContent;

            if (images && images.length > 0) {
                userMessageContent = [];
                userMessageContent.push({
                    type: "text",
                    text: pdfText ? `**Extracted Text from PDF:**\n${pdfText}` : "Extract the requested fields from the provided resume images."
                });
                images.forEach((img) => {
                    userMessageContent.push({
                        type: "image_url",
                        image_url: { url: `data:image/jpeg;base64,${img}` }
                    });
                });
            } else {
                userMessageContent = `**Extracted Text from PDF:**\n${pdfText}`;
            }

            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessageContent }
            ];

            const cfResponse = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", { messages });
            const replyText = cfResponse.response || (cfResponse.choices?.[0]?.message?.content);

            if (!replyText) {
                return { ok: false, status: 500, response: "No content returned from Gemma 4." };
            }

            return { ok: true, response: replyText, status: 200 };

        } catch (fallbackError) {
            console.error("Fallback model error:", fallbackError);
            return { ok: false, status: 500, error: `Both models failed. Final error: ${fallbackError.message}` };
        }
    }
}
