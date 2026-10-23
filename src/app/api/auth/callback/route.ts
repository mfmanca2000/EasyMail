import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { me } from "@/lib/graph";
import { exchangeCode } from "@/lib/msauth";
import { kvSet } from "@/lib/db";
import { createSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const back = (error: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, env().APP_URL));
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back(p.get("error_description") ?? p.get("error")!);
  const code = p.get("code");
  if (!code || !p.get("state") || p.get("state") !== req.cookies.get("oauth_state")?.value) {
    return back("Sign-in expired, please try again.");
  }
  try {
    const tokens = await exchangeCode(code);
    const { mail } = await me(tokens.access_token);
    if (mail !== env().ALLOWED_EMAIL.toLowerCase()) return back(`${mail} is not allowed to use this app.`);
    await kvSet("user_email", mail);
    await createSession(mail);
  } catch (e) {
    console.error(e);
    return back("Could not complete Microsoft sign-in.");
  }
  const res = NextResponse.redirect(new URL("/", env().APP_URL));
  res.cookies.delete({ name: "oauth_state", path: "/api/auth" });
  return res;
}
