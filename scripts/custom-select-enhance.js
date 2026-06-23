(function () {
  "use strict";

  const CHEVRON =
    '<svg class="cs-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>';

  function closeAllEnhanced(except) {
    document
      .querySelectorAll(".custom-select.cs-enhanced.open")
      .forEach((w) => {
        if (w === except) return;
        w.classList.remove("open");
        if (w._csDropdown) w._csDropdown.style.display = "none";
      });
  }

  function enhanceSelect(select) {
    if (select.dataset.csEnhanced || select.multiple) return;
    select.dataset.csEnhanced = "1";

    // Wrapper replaces the select in layout flow.
    const wrap = document.createElement("div");
    wrap.className = "custom-select cs-enhanced";
    // Preserve layout-affecting inline styles (e.g. side-by-side month/year).
    if (select.style.flex) {
      wrap.style.flex = select.style.flex;
      select.style.flex = "";
    }
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.style.display = "none"; // keep functional but hidden

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select-trigger";
    const labelSpan = document.createElement("span");
    labelSpan.className = "cs-label";
    trigger.appendChild(labelSpan);
    trigger.insertAdjacentHTML("beforeend", CHEVRON);
    wrap.appendChild(trigger);

    const dropdown = document.createElement("div");
    dropdown.className = "cs-dropdown";
    dropdown.style.display = "none";
    document.body.appendChild(dropdown);
    wrap._csDropdown = dropdown;

    function currentOption() {
      return select.options[select.selectedIndex] || null;
    }

    function syncLabel() {
      const opt = currentOption();
      labelSpan.textContent = opt ? opt.textContent.trim() : "";
      // A "placeholder" option is one with an empty value (e.g. "Select …").
      wrap.classList.toggle("has-value", !!select.value);
      if (select.disabled) wrap.classList.add("cs-disabled");
      else wrap.classList.remove("cs-disabled");
    }

    function buildOptions() {
      dropdown.innerHTML = "";
      Array.from(select.options).forEach((o) => {
        const item = document.createElement("div");
        item.className = "cs-option";
        item.textContent = o.textContent.trim();
        item.dataset.value = o.value;
        if (o.value === select.value) item.classList.add("selected");
        if (o.disabled) item.classList.add("cs-opt-disabled");
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          if (o.disabled) return;
          if (select.value !== o.value) {
            select.value = o.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          syncLabel();
          dropdown
            .querySelectorAll(".cs-option")
            .forEach((x) =>
              x.classList.toggle("selected", x.dataset.value === o.value),
            );
          closeAllEnhanced();
        });
        dropdown.appendChild(item);
      });
    }

    function open() {
      buildOptions();
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      dropdown.style.position = "fixed";
      dropdown.style.left = rect.left + "px";
      dropdown.style.width = rect.width + "px";
      dropdown.style.right = "auto";
      if (spaceBelow < 240) {
        dropdown.style.top = "auto";
        dropdown.style.bottom = window.innerHeight - rect.top + 4 + "px";
      } else {
        dropdown.style.top = rect.bottom + 4 + "px";
        dropdown.style.bottom = "auto";
      }
      dropdown.style.display = "block";
      wrap.classList.add("open");
    }

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (select.disabled) return;
      const isOpen = wrap.classList.contains("open");
      closeAllEnhanced();
      if (!isOpen) open();
    });

    // Native change (incl. our dispatched one) -> refresh label.
    select.addEventListener("change", syncLabel);

    // Catch programmatic `select.value = ...` so the label updates too.
    // (Assigning .value does NOT fire a change event natively.)
    const proto =
      window.HTMLSelectElement && window.HTMLSelectElement.prototype;
    const desc = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) {
      Object.defineProperty(select, "value", {
        configurable: true,
        get() {
          return desc.get.call(this);
        },
        set(v) {
          desc.set.call(this, v);
          syncLabel();
        },
      });
    }

    // Dynamically added/removed <option>s (e.g. year lists) -> resync.
    new MutationObserver(() => {
      syncLabel();
      if (wrap.classList.contains("open")) buildOptions();
    }).observe(select, { childList: true });

    syncLabel();
  }

  function enhanceAll(root) {
    (root || document)
      .querySelectorAll(".p2-card-form select, .p2-card select")
      .forEach(enhanceSelect);
  }

  function init() {
    enhanceAll(document);
    // Close on outside click / scroll of the page.
    document.addEventListener("click", () => closeAllEnhanced());
    window.addEventListener("scroll", () => closeAllEnhanced(), true);
    // Pick up any selects added later (defensive).
    new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches("select")) enhanceSelect(n);
          else enhanceAll(n);
        });
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
