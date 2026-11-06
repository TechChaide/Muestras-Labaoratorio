/**
 * HTTP Client — mismo patrón que muestreos_frontend.
 *
 * El token lo gestiona seguridadesGuard como cookie httpOnly en apps.chaide.com.
 * Este cliente solo envía credentials: 'include' para que el browser adjunte
 * esa cookie a las llamadas a apiAPP (ensayosLaboratorioBA).
 */

import { toast } from "@/hooks/use-toast";

export type FetchOptions = RequestInit & {
  skipAuth?: boolean;
};

export async function fetchWithAuth(url: string, options: FetchOptions = {}) {
  const { skipAuth = false, ...restOptions } = options;

  const response = await fetch(url, {
    ...restOptions,
    credentials: skipAuth ? "omit" : "include",
  });

  if (response.status === 401) {
    let errMsg = "Tu sesión ha expirado. Por favor, inicia sesión de nuevo.";
    try {
      const body = await response.clone().json().catch(() => null);
      if (body) {
        if (typeof body === "string") errMsg = body;
        else if (body.message) errMsg = body.message;
        else if (body.error) errMsg = body.error;
      }
    } catch {
      // ignore
    }
    toast({
      title: "Error de autenticación",
      description: errMsg,
      variant: "destructive",
    });
    console.error("❌ Error 401 - Sesión no válida", errMsg);
  }

  return response;
}

function clearAuthData() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("user");
    localStorage.removeItem("appsByProfile");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("token");
  }
}

export function clearAuth() {
  clearAuthData();
}
