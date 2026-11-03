'use strict';

const nodemailer = require('nodemailer');

/**
 * SMTP transport (issue #139).
 *
 * Chosen when SMTP_HOST is set. Port 587 uses STARTTLS (secure:false +
 * nodemailer's opportunistic upgrade); 465 uses implicit TLS (secure:true).
 * Auth is optional so a local relay (Mailhog, Postfix on the same host) works.
 */
let transport = null;

function connection() {
  if (transport) return transport;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    // A hung relay must not hold the request open indefinitely.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

module.exports = {
  name: 'smtp',

  async send({ to, subject, text, html }) {
    await connection().sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      text,
      html,
    });
  },
};
