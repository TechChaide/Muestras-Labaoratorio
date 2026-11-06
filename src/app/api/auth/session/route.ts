import { NextRequest, NextResponse } from "next/server";
import { environment } from "@/environments/environments.prod";

/**
 * Espeja el JWT en una cookie httpOnly bajo el basePath de esta app
 * (p.ej. /Ensayos-Calidad), para que el proxy same-origin la reciba
 * aunque el Set-Cookie de seguridades vaya con otro Path.
 */

const COOKIE_NAME = "ensayos_auth_token";

function cookiePath() {
  const base = environment.basePath || "";
  return base || "/";
}

function looksLikeJwt(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("eyJ") &&
    value.split(".").length >= 3
  );
}

export async function POST(req: NextRequest) {
  let body: { token?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Body inválido" }, { status: 400 });
  }

  if (!looksLikeJwt(body.token)) {
    return NextResponse.json(
      { message: "Se requiere un JWT válido en { token }" },
      { status: 400 }
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, body.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: cookiePath(),
    maxAge: 60 * 60 * 12, // 12h
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: cookiePath(),
    maxAge: 0,
  });
  return res;
}
