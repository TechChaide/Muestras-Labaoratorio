import type { Tabla } from "@/types/interfaces";
import type { BodyListResponse } from "@/types/body-list-response";
import type { BodyResponse } from "@/types/body-response";
import { fetchWithAuth } from "@/lib/http-client";
import { environment } from "@/environments/environments.prod";

const API_URL = `${environment.apiAPP}/api/Tabla`;

export interface TablaDependenciaFormulario {
  codigo_formulario: number;
  nombre_formulario?: string;
  cabecera_formulario?: string;
}

export interface TablaDependenciaEnsayo {
  codigo_ensayo_categoria_ensayo: number;
  codigo_tipo_ensayo?: number;
  nombre_tipo_ensayo?: string;
  estado?: string;
}

export interface TablaDependencias {
  codigo_tabla: number;
  /** true si algún formulario ACTIVO todavía referencia esta tabla. */
  en_uso: boolean;
  formularios: TablaDependenciaFormulario[];
  /** Ensayos (instancias) que dependen de esos formularios. */
  ensayos: TablaDependenciaEnsayo[];
  /** Resultados ya capturados sobre celdas de esta tabla (dato real, aunque
   * ningún formulario activo la use ahora mismo). */
  total_resultados_capturados: number;
}

export const tablaService = {
  async getAll(): Promise<BodyListResponse<Tabla>> {
    const response = await fetchWithAuth(API_URL);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to fetch tablas");
    }
    return response.json();
  },

  async getById(id: number | string): Promise<BodyResponse<Tabla>> {
    const response = await fetchWithAuth(`${API_URL}/${id}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || `Failed to fetch tabla with id ${id}`);
    }
    return response.json();
  },

  async save(data: Tabla): Promise<BodyResponse<Tabla>> {
    const response = await fetchWithAuth(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || "Failed to save tabla");
    }
    return response.json();
  },

  /** Formularios activos que referencian la tabla y ensayos que dependen de
   * ellos, resuelto en el servidor (ver tabla.controller.js#getDependencias). */
  async getDependencias(id: number | string): Promise<TablaDependencias> {
    const response = await fetchWithAuth(`${API_URL}/${id}/dependencias`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Error desconocido" }));
      throw new Error(errorBody.error || errorBody.message || "No se pudo verificar el uso de la tabla.");
    }
    const body = await response.json();
    return body.data as TablaDependencias;
  },

  /** Desactiva la tabla y en cascada columna/celda/formula/dependencias y sus
   * vínculos formulario_tabla. El backend rechaza (409) si algún formulario
   * activo aún la usa — revisar con getDependencias antes de confirmar. */
  async delete(id: number | string): Promise<void> {
    const response = await fetchWithAuth(`${API_URL}/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Error desconocido" }));
      throw new Error(errorBody.error || errorBody.message || `Failed to delete tabla with id ${id}`);
    }
  },
};
