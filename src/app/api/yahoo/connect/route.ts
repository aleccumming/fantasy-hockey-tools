import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { buildAuthorizeUrl } from "@/lib/yahoo-oauth";

const STATE_COOKIE = "yahoo_oauth_state";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/api/auth/signin", getBaseUrl()));
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes - just long enough to complete the redirect round trip
    path: "/",
  });

  return NextResponse.redirect(buildAuthorizeUrl(state));
}

function getBaseUrl(): string {
  return process.env.YAHOO_REDIRECT_BASE_URL ?? "https://fh-tools.alecgcumming.com";
}
