/**
 * Tiny in-memory rate limiter for the auth endpoints.
 *
 * Single-process only (this proxy runs as one container). Enough to blunt
 * password guessing and signup floods; a shared store would be needed if the
 * proxy is ever scaled out.
 */

'use strict';

function createRateLimiter({ windowMs = 15 * 60_000, max = 20, code = 'RATE_LIMITED' } = {}) {
  /** @type {Map<string, number[]>} key → request timestamps */
  const hits = new Map();

  // Drop empty buckets so the map can't grow without bound.
  const sweep = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, times] of hits) {
      const kept = times.filter((t) => t > cutoff);
      if (kept.length) hits.set(key, kept);
      else hits.delete(key);
    }
  }, windowMs);
  if (typeof sweep.unref === 'function') sweep.unref();

  return function rateLimit(req, res, next) {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;
    const times = (hits.get(key) || []).filter((t) => t > cutoff);

    if (times.length >= max) {
      const retryAfter = Math.ceil((times[0] + windowMs - now) / 1000);
      res.set('Retry-After', String(Math.max(retryAfter, 1)));
      return res.status(429).json({
        error: {
          code,
          message: `Too many attempts — try again in ${Math.max(retryAfter, 1)}s`,
        },
      });
    }

    times.push(now);
    hits.set(key, times);
    return next();
  };
}

module.exports = { createRateLimiter };
