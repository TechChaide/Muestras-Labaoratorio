import { environment } from "@/environments/environments.prod";
import { fetchWithAuth } from "@/lib/http-client";

// Ruta propia de Next.js (src/app/api/upload/imagen/route.ts), no del backend Express.
// Hay que anteponer basePath a mano: fetch() no reescribe rutas relativas como sí
// hacen next/link o next/image (mismo patrón que camera-modal.tsx con el logo).
const API_URL = `${environment.basePath}/api/upload/imagen`;

export const uploadService = {
  /** Sube una imagen para una celda tipo_dato = 'imagen'. Devuelve la URL relativa
   * (servida como estática por Next.js desde /public/uploads) para guardar en
   * Resultado.resultados. */
  async uploadImagen(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("imagen", file);

    const response = await fetchWithAuth(API_URL, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Error desconocido" }));
      throw new Error(errorBody.error || "No se pudo subir la imagen.");
    }

    const body = await response.json();
    const url = body?.data?.url;
    if (!url) throw new Error("El servidor no devolvió la URL de la imagen.");
    return url as string;
  },

  /** Convierte una URL relativa (/uploads/...) devuelta por el upload en una URL
   * navegable, anteponiendo basePath. */
  resolveUrl(relativeUrl: string): string {
    if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
    return `${environment.basePath}${relativeUrl}`;
  },
};
