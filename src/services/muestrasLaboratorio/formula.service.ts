import type { Formula } from "@/types/interfaces";
import type { BodyListResponse } from "@/types/body-list-response";
import type { BodyResponse } from "@/types/body-response";
import { fetchWithAuth } from "@/lib/http-client";
import { environment } from "@/environments/environments.prod";

const API_URL = `${environment.apiAPP}/api/Formula`;

export const formulaService = {
  async getAll(): Promise<BodyListResponse<Formula>> {
    const response = await fetchWithAuth(API_URL);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch formulas");
    }
    return response.json();
  },

  async getByTabla(codigoTabla: number): Promise<BodyListResponse<Formula>> {
    const response = await fetchWithAuth(`${API_URL}/por-tabla?codigo_tabla=${codigoTabla}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || errorBody.error || "Failed to fetch formulas por tabla");
    }
    return response.json();
  },

  async getById(id: number | string): Promise<BodyResponse<Formula>> {
    const response = await fetchWithAuth(`${API_URL}/${id}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || `Failed to fetch formula with id ${id}`);
    }
    return response.json();
  },

  async save(data: Formula): Promise<BodyResponse<Formula>> {
    const response = await fetchWithAuth(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to save formula");
    }
    return response.json();
  },

  async delete(id: number | string): Promise<void> {
    const response = await fetchWithAuth(`${API_URL}/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || `Failed to delete formula with id ${id}`);
    }
  },
};
