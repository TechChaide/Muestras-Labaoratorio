
import type { EnsayoCategoriaEnsayo, TipoUsuarioAplicacion } from "@/types/interfaces";
import type { BodyListResponse } from "@/types/body-list-response";
import type { BodyResponse } from "@/types/body-response";
import { fetchWithAuth } from "@/lib/http-client";
import { environment } from "@/environments/environments.prod";

const API_URL = `${environment.apiAPP}/api/ensayo_categoria_ensayo`;

export const ensayoCategoriaEnsayoService = {
  async getAll(): Promise<BodyListResponse<EnsayoCategoriaEnsayo>> {
    const response = await fetchWithAuth(API_URL);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to fetch ensayo-categoria-ensayo');
    }
    return response.json();
  },

  async getById(id: number | string): Promise<BodyResponse<EnsayoCategoriaEnsayo>> {
    const response = await fetchWithAuth(`${API_URL}/${id}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || `Failed to fetch ensayo-categoria-ensayo with id ${id}`);
    }
    return response.json();
  },

  async save(data: EnsayoCategoriaEnsayo): Promise<BodyResponse<EnsayoCategoriaEnsayo>> {
    const response = await fetchWithAuth(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to save ensayo-categoria-ensayo');
    }
    return response.json();
  },

  async delete(id: number | string): Promise<void> {
    const response = await fetchWithAuth(`${API_URL}/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || `Failed to delete tipo-usuario-aplicacion with id ${id}`);
    }
  },

  /** Registros activos sin muestra asignada (pendientes de carga de muestra), con solicitud y tipo de ensayo incluidos. */
  async getPendientesMuestra(): Promise<BodyListResponse<EnsayoCategoriaEnsayo>> {
    const response = await fetchWithAuth(`${API_URL}/pendientes-muestra`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to fetch pendientes de muestra');
    }
    return response.json();
  },

  /** Asigna una muestra recién cargada a uno o más registros pendientes en un solo request. */
  async asignarMuestra(codigoMuestra: number, ids: number[]): Promise<{ message: string; updated: number }> {
    const response = await fetchWithAuth(`${API_URL}/asignar-muestra`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_muestra: codigoMuestra, ids }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to asignar muestra');
    }
    return response.json();
  },

  /** Ensayos con captura de datos culminada, pendientes de revisión/aprobación. */
  async getPendientesAprobacion(): Promise<BodyListResponse<EnsayoCategoriaEnsayo>> {
    const response = await fetchWithAuth(`${API_URL}/pendientes-aprobacion`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to fetch pendientes de aprobación');
    }
    return response.json();
  },

  /** Transiciona el ensayo a "pendiente de aprobación" y notifica al equipo revisor (2.3). */
  async marcarPendienteAprobacion(id: number | string, correos?: string): Promise<BodyResponse<EnsayoCategoriaEnsayo>> {
    const response = await fetchWithAuth(`${API_URL}/${id}/pendiente-aprobacion`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correos }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to marcar pendiente de aprobación');
    }
    return response.json();
  },

  /**
   * Culminación a nivel de solicitud: marca PA todos los ensayos activos y envía
   * UNA sola notificación al jefe (cuando todos los tipos ya culminaron captura).
   */
  async marcarSolicitudPendienteAprobacion(
    codigoSolicitud: number | string,
    correos?: string
  ): Promise<{ data: EnsayoCategoriaEnsayo[]; updated: number; alreadyPending: number }> {
    const response = await fetchWithAuth(`${API_URL}/solicitud/${codigoSolicitud}/pendiente-aprobacion`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correos }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to marcar solicitud pendiente de aprobación');
    }
    return response.json();
  },

  /** Aprueba ('AP') o rechaza ('RE') el ensayo. Si se aprueba, notifica al solicitante (2.4). */
  async aprobarEnsayo(
    id: number | string,
    decision: 'AP' | 'RE',
    datos?: { usuario_aprobacion?: string; observaciones_aprobacion?: string; correos?: string }
  ): Promise<BodyResponse<EnsayoCategoriaEnsayo>> {
    const response = await fetchWithAuth(`${API_URL}/${id}/aprobar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, ...datos }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to aprobar/rechazar ensayo');
    }
    return response.json();
  },
};
