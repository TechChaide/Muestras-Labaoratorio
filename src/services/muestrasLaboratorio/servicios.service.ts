import type { BodyListResponse } from "@/types/body-list-response";
import { environment } from "@/environments/environments.prod";
import { fetchWithAuth } from "@/lib/http-client";

/** Búsqueda de materiales (maestro SAP) vía apiAPP — mismo patrón que muestreos. */
const API_URL = `${environment.apiAPP}/api/servicios`;

export interface MaterialResult {
  CENTRO: string;
  MATERIAL: string;
  DESCRIPCION: string;
}

export const serviciosService = {
  async buscarMateriales(
    busqueda: string,
    signal?: AbortSignal
  ): Promise<BodyListResponse<MaterialResult>> {
    const qs = new URLSearchParams({ Busqueda: busqueda });
    const response = await fetchWithAuth(`${API_URL}/materiales/buscar?${qs.toString()}`, {
      signal,
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || errorBody.msg || "Failed to search materiales");
    }
    return response.json();
  },
};
