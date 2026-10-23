import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/msauth";

export async function GET() {
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
