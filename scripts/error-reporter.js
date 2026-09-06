/**
 * Lightweight Frontend Error Reporter
 * Captures only unexpected runtime errors and unhandled promise rejections.
 * Features:
 * - No Fetch/XHR monkey patching
 * - Ignores aborts, cancellations, 401/403/404, media failures, browser extensions
 * - Error fingerprinting with 30-min sessionStorage deduplication
 * - Max 2 reports per page load
 * - Synchronous cached user_id retrieval (no auth.getSession() calls)
 * - Zero retries on failure
 */
(function (global) {
  let reportsSentThisPage = 0;
  const MAX_REPORTS_PER_PAGE = 2;
  const DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

  const IGNORED_MESSAGE_PATTERNS = [
    /abort/i,
    /cancelled/i,
    /networkerror/i,
    /failed to fetch/i,
    /load failed/i,
    /\b(401|403|404)\b/,
    /resizeobserver/i,
    /chrome-extension/i,
    /moz-extension/i,
    /safari-extension/i,
    /evaluating 'window\.ethereum/i,
    /media_element_error/i,
    /the play\(\) request was interrupted/i,
    /play\(\) failed/i,
    /video/i,
    /audio/i,
    /hls/i,
    /plyr/i
  ];

  const IGNORED_SOURCE_PATTERNS = [
    /chrome-extension:\/\//i,
    /moz-extension:\/\//i,
    /safari-extension:\/\//i,
    /googletagmanager\.com/i,
    /google-analytics\.com/i,
    /cloudflareinsights\.com/i
  ];

  function shouldIgnore(message, source, stack) {
    const str = `${message || ''} ${source || ''} ${stack || ''}`;
    for (let i = 0; i < IGNORED_MESSAGE_PATTERNS.length; i++) {
      if (IGNORED_MESSAGE_PATTERNS[i].test(str)) return true;
    }
    for (let i = 0; i < IGNORED_SOURCE_PATTERNS.length; i++) {
      if (IGNORED_SOURCE_PATTERNS[i].test(source || '')) return true;
    }
    return false;
  }

  function getFirstStackFrame(stack) {
    if (!stack || typeof stack !== 'string') return '';
    const lines = stack.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.includes('error-reporter.js')) {
        return line.replace(/^at\s+/, '').replace(/\s+/g, ' ');
      }
    }
    return '';
  }

  function createFingerprint(message, source, stack) {
    const normMsg = (message || '').toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').slice(0, 100);
    const normSource = (source || '').split('?')[0].replace(/https?:\/\/[^\/]+/, '');
    const firstFrame = getFirstStackFrame(stack).replace(/https?:\/\/[^\/]+/, '').replace(/:\d+:\d+.*$/, '');
    return `${normMsg}|${normSource}|${firstFrame}`;
  }

  function isRecentlyReported(fingerprint) {
    try {
      const key = `msc_err_${fingerprint}`;
      const last = sessionStorage.getItem(key);
      if (last) {
        const time = parseInt(last, 10);
        if (Date.now() - time < DEDUP_WINDOW_MS) {
          return true;
        }
      }
      sessionStorage.setItem(key, String(Date.now()));
    } catch (e) {
      // sessionStorage might be restricted/full; proceed
    }
    return false;
  }

  function getCachedUserId() {
    if (global.__mscSession && global.__mscSession.user) {
      return global.__mscSession.user.id || null;
    }
    try {
      const raw = localStorage.getItem('sb-izsggdtdiacxdsjjncdq-auth-token');
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.user?.id || null;
      }
    } catch (e) {}
    return null;
  }

  async function reportError(errorData) {
    if (reportsSentThisPage >= MAX_REPORTS_PER_PAGE) return;

    const message = errorData.message || 'Unknown Error';
    const source = errorData.source || '';
    const stack = errorData.stack || '';

    if (shouldIgnore(message, source, stack)) return;

    const fingerprint = createFingerprint(message, source, stack);
    if (isRecentlyReported(fingerprint)) return;

    reportsSentThisPage++;

    const client = global.supabaseClient || (typeof global.getSupabaseClient === 'function' ? global.getSupabaseClient() : null);
    if (!client) return;

    try {
      const userId = getCachedUserId();
      await client.from('frontend_errors').insert({
        user_id: userId,
        error_message: message.slice(0, 500),
        stack_trace: stack ? stack.slice(0, 2000) : (source ? `Source: ${source}` : 'No Stack'),
        url: window.location.href,
        user_agent: navigator.userAgent
      });
    } catch (e) {
      // Never retry on failure
    }
  }

  window.addEventListener('error', function (event) {
    // Ignore asset load errors on DOM nodes (images, stylesheets, scripts)
    if (event.target && (event.target.nodeName === 'IMG' || event.target.nodeName === 'SCRIPT' || event.target.nodeName === 'LINK' || event.target.nodeName === 'VIDEO' || event.target.nodeName === 'AUDIO')) {
      return;
    }
    reportError({
      message: event.message || (event.error && event.error.message),
      source: event.filename,
      stack: event.error && event.error.stack
    });
  });

  window.addEventListener('unhandledrejection', function (event) {
    const reason = event.reason;
    const message = reason ? (reason.message || (typeof reason === 'string' ? reason : 'Unhandled Promise Rejection')) : 'Unhandled Promise Rejection';
    const stack = reason && reason.stack ? reason.stack : '';
    reportError({
      message: message,
      source: 'unhandledrejection',
      stack: stack
    });
  });

  global.reportFrontendError = function (message, stack, source) {
    let msg = message;
    if (msg && typeof msg === 'object') {
      msg = msg.message || JSON.stringify(msg);
    }
    reportError({
      message: String(msg || ''),
      stack: stack || '',
      source: source || ''
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
