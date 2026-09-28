import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/db";
import { yahooConnections } from "@/db/schema";
import { exchangeCodeForTokens } from "@/lib/yahoo-oauth";

const STATE_COOKIE = "yahoo_oauth_state";

function getBaseUrl(): string {
  return process.env.YAHOO_REDIRECT_BASE_URL ?? "https://fh-tools.alecgcumming.com";
}

export async function GET(request: Request) {
  const baseUrl = getBaseUrl();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/api/auth/signin", baseUrl));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (oauthError || !code || !state || state !== expectedState) {
    return NextResponse.redirect(new URL("/players?yahoo=error", baseUrl));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await db
      .insert(yahooConnections)
      .values({
        userId: session.user.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: yahooConnections.userId,
        set: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt,
          updatedAt: new Date(),
        },
      });

    return NextResponse.redirect(new URL("/players?yahoo=connected", baseUrl));
  } catch (err) {
    console.error("Yahoo token exchange failed:", err);
    return NextResponse.redirect(new URL("/players?yahoo=error", baseUrl));
  }
}
