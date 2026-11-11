import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import crypto from "node:crypto";

export interface AuthUser {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

const COOKIE_NAME = "ngeplay_auth";
const STATE_COOKIE = "ngeplay_oauth_state";

function getSecret() {
  const raw =
    process.env.AUTH_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "ngeplay-local-fallback-secret";
  return new TextEncoder().encode(raw);
}

function getOrigin(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  return `${proto}://${host}`;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ action: string }> }
) {
  const { action } = await context.params;
  const origin = getOrigin(req);

  if (action === "me") {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ user: null });
    try {
      const { payload } = await jwtVerify(token, getSecret());
      return NextResponse.json({
        user: {
          sub: String(payload.sub || ""),
          name: String(payload.name || ""),
          email: String(payload.email || ""),
          picture: payload.picture ? String(payload.picture) : undefined,
        } satisfies AuthUser,
      });
    } catch {
      return NextResponse.json({ user: null });
    }
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (action === "login") {
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${origin}/?auth_error=missing_config`);
    }
    const state = crypto.randomBytes(16).toString("hex");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${origin}/api/auth/callback`,
      response_type: "code",
      scope: "openid email profile",
      prompt: "select_account",
      state,
    });
    const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  }

  if (action === "callback") {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const savedState = req.cookies.get(STATE_COOKIE)?.value;

    if (!clientId || !clientSecret || !code || !state || state !== savedState) {
      return NextResponse.redirect(`${origin}/?auth_error=oauth_failed`);
    }

    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `${origin}/api/auth/callback`,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        return NextResponse.redirect(`${origin}/?auth_error=token_failed`);
      }

      const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await profileRes.json();
      if (!profileRes.ok || !profile.sub) {
        return NextResponse.redirect(`${origin}/?auth_error=profile_failed`);
      }

      const jwt = await new SignJWT({
        name: profile.name || profile.email || "Google User",
        email: profile.email || "",
        picture: profile.picture || "",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(String(profile.sub))
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(getSecret());

      const res = NextResponse.redirect(`${origin}/`);
      res.cookies.delete(STATE_COOKIE);
      res.cookies.set(COOKIE_NAME, jwt, {
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https://"),
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      return res;
    } catch {
      return NextResponse.redirect(`${origin}/?auth_error=oauth_failed`);
    }
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ action: string }> }
) {
  const { action } = await context.params;
  if (action === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(COOKIE_NAME);
    return res;
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
