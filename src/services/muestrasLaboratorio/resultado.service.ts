
import type { EnsayoCategoriaEnsayo, EnsayoMediciones, Familia, Muestra, Resultado, TipoUsuarioAplicacion } from "@/types/interfaces";
import type { BodyListResponse } from "@/types/body-list-response";
import type { BodyResponse } from "@/types/body-response";
import { fetchWithAuth } from "@/lib/http-client";
import { environment } from "@/environments/environments.prod";

const API_URL = `${environment.apiAPP}/api/resultado`;

/** Conserva los dígitos escritos. Number("108.120") los perdería al volver a texto. */
function valorTalCual(valor: Resultado["valor"]): string | null {
  if (valor == null || valor === "") return null;
  if (typeof valor === "string") {
    const texto = valor.trim().replace(",", ".");
    return /^-?\d+(\.\d+)?$/.test(texto) ? texto : null;
  }
  return Number.isFinite(valor) ? String(valor) : null;
}

export interface TablaVersionResultado {
  codigo_tabla: number;
  version?: string | number | null;
  nombre_tabla?: string | null;
  estado?: string | null;
  total: number;
}

export const resultadoService = {
  async getAll(): Promise<BodyListResponse<Resultado>> {
    const response = await fetchWithAuth(API_URL);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to fetch resultado');
    }
    return response.json();
  },

  async getById(id: number | string): Promise<BodyResponse<Resultado>> {
    const response = await fetchWithAuth(`${API_URL}/${id}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || `Failed to fetch resultado with id ${id}`);
    }
    return response.json();
  },

  /** Solo los resultados de los ensayos indicados, no el catálogo completo. */
  async getPorEnsayoTabla(
    codigoEnsayo: number,
    codigoTabla?: number
  ): Promise<BodyListResponse<Resultado> & { versiones: TablaVersionResultado[] }> {
    const qs = new URLSearchParams({
      codigo_ensayo_categoria_ensayo: String(codigoEnsayo),
    });
    if (codigoTabla && codigoTabla > 0) qs.set("codigo_tabla", String(codigoTabla));
    const response = await fetchWithAuth(`${API_URL}/por-ensayo-tabla?${qs.toString()}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: "Error desconocido" }));
      throw new Error(errorBody.message || errorBody.error || "Failed to fetch resultados por tabla");
    }
    const body = (await response.json()) as BodyListResponse<Resultado> & {
      versiones?: TablaVersionResultado[];
    };
    const lista = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
    return {
      ...body,
      data: lista,
      versiones: Array.isArray(body.versiones) ? body.versiones : [],
    };
  },

  async getByEnsayos(codigosEnsayo: number[]): Promise<BodyListResponse<Resultado>> {
    const ids = [...new Set(codigosEnsayo.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
    if (ids.length === 0) {
      return { data: [], size: 0 };
    }
    const qs = new URLSearchParams({ codigo_ensayo_categoria_ensayo: ids.join(",") });
    const response = await fetchWithAuth(`${API_URL}/por-ensayo?${qs.toString()}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || errorBody.error || 'Failed to fetch resultados del ensayo');
    }
    const body = (await response.json()) as BodyListResponse<Resultado>;
    const lista = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
    const permitidos = new Set(ids);
    return {
      ...body,
      data: lista.filter((r) => permitidos.has(Number(r.codigo_ensayo_categoria_ensayo))),
    };
  },

  async save(data: Resultado): Promise<BodyResponse<Resultado>> {
    const tomaN = data.toma == null ? null : Number(data.toma);
    const valorTexto = valorTalCual(data.valor);
    const payload: Resultado = {
      ...data,
      toma: Number.isFinite(tomaN as number) ? tomaN : null,
      valor: valorTexto as Resultado["valor"],
    };
    const response = await fetchWithAuth(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to save resultado');
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
};
