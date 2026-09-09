// =======================================================
// PROFILE WIZARD — Mobile Implementation
// Self-contained onboarding flow for the Airy Flow profile UI.
// =======================================================

(function () {
  "use strict";

  const QUESTION_CONFIGS = {
    preferred_locations: {
      id: "preferred_locations",
      icon: "📍",
      question: "Where are you looking for opportunities?",
      hint: "Select all that apply — or type a city and press Enter",
      type: "chips_custom",
      options: [
        "Mumbai",
        "Delhi NCR",
        "Bangalore",
        "Hyderabad",
        "Pune",
        "Chennai",
        "Kolkata",
        "Ahmedabad",
        "Jaipur",
        "PAN India",
      ],
      profileKey: "preferred_locations",
      optional: true,
    },
    relocation: {
      id: "relocation",
      icon: "🔄",
      question: "Are you open to relocating?",
      type: "radio",
      options: [
        { label: "Yes, open to relocation", value: "Yes" },
        { label: "No, prefer current city", value: "No" },
        { label: "PAN India — anywhere", value: "PAN India" },
      ],
      profileKey: "relocation_preference",
      optional: false,
    },
    joining_date: {
      id: "joining_date",
      icon: "📅",
      question: "When can you start?",
      hint: "Earliest date you can join",
      type: "date",
      profileKey: "earliest_joining_date",
      optional: true,
    },
    expected_ctc: {
      id: "expected_ctc",
      icon: "💰",
      question: "What is your expected CTC?",
      hint: "Annual package in ₹",
      type: "text",
      profileKey: "expected_salary",
      placeholder: "e.g., 10,00,000",
      optional: true,
    },
    expected_ctc_experienced: {
      id: "expected_ctc",
      icon: "💰",
      question: "What is your expected CTC?",
      hint: "Annual package in ₹",
      type: "text",
      profileKey: "expected_salary",
      placeholder: "e.g., 40,00,000",
      optional: true,
    },
    expected_ctc_semi: {
      id: "expected_ctc",
      icon: "💰",
      question: "What is your expected CTC?",
      hint: "Annual package in ₹",
      type: "text",
      profileKey: "expected_salary",
      placeholder: "e.g., 8,00,000",
      optional: true,
    },
    expected_stipend_articleship: {
      id: "expected_stipend",
      icon: "💰",
      question: "What monthly stipend are you expecting?",
      hint: "In ₹ — leave blank if not sure",
      type: "text",
      profileKey: "expected_salary",
      placeholder: "e.g., 10,000",
      optional: true,
    },
    expected_stipend_industrial: {
      id: "expected_stipend",
      icon: "💰",
      question: "What monthly stipend are you expecting?",
      hint: "In ₹ — leave blank if not sure",
      type: "text",
      profileKey: "expected_salary",
      placeholder: "e.g., 25,000",
      optional: true,
    },
    current_ctc: {
      id: "current_ctc",
      icon: "💵",
      question: "What is your current CTC?",
      hint: "Annual package in ₹",
      type: "text",
      profileKey: "current_ctc",
      placeholder: "e.g., 30,00,000",
      optional: true,
    },
    preferred_domains: {
      id: "preferred_domains",
      icon: "🎯",
      question: "Which domains interest you?",
      hint: "Select all that apply",
      type: "chips_grouped",
      options: [
        {
          group: "Finance",
          items: [
            "FP&A",
            "Business Finance",
            "Controllership",
            "Financial Reporting",
            "Accounting & Reporting",
            "MIS Reporting",
            "Finance & Accounts",
            "Treasury",
            "Supply Chain Finance",
            "Costing & Plant Finance",
            "Banking & Credit",
            "Finance",
          ],
        },
        {
          group: "Audit, Risk & Compliance",
          items: [
            "Statutory Audit",
            "Internal Audit",
            "Concurrent Audit",
            "Risk Advisory",
            "SOX / IFC Controls",
            "Forensics",
            "Compliance",
          ],
        },
        {
          group: "Tax",
          items: [
            "Direct Tax",
            "Indirect Tax (GST)",
            "Transfer Pricing",
            "International Taxation",
            "M&A Tax",
          ],
        },
        {
          group: "Deals & Capital Markets",
          items: [
            "Deals & Transaction Advisory",
            "Due Diligence",
            "Valuation",
            "Investment Banking",
            "Equity Research",
            "Mergers & Acquisitions (M&A)",
          ],
        },
        { group: "Consulting", items: ["Management Consulting", "Strategy"] },
        {
          group: "Emerging",
          items: ["Data Analytics / Power BI", "ESG & Sustainability"],
        },
        { group: "Other", items: ["Other"] },
      ],
      profileKey: "preferred_domains",
      optional: true,
    },
    preferred_domains_industrial: {
      id: "preferred_domains",
      icon: "🎯",
      question: "Which domains interest you?",
      hint: "Select all that apply",
      type: "chips",
      options: [
        "FP&A",
        "Business Finance",
        "Supply Chain Finance",
        "Treasury",
        "Controllership",
        "Financial Reporting",
        "Accounting & Reporting",
        "MIS Reporting",
        "Finance & Accounts",
        "Banking & Credit",
        "Costing & Plant Finance",
        "Finance",
        "Internal Audit",
        "Direct Tax",
        "Indirect Tax (GST)",
        "Transfer Pricing",
        "Valuation",
        "Due Diligence",
        "Deals & Transaction Advisory",
        "Investment Banking",
        "Equity Research",
        "M&A",
        "Strategy",
        "Management Consulting",
        "Forensics",
        "Other",
      ],
      profileKey: "preferred_domains",
      optional: true,
    },
    preferred_firm_type: {
      id: "preferred_firm_type",
      icon: "🏢",
      question: "What type of CA firm are you looking for?",
      hint: "Select all that apply",
      type: "chips",
      options: ["Big 4", "Big 6", "Big 10", "Mid Size", "Small Size", "Any"],
      profileKey: "preferred_firm_type",
      optional: true,
    },
    preferred_industries: {
      id: "preferred_industries",
      icon: "🏭",
      question: "Which industries do you prefer?",
      hint: "Select all that apply",
      type: "chips",
      options: [
        "CA Firms",
        "Banking",
        "Financial Services",
        "FinTech",
        "Consulting",
        "E-Commerce",
        "FMCG",
        "Government / PSU",
        "Manufacturing",
        "IT & Technology",
        "Insurance",
        "Healthcare",
        "Automobile",
        "Infrastructure",
        "Energy & Oil",
        "Logistics",
        "Retail",
        "Telecom",
        "Media",
        "NGO",
        "Other",
      ],
      profileKey: "preferred_industries",
      optional: true,
    },
    preferred_industries_articleship: {
      id: "preferred_industries",
      icon: "🏭",
      question: "Which client industries or business types interest you?",
      hint: "Select all that apply",
      type: "chips",
      options: [
        "Listed Companies",
        "MNCs",
        "Startups",
        "SMEs",
        "Banking",
        "Financial Services",
        "FMCG",
        "Manufacturing",
        "IT & Technology",
        "E-Commerce",
        "Consulting",
        "Pharma & Healthcare",
        "Automobile",
        "Infrastructure",
        "Real Estate",
        "Retail",
        "Energy & Utilities",
        "Telecom",
        "Logistics",
        "Government & PSU",
        "Others",
      ],
      profileKey: "preferred_industries",
      optional: true,
    },
    notice_period: {
      id: "notice_period",
      icon: "📋",
      question: "What is your current notice period?",
      type: "radio",
      options: [
        { label: "Immediate Joiner", value: "Immediate Joiner" },
        { label: "15 Days or less", value: "15 Days or less" },
        { label: "1 Month", value: "1 Month" },
        { label: "2 Months", value: "2 Months" },
        { label: "3 Months", value: "3 Months" },
      ],
      profileKey: "notice_period",
      optional: true,
    },
    gender: {
      id: "gender",
      icon: "🧑",
      question: "What is your gender?",
      type: "radio",
      options: [
        { label: "Male", value: "Male" },
        { label: "Female", value: "Female" },
        { label: "Other", value: "Other" },
      ],
      profileKey: "gender",
      optional: true,
    },
    employment_status: {
      id: "employment_status",
      icon: "💼",
      question: "What is your current employment status?",
      type: "radio",
      options: [
        { label: "Currently Employed", value: "Employed" },
        { label: "Actively Looking", value: "Unemployed" },
      ],
      profileKey: "current_employment_status",
      optional: false,
    },
    yoe_experienced: {
      id: "yoe_experienced",
      icon: "📅",
      question: "How many years of post-qualification experience do you have?",
      type: "radio",
      options: [
        { label: "1 Year", value: "1 Year" },
        { label: "2 Years", value: "2 Years" },
        { label: "3 Years", value: "3 Years" },
        { label: "4 Years", value: "4 Years" },
        { label: "5 Years", value: "5 Years" },
        { label: "6–10 Years", value: "6 Years" },
        { label: "10+ Years", value: "10 Years" },
      ],
      profileKey: "emp_exp_years",
      optional: false,
    },
    yoe_semi: {
      id: "yoe_semi",
      icon: "📅",
      question: "How many years of work experience do you have?",
      type: "radio",
      options: [
        { label: "Less than 1 year", value: "0 Years" },
        { label: "1 Year", value: "1 Year" },
        { label: "2 Years", value: "2 Years" },
        { label: "3 Years", value: "3 Years" },
        { label: "4 Years", value: "4 Years" },
        { label: "5 Years", value: "5 Years" },
        { label: "6–10 Years", value: "6 Years" },
        { label: "10+ Years", value: "10 Years" },
      ],
      profileKey: "emp_exp_years",
      optional: false,
    },
  };

  const ROLE_QUESTIONS = {
    industrial: [
      "gender",
      "preferred_locations",
      "joining_date",
      "expected_stipend_industrial",
      "preferred_domains_industrial",
      "preferred_industries",
    ],
    articleship: [
      "gender",
      "preferred_locations",
      "joining_date",
      "expected_stipend_articleship",
      "preferred_firm_type",
      "preferred_industries_articleship",
    ],
    fresher_fresher: [
      "gender",
      "preferred_locations",
      "relocation",
      "joining_date",
      "expected_ctc",
      "preferred_domains",
      "preferred_industries",
    ],
    fresher_experienced: [
      "gender",
      "yoe_experienced",
      "preferred_locations",
      "relocation",
      "joining_date",
      "current_ctc",
      "expected_ctc_experienced",
      "preferred_domains",
      "preferred_industries",
      "employment_status",
      "notice_period",
    ],
    semi_fresher: [
      "gender",
      "preferred_locations",
      "relocation",
      "joining_date",
      "expected_ctc_semi",
      "preferred_domains",
      "preferred_industries",
      "employment_status",
      "notice_period",
    ],
    semi_experienced: [
      "gender",
      "yoe_semi",
      "preferred_locations",
      "relocation",
      "joining_date",
      "expected_ctc_semi",
      "preferred_domains",
      "preferred_industries",
      "employment_status",
      "notice_period",
    ],
  };

  const REQUIRED_FIELDS = [
    {
      id: "name",
      profileKey: "name",
      label: "Full Name",
      icon: "👤",
      type: "text",
      placeholder: "Your full name",
      optional: false,
    },
    {
      id: "contact_number",
      profileKey: "contact_number",
      label: "Phone Number",
      icon: "📱",
      type: "tel",
      placeholder: "10-digit number",
      optional: true,
    },
  ];

  const state = {
    phase: "type",
    programType: null,
    pendingType: null,
    profileData: {},
    answers: {},
    prefQueue: [],
    prefIdx: 0,
    missingQueue: [],
    missingIdx: 0,
    history: [],
    currentSlot: "a",
    includesTypeStep: true,
    transitioning: false,
    saving: false,
    services: {},
  };

  const dom = {};

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toList(value) {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value !== "string" || !value.trim()) return [];
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function valueForQuestion(config) {
    if (Object.prototype.hasOwnProperty.call(state.answers, config.id)) {
      return state.answers[config.id];
    }
    return state.profileData[config.profileKey] ?? null;
  }

  function notify(message, type = "info") {
    if (typeof state.services.showToast === "function") {
      state.services.showToast(message, type);
      return;
    }
    if (type === "error") console.error(message);
  }

  function cacheDom() {
    dom.wizard = document.getElementById("profile-wizard");
    dom.body = document.getElementById("wz-body");
    dom.screenA = document.getElementById("wz-screen-a");
    dom.screenB = document.getElementById("wz-screen-b");
    dom.fill = document.getElementById("wz-progress-fill");
    dom.progress = dom.fill?.parentElement || null;
    dom.pill = document.getElementById("wz-step-pill");
    dom.backBtn = document.getElementById("wz-back-btn");
    dom.nextBtn = document.getElementById("wz-next-btn");
    dom.skipBtn = document.getElementById("wz-skip-btn");
    return Boolean(
      dom.wizard &&
        dom.body &&
        dom.screenA &&
        dom.screenB &&
        dom.backBtn &&
        dom.nextBtn &&
        dom.skipBtn,
    );
  }

  function resetState(profileData, services) {
    state.phase = "type";
    state.programType = null;
    state.pendingType = null;
    state.profileData = profileData || {};
    state.answers = {};
    state.prefQueue = [];
    state.prefIdx = 0;
    state.missingQueue = [];
    state.missingIdx = 0;
    state.history = [];
    state.currentSlot = "a";
    state.includesTypeStep = true;
    state.transitioning = false;
    state.saving = false;
    state.services = services || {};
  }

  function init(profileData, lookingFor, services = {}) {
    const safeProfile = profileData && typeof profileData === "object" ? profileData : {};
    const effectiveLookingFor = lookingFor || safeProfile.looking_for || null;
    const isNewUser = !String(safeProfile.name || "").trim();
    const hasType = Boolean(effectiveLookingFor || safeProfile.job_preference);

    resetState(safeProfile, services);

    if (!cacheDom()) {
      showMain();
      return;
    }

    // Preserve wizard-only JSON properties when the regular profile form is
    // saved later, including for users who do not need to see the wizard.
    applyProfileToForm({
      ...safeProfile,
      ...(effectiveLookingFor ? { looking_for: effectiveLookingFor } : {}),
    });

    if (!isNewUser && hasType) {
      showMain();
      return;
    }

    const mappedType = mapLookingFor(
      effectiveLookingFor || safeProfile.job_preference,
      safeProfile.profile_wizard_type,
    );
    if (mappedType) {
      state.programType = mappedType;
      state.includesTypeStep = false;
      buildPrefQueue();
    }

    dom.wizard.classList.add("wz-visible");
    dom.wizard.setAttribute("aria-hidden", "false");
    dom.wizard.inert = false;
    document.body.style.overflow = "hidden";

    dom.nextBtn.onclick = handleNext;
    dom.backBtn.onclick = handleBack;
    dom.skipBtn.onclick = handleSkip;
    dom.body.onkeydown = (event) => {
      if (event.key !== "Enter" || state.transitioning || state.saving) return;
      if (document.activeElement?.id === "wz-custom-chip-input") return;
      if (document.activeElement?.tagName === "TEXTAREA") return;
      event.preventDefault();
      dom.nextBtn.click();
    };

    renderInitial(mappedType ? "prefs" : "type");
  }

  function showMain() {
    const main = document.getElementById("profile-main");
    const wizard = document.getElementById("profile-wizard");
    if (main) main.style.display = "";
    if (wizard) {
      if (wizard.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      wizard.classList.remove("wz-visible");
      wizard.setAttribute("aria-hidden", "true");
      wizard.inert = true;
    }
    document.body.style.overflow = "";
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
      main.removeAttribute("tabindex");
    }
  }

  function mapLookingFor(value, refinedType) {
    if (refinedType && ROLE_QUESTIONS[refinedType]) return refinedType;
    const map = {
      industrial: "industrial",
      "CA Industrial Training Default": "industrial",
      articleship: "articleship",
      "CA Articleship": "articleship",
      fresher: "fresher_fresher",
      fresher_fresher: "fresher_fresher",
      fresher_experienced: "fresher_experienced",
      "CA Fresher": "fresher_fresher",
      "CA Freshers": "fresher_fresher",
      "CA Fresher (Fresher)": "fresher_fresher",
      "CA Fresher (Experienced)": "fresher_experienced",
      semi: "semi_fresher",
      semi_fresher: "semi_fresher",
      semi_experienced: "semi_experienced",
      "Semi Qualified CA": "semi_fresher",
    };
    return map[value] || null;
  }

  function typeToLookingFor(type) {
    const map = {
      industrial: "CA Industrial Training Default",
      articleship: "CA Articleship",
      fresher_fresher: "CA Fresher",
      fresher_experienced: "CA Fresher",
      semi_fresher: "Semi Qualified CA",
      semi_experienced: "Semi Qualified CA",
    };
    return map[type] || "CA Fresher";
  }

  function typeToPortalPreference(type) {
    if (type === "industrial" || type === "articleship") return type;
    if (type?.startsWith("semi_")) return "semi";
    return "fresher";
  }

  function getCurrentPosition() {
    const typeSteps = state.includesTypeStep ? 1 : 0;
    if (state.phase === "type") return 1;
    if (state.phase === "prefs") return typeSteps + state.prefIdx + 1;
    if (state.phase === "missing") {
      return typeSteps + state.prefQueue.length + state.missingIdx + 1;
    }
    return typeSteps + state.prefQueue.length + state.missingQueue.length + 1;
  }

  function updateProgress() {
    const total =
      (state.includesTypeStep ? 1 : 0) +
      state.prefQueue.length +
      state.missingQueue.length +
      1;
    const current = Math.min(getCurrentPosition(), Math.max(total, 1));
    const percent = Math.round((current / Math.max(total, 1)) * 100);

    if (dom.fill) dom.fill.style.width = `${percent}%`;
    if (dom.progress) dom.progress.setAttribute("aria-valuenow", String(percent));

    let label = `Step ${current}`;
    if (state.phase === "prefs") {
      label = `Preferences ${state.prefIdx + 1}/${state.prefQueue.length}`;
    } else if (state.phase === "missing") {
      label = `Details ${state.missingIdx + 1}/${state.missingQueue.length}`;
    } else if (state.phase === "publish") {
      label = "Complete";
    }
    if (dom.pill) dom.pill.textContent = label;
  }

  function updateNavigation() {
    const config =
      state.phase === "prefs" ? QUESTION_CONFIGS[state.prefQueue[state.prefIdx]] : null;
    const missingField =
      state.phase === "missing" ? state.missingQueue[state.missingIdx] : null;
    const canSkip = Boolean(config?.optional || missingField?.optional);

    dom.backBtn.style.visibility =
      state.history.length && state.phase !== "publish" ? "visible" : "hidden";
    dom.skipBtn.style.display = canSkip ? "" : "none";
    dom.skipBtn.textContent = "Skip";
    dom.nextBtn.style.display = state.phase === "publish" ? "none" : "";
    dom.nextBtn.textContent = "Continue →";
    dom.nextBtn.disabled = state.phase === "type" && !state.pendingType;
  }

  function renderInitial(phase) {
    state.phase = phase;
    dom.screenA.innerHTML = buildScreen(phase);
    dom.screenA.className = "wz-screen wz-screen-a wz-active";
    dom.screenB.innerHTML = "";
    dom.screenB.className = "wz-screen wz-screen-b";
    state.currentSlot = "a";
    updateProgress();
    updateNavigation();
    mountScreen(phase, dom.screenA);
    focusScreen(dom.screenA);
  }

  function goTo(phase, direction) {
    if (state.transitioning) return;
    state.transitioning = true;
    state.phase = phase;
    updateProgress();

    const currentSlot = state.currentSlot;
    const nextSlot = currentSlot === "a" ? "b" : "a";
    const currentScreen = document.getElementById(`wz-screen-${currentSlot}`);
    const nextScreen = document.getElementById(`wz-screen-${nextSlot}`);
    const directionClass = direction === "forward" ? "fwd" : "back";

    nextScreen.innerHTML = buildScreen(phase);
    nextScreen.className = `wz-screen wz-screen-${nextSlot} wz-enter-${directionClass}`;
    mountScreen(phase, nextScreen);
    void nextScreen.offsetHeight;

    requestAnimationFrame(() => {
      currentScreen.classList.remove("wz-active");
      currentScreen.classList.add(
        direction === "forward" ? "wz-exit-fwd" : "wz-exit-back",
      );
      nextScreen.classList.remove("wz-enter-fwd", "wz-enter-back");
      nextScreen.classList.add("wz-active");
      state.currentSlot = nextSlot;
      updateNavigation();

      window.setTimeout(() => {
        currentScreen.innerHTML = "";
        currentScreen.className = `wz-screen wz-screen-${currentSlot}`;
        state.transitioning = false;
        focusScreen(nextScreen);
      }, 400);
    });
  }

  function focusScreen(screen) {
    const focusTarget = screen.querySelector(
      ".wz-text-input, .wz-type-card, .wz-radio-card, .wz-chip",
    );
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }

  function buildScreen(phase) {
    if (phase === "type") return buildType();
    if (phase === "prefs") {
      return buildQuestion(QUESTION_CONFIGS[state.prefQueue[state.prefIdx]]);
    }
    if (phase === "missing") return buildMissing();
    if (phase === "publish") return buildPublish();
    return '<div class="wz-inner"><p>Loading…</p></div>';
  }

  function buildType() {
    const cards = [
      ["articleship", "📁", "CA Articleship", "Article positions at CA firms"],
      ["industrial", "🏭", "Industrial Training", "Training roles in companies"],
      ["fresher_fresher", "🎉", "CA Fresher", "Just qualified, up to 2 years experience"],
      ["fresher_experienced", "💼", "Experienced CA", "Qualified with 3+ years experience"],
      ["semi_fresher", "📚", "Semi-Qualified", "CA Inter or pursuing Final"],
    ];
    return `<div class="wz-inner">
      <div class="wz-q-icon" aria-hidden="true">🎓</div>
      <h2 class="wz-q-title">What are you looking for?</h2>
      <p class="wz-q-hint">Choose the option that best describes your current goal.</p>
      <div class="wz-type-grid">${cards
        .map(
          ([type, icon, label, description]) => `<button type="button"
            class="wz-type-card${state.pendingType === type ? " wz-selected" : ""}"
            data-type="${type}" aria-pressed="${state.pendingType === type}">
            <div class="wz-type-icon" aria-hidden="true">${icon}</div>
            <div class="wz-type-label">${escapeHtml(label)}</div>
            <div class="wz-type-sub">${escapeHtml(description)}</div>
          </button>`,
        )
        .join("")}</div>
    </div>`;
  }

  function buildQuestion(config) {
    if (!config) return '<div class="wz-inner"><p>Loading…</p></div>';
    const currentValue = valueForQuestion(config);
    const selectedValues = toList(currentValue);
    let content = "";

    if (config.type === "radio") {
      content = `<div class="wz-radio-grid">${config.options
        .map((option) => {
          const value = typeof option === "object" ? option.value : option;
          const label = typeof option === "object" ? option.label : option;
          const sub = typeof option === "object" ? option.sub : "";
          const selected = String(currentValue ?? "") === String(value);
          return `<button type="button" class="wz-radio-card${selected ? " wz-selected" : ""}"
            data-val="${escapeHtml(value)}" aria-pressed="${selected}">
            <span class="wz-radio-dot" aria-hidden="true"></span>
            <span><span class="wz-radio-label">${escapeHtml(label)}</span>${
              sub ? `<span class="wz-radio-sub">${escapeHtml(sub)}</span>` : ""
            }</span>
          </button>`;
        })
        .join("")}</div>`;
    } else if (config.type === "chips" || config.type === "chips_custom") {
      const options = [...config.options];
      if (config.type === "chips_custom") {
        selectedValues.forEach((value) => {
          if (!options.includes(value)) options.push(value);
        });
      }
      const chips = options
        .map((option) => buildChip(option, selectedValues.includes(option)))
        .join("");
      const customInput =
        config.type === "chips_custom"
          ? '<div class="wz-custom-chip-wrap"><input id="wz-custom-chip-input" class="wz-text-input wz-custom-chip-input" type="text" placeholder="Type a city, press Enter…" aria-label="Add another city"></div>'
          : "";
      content = `<div class="wz-chip-grid" id="wz-q-chips">${chips}</div>${customInput}`;
    } else if (config.type === "chips_grouped") {
      content = `<div class="wz-chip-grid" id="wz-q-chips">${config.options
        .map(
          (group) =>
            `<div class="wz-chip-group-label">${escapeHtml(group.group)}</div>` +
            group.items
              .map((item) => buildChip(item, selectedValues.includes(item)))
              .join(""),
        )
        .join("")}</div>`;
    } else if (config.type === "date") {
      content = `<input id="wz-q-date" type="date" class="wz-text-input wz-input-narrow" value="${escapeHtml(currentValue || "")}">`;
    } else {
      content = `<input id="wz-q-text" type="${config.type === "tel" ? "tel" : "text"}"
        class="wz-text-input wz-input-narrow" placeholder="${escapeHtml(
          config.placeholder || "",
        )}" value="${escapeHtml(currentValue || "")}">`;
    }

    return `<div class="wz-inner">
      <div class="wz-q-icon" aria-hidden="true">${config.icon}</div>
      <h2 class="wz-q-title">${escapeHtml(config.question)}</h2>
      ${config.hint ? `<p class="wz-q-hint">${escapeHtml(config.hint)}</p>` : ""}
      ${content}
    </div>`;
  }

  function buildChip(value, selected) {
    return `<button type="button" class="wz-chip${selected ? " wz-selected" : ""}"
      data-val="${escapeHtml(value)}" aria-pressed="${selected}">${escapeHtml(value)}</button>`;
  }

  function buildMissing() {
    const field = state.missingQueue[state.missingIdx];
    if (!field) return "";
    const savedValue =
      state.answers[`missing_${field.id}`] ?? state.profileData[field.profileKey] ?? "";
    return `<div class="wz-inner">
      <div class="wz-q-icon" aria-hidden="true">${field.icon}</div>
      <h2 class="wz-q-title">${escapeHtml(field.label)}</h2>
      <p class="wz-q-hint">Just a few more details to complete your profile.</p>
      <input id="wz-missing-input" type="${field.type}" class="wz-text-input wz-input-narrow"
        placeholder="${escapeHtml(field.placeholder)}" value="${escapeHtml(savedValue)}">
    </div>`;
  }

  function buildPublish() {
    const name = state.answers.missing_name || state.profileData.name || "there";
    const firstName = String(name).trim().split(/\s+/)[0] || "there";
    return `<div class="wz-inner wz-publish-screen">
      <div class="wz-publish-icon" aria-hidden="true">🎉</div>
      <h2 class="wz-publish-title">You're all set, ${escapeHtml(firstName)}!</h2>
      <p class="wz-publish-sub">Your profile is ready. Recruiters can now find you on My Student Club.</p>
      <div class="wz-strength">
        <div class="wz-strength-label"><span>Profile Strength</span><span id="wz-pct-label">—</span></div>
        <div class="wz-completeness-bar-wrap">
          <div class="wz-completeness-bar" id="wz-comp-bar"></div>
        </div>
      </div>
      <div class="wz-publish-actions">
        <button type="button" class="wz-btn-primary" id="wz-go-profile">View My Profile →</button>
        <button type="button" class="wz-btn-secondary" id="wz-complete-later">Complete Later</button>
      </div>
      <p class="wz-save-error" id="wz-save-error" role="alert" hidden></p>
    </div>`;
  }

  function mountScreen(phase, screen) {
    if (phase === "type") mountType(screen);
    else if (phase === "prefs") mountQuestion(screen);
    else if (phase === "publish") mountPublish(screen);
  }

  function mountType(screen) {
    screen.querySelectorAll(".wz-type-card").forEach((card) => {
      card.addEventListener("click", () => {
        screen.querySelectorAll(".wz-type-card").forEach((candidate) => {
          candidate.classList.remove("wz-selected");
          candidate.setAttribute("aria-pressed", "false");
        });
        card.classList.add("wz-selected");
        card.setAttribute("aria-pressed", "true");
        state.pendingType = card.dataset.type;
        dom.nextBtn.disabled = false;
      });
    });
  }

  function mountQuestion(screen) {
    const config = QUESTION_CONFIGS[state.prefQueue[state.prefIdx]];
    if (!config) return;

    if (config.type === "radio") {
      screen.querySelectorAll(".wz-radio-card").forEach((card) => {
        card.addEventListener("click", () => {
          screen.querySelectorAll(".wz-radio-card").forEach((candidate) => {
            candidate.classList.remove("wz-selected");
            candidate.setAttribute("aria-pressed", "false");
          });
          card.classList.add("wz-selected");
          card.setAttribute("aria-pressed", "true");
        });
      });
    } else if (["chips", "chips_custom", "chips_grouped"].includes(config.type)) {
      bindChips(screen);
      const customInput = screen.querySelector("#wz-custom-chip-input");
      if (customInput) {
        customInput.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          addCustomChip(screen, customInput);
        });
      }
    }
  }

  function bindChips(screen) {
    screen.querySelectorAll(".wz-chip").forEach((chip) => {
      chip.onclick = () => {
        const selected = chip.classList.toggle("wz-selected");
        chip.setAttribute("aria-pressed", String(selected));
      };
    });
  }

  function addCustomChip(screen, input) {
    const value = input.value.trim();
    const grid = screen.querySelector("#wz-q-chips");
    if (!value || !grid) return;
    const existing = Array.from(grid.querySelectorAll(".wz-chip")).find(
      (chip) => chip.dataset.val.toLowerCase() === value.toLowerCase(),
    );
    if (existing) {
      existing.classList.add("wz-selected");
      existing.setAttribute("aria-pressed", "true");
    } else {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = buildChip(value, true);
      const chip = wrapper.firstElementChild;
      grid.appendChild(chip);
      bindChips(screen);
    }
    input.value = "";
  }

  function mountPublish(screen) {
    window.setTimeout(() => {
      const percent = calculateCompleteness();
      const bar = screen.querySelector("#wz-comp-bar");
      const label = screen.querySelector("#wz-pct-label");
      if (bar) bar.style.width = `${percent}%`;
      if (label) label.textContent = `${percent}%`;
    }, 150);

    screen.querySelector("#wz-go-profile")?.addEventListener("click", finishWizard);
    screen.querySelector("#wz-complete-later")?.addEventListener("click", finishWizard);
  }

  function handleNext() {
    if (state.transitioning || state.saving) return;

    if (state.phase === "type") {
      if (!state.pendingType) {
        notify("Please select what you are looking for.", "warning");
        return;
      }
      state.programType = state.pendingType;
      buildPrefQueue();
      state.history.push({ phase: "type" });
      goTo("prefs", "forward");
      return;
    }

    if (state.phase === "prefs") {
      const config = QUESTION_CONFIGS[state.prefQueue[state.prefIdx]];
      const value = collectPrefAnswer();
      if (!config?.optional && isEmptyAnswer(value)) {
        notify("Please select an option to continue.", "warning");
        return;
      }
      advancePref();
      return;
    }

    if (state.phase === "missing") {
      const field = state.missingQueue[state.missingIdx];
      const screen = document.getElementById(`wz-screen-${state.currentSlot}`);
      const value = screen?.querySelector("#wz-missing-input")?.value.trim() || "";
      if (field && !field.optional && !value) {
        notify(`${field.label} is required.`, "warning");
        return;
      }
      if (value) state.answers[`missing_${field.id}`] = value;
      else delete state.answers[`missing_${field.id}`];
      advanceMissing();
    }
  }

  function handleSkip() {
    if (state.transitioning || state.saving) return;
    if (state.phase === "prefs") {
      const config = QUESTION_CONFIGS[state.prefQueue[state.prefIdx]];
      if (!config?.optional) return;
      delete state.answers[config.id];
      advancePref();
    } else if (state.phase === "missing") {
      const field = state.missingQueue[state.missingIdx];
      if (!field?.optional) return;
      delete state.answers[`missing_${field.id}`];
      advanceMissing();
    }
  }

  function handleBack() {
    if (state.transitioning || state.saving) return;
    const previous = state.history.pop();
    if (!previous) return;
    if (previous.phase === "prefs") state.prefIdx = previous.idx;
    if (previous.phase === "missing") state.missingIdx = previous.idx;
    goTo(previous.phase, "back");
  }

  function buildPrefQueue() {
    state.prefQueue = ROLE_QUESTIONS[state.programType] || ROLE_QUESTIONS.fresher_fresher;
    state.prefIdx = 0;
  }

  function collectPrefAnswer() {
    const config = QUESTION_CONFIGS[state.prefQueue[state.prefIdx]];
    const screen = document.getElementById(`wz-screen-${state.currentSlot}`);
    if (!config || !screen) return null;
    let value = null;

    if (config.type === "radio") {
      value = screen.querySelector(".wz-radio-card.wz-selected")?.dataset.val || null;
    } else if (["chips", "chips_custom", "chips_grouped"].includes(config.type)) {
      const values = Array.from(screen.querySelectorAll(".wz-chip.wz-selected")).map(
        (chip) => chip.dataset.val,
      );
      value = values.length ? values : null;
    } else if (config.type === "date") {
      value = screen.querySelector("#wz-q-date")?.value || null;
    } else {
      value = screen.querySelector("#wz-q-text")?.value.trim() || null;
    }

    if (value === null) delete state.answers[config.id];
    else state.answers[config.id] = value;
    return value;
  }

  function isEmptyAnswer(value) {
    return value == null || value === "" || (Array.isArray(value) && !value.length);
  }

  function advancePref() {
    state.history.push({ phase: "prefs", idx: state.prefIdx });
    state.prefIdx += 1;
    if (state.prefIdx < state.prefQueue.length) {
      goTo("prefs", "forward");
      return;
    }
    buildMissingQueue();
    goTo(state.missingQueue.length ? "missing" : "publish", "forward");
  }

  function buildMissingQueue() {
    state.missingQueue = REQUIRED_FIELDS.filter(
      (field) => !String(state.profileData[field.profileKey] || "").trim(),
    );
    state.missingIdx = 0;
  }

  function advanceMissing() {
    state.history.push({ phase: "missing", idx: state.missingIdx });
    state.missingIdx += 1;
    goTo(state.missingIdx < state.missingQueue.length ? "missing" : "publish", "forward");
  }

  function buildProfileUpdates() {
    const updates = {};
    state.prefQueue.forEach((questionKey) => {
      const config = QUESTION_CONFIGS[questionKey];
      if (!config || !Object.prototype.hasOwnProperty.call(state.answers, config.id)) return;
      const value = state.answers[config.id];
      updates[config.profileKey] = Array.isArray(value) ? value.join(", ") : value;
    });
    REQUIRED_FIELDS.forEach((field) => {
      const value = state.answers[`missing_${field.id}`];
      if (value) updates[field.profileKey] = value;
    });
    return updates;
  }

  function getProjectedProfile() {
    const lookingFor = typeToLookingFor(state.programType);
    return {
      ...state.profileData,
      ...buildProfileUpdates(),
      looking_for: lookingFor,
      job_preference: typeToPortalPreference(state.programType),
      profile_wizard_type: state.programType,
    };
  }

  function calculateCompleteness() {
    const profile = getProjectedProfile();
    const checks = [
      ["name", 15],
      ["contact_number", 10],
      ["looking_for", 10],
      ["preferred_locations", 10],
      ["preferred_domains", 10],
      ["preferred_industries", 8],
      ["expected_salary", 8],
      ["gender", 5],
      ["relocation_preference", 6],
      ["earliest_joining_date", 5],
      ["notice_period", 5],
      ["preferred_firm_type", 8],
    ];
    return Math.min(
      100,
      checks.reduce((score, [key, points]) => score + (profile[key] ? points : 0), 0),
    );
  }

  function ensureFormField(name) {
    const form = document.getElementById("profile-form");
    if (!form) return null;
    let field = form.elements.namedItem(name);
    if (field && "value" in field) return field;
    field = document.createElement("input");
    field.type = "hidden";
    field.name = name;
    field.id = `wz-profile-${name}`;
    form.appendChild(field);
    return field;
  }

  function applyProfileToForm(profile) {
    const wizardOnlyKeys = [
      "looking_for",
      "profile_wizard_type",
      "preferred_domains",
      "preferred_industries",
      "preferred_firm_type",
      "relocation_preference",
      "current_employment_status",
    ];
    wizardOnlyKeys.forEach(ensureFormField);

    Object.entries(profile).forEach(([key, value]) => {
      const field = document.getElementById(key) ||
        (wizardOnlyKeys.includes(key) ? ensureFormField(key) : null);
      if (!field || !("value" in field)) return;
      field.value = Array.isArray(value) ? value.join(", ") : value ?? "";
    });
    document.getElementById("job_preference")?.dispatchEvent(new Event("change"));
  }

  function setPublishSaving(saving) {
    state.saving = saving;
    const screen = document.getElementById(`wz-screen-${state.currentSlot}`);
    const primary = screen?.querySelector("#wz-go-profile");
    const secondary = screen?.querySelector("#wz-complete-later");
    if (primary) {
      primary.disabled = saving;
      primary.textContent = saving ? "Saving…" : "View My Profile →";
    }
    if (secondary) secondary.disabled = saving;
  }

  async function finishWizard() {
    if (state.saving) return;
    setPublishSaving(true);
    const profile = getProjectedProfile();
    const lookingFor = typeToLookingFor(state.programType);

    try {
      const client = state.services.supabaseClient;
      const userId = state.services.userId;
      if (!client || !userId) throw new Error("Your session has expired. Please reload and sign in again.");

      const { error } = await client.from("profiles").upsert({
        uuid: userId,
        profile,
        looking_for: lookingFor,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;

      applyProfileToForm(profile);
      state.profileData = profile;
      localStorage.setItem("userProfileData", JSON.stringify(profile));
      localStorage.setItem("userJobPreference", profile.job_preference);
      sessionStorage.removeItem("msc_portal_redirected");
      if (typeof state.services.onSaved === "function") state.services.onSaved(profile);
      notify("Profile created successfully!", "success");
      showMain();
    } catch (error) {
      console.error("Wizard save error:", error);
      const message = error?.message || "We couldn't save your profile. Please try again.";
      const screen = document.getElementById(`wz-screen-${state.currentSlot}`);
      const errorElement = screen?.querySelector("#wz-save-error");
      if (errorElement) {
        errorElement.hidden = false;
        errorElement.textContent = message;
      }
      notify(message, "error");
      setPublishSaving(false);
    }
  }

  window.WZ = { init };
})();
