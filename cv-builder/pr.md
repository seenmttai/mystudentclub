# CV Builder V2 - PR Summary

## Overview
This PR upgrades CV Builder to a stable V2 with universal template support, custom sections, reliable section ordering, global undo/redo history, improved contact rendering, richer editing UX, and mobile/responsive fixes.

## Goals Delivered
- Universalized templates to support all core resume sections consistently.
- Added robust custom section support across editor + preview + templates.
- Fixed section reordering reliability with wrapper-based section architecture.
- Added global undo/redo for all key user changes.
- Improved contact rendering (clickable links, icons, extra links, location).
- Improved preview/editor UX and mobile behavior.

## Major Changes

### 1. Universal Template Support
- Standardized section handling across all CV templates (`cv1` to `cv13`) so each template can render:
  - Summary
  - Education
  - Experience
  - Projects
  - Certifications
  - Achievements
  - Leadership
  - Interests
  - Skills
  - Custom sections
- Removed fragile sibling-guessing behavior and moved to consistent section wrapper logic (`.sortable-section` + `data-section-id`).
- Fixed multiple template-specific styling/render bugs where sections were rendering outside expected table/section structure.

### 2. Custom Sections (End-to-End)
- Added editor support to create/remove/edit custom sections and items.
- Custom sections are persisted, previewed, and included in section order.
- Rendering now follows template-compatible section styling paths instead of raw/plain fallback output.

### 3. Section Reordering
- Implemented/normalized wrapper-based section reorder flow.
- Reordering now works against section wrappers (not raw sibling nodes), improving reliability for preview/export consistency.
- Added reorder controls in editor and preview-area workflow.

### 4. Global Undo/Redo
- Added global undo/redo state history with keyboard shortcuts and UI controls.
- Supports broad change types:
  - form edits
  - section reorder
  - AI refinements
  - imported/loaded data changes
  - template changes
- Added mobile-friendly undo/redo placement and improved icon/UI visibility.

### 5. Contact System Refactor
- Refactored contact rendering to structured fields:
  - phone, email, linkedin, location, social links
- Made contact links clickable in templates (including additional/social links).
- Added icon-based contact rendering and normalized behavior across templates.
- Removed legacy free-text contact field dependency in input flow.
- Fixed template-specific contact rendering issues (including `cv11` behavior).

### 6. Template/Style Fixes Across CVs
- Fixed several section CSS regressions and missing borders in templates (including grid/minimalist/classic variants).
- Fixed left-column alignment and layout issues in templates with label/left columns.
- Fixed project/experience render conflicts in templates where project content appeared under experience blocks.
- Ensured custom and reordered sections follow each template’s native visual style.

### 7. Preview and Data Behavior
- Improved preview bootstrapping/fallback logic.
- Demo/template preview behavior refined (template exploration vs user-input rendering expectations).
- Updated guided walkthrough content to include new V2 capabilities (reorder, undo/redo, etc.).

### 8. Rich Text Editing (V2 Enhancement)
- Integrated Quill-based rich editor for Summary (with fallback handling).
- Added formatting support (bold/italic/underline, list, links, clear formatting).
- Replaced browser prompt for links with custom in-editor link popover UI.
- Added toolbar tooltips for formatting actions.
- Extended rich editor behavior to additional list-style fields:
  - achievements
  - leadership
  - interests
  - custom section items
- Added sanitization and rendering guards to keep rich text safe and layout-stable.
- Added overflow guards to keep list formatting inside template borders.

### 9. Mobile/Responsive Improvements
- Fixed preview visibility and reorder drawer behavior on mobile.
- Improved placement/visibility of undo-redo controls on small screens.
- Fixed toolbar/icon distortion issues.
- Updated branding area behavior for mobile and tablet.

### 10. Branding + Header Updates
- Updated builder branding to My Student Club logo.
- Made logo clickable to main site (`/`).
- Kept Beta badge visible on desktop and mobile.
- Added live completion percentage (`%`) beside progress bar.

## Data Model / Behavior Notes
- Added/normalized robust state shape checks via `ensureCvDataShape()`.
- Kept backward compatibility for previously saved local snapshots/data.
- Export filename currently derives from user name (safe filename normalization).

## Files Touched (High Level)
- `cv-builder/index.html`
- `cv-builder/cv-script.js`
- `cv-builder/cv-common.js`
- `cv-builder/cv-styles.css`
- Multiple template files (`cv1.html` ... `cv13.html`) for section and style consistency fixes.

## QA Checklist
- [ ] All templates (`cv1`-`cv13`) render all core sections correctly.
- [ ] Custom section create/edit/delete works and renders correctly in preview.
- [ ] Section reorder works reliably across templates.
- [ ] Undo/redo works for edits, reorder, AI refine, imports, and template changes.
- [ ] Contact links (phone/email/linkedin/social links) are clickable across templates.
- [ ] Additional links render correctly in contact area.
- [ ] Rich text formatting renders correctly and does not overflow section borders.
- [ ] Mobile layout: preview, reorder drawer, undo/redo, branding visible and usable.
- [ ] PDF export renders expected template output.

## Risk / Follow-up
- Rich editor is now enabled for selected sections; experience/project bullet editors can be migrated in a dedicated follow-up if needed with bullet-array compatibility checks.
- Continue template-by-template visual QA for edge-case content length and print output.

