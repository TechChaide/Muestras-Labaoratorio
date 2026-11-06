import type { Auth } from "@/types/interfaces";
import type { BodyResponse } from "@/types/body-response";
import { environment } from "@/environments/environments.prod";
import { fetchWithAuth } from "@/lib/http-client";

const API_URL = `${environment.apiURL}/api/auths/login`;
const API_URL_CENTRAL = `${environment.apiURL}/api/auths/loginCentral`;

/** Codigo de app para que seguridades resuelva TOKEN_TIME_LIFE. */
const NOMBRE_APLICACION =
  (Array.isArray(environment.aplicaciones) && environment.aplicaciones[0]) ||
  environment.nombreAplicacion;

type LoginCredentials = {
  email: string;
  password: string;
};

/**
 * Login contra seguridadesGuard — mismo patrón que muestreos_frontend.
 * La cookie httpOnly la setea seguridades; el browser la reenvía a apiAPP
 * con credentials: 'include'.
 */
export const authService = {
  async login(credentials: LoginCredentials): Promise<BodyResponse<Auth>> {
    return this.loginCentral({
      email: credentials.email,
      password: credentials.password,
    });
  },

  async loginCentral(credentials: {
    email: string;
    password: unknown;
  }): Promise<BodyResponse<Auth>> {
    const response = await fetchWithAuth(API_URL_CENTRAL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
        nombre_aplicacion: NOMBRE_APLICACION,
      }),
    });

    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => ({ message: "Error al iniciar sesión." }));
      throw new Error(errorBody.message || "Ocurrió un error desconocido.");
    }

    return response.json() as Promise<BodyResponse<Auth>>;
  },
};

// Alias por si quedó alguna importación antigua
export async function clearSessionCookie() {
  // La cookie httpOnly la limpia seguridades en logout; no hay espejo local.
}
