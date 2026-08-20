// Scratch test for Hirer Dashboard Worker logic and security validation
const assert = require('assert');

// Mock Data
const mockHirer1 = { id: 'hirer-uuid-1111', email: 'hr@tata.com' };
const mockHirer2 = { id: 'hirer-uuid-2222', email: 'recruiter@kpmg.com' };

const mockJobs = [
  { id: 'job-101', table_name: 'Industrial Training Job Portal', posted_by: 'hirer-uuid-1111', Company: 'Tata Motors', Category: 'FP&A' },
  { id: 'job-102', table_name: 'Fresher Jobs', posted_by: 'hirer-uuid-2222', Company: 'KPMG', Category: 'Statutory Audit' }
];

const mockApplications = [
  { id: 1, user_id: 'cand-uuid-aaaa', job_id: 'job-101', job_table: 'Industrial Training Job Portal', status: 'new', applied_at: new Date().toISOString() },
  { id: 2, user_id: 'cand-uuid-bbbb', job_id: 'job-101', job_table: 'Industrial Training Job Portal', status: 'shortlisted', applied_at: new Date().toISOString() },
  { id: 3, user_id: 'cand-uuid-cccc', job_id: 'job-102', job_table: 'Fresher Jobs', status: 'new', applied_at: new Date().toISOString() }
];

const mockProfiles = {
  'cand-uuid-aaaa': { uuid: 'cand-uuid-aaaa', profile: { full_name: 'Rohan Sharma', email: 'rohan@gmail.com', ca_inter_attempts: '1st Attempt' }, ocr_cv: 'Sample CV Content for Rohan' },
  'cand-uuid-bbbb': { uuid: 'cand-uuid-bbbb', profile: { full_name: 'Priya Mehta', email: 'priya@gmail.com', ca_final_attempts: '1st Attempt' }, ocr_cv: 'Sample CV Content for Priya' },
  'cand-uuid-cccc': { uuid: 'cand-uuid-cccc', profile: { full_name: 'Amit Patel', email: 'amit@gmail.com', ca_inter_attempts: '2nd Attempt' }, ocr_cv: 'Sample CV Content for Amit' }
};

// Security Check Function: Check if hirer owns the job
function verifyHirerJobOwnership(hirerId, jobId, table) {
  const job = mockJobs.find(j => j.id === jobId && j.table_name === table);
  if (!job) return false;
  return job.posted_by === hirerId;
}

// Security Check Function: Check if hirer is authorized to view candidate
function isHirerAuthorizedForCandidate(hirerId, candidateId) {
  const candApps = mockApplications.filter(a => a.user_id === candidateId);
  return candApps.some(app => {
    const job = mockJobs.find(j => j.id === app.job_id);
    return job && job.posted_by === hirerId;
  });
}

console.log('--- RUNNING HIRER SECURITY TESTS ---');

// Test 1: Hirer 1 can view applicants for their own job (job-101)
assert.strictEqual(verifyHirerJobOwnership(mockHirer1.id, 'job-101', 'Industrial Training Job Portal'), true, 'Hirer 1 should own job-101');
assert.strictEqual(verifyHirerJobOwnership(mockHirer1.id, 'job-102', 'Fresher Jobs'), false, 'Hirer 1 should NOT own job-102');

// Test 2: Hirer 1 can view Rohan (applied to job-101) but CANNOT view Amit (applied to job-102)
assert.strictEqual(isHirerAuthorizedForCandidate(mockHirer1.id, 'cand-uuid-aaaa'), true, 'Hirer 1 should be authorized for Rohan');
assert.strictEqual(isHirerAuthorizedForCandidate(mockHirer1.id, 'cand-uuid-cccc'), false, 'Hirer 1 must NOT be authorized for Amit');

// Test 3: Hirer 2 can view Amit (applied to job-102) but CANNOT view Rohan (applied to job-101)
assert.strictEqual(isHirerAuthorizedForCandidate(mockHirer2.id, 'cand-uuid-cccc'), true, 'Hirer 2 should be authorized for Amit');
assert.strictEqual(isHirerAuthorizedForCandidate(mockHirer2.id, 'cand-uuid-aaaa'), false, 'Hirer 2 must NOT be authorized for Rohan');

// Test 4: Profile gating calculation test
function calculateProfileCompletionMock(profile, hasResume) {
  if (!profile && !hasResume) return 0;
  let score = 0;
  if (hasResume) score += 14;
  if (profile) {
    if ((profile.full_name || '').trim()) score += 14;
    if ((profile.contact_number || '').trim()) score += 10;
    if ((profile.current_city || '').trim()) score += 3;
    if ((profile.profile_summary || '').trim()) score += 10;
    if ((profile.ca_inter_course || '').trim()) score += 12;
    if ((profile.articleship_firm_name || '').trim()) score += 12;
    if ((profile.notice_period || '').trim()) score += 7;
  }
  return Math.min(100, score);
}

// 0% profile -> Block
assert.strictEqual(calculateProfileCompletionMock(null, false), 0);

// Incomplete profile (< 50%) -> Warning
const partialProfile = { full_name: 'Test Candidate' };
const partialScore = calculateProfileCompletionMock(partialProfile, true);
assert.strictEqual(partialScore < 50, true);

// >= 50% profile -> Allow with toast
const fullProfile = {
  full_name: 'Rohan Sharma',
  contact_number: '9876543210',
  current_city: 'Mumbai',
  profile_summary: 'CA Inter qualified aspirant',
  ca_inter_course: 'CA Inter',
  articleship_firm_name: 'KPMG',
  notice_period: 'Immediate'
};
const fullScore = calculateProfileCompletionMock(fullProfile, true);
assert.strictEqual(fullScore >= 50, true);

console.log('All 4 Hirer Dashboard & Security Automated Tests Passed Successfully!');
