'use strict';

/**
 * Resend transport (issue #139) — https://resend.com/docs/api-reference/emails/send-email
 *
 * Chosen when RESEND_API_KEY is set. The error body is truncated into the log
 * so a bad key or an unverified domain is diagnosable without dumping the
 * request.
 */
module.exports = {
  name: 'resend',

  async send({ to, subject, text, html }) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [to],
        subject,
        text,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
    }
  },
};
