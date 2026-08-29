// ─── 速率限制工具 ────────────────────────────────────────
const rateLimits = new Map();

function checkRateLimit(key, maxAttempts = 10, windowMs = 60000) {
  const now = Date.now();
  let entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    rateLimits.set(key, entry);
    return true;
  }
  entry.count++;
  return entry.count <= maxAttempts;
}

// 每分钟清理过期条目
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(key);
  }
}, 60000);

module.exports = { checkRateLimit };
