import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { destroySession } from "@/lib/session";

export async function POST() {
  await destroySession();
  return NextResponse.redirect(new URL("/login", env().APP_URL), 303);
}
