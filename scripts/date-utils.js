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

export { getDaysAgo, isJobExpired, JOB_EXPIRATION_DAYS };

