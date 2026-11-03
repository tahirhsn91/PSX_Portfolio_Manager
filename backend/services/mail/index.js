'use strict';

const stub = require('./stub');
const resend = require('./resend');
const smtp = require('./smtp');

/**
 * Password-reset mail (issue #139).
 *
 * Transport selection by environment, in this order:
 *   RESEND_API_KEY → Resend (HTTP API)
 *   SMTP_HOST      → SMTP (nodemailer)
 *   neither        → dev stub (console), which refuses to run in production
 */
function transport() {
  if ((process.env.RESEND_API_KEY || '').trim()) return resend;
  if ((process.env.SMTP_HOST || '').trim()) return smtp;
  return stub;
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

function compose({ displayName, resetUrl }) {
  const safeName = displayName ? escapeHtml(displayName) : 'there';
  const safeUrl = escapeHtml(resetUrl);

  const text = [
    `Hi ${displayName || 'there'},`,
    '',
    'Someone asked to reset the password for your PSX Portfolio account.',
    'Open this link to choose a new one:',
    '',
    resetUrl,
    '',
    'The link works once and expires in 60 minutes.',
    "If this wasn't you, ignore this email — your password has not changed.",
    '',
    '— PSX Portfolio Manager',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f1f1f1">
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#161817">
    <h2 style="font-size:18px;margin:0 0 16px;font-weight:600">Reset your password</h2>
    <p style="line-height:1.55;margin:0 0 16px">Hi ${safeName},</p>
    <p style="line-height:1.55;margin:0 0 16px">Someone asked to reset the password for your PSX Portfolio account. Choose a new one below.</p>
    <p style="margin:28px 0">
      <a href="${safeUrl}" style="background:#007a42;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600">Choose a new password</a>
    </p>
    <p style="line-height:1.55;margin:0 0 8px;color:#666666;font-size:13px">The link works once and expires in 60 minutes.</p>
    <p style="line-height:1.55;margin:0;color:#666666;font-size:13px">If this wasn't you, ignore this email — your password has not changed.</p>
  </div>
</body></html>`;

  return { text, html };
}

/**
 * Sends the reset mail. Never throws: a delivery failure is an operator signal,
 * not something the caller may surface — surfacing it would tell an attacker
 * which addresses have accounts.
 */
async function sendPasswordReset({ to, displayName, resetUrl }) {
  const { text, html } = compose({ displayName, resetUrl });
  const subject = 'Reset your PSX Portfolio password';
  const chosen = transport();

  try {
    await chosen.send({ to, subject, text, html });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[mail] password reset failed via ${chosen.name}: ${err.message}`);
  }
}

module.exports = {
  sendPasswordReset,
  transportName: () => transport().name,
};
