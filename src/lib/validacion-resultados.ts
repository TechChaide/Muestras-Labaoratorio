import { parseValorNumerico } from "@/lib/formula/grid-utils";
import type { Resultado } from "@/types/interfaces";

export interface CeldaValidable {
  codigo_celda: number;
  codigo_tabla: number;
  esTexto: boolean;
}

export interface CorreccionResultado {
  codigo_resultado: number;
  codigo_celda: number;
  codigo_tabla: number;
  toma?: number;
  esTexto: boolean;
  valorGuardado: string;
  /** Texto exacto que se ve en la celda. */
  valorMostrado: string;
}

/** Lo que quedó guardado para comparar con la pantalla. `resultados` manda si trae el texto. */
function textoGuardado(row: Resultado): string {
  const crudo = row.resultados ?? "";
  if (crudo.trim() !== "") return crudo;
  if (row.valor == null || String(row.valor).trim() === "") return "";
  const s = String(row.valor).trim();
  if (!s.includes(".")) return s;
  return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** Si hay varias filas para la misma celda, manda la más reciente. */
export function resultadoVigente(rows: Resultado[]): Resultado | undefined {
  return [...rows].sort((a, b) => {
    const fa = a.fecha_generacion ? new Date(a.fecha_generacion).getTime() : 0;
    const fb = b.fecha_generacion ? new Date(b.fecha_generacion).getTime() : 0;
    if (fb !== fa) return fb - fa;
    return (b.codigo_resultado || 0) - (a.codigo_resultado || 0);
  })[0];
}

/** Lee de la pantalla los valores numéricos que el usuario está viendo en cada celda. */
export function leerValoresMostrados(contenedor: HTMLElement): Map<number, string> {
  const mostrados = new Map<number, string>();
  contenedor.querySelectorAll<HTMLElement>("[data-codigo-celda]").forEach((td) => {
    const control = td.querySelector<HTMLInputElement>("input:not([type=file])");
    const calculado = td.querySelector<HTMLElement>("[data-valor-calculado]");
    const valor = control ? control.value : (calculado?.textContent || "").replace("—", "");
    mostrados.set(Number(td.dataset.codigoCelda), valor.trim());
  });
  return mostrados;
}

/**
 * Compara cada celda de la pantalla con la fila guardada de esa misma celda.
 * Si el texto difiere, la pantalla manda. No crea filas ni vacía una celda:
 * un lado vacío se deja como está.
 */
export function calcularCorrecciones(
  celdas: CeldaValidable[],
  filas: Resultado[],
  mostrados: Map<number, string>
): CorreccionResultado[] {
  const porCelda = new Map<number, Resultado[]>();
  for (const fila of filas) {
    if (fila.codigo_celda == null) continue;
    const lista = porCelda.get(fila.codigo_celda) || [];
    lista.push(fila);
    porCelda.set(fila.codigo_celda, lista);
  }

  const correcciones: CorreccionResultado[] = [];
  for (const celda of celdas) {
    const vigente = resultadoVigente(porCelda.get(celda.codigo_celda) || []);
    const mostrado = (mostrados.get(celda.codigo_celda) ?? "").trim();
    const guardado = vigente ? textoGuardado(vigente).trim() : "";
    if (!vigente?.codigo_resultado || mostrado === "" || guardado === "") continue;
    if (mostrado === guardado) continue;
    if (!celda.esTexto) {
      const nMostrado = parseValorNumerico(mostrado.replace(",", "."));
      const nGuardado = parseValorNumerico(guardado.replace(",", "."));
      if (nMostrado == null || nGuardado == null) continue;
    }
    correcciones.push({
      codigo_resultado: vigente.codigo_resultado,
      codigo_celda: celda.codigo_celda,
      codigo_tabla: celda.codigo_tabla,
      toma: vigente.toma,
      esTexto: celda.esTexto,
      valorGuardado: guardado,
      valorMostrado: mostrado,
    });
  }
  return correcciones;
}
