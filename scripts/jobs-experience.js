/* Accessibility and small presentation enhancements; the portal owns all job data and actions. */
(() => {
  'use strict';
  if (!document.body.classList.contains('msc-jobs')) return;

  const jobs = document.getElementById('jobs');
  const summary = document.getElementById('jobs-results-summary');
  const loader = document.getElementById('loader');
  function updateResults() {
    if (!jobs || !summary) return;
    const count = jobs.querySelectorAll('.job-card').length;
    const loading = loader && getComputedStyle(loader).display !== 'none';
    jobs.setAttribute('aria-busy', String(Boolean(loading)));
    if (count) summary.textContent = `${count} ${count === 1 ? 'opportunity' : 'opportunities'} loaded`;
    else if (jobs.querySelector('.jobs-load-error')) summary.textContent = 'Opportunities could not be loaded';
    else if (jobs.querySelector('.jobs-empty-state, .no-jobs-found')) summary.textContent = 'No matching opportunities';
    else if (loading) summary.textContent = 'Finding opportunities…';
    jobs.querySelectorAll('.job-card-bookmark').forEach(button => {
      const saved = button.classList.contains('saved');
      const company = button.closest('.job-card')?.querySelector('.job-card-company')?.textContent.trim() || 'this company';
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', `${saved ? 'Unsave' : 'Save'} job at ${company}`);
    });
  }
  if (jobs) new MutationObserver(updateResults).observe(jobs, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  if (loader) new MutationObserver(updateResults).observe(loader, { attributes: true, attributeFilter: ['style'] });
  updateResults();

  // Both dialogs keep keyboard focus inside and return it to the triggering control.
  const dialogs = [
    { overlay: document.getElementById('filterModalOverlay'), selector: '.filter-modal-content', closeId: 'closeFilterModalBtn', isOpen: el => el.classList.contains('show') },
    { overlay: document.getElementById('modal'), selector: '.modal-dialog', closeId: 'modalCloseBtn', isOpen: el => getComputedStyle(el).display !== 'none' }
  ].filter(item => item.overlay);
  let activeDialog = null;
  let returnFocus = null;
  let previousOverflow = '';
  dialogs.forEach(item => {
    const dialog = item.overlay.querySelector(item.selector);
    if (!dialog) return;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('tabindex', '-1');
    if (!dialog.hasAttribute('aria-labelledby')) dialog.setAttribute('aria-label', 'Job details');
    item.dialog = dialog;
    let wasOpen = false;
    const syncDialog = () => {
      const open = item.isOpen(item.overlay);
      item.overlay.setAttribute('aria-hidden', String(!open));
      if (open && !wasOpen) {
        returnFocus = document.activeElement;
        previousOverflow = document.body.style.overflow === 'hidden' ? '' : document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        activeDialog = item;
        const title = dialog.querySelector('h2');
        if (title) {
          title.id = 'job-details-title';
          dialog.setAttribute('aria-labelledby', title.id);
          dialog.removeAttribute('aria-label');
        }
        dialog.focus({ preventScroll: true });
      } else if (!open && wasOpen && activeDialog === item) {
        activeDialog = null;
        document.body.style.overflow = previousOverflow;
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      }
      wasOpen = open;
    };
    new MutationObserver(syncDialog).observe(item.overlay, { attributes: true, attributeFilter: ['class', 'style'] });
    syncDialog();
  });
  document.addEventListener('keydown', event => {
    if (!activeDialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      document.getElementById(activeDialog.closeId)?.click();
      return;
    }
    if (event.key !== 'Tab') return;
    const nodes = [...activeDialog.dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
      .filter(el => !el.closest('[hidden]') && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length);
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (!first) { event.preventDefault(); activeDialog.dialog.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === activeDialog.dialog)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !activeDialog.dialog.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });

  // Generated compensation range controls retain a name even when their original select is replaced.
  const labelGeneratedControls = () => {
    document.querySelectorAll('.stipend-min-input').forEach(input => { if (!input.hasAttribute('aria-label')) input.setAttribute('aria-label', 'Minimum compensation'); });
    document.querySelectorAll('.stipend-max-input').forEach(input => { if (!input.hasAttribute('aria-label')) input.setAttribute('aria-label', 'Maximum compensation'); });
    document.querySelectorAll('.pill-options .pill-btn, .stipend-chip').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('active'))));
  };
  document.querySelectorAll('.filter-sidebar, .filter-modal-content').forEach(region => {
    new MutationObserver(labelGeneratedControls).observe(region, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  labelGeneratedControls();
})();
