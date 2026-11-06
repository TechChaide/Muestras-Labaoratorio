
import type { EnsayoCategoriaEnsayo, EnsayoMediciones, Familia, Muestra, Resultado, Solicitud, TipoUsuarioAplicacion } from "@/types/interfaces";
import type { BodyListResponse } from "@/types/body-list-response";
import type { BodyResponse } from "@/types/body-response";
import { fetchWithAuth } from "@/lib/http-client";
import { environment } from "@/environments/environments.prod";

const API_URL = `${environment.apiAPP}/api/solicitud`;

export const solicitudService = {
  async getAll(): Promise<BodyListResponse<Solicitud>> {
    const response = await fetchWithAuth(API_URL);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to fetch solicitud');
    }
    return response.json();
  },

  async getById(id: number | string): Promise<BodyResponse<Solicitud>> {
    const response = await fetchWithAuth(`${API_URL}/${id}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || `Failed to fetch solicitud with id ${id}`);
    }
    return response.json();
  },

  async save(data: Solicitud): Promise<BodyResponse<Solicitud>> {
    const response = await fetchWithAuth(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to save solicitud');
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

  async getUltimaSolicitudFamilia(mnemonicoFamilia: string, mes: string, anio: string): Promise<BodyResponse<Solicitud>> {
    const response = await fetchWithAuth(API_URL + '/getUltimaSolicitud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mnemonicoFamilia, mes, anio }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to save solicitud');
    }
    return response.json();
  },
};
