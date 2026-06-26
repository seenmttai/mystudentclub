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
11. **ca_final_status**: (Semi-Qualified only) "Appearing", "Group 1 Pending", "Group 2 Pending", "Both Groups Pending", or "Not Pursuing" — only set for semi portal types.
12. **ca_final_groups_cleared**: (Semi-Qualified only) "None", "Group 1", "Group 2", or "Both" — which CA Final groups have been cleared so far.
13. **ca_final_course**: "CA Final (Both Groups)", "CA Final G1", or "CA Final G2" — only if cleared or registered.
14. **ca_final_attempts_type**: "First Attempt" or "Other".
15. **ca_final_attempts**: Integer number of attempts.
16. **ca_final_score**: Score percentage as string e.g. "62.5" — ONLY if actually cleared.
17. **ca_final_performance**: "All India Rank Holder", "Above 60%", or "Other" — ONLY if cleared.
18. **ca_final_clear_month**: Month cleared (e.g. "Jan", "May", "Nov") — ONLY if actually cleared.
19. **ca_final_clear_year**: 4-digit year cleared — ONLY if actually cleared.
20. **ca_final_air**: AIR integer, or null — ONLY if performance is "All India Rank Holder".
21. **ca_final_app_month**: Expected appearance month — ONLY if not yet cleared and upcoming attempt exists.
22. **ca_final_app_year**: Expected appearance year — ONLY if not yet cleared.

### CA Inter Details:
21. **ca_inter_course**: "CA Inter (Both Groups)", "CA Inter G1", or "CA Inter G2".
22. **ca_inter_attempts_type**: "First Attempt" or "Other".
23. **ca_inter_attempts**: Integer.
24. **ca_inter_score**: Score percentage as string.
25. **ca_inter_performance**: "All India Rank Holder", "Above 60%", or "Other".
26. **ca_inter_clear_month**: Month cleared.
27. **ca_inter_clear_year**: 4-digit year.
28. **ca_inter_air**: AIR integer, or null.

### CA Foundation Details:
29. **ca_found_course**: "CA Foundation" if cleared.
30. **ca_found_attempts_type**: "First Attempt" or "Other".
31. **ca_found_attempts**: Integer.
32. **ca_found_score**: Score percentage as string.
33. **ca_found_clear_month**: Month cleared.
34. **ca_found_clear_year**: 4-digit year.

### Graduation:
35. **grad_degree**: "B.Com", "BBA", "BA", etc.
36. **grad_college**: College/Institute name.
37. **grad_university**: University name.
38. **grad_status**: "Pursuing", "Graduated", or "Dropped".
39. **grad_year**: Passing year.
40. **grad_percentage**: Percentage or CGPA.

### Class XII:
41. **class12_board**: "CBSE", "ICSE / ISC", "State Board", etc.
42. **class12_school**: School name.
43. **class12_year**: Passing year.
44. **class12_percentage**: Percentage.

### Class X:
45. **class10_board**: "CBSE", "ICSE", "State Board", etc.
46. **class10_school**: School name.
47. **class10_year**: Passing year.
48. **class10_percentage**: Percentage.

### Articleship:
49. **articleship_firm_type**: "Big 4", "Big 6", "Big 10", "Mid Size Firm", "Small Size Firm", or "None".
50. **articleship_firm_name**: Name of the articleship CA firm.
51. **articleship_start_month**: Month articleship started (abbreviated: "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec").
52. **articleship_start_year**: Year articleship started (4-digit integer).
53. **articleship_end_month**: Month articleship ended or expected to end (abbreviated: "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec").
54. **articleship_end_year**: Year articleship ended or expected to end (4-digit integer).
55. **articleship_domain**: Comma-separated list of ALL domains the candidate worked in, from: "Statutory Audit", "Internal Audit & Risk", "SOX / IFC Controls", "Forensics & Compliance", "Direct Tax", "Indirect Tax (GST)", "International Taxation", "Transfer Pricing", "Accounting & Reporting", "FP&A", "Controllership", "Treasury", "Costing & Plant Finance", "Supply Chain Finance", "Commercial Finance", "Business Finance", "Consulting", "Due Diligence", "Valuation", "Deals & Transaction Advisory", "M&A Advisory", "Project Finance", "Banking & Credit", "Investment Banking", "Equity Research", "ESG", "Financial Reporting (IND AS / IFRS)", "Data Analytics", "Overall Exposure", "Other". Include every domain mentioned.
56. **articleship_client_industries**: Comma-separated list of client industries from: "Banking", "Financial Services", "FMCG", "Manufacturing", "Pharma", "IT", "E-Commerce", "Automobile", "Infrastructure", "Real Estate", "Consulting", "Retail", "Energy", "Telecom", "Logistics", "Others".
57. **articleship_responsibilities**: Paragraph summarising key responsibilities during articleship.

### Industrial Training:
58. **industrial_training_company**: Company name if industrial training is mentioned.
59. **it_industry**: Industry of the industrial training company.
60. **it_start_month**: Month IT started (abbreviated: "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec").
61. **it_start_year**: Year IT started (4-digit integer).
62. **it_end_month**: Month IT ended (abbreviated: "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec").
63. **it_end_year**: Year IT ended (4-digit integer).
64. **it_responsibilities**: Key responsibilities during industrial training.

### Employment (post-qualification jobs only — see portal context):
65. **is_current_employment**: "Yes" or "No".
66. **employment_type**: "Full-time", "Part-time", "Contract", "Internship", or "Freelance".
67. **emp_company_name**: Current/most-recent employer.
68. **emp_company_type**: "Big 4", "Big 6", "Big 10", "CA Firm", "MNC", "Listed Company", "Startup", "GCC / SSC", "PSU", or "Industry".
69. **emp_industry**: Industry of current employer.
70. **emp_domain**: Comma-separated list of ALL domains of work (from: "Statutory Audit", "Internal Audit & Risk", "SOX / IFC Controls", "Forensics & Compliance", "Direct Tax", "Indirect Tax (GST)", "International Taxation", "Transfer Pricing", "Accounting & Reporting", "FP&A", "Controllership", "Treasury", "Costing & Plant Finance", "Supply Chain Finance", "Commercial Finance", "Business Finance", "Consulting", "Due Diligence", "Valuation", "Deals & Transaction Advisory", "M&A Advisory", "Project Finance", "Banking & Credit", "Investment Banking", "Equity Research", "ESG", "Financial Reporting (IND AS / IFRS)", "Data Analytics", "Overall Exposure", "Other"). Include ALL domains mentioned — do NOT limit to one.
71. **emp_job_title**: Job title.
72. **emp_job_profile**: Full paragraph summarising all responsibilities and achievements for this role.
73. **emp_join_year**: Year started.
74. **emp_join_month**: Month started.
75. **emp_team_handling**: "Individual Contributor", "Managed 1–5 People", "Managed 6–20 People", or "Managed 20+ People" — only for experienced candidates.

### Previous Employment (if a second job is mentioned):
76. **prev_emp_company_name**: Previous employer name.
77. **prev_emp_company_type**: Type (same options as emp_company_type).
78. **prev_emp_industry**: Industry.
79. **prev_emp_domain**: Comma-separated list of ALL domains of work (same domain list as emp_domain). Include ALL domains mentioned — do NOT limit to one.
80. **prev_emp_job_title**: Designation.
81. **prev_emp_start_month**: Start month.
82. **prev_emp_start_year**: Start year.
83. **prev_emp_end_month**: End month.
84. **prev_emp_end_year**: End year.

### Achievements:
83. **achievement_air**: AIR or academic rank mentions (e.g. "CA Final AIR 42").
84. **achievement_scholarships**: Any scholarships mentioned.
85. **achievement_awards**: Awards or recognitions.
86. **achievement_leadership**: Leadership positions held.
87. **achievement_positions**: Positions of responsibility in college/institute.
88. **achievement_extracurricular**: Extracurricular activities.
89. **achievement_key**: Key professional/work achievements (e.g. cost savings, process improvements, revenue impact). Compose from resume content if not explicitly listed. Return empty string if none found.

### Certification (extract the primary or most notable certification from the resume):
90. **cert_name**: Name of the certification (e.g., "Financial Modeling Certification", "CFA Level 1", "DISA", "Certified Internal Auditor"). Return empty string if none found.
91. **cert_issuer**: Organization that issued the certification (e.g., "NSE Academy", "CFA Institute", "ICAI"). Return empty string if not mentioned.
92. **cert_month**: Month the certification was completed (abbreviated: "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"). Return empty string if not mentioned.
93. **cert_year**: Year the certification was completed as a 4-digit integer (e.g., 2022). Return empty string if not mentioned.
94. **cert_url**: Credential URL if explicitly mentioned. Return empty string if not found.

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
            // Gemma on Cloudflare is text-only — never pass image payloads
            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: pdfText ? `**Extracted Text from PDF:**\n${pdfText}` : "No text could be extracted from the resume." }
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
