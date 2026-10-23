import { env } from "./env";
import { kvGet, kvSet } from "./db";

const AUTHORITY = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
export const SCOPES = ["offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send"];

export const redirectUri = () => `${env().APP_URL}/api/auth/callback`;

export function authorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: env().MS_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
    prompt: "select_account",
  });
  return `${AUTHORITY}/authorize?${p}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env().MS_CLIENT_ID,
      client_secret: env().MS_CLIENT_SECRET,
      scope: SCOPES.join(" "),
      ...params,
    }),
  });
  if (!res.ok) throw new Error(`Microsoft token endpoint ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
  });
  if (t.refresh_token) await kvSet("ms_refresh_token", t.refresh_token);
  return t;
}

let memo: { token: string; expiresAt: number } | undefined;

/** Access token for Graph, refreshed from the stored refresh token when needed. */
export async function accessToken(): Promise<string> {
  if (memo && memo.expiresAt > Date.now() + 60_000) return memo.token;
  const refresh = await kvGet("ms_refresh_token");
  if (!refresh) throw new Error("Not connected to Microsoft. Sign in again.");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  if (t.refresh_token) await kvSet("ms_refresh_token", t.refresh_token);
  memo = { token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
  return t.access_token;
}
