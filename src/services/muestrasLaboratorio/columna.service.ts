import type { Columna } from "@/types/interfaces";
import type { BodyListResponse } from "@/types/body-list-response";
import type { BodyResponse } from "@/types/body-response";
import { fetchWithAuth } from "@/lib/http-client";
import { environment } from "@/environments/environments.prod";

const API_URL = `${environment.apiAPP}/api/Columna`;

export const columnaService = {
  async getAll(): Promise<BodyListResponse<Columna>> {
    const response = await fetchWithAuth(API_URL);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch columnas");
    }
    return response.json();
  },

  async getByTabla(codigoTabla: number): Promise<BodyListResponse<Columna>> {
    const response = await fetchWithAuth(`${API_URL}/por-tabla?codigo_tabla=${codigoTabla}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || errorBody.error || "Failed to fetch columnas por tabla");
    }
    return response.json();
  },

  async getById(id: number | string): Promise<BodyResponse<Columna>> {
    const response = await fetchWithAuth(`${API_URL}/${id}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || `Failed to fetch columna with id ${id}`);
    }
    return response.json();
  },

  async save(data: Columna): Promise<BodyResponse<Columna>> {
    const response = await fetchWithAuth(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to save columna");
    }
    return response.json();
  },

  async delete(id: number | string): Promise<void> {
    const response = await fetchWithAuth(`${API_URL}/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || `Failed to delete columna with id ${id}`);
    }
  },
};
