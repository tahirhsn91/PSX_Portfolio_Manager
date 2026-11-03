'use strict';

/**
 * Development mail transport (issue #139).
 *
 * Selected only when neither Resend nor SMTP is configured, and it refuses to
 * run with NODE_ENV=production: a production deploy with no mail credentials
 * should fail loudly at send time, not silently swallow every reset link.
 *
 * The console line is the point — it is how you fetch the link while testing
 * the flow without a provider account.
 */
module.exports = {
  name: 'stub',

  async send({ to, subject, text }) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('no mail transport configured (set RESEND_API_KEY or SMTP_HOST)');
    }
    // eslint-disable-next-line no-console
    console.log(`[mail:stub] ${subject} → ${to}\n${text}`);
  },
};
