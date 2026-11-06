import {
  loadFormFormulaContext,
  bindLiveFormulas,
  cellRefToken,
  parseValorNumerico,
  formulaApi,
  type FormCellSnapshot,
} from "@/lib/formula";
import { resultadoService } from "@/services/muestrasLaboratorio/resultado.service";
import { formatAliasDisplay } from "@/lib/utils";
import { CELDA_IMAGEN_PREFIJO, type TablaCeldaInforme } from "@/lib/informe/parser";
import type { Resultado } from "@/types/interfaces";

const TEXT_TIPOS_DATO = new Set(["texto", "fecha", "booleano", "imagen"]);
const esCeldaTexto = (cell: Pick<FormCellSnapshot, "tipo_celda" | "tipo_dato">) =>
  cell.tipo_celda !== "calculated" && TEXT_TIPOS_DATO.has(cell.tipo_dato);

const asArray = <T,>(data: T | T[] | undefined): T[] =>
  Array.isArray(data) ? data : data ? [data] : [];

export interface TablaSnapshotResult {
  titulo: string;
  columnas: TablaCeldaInforme[];
  filas: TablaCeldaInforme[][];
}

/** Construye una "foto" de una tabla con los datos ya capturados de UN
 * ensayo puntual — para insertarla como snapshot en un informe (no una
 * referencia viva; si el ensayo cambia después, el informe no se actualiza).
 * Respeta rowspan/colspan: las celdas cubiertas por un merge se marcan
 * `covered` (no se inventan celdas vacías independientes). */
export async function construirSnapshotTabla(
  codigoEnsayoCategoriaEnsayo: number,
  codigoTabla: number,
  tituloTabla: string
): Promise<TablaSnapshotResult> {
  const ctx = await loadFormFormulaContext([codigoTabla]);
  const celdas = ctx.cells.filter((c) => c.codigo_tabla === codigoTabla);
  if (!celdas.length) return { titulo: tituloTabla, columnas: [], filas: [] };

  const liveFormulas = bindLiveFormulas(ctx.drafts, ctx.cells, ctx.refMap);
  const formulaIds = new Set(liveFormulas.map((f) => f.id));

  const resultadosRes = await resultadoService.getByEnsayos([codigoEnsayoCategoriaEnsayo]);
  const propios = asArray<Resultado>(resultadosRes.data).filter(
    (r) => r.codigo_ensayo_categoria_ensayo === codigoEnsayoCategoriaEnsayo && r.estado === "A"
  );

  const cellsById = new Map(ctx.cells.map((c) => [c.codigo_celda, c]));
  const inputValues: Record<string, number> = {};
  const textValues: Record<string, string> = {};
  for (const r of propios) {
    if (r.codigo_celda == null) continue;
    const cell = cellsById.get(r.codigo_celda);
    if (!cell) continue;
    const ref = cellRefToken(cell);
    if (cell.tipo_celda === "calculated" || formulaIds.has(ref)) continue;
    if (esCeldaTexto(cell)) {
      if (r.resultados != null) textValues[ref] = r.resultados;
    } else {
      const n = parseValorNumerico(r.valor);
      if (n != null) inputValues[ref] = n;
    }
  }

  const computed = formulaApi.evaluateLive(liveFormulas, inputValues);

  let maxRow = 0;
  let maxCol = 0;
  const byAnchor = new Map<string, FormCellSnapshot>();
  for (const c of celdas) {
    maxRow = Math.max(maxRow, c.fila + c.rowspan - 1);
    maxCol = Math.max(maxCol, c.col + c.colspan - 1);
    byAnchor.set(`${c.fila}:${c.col}`, c);
  }

  const displayValue = (cel: FormCellSnapshot): string => {
    const ref = cellRefToken(cel);
    if (cel.tipo_celda === "calculated" || formulaIds.has(ref)) {
      const v = computed.values[ref];
      return v != null && Number.isFinite(v) ? String(Math.round((v as number) * 10000) / 10000) : "";
    }
    if (cel.tipo_celda === "input") {
      const tipoDato = cel.tipo_dato || "texto";
      if (tipoDato === "nulos") return "";
      if (esCeldaTexto(cel)) {
        const raw = textValues[ref] || "";
        return tipoDato === "imagen" && raw ? `${CELDA_IMAGEN_PREFIJO}${raw}` : raw;
      }
      const v = inputValues[ref];
      return v != null && Number.isFinite(v) ? String(v) : "";
    }
    return formatAliasDisplay(cel.alias) || "";
  };

  const grid: (TablaCeldaInforme | null)[][] = Array.from({ length: maxRow }, () =>
    Array.from({ length: maxCol }, () => null)
  );

  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      if (grid[r - 1][c - 1]?.covered) continue;
      const anchor = byAnchor.get(`${r}:${c}`);
      if (!anchor) {
        grid[r - 1][c - 1] = { text: "" };
        continue;
      }
      const rs = Math.max(1, anchor.rowspan || 1);
      const cs = Math.max(1, anchor.colspan || 1);
      grid[r - 1][c - 1] = {
        text: displayValue(anchor),
        rowSpan: rs > 1 ? rs : undefined,
        colSpan: cs > 1 ? cs : undefined,
      };
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = r - 1 + dr;
          const cc = c - 1 + dc;
          if (rr < maxRow && cc < maxCol) {
            grid[rr][cc] = { text: "", covered: true };
          }
        }
      }
    }
  }

  const materialize = (row: (TablaCeldaInforme | null)[]): TablaCeldaInforme[] =>
    row.map((cell) => cell || { text: "" });

  const first = materialize(grid[0] || []);
  const rest = grid.slice(1).map(materialize);
  return { titulo: tituloTabla, columnas: first, filas: rest };
}
