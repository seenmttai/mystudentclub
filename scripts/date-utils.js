const JOB_EXPIRATION_DAYS = 15;
const JOB_EXPIRATION_MS = JOB_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;

function isJobExpired(timestampStr, now = new Date()) {
  if (!timestampStr) return false;
  const timestamp = new Date(timestampStr);
  return Number.isFinite(timestamp.getTime()) && now.getTime() - timestamp.getTime() > JOB_EXPIRATION_MS;
}

function getDaysAgo(timestampStr) {
  const timestamp = new Date(timestampStr);
  const now = new Date();
  
  const diffMs = now - timestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) {
    return 'today';
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays <= 10) {
    return `${diffDays} days ago`;
  } else if (diffDays <= 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  } else {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  }
}

// "Posted 3 days ago", "Reposted today" (the team reposted an older vacancy: Created_At was bumped and
// reposted_at set, migration 202611170001), or "Expired". `fallback` is shown when there is no date.
function getPostedLabel(job, fallback = 'N/A') {
  const createdAt = job && job.Created_At;
  if (isJobExpired(createdAt)) return 'Expired';
  const verb = job && job.reposted_at ? 'Reposted' : 'Posted';
  return `${verb} ${createdAt ? getDaysAgo(createdAt) : fallback}`;
}

export { getDaysAgo, isJobExpired, getPostedLabel, JOB_EXPIRATION_DAYS };

