import { fetchWithAuth } from "@/lib/http-client";
import { environment } from "@/environments/environments.prod";

/** Entrega de informe PDF por correo — API Express del backend de aplicación
 * (`POST /api/informes/enviar-resultados`), no la API local de Next que
 * guarda/lista los .txt del editor. */
const API_URL = `${environment.apiAPP}/api/informes`;

export interface EnviarInformePayload {
  correos: string;
  asunto?: string;
  cuerpoHtml?: string;
  pdfBase64: string;
  nombreArchivo?: string;
}

export const informeEntregaService = {
  async enviarResultados(payload: EnviarInformePayload): Promise<void> {
    const response = await fetchWithAuth(`${API_URL}/enviar-resultados`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(
        errorBody.message || errorBody.error || "No se pudo enviar el informe por correo."
      );
    }
  },
};
