import { environment } from "@/environments/environments.prod";
import { fetchWithAuth } from "@/lib/http-client";

const API_URL = `${environment.basePath}/api/informes`;

export interface InformeListado {
  nombre: string;
  fecha_modificacion: string;
  codigo_familia?: number;
  codigo_tipo_ensayo?: number;
}

export interface InformeCargado {
  nombre: string;
  contenido: string;
  codigo_familia?: number;
  codigo_tipo_ensayo?: number;
}

export const informeService = {
  async listar(): Promise<InformeListado[]> {
    const response = await fetchWithAuth(API_URL);
    if (!response.ok) throw new Error("No se pudo listar los informes.");
    const body = await response.json();
    return body.data as InformeListado[];
  },

  async cargar(nombre: string): Promise<InformeCargado> {
    const response = await fetchWithAuth(`${API_URL}/${encodeURIComponent(nombre)}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Error desconocido" }));
      throw new Error(errorBody.error || "No se pudo cargar el informe.");
    }
    const body = await response.json();
    return body.data as InformeCargado;
  },

  /** Guarda (crea o sobrescribe) un informe, clasificado por familia y tipo
   * de ensayo (ver ClasificarInformeDialog). Devuelve el nombre real usado
   * (puede diferir levemente si el backend sanitizó caracteres). */
  async guardar(
    nombre: string,
    contenido: string,
    codigoFamilia: number,
    codigoTipoEnsayo: number
  ): Promise<string> {
    const response = await fetchWithAuth(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        contenido,
        codigo_familia: codigoFamilia,
        codigo_tipo_ensayo: codigoTipoEnsayo,
      }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Error desconocido" }));
      throw new Error(errorBody.error || "No se pudo guardar el informe.");
    }
    const body = await response.json();
    return body.data.nombre as string;
  },
};
