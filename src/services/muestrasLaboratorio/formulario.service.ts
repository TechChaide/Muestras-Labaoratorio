import type { Formulario, FormularioTabla } from "@/types/interfaces";
import type { BodyListResponse } from "@/types/body-list-response";
import type { BodyResponse } from "@/types/body-response";
import { fetchWithAuth } from "@/lib/http-client";
import { environment } from "@/environments/environments.prod";

const API_URL = `${environment.apiAPP}/api/Formulario`;

export const formularioService = {
  async getAll(): Promise<BodyListResponse<Formulario>> {
    const response = await fetchWithAuth(API_URL);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch formularios");
    }
    return response.json();
  },

  async getById(id: number | string): Promise<BodyResponse<Formulario>> {
    const response = await fetchWithAuth(`${API_URL}/${id}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || `Failed to fetch formulario with id ${id}`);
    }
    return response.json();
  },

  /** Secciones del formulario. Con el id del ensayo, si los resultados están
   * en una versión anterior de la misma tabla, el backend devuelve esa versión. */
  async getTablas(id: number | string, codigoEnsayo?: number): Promise<BodyListResponse<FormularioTabla>> {
    const qs = new URLSearchParams();
    if (codigoEnsayo && codigoEnsayo > 0) {
      qs.set("codigo_ensayo_categoria_ensayo", String(codigoEnsayo));
    }
    const query = qs.toString();
    const response = await fetchWithAuth(`${API_URL}/${id}/tablas${query ? `?${query}` : ""}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || errorBody.error || `Failed to fetch tablas del formulario ${id}`);
    }
    return response.json();
  },

  async save(data: Formulario): Promise<BodyResponse<Formulario>> {
    const response = await fetchWithAuth(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to save formulario");
    }
    return response.json();
  },

  async delete(id: number | string): Promise<void> {
    const response = await fetchWithAuth(`${API_URL}/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || `Failed to delete formulario with id ${id}`);
    }
  },
};
