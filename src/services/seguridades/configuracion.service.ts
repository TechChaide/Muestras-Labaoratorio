
import { environment } from "@/environments/environments.prod";
import type { BodyListResponse } from "@/types/body-list-response";
import type { Configuracion } from "@/types/interfaces";

// Mismo patrón que ProductividadChaide/src/services/configuracion.service.ts —
// la tabla `configuracion` vive en seguridadesGuard y es compartida entre
// todas las aplicaciones (se filtra por codigo_aplicacion).
const API_URL = `${environment.apiURL}/api/configuracion`;
const CODIGO_APLICACION = "APP_ENSAYOS_LABORATORIO";

export const configuracionService = {
  async getConfiguracionesByCodigoAplicacion(
    codigoAplicacion: string = CODIGO_APLICACION
  ): Promise<BodyListResponse<Configuracion>> {
    const response = await fetch(`${API_URL}/by-codigo-aplicacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo_aplicacion: codigoAplicacion }),
    });

    if (!response.ok) {
      // El backend responde 404 cuando no hay configuraciones para la app —
      // no es un error real, simplemente no hay nada configurado todavía.
      if (response.status === 404) return { data: [], size: 0, length: 0 };
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch configuraciones");
    }
    return response.json();
  },

  /** Valor crudo (string) de una configuración puntual por nombre, o '' si no existe. */
  async getValorConfiguracion(
    nombreConfiguracion: string,
    codigoAplicacion: string = CODIGO_APLICACION
  ): Promise<string> {
    const res = await this.getConfiguracionesByCodigoAplicacion(codigoAplicacion);
    const items = Array.isArray(res.data) ? res.data : [];
    const config = items.find((c) => c.nombre_configuracion === nombreConfiguracion);
    return config?.valor_configuracion || "";
  },
};
