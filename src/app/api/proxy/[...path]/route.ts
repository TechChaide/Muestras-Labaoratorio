import { NextRequest, NextResponse } from "next/server";
import { environment } from "@/environments/environments.prod";

/**
 * Proxy same-origin → backend ensayosLaboratorioBA.
 *
 * El browser llama a /Ensayos-Calidad/api/proxy/... (mismo origen) con
 * Authorization + cookies; Next reenvía al contenedor backend.
 * Así no se pierde el JWT en Traefik/ARR y no hay hairpin a apps.chaide.com.
 *
 * Ej: GET  /api/proxy/Familia
 *     POST /api/proxy/solicitud
 *     GET  /api/proxy/servicios/materiales/buscar?Busqueda=pla
 */

const COOKIE_TOKEN_NAMES = [
  "ensayos_auth_token",
  "auth_token",
  "token",
  "jwt",
  "access_token",
  "Authorization",
];

function looksLikeJwt(value: string | undefined | null): value is string {
  if (!value) return false;
  const v = value.replace(/^Bearer\s+/i, "").trim();
  return v.startsWith("eyJ") && v.split(".").length >= 3;
}

function resolveToken(req: NextRequest): string | null {
  const fromHeader =
    req.headers.get("authorization") || req.headers.get("x-access-token") || "";
  if (looksLikeJwt(fromHeader)) {
    return fromHeader.replace(/^Bearer\s+/i, "").trim();
  }

  for (const name of COOKIE_TOKEN_NAMES) {
    const c = req.cookies.get(name)?.value;
    if (looksLikeJwt(c)) {
      return c!.replace(/^Bearer\s+/i, "").trim();
    }
  }

  for (const { value } of req.cookies.getAll()) {
    if (looksLikeJwt(value)) {
      return value.replace(/^Bearer\s+/i, "").trim();
    }
  }

  return null;
}

function resolveApiBase(): string {
  const fromEnv = process.env.API_APP_INTERNAL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const publicBase = environment.apiAPP.replace(/\/+$/, "");
  if (/apps\.chaide\.com/i.test(publicBase)) {
    return "http://ensayos_laboratorio_backend_service:5400";
  }
  return publicBase;
}

async function proxyRequest(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  method: string
) {
  const { path } = await context.params;
  const targetPath = path.join("/");
  const qs = req.nextUrl.searchParams.toString();
  const targetUrl = `${resolveApiBase()}/api/${targetPath}${qs ? `?${qs}` : ""}`;

  const token = resolveToken(req);
  if (!token) {
    return NextResponse.json(
      {
        message: "Authentication token required",
        code: "MISSING_TOKEN",
        hint: "No hay token en headers ni cookies. Cierra sesión e inicia de nuevo.",
      },
      { status: 403 }
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-Access-Token": token,
    Accept: "application/json",
  };

  const contentType = req.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await req.arrayBuffer();
    if (body.byteLength === 0) body = undefined;
  }

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      cache: "no-store",
    });

    const upstreamType = upstream.headers.get("content-type") || "application/json";
    const upstreamBody = await upstream.arrayBuffer();

    return new NextResponse(upstreamBody, {
      status: upstream.status,
      headers: {
        "Content-Type": upstreamType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No se pudo contactar el API de la aplicación.",
        code: "UPSTREAM_UNREACHABLE",
        targetUrl,
        hint:
          "Si corre en Docker, define API_APP_INTERNAL=http://ensayos_laboratorio_backend_service:5400",
      },
      { status: 502 }
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export const GET = (req: NextRequest, ctx: Ctx) => proxyRequest(req, ctx, "GET");
export const POST = (req: NextRequest, ctx: Ctx) => proxyRequest(req, ctx, "POST");
export const PUT = (req: NextRequest, ctx: Ctx) => proxyRequest(req, ctx, "PUT");
export const PATCH = (req: NextRequest, ctx: Ctx) => proxyRequest(req, ctx, "PATCH");
export const DELETE = (req: NextRequest, ctx: Ctx) => proxyRequest(req, ctx, "DELETE");
