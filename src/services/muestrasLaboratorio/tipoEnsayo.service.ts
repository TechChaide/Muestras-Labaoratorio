
import type { EnsayoCategoriaEnsayo, EnsayoMediciones, Familia, Muestra, Resultado, Solicitud, TipoEnsayo, TipoUsuarioAplicacion } from "@/types/interfaces";
import type { BodyListResponse } from "@/types/body-list-response";
import type { BodyResponse } from "@/types/body-response";
import { environment } from "@/environments/environments.prod";
import { fetchWithAuth } from "@/lib/http-client";

const API_URL = `${environment.apiAPP}/api/tipo_ensayo`;

export const tipoEnsayoService = {
  async getAll(): Promise<BodyListResponse<TipoEnsayo>> {
    const response = await fetchWithAuth(API_URL);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to fetch tipo ensayo');
    }
    return response.json();
  },

  async getById(id: number | string): Promise<BodyResponse<TipoEnsayo>> {
    const response = await fetchWithAuth(`${API_URL}/${id}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || `Failed to fetch tipo ensayo with id ${id}`);
    }
    return response.json();
  },

  async save(data: TipoEnsayo): Promise<BodyResponse<TipoEnsayo>> {
    const response = await fetchWithAuth(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to save tipo ensayo');
    }
    return response.json();
  },

  async delete(id: number | string): Promise<void> {
    const response = await fetchWithAuth(`${API_URL}/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || `Failed to delete ensayo-mediciones with id ${id}`);
    }
  },


  async getTablasActivasPorTipoDeEnsayo(): Promise<any> {
    const response = await fetchWithAuth(`${API_URL}/activeTablesByTE`, {
      method: 'GET',
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || `Failed to fetch tablas activas por tipo de ensayo`);
    }
    return response.json();
  },

};
