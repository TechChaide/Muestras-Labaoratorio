import type { Celda, Columna, Dependencias, Formula, Tabla } from "@/types/interfaces";
import { celdaService } from "@/services/muestrasLaboratorio/celda.service";
import { columnaService } from "@/services/muestrasLaboratorio/columna.service";
import { dependenciasService } from "@/services/muestrasLaboratorio/dependencias.service";
import { formulaService } from "@/services/muestrasLaboratorio/formula.service";
import { parseQualifiedRef, qualifyAlias } from "@/lib/formula/cross-table";
import { formulaApi } from "@/lib/formula";
import { cellPositionRef, colLetter } from "@/lib/formula/grid-utils";

export interface FormCellSnapshot {
  codigo_celda: number;
  codigo_tabla: number;
  fila: number;
  col: number;
  alias: string;
  tipo_celda: string;
  rowspan: number;
  colspan: number;
}

export interface FormulaDraft {
  codigo_celda: number;
  codigo_tabla: number;
  codigo_formula?: number;
  cellLabel: string;
  nombre: string;
  expresion: string;
  latex: string;
}

export interface FormFormulaContext {
  cells: FormCellSnapshot[];
  columnsByTable: Map<number, Columna[]>;
  drafts: FormulaDraft[];
  refMap: Map<string, number>;
}

export interface FormulaValidationIssue {
  codigo_celda: number;
  message: string;
}

function asArray<T>(data: T | T[] | undefined | null): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

async function silentDelete(run: () => Promise<void>) {
  try {
    await run();
  } catch {
    /* registro ya eliminado o FK */
  }
}

/** Mapa ref cualificada → codigo_celda para tablas del formulario. */
export function buildRefMap(cells: FormCellSnapshot[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of cells) {
    const pos = cellPositionRef(c.col, c.fila);
    const alias = (c.alias || "").trim();
    map.set(qualifyAlias(c.codigo_tabla, pos), c.codigo_celda);
    if (alias) {
      map.set(qualifyAlias(c.codigo_tabla, alias), c.codigo_celda);
    }
  }
  return map;
}

/** Resuelve una ref del DSL a codigo_celda dentro del formulario. */
export function resolveRefToCell(
  ref: string,
  targetTableId: number,
  refMap: Map<string, number>,
  cells: FormCellSnapshot[]
): number | null {
  const trimmed = (ref || "").trim();
  if (!trimmed) return null;

  const parsed = parseQualifiedRef(trimmed);
  if (parsed.codigoTabla != null) {
    return (
      refMap.get(qualifyAlias(parsed.codigoTabla, parsed.alias)) ??
      refMap.get(trimmed) ??
      null
    );
  }

  const name = parsed.alias;
  const sameTable = cells.filter(
    (c) =>
      c.codigo_tabla === targetTableId &&
      ((c.alias || "").trim() === name ||
        cellPositionRef(c.col, c.fila) === name)
  );
  if (sameTable.length === 1) return sameTable[0].codigo_celda;

  const global = cells.filter(
    (c) =>
      (c.alias || "").trim() === name || cellPositionRef(c.col, c.fila) === name
  );
  if (global.length === 1) return global[0].codigo_celda;

  return null;
}

export function cellRefToken(cell: FormCellSnapshot): string {
  const alias = (cell.alias || "").trim();
  return qualifyAlias(
    cell.codigo_tabla,
    alias || cellPositionRef(cell.col, cell.fila)
  );
}

export function validateFormulaDrafts(
  drafts: FormulaDraft[],
  refMap: Map<string, number>,
  cells: FormCellSnapshot[]
): FormulaValidationIssue[] {
  const issues: FormulaValidationIssue[] = [];

  for (const d of drafts) {
    const exp = d.expresion.trim();
    if (!exp) {
      issues.push({
        codigo_celda: d.codigo_celda,
        message: `Fórmula vacía en ${d.cellLabel}.`,
      });
      continue;
    }

    const compiled = formulaApi.compile(exp);
    if (!compiled.ok) {
      issues.push({
        codigo_celda: d.codigo_celda,
        message: `${d.cellLabel}: ${compiled.error}`,
      });
      continue;
    }

    for (const ref of compiled.refs) {
      const dep = resolveRefToCell(ref, d.codigo_tabla, refMap, cells);
      if (dep == null) {
        issues.push({
          codigo_celda: d.codigo_celda,
          message: `${d.cellLabel}: referencia "${ref}" no existe en este formulario.`,
        });
      } else if (dep === d.codigo_celda) {
        issues.push({
          codigo_celda: d.codigo_celda,
          message: `${d.cellLabel}: la fórmula no puede referenciarse a sí misma.`,
        });
      }
    }
  }

  return issues;
}

export async function loadFormFormulaContext(
  tableIds: number[]
): Promise<FormFormulaContext> {
  const allowed = new Set(tableIds.filter((id) => id > 0));
  if (allowed.size === 0) {
    return {
      cells: [],
      columnsByTable: new Map(),
      drafts: [],
      refMap: new Map(),
    };
  }

  const [cRes, colRes, fRes] = await Promise.all([
    celdaService.getAll().catch(() => ({ data: [] as Celda[] })),
    columnaService.getAll().catch(() => ({ data: [] as Columna[] })),
    formulaService.getAll().catch(() => ({ data: [] as Formula[] })),
  ]);

  const allCells = asArray(cRes.data).filter(
    (c) => c.codigo_tabla != null && allowed.has(c.codigo_tabla)
  );
  const allCols = asArray(colRes.data).filter(
    (c) => c.codigo_tabla != null && allowed.has(c.codigo_tabla)
  );
  const allFormulas = asArray(fRes.data);

  const formulasByCelda = new Map<number, Formula>();
  for (const f of allFormulas) {
    if (f.codigo_celda) formulasByCelda.set(f.codigo_celda, f);
  }

  const columnsByTable = new Map<number, Columna[]>();
  for (const col of allCols) {
    const tid = col.codigo_tabla!;
    const list = columnsByTable.get(tid) || [];
    list.push(col);
    columnsByTable.set(tid, list);
  }
  for (const [tid, cols] of columnsByTable) {
    columnsByTable.set(
      tid,
      cols.sort((a, b) => (a.indice || 0) - (b.indice || 0))
    );
  }

  const cells: FormCellSnapshot[] = allCells.map((c) => ({
    codigo_celda: c.codigo_celda,
    codigo_tabla: c.codigo_tabla!,
    fila: c.fila || 1,
    col: c.col || 1,
    alias: (c.alias || "").trim(),
    tipo_celda: String(c.tipo_celda || "label"),
    rowspan: Math.max(1, c.rowspan || 1),
    colspan: Math.max(1, c.colspan || 1),
  }));

  const refMap = buildRefMap(cells);

  const drafts: FormulaDraft[] = cells
    .filter((c) => c.tipo_celda === "calculated")
    .map((c) => {
      const f = formulasByCelda.get(c.codigo_celda);
      const label = cellRefToken(c);
      return {
        codigo_celda: c.codigo_celda,
        codigo_tabla: c.codigo_tabla,
        codigo_formula: f?.codigo_formula,
        cellLabel: label,
        nombre: f?.nombre || c.alias || `Fórmula ${colLetter(c.col)}${c.fila}`,
        expresion: f?.expresion || "",
        latex: f?.latex || "",
      };
    });

  return { cells, columnsByTable, drafts, refMap };
}

export async function saveFormFormulaDrafts(
  tableIds: number[],
  drafts: FormulaDraft[]
): Promise<void> {
  const ctx = await loadFormFormulaContext(tableIds);
  const issues = validateFormulaDrafts(drafts, ctx.refMap, ctx.cells);
  if (issues.length > 0) {
    throw new Error(issues.map((i) => i.message).join("\n"));
  }

  const draftByCell = new Map(drafts.map((d) => [d.codigo_celda, d]));
  const calculatedCells = ctx.cells.filter((c) => c.tipo_celda === "calculated");

  const fRes = await formulaService.getAll().catch(() => ({ data: [] as Formula[] }));
  const existingFormulas = asArray(fRes.data);
  const formulaByCell = new Map<number, Formula>();
  for (const f of existingFormulas) {
    if (f.codigo_celda) formulaByCell.set(f.codigo_celda, f);
  }

  const depRes = await dependenciasService
    .getAll()
    .catch(() => ({ data: [] as Dependencias[] }));
  const allDeps = asArray(depRes.data);

  for (const cell of calculatedCells) {
    const draft = draftByCell.get(cell.codigo_celda);
    const existing = formulaByCell.get(cell.codigo_celda);
    const exp = draft?.expresion.trim() || "";

    if (!exp) {
      if (existing?.codigo_formula) {
        await silentDelete(() => formulaService.delete(existing.codigo_formula!));
      }
      continue;
    }

    const compiled = formulaApi.compile(exp);
    if (!compiled.ok) {
      throw new Error(`${cellRefToken(cell)}: ${compiled.error}`);
    }

    const fSaved = await formulaService.save({
      codigo_formula: draft?.codigo_formula || existing?.codigo_formula || 0,
      codigo_celda: cell.codigo_celda,
      nombre: draft?.nombre || cell.alias || `Fórmula ${cell.codigo_celda}`,
      expresion: exp,
      latex: compiled.latex,
      ambito: "CELDA",
      estado: "A",
    });

    const codigoFormula =
      (fSaved.data as Formula)?.codigo_formula ||
      draft?.codigo_formula ||
      existing?.codigo_formula;
    if (!codigoFormula) continue;

    const depsToDelete = allDeps.filter((d) => d.codigo_formula === codigoFormula);
    for (const dep of depsToDelete) {
      if (dep.codigo_dependencia) {
        await silentDelete(() => dependenciasService.delete(dep.codigo_dependencia));
      }
    }

    for (const ref of compiled.refs) {
      const depCell = resolveRefToCell(ref, cell.codigo_tabla, ctx.refMap, ctx.cells);
      if (!depCell) continue;
      await dependenciasService.save({
        codigo_dependencia: 0,
        codigo_formula: codigoFormula,
        codigo_celda: depCell,
        estado: "A",
      });
    }
  }

  for (const cell of ctx.cells) {
    if (cell.tipo_celda === "calculated") continue;
    const existing = formulaByCell.get(cell.codigo_celda);
    if (existing?.codigo_formula) {
      await silentDelete(() => formulaService.delete(existing.codigo_formula!));
    }
  }
}

export function tableDisplayName(tabla: Tabla | undefined, codigoTabla: number): string {
  return tabla?.nombre_tabla?.trim() || `Tabla #${codigoTabla}`;
}

/** Elimina fórmulas de celdas que ya no son tipo calculated (Editor de Tablas). */
export async function purgeOrphanFormulasForTable(
  codigoTabla: number,
  calculatedCellIds: Set<number>
): Promise<void> {
  const cRes = await celdaService.getAll().catch(() => ({ data: [] as Celda[] }));
  const cellIds = asArray(cRes.data)
    .filter((c) => c.codigo_tabla === codigoTabla && c.codigo_celda)
    .map((c) => c.codigo_celda);

  if (cellIds.length === 0) return;

  const fRes = await formulaService.getAll().catch(() => ({ data: [] as Formula[] }));
  for (const f of asArray(fRes.data)) {
    if (!f.codigo_celda || !f.codigo_formula) continue;
    if (!cellIds.includes(f.codigo_celda)) continue;
    if (!calculatedCellIds.has(f.codigo_celda)) {
      await silentDelete(() => formulaService.delete(f.codigo_formula!));
    }
  }
}
