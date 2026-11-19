// Apply assessments (hire.mystudentclub.com docs/apply-assessments.md): a recruiter can make an assessment mandatory
// for an Easy Apply vacancy. Before Easy Apply saves the application, assessmentGate() asks hire whether this vacancy
// has one and, if the student has not submitted it yet, opens it in an overlay (hire's /assessment-take.js, loaded on
// first use). It resolves true to go ahead with the application and false when the student leaves the assessment.
// It never blocks applying when hire cannot be reached: the recruiter then sees "Assessment not taken".
const HIRE_ORIGIN = 'https://hire.mystudentclub.com';
const LOAD_TIMEOUT_MS = 8000;
let loading = null;

// Local testing only: on localhost, localStorage 'msc:hire-api' may name a local hire preview (http://localhost:8787).
function hireOrigin() {
  try {
    if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      const local = window.localStorage.getItem('msc:hire-api');
      if (local && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(local)) return local;
    }
  } catch (_) { /* storage blocked: production */ }
  return HIRE_ORIGIN;
}

function loadTaker(origin) {
  if (window.MscAssessment) return Promise.resolve(window.MscAssessment);
  if (!loading) {
    loading = new Promise(resolve => {
      const script = document.createElement('script');
      script.src = `${origin}/assessment-take.js`;
      script.async = true;
      // Too slow this time: apply without it, and let the next apply try again (the script may still arrive).
      const timer = setTimeout(() => { loading = null; resolve(window.MscAssessment || null); }, LOAD_TIMEOUT_MS);
      script.onload = () => { clearTimeout(timer); resolve(window.MscAssessment || null); };
      script.onerror = () => { clearTimeout(timer); loading = null; resolve(null); };
      document.head.appendChild(script);
    });
  }
  return loading;
}

// { table, job, supabaseClient, session } -> Promise<boolean>. `table`: the vacancy's portal table ('Fresher Jobs', …);
// `job.id`: the vacancy's own id (numeric or UUID, never the "table|uuid" application encoding).
export async function assessmentGate({ table, job, supabaseClient, session }) {
  if (!table || !job || job.id === undefined || job.id === null || job.id === '') return true;
  const origin = hireOrigin();
  const taker = await loadTaker(origin);
  if (!taker || typeof taker.gate !== 'function') return true;
  const getToken = async () => {
    try {
      const { data } = await supabaseClient.auth.getSession();
      return data?.session?.access_token || session?.access_token || null;
    } catch (_) { return session?.access_token || null; }
  };
  try {
    return await taker.gate({ api: origin, table, jobId: job.id, company: job.Company || '', title: job.Category || job.Role || job['Primary Domain'] || '', getToken });
  } catch (error) {
    console.warn('Assessment check failed; applying without it.', error);
    return true;
  }
}
