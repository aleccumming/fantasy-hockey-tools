// Server-only. Yahoo's OAuth2 authorization-code flow, verified directly
// against Yahoo's own docs (developer.yahoo.com/oauth2/guide) rather than
// guessed - this is a data-access connection (read a user's own Yahoo
// Fantasy league), not a site-login provider, so it's a standalone flow
// rather than going through Auth.js's provider system.
const AUTHORIZE_URL = "https://api.login.yahoo.com/oauth2/request_auth";
const TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";

// Read-only Fantasy Sports scope - the only one currently grantable (Yahoo
// doesn't offer self-serve write access).
const FANTASY_READ_SCOPE = "fspt-r";

// Yahoo requires HTTPS on every registered redirect URI, with no exception
// for localhost (unlike Google) - only the production URL is registered on
// the Yahoo app, so this always points there regardless of where the code
// is running. Testing this flow means deploying and clicking through on the
// real site, not localhost.
function getRedirectUri(): string {
  const base = process.env.YAHOO_REDIRECT_BASE_URL ?? "https://fh-tools.alecgcumming.com";
  return `${base}/api/yahoo/callback`;
}

function basicAuthHeader(): string {
  const id = process.env.YAHOO_CLIENT_ID;
  const secret = process.env.YAHOO_CLIENT_SECRET;
  if (!id || !secret) throw new Error("YAHOO_CLIENT_ID/YAHOO_CLIENT_SECRET are not set");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export function buildAuthorizeUrl(state: string): string {
  const id = process.env.YAHOO_CLIENT_ID;
  if (!id) throw new Error("YAHOO_CLIENT_ID is not set");
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: FANTASY_READ_SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface YahooTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

async function tokenRequest(body: URLSearchParams): Promise<YahooTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Yahoo token request failed: ${res.status} ${text}`);
  }
  return res.json();
}

export function exchangeCodeForTokens(code: string): Promise<YahooTokenResponse> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      redirect_uri: getRedirectUri(),
      code,
    })
  );
}

export function refreshYahooToken(refreshToken: string): Promise<YahooTokenResponse> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      redirect_uri: getRedirectUri(),
      refresh_token: refreshToken,
    })
  );
}
