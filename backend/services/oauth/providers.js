/**
 * Provider adapters for social sign-in (issue #136).
 *
 * Each adapter does exactly three things: build the authorization URL, exchange
 * the code for a provider identity, and report that identity. The browser never
 * sees a provider token — the exchange happens here, server-side, and the app
 * issues its own `psx_session` cookie afterwards.
 *
 * A provider whose client id/secret is absent is reported as disabled and never
 * rendered as a button (requirement 9). The `stub` adapter is enabled only by
 * `OAUTH_STUB_ENABLED=true`, for local development without real credentials:
 * it round-trips through the same start → callback → link-or-create path.
 */

'use strict';

const fetch = require('node-fetch');
const crypto = require('crypto');

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';

const FB_VERSION = 'v19.0';
const FACEBOOK_AUTH = `https://www.facebook.com/${FB_VERSION}/dialog/oauth`;
const FACEBOOK_TOKEN = `https://graph.facebook.com/${FB_VERSION}/oauth/access_token`;
const FACEBOOK_ME = `https://graph.facebook.com/${FB_VERSION}/me`;
const FACEBOOK_DEBUG = `https://graph.facebook.com/${FB_VERSION}/debug_token`;

class ProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

const env = (name) => (process.env[name] || '').trim();

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Google (OIDC) ────────────────────────────────────────────────────────────
// Uses the userinfo endpoint rather than verifying an id_token: the access token
// is obtained over TLS directly from Google's token endpoint, and userinfo's
// `sub` is the same stable identifier the id_token carries. PKCE still guards
// the code exchange.

const google = {
  id: 'google',
  label: 'Google',

  config() {
    const clientId = env('OAUTH_GOOGLE_CLIENT_ID');
    const clientSecret = env('OAUTH_GOOGLE_CLIENT_SECRET');
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  },

  authorizeUrl({ state, codeChallenge, redirectUri, nonce }) {
    const { clientId } = this.config();
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (nonce) url.searchParams.set('nonce', nonce);
    return url.toString();
  },

  async exchange({ code, codeVerifier, redirectUri }) {
    const { clientId, clientSecret } = this.config();
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });

    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokenRes.ok) throw new ProviderError('OAUTH_FAILED', 'Google rejected the sign-in');
    const tokens = await tokenRes.json();

    const infoRes = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) throw new ProviderError('OAUTH_FAILED', 'Google returned no profile');
    const profile = await infoRes.json();

    if (!profile.sub) throw new ProviderError('OAUTH_FAILED', 'Google returned no account id');
    return {
      subject: String(profile.sub),
      email: profile.email ? String(profile.email).trim().toLowerCase() : null,
      emailVerified: profile.email_verified === true,
      name: profile.name ? String(profile.name).slice(0, 100) : null,
    };
  },
};

// ── Facebook (OAuth 2.0 + debug_token) ───────────────────────────────────────

const facebook = {
  id: 'facebook',
  label: 'Facebook',

  config() {
    const clientId = env('OAUTH_FACEBOOK_APP_ID');
    const clientSecret = env('OAUTH_FACEBOOK_APP_SECRET');
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  },

  authorizeUrl({ state, codeChallenge, redirectUri }) {
    const { clientId } = this.config();
    const url = new URL(FACEBOOK_AUTH);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'email,public_profile');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  },

  async exchange({ code, codeVerifier, redirectUri }) {
    const { clientId, clientSecret } = this.config();
    const tokenUrl = new URL(FACEBOOK_TOKEN);
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('code', code);
    if (codeVerifier) tokenUrl.searchParams.set('code_verifier', codeVerifier);

    const tokenRes = await fetch(tokenUrl);
    if (!tokenRes.ok) throw new ProviderError('OAUTH_FAILED', 'Facebook rejected the sign-in');
    const tokens = await tokenRes.json();

    // A token minted for a different app must never sign anyone in here.
    const debugUrl = new URL(FACEBOOK_DEBUG);
    debugUrl.searchParams.set('input_token', tokens.access_token);
    debugUrl.searchParams.set('access_token', `${clientId}|${clientSecret}`);
    const debugRes = await fetch(debugUrl);
    const debug = await debugRes.json();
    const data = debug && debug.data;
    if (!data || data.is_valid !== true || String(data.app_id) !== String(clientId)) {
      throw new ProviderError('OAUTH_FAILED', 'Facebook could not validate the sign-in');
    }

    const meUrl = new URL(FACEBOOK_ME);
    meUrl.searchParams.set('fields', 'id,name,email');
    meUrl.searchParams.set('access_token', tokens.access_token);
    const meRes = await fetch(meUrl);
    if (!meRes.ok) throw new ProviderError('OAUTH_FAILED', 'Facebook returned no profile');
    const profile = await meRes.json();
    if (!profile.id) throw new ProviderError('OAUTH_FAILED', 'Facebook returned no account id');

    // Facebook only returns confirmed addresses, but carries no explicit
    // verification claim: an address that is present is treated as verified, and
    // a missing one is refused by the link-or-create table.
    const email = profile.email ? String(profile.email).trim().toLowerCase() : null;
    return {
      subject: String(profile.id),
      email,
      emailVerified: Boolean(email),
      name: profile.name ? String(profile.name).slice(0, 100) : null,
    };
  },
};

// ── Stub (development only) ──────────────────────────────────────────────────

const stub = {
  id: 'stub',
  label: 'Stub (dev)',

  config() {
    return env('OAUTH_STUB_ENABLED') === 'true' ? { enabled: true } : null;
  },

  authorizeUrl({ state, redirectUri }) {
    // No external provider: the browser comes straight back to the callback.
    const url = new URL(redirectUri);
    url.searchParams.set('code', 'stub');
    url.searchParams.set('state', state);
    return url.toString();
  },

  async exchange({ statePayload }) {
    const email = String(statePayload?.stubEmail || env('OAUTH_STUB_EMAIL') || 'stub@example.com')
      .trim()
      .toLowerCase();
    // A stable subject per address, so repeat sign-ins reuse the same account.
    const subject = `stub:${crypto.createHash('sha256').update(email).digest('hex').slice(0, 24)}`;
    return {
      subject,
      email,
      emailVerified: true,
      name: 'Stub User',
    };
  },
};

const ALL = [google, facebook, stub];

/** Configured providers only, in a stable order. No secrets leave this module. */
function listProviders() {
  return ALL.filter((p) => p.config()).map((p) => ({ id: p.id, label: p.label, enabled: true }));
}

function getProvider(id) {
  const provider = ALL.find((p) => p.id === id);
  return provider && provider.config() ? provider : null;
}

module.exports = { listProviders, getProvider, ProviderError, base64url };
