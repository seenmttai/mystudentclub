import { createClient } from '@supabase/supabase-js';

// Supabase configuration (using your actual Project URL and Anon Key)
const SUPABASE_URL = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Simple client-side rate limiting for error logging:
// Max 10 errors per 10 minutes per browser (using localStorage for persistence).
const RATE_LIMIT_KEY = 'ca_skillcheck_error_rate_limit';
const MAX_ERRORS = 10;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function loadErrorTimestamps() {
    try {
        const raw = localStorage.getItem(RATE_LIMIT_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(Number).filter(ts => !Number.isNaN(ts));
    } catch {
        return [];
    }
}

function saveErrorTimestamps(timestamps) {
    try {
        localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(timestamps));
    } catch {
        // Swallow storage errors; logging should not crash the app
    }
}

function canLogError() {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    let timestamps = loadErrorTimestamps();
    // Keep only timestamps inside the window
    timestamps = timestamps.filter(ts => ts >= windowStart);

    if (timestamps.length >= MAX_ERRORS) {
        return { allowed: false, timestamps };
    }

    // Add current timestamp and persist
    timestamps.push(now);
    saveErrorTimestamps(timestamps);
    return { allowed: true, timestamps };
}

export async function logError(error, context = 'general') {
    console.error('Logged Error:', error);

    // Apply client-side rate limiting
    const { allowed } = canLogError();
    if (!allowed) {
        console.warn('Error logging rate limit reached; skipping Supabase log.');
        return;
    }

    try {
        const errorPayload = {
            error_message: error.message || error.toString(),
            stack_trace: error.stack || 'No stack trace',
            user_action_context: context,
            browser_info: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                url: window.location.href
            }
        };

        await supabase.from('error_logs').insert([errorPayload]);
    } catch (loggingError) {
        console.error('Failed to log error to Supabase:', loggingError);
    }
}
