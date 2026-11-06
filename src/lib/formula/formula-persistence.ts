import type { Celda, Columna, Dependencias, Formula, Tabla } from "@/types/interfaces";
import { celdaService } from "@/services/muestrasLaboratorio/celda.service";
import { columnaService } from "@/services/muestrasLaboratorio/columna.service";
import { dependenciasService } from "@/services/muestrasLaboratorio/dependencias.service";
import { formulaService } from "@/services/muestrasLaboratorio/formula.service";
import { parseQualifiedRef, qualifyAlias, rewriteTableRefsInExpression } from "@/lib/formula/cross-table";
import { formulaApi } from "@/lib/formula/calc-api";
import { cellPositionRef, colLetter } from "@/lib/formula/grid-utils";
import { tokenize } from "@/lib/formula/tokenize";
import type { LiveFormulaDef } from "@/lib/formula/types";

/** Tipos de celda que pueden llevar una fórmula asociada (entrada o calculada). */
const FORMULA_ELIGIBLE_TIPOS = new Set(["input", "calculated"]);
/** tipo_dato que nunca produce un valor numérico, así que no puede participar
 * en una fórmula (el motor de fórmulas solo trabaja con números). "texto" se
 * deja fuera de esta lista a propósito: es también el valor por defecto de
 * celdas creadas antes de que existiera tipo_dato, que en la práctica ya
 * tenían fórmulas numéricas asociadas. */
const FORMULA_INELIGIBLE_TIPOS_DATO = new Set(["imagen", "fecha", "booleano", "nulos"]);

export function isFormulaEligible(tipoCelda: string, tipoDato?: string): boolean {
  if (!FORMULA_ELIGIBLE_TIPOS.has(tipoCelda)) return false;
  if (tipoDato && FORMULA_INELIGIBLE_TIPOS_DATO.has(tipoDato)) return false;
  return true;
}

export interface FormCellSnapshot {
  codigo_celda: number;
  codigo_tabla: number;
  fila: number;
  col: number;
  alias: string;
  tipo_celda: string;
  tipo_dato: string;
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

export type ResolveRefOutcome =
  | { ok: true; codigo_celda: number }
  | { ok: false; reason: "missing" | "ambiguous"; hint: string };

/** Resuelve una ref del DSL con detalle (falta vs ambigüedad entre alias). */
export function resolveRefDetailed(
  ref: string,
  targetTableId: number,
  refMap: Map<string, number>,
  cells: FormCellSnapshot[]
): ResolveRefOutcome {
  const trimmed = (ref || "").trim();
  if (!trimmed) {
    return { ok: false, reason: "missing", hint: "Referencia vacía." };
  }

  const parsed = parseQualifiedRef(trimmed);
  if (parsed.codigoTabla != null) {
    const id =
      refMap.get(qualifyAlias(parsed.codigoTabla, parsed.alias)) ??
      refMap.get(trimmed) ??
      null;
    if (id == null) {
      return {
        ok: false,
        reason: "missing",
        hint: `No existe "${trimmed}" en este formulario.`,
      };
    }
    return { ok: true, codigo_celda: id };
  }

  const name = parsed.alias;
  const sameTable = cells.filter(
    (c) =>
      c.codigo_tabla === targetTableId &&
      ((c.alias || "").trim() === name ||
        cellPositionRef(c.col, c.fila) === name)
  );
  if (sameTable.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      hint: `"${name}" aparece ${sameTable.length} veces en esta tabla. Usa un alias único o T${targetTableId}.${name} con posición distinta.`,
    };
  }
  if (sameTable.length === 1) {
    return { ok: true, codigo_celda: sameTable[0].codigo_celda };
  }

  const global = cells.filter(
    (c) =>
      (c.alias || "").trim() === name || cellPositionRef(c.col, c.fila) === name
  );
  if (global.length > 1) {
    const tables = [...new Set(global.map((c) => `T${c.codigo_tabla}`))].join(", ");
    return {
      ok: false,
      reason: "ambiguous",
      hint: `"${name}" aparece en varias tablas (${tables}). Usa T{id}.${name} (ej. T${global[0].codigo_tabla}.${name}).`,
    };
  }
  if (global.length === 1) {
    return { ok: true, codigo_celda: global[0].codigo_celda };
  }

  return {
    ok: false,
    reason: "missing",
    hint: `Referencia "${trimmed}" no existe en este formulario.`,
  };
}

/** Resuelve una ref del DSL a codigo_celda dentro del formulario. */
export function resolveRefToCell(
  ref: string,
  targetTableId: number,
  refMap: Map<string, number>,
  cells: FormCellSnapshot[]
): number | null {
  const r = resolveRefDetailed(ref, targetTableId, refMap, cells);
  return r.ok ? r.codigo_celda : null;
}

export function cellRefToken(cell: FormCellSnapshot): string {
  const alias = (cell.alias || "").trim();
  return qualifyAlias(
    cell.codigo_tabla,
    alias || cellPositionRef(cell.col, cell.fila)
  );
}

/**
 * Reescribe cada referencia de la fórmula al token de la celda (T{tabla}.{alias}).
 * Así el cálculo en vivo usa las mismas claves que los valores capturados,
 * sin que el usuario tenga que enfocar la celda calculada.
 */
export function bindLiveFormulas(
  drafts: FormulaDraft[],
  cells: FormCellSnapshot[],
  refMap: Map<string, number>
): LiveFormulaDef[] {
  const byId = new Map(cells.map((c) => [c.codigo_celda, c]));

  return drafts
    .filter((d) => {
      if (d.expresion.trim() === "") return false;
      const cell = byId.get(d.codigo_celda);
      if (!cell) return false;
      return isFormulaEligible(cell.tipo_celda, cell.tipo_dato);
    })
    .map((d) => {
      const { tokens, error } = tokenize(d.expresion);
      if (error) return { id: d.cellLabel, expresion: d.expresion };

      const dependsOn: string[] = [];
      const expresion = tokens
        .map((token, index) => {
          if (token.type !== "ident") return token.raw;
          const next = tokens[index + 1];
          if (next?.type === "op" && next.value === "(") return token.raw;
          const codigo = resolveRefToCell(token.value, d.codigo_tabla, refMap, cells);
          const cell = codigo == null ? undefined : byId.get(codigo);
          if (!cell) return token.raw;
          const canon = cellRefToken(cell);
          dependsOn.push(canon);
          return canon;
        })
        .join("");

      return { id: d.cellLabel, expresion, dependsOn };
    });
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
      // Vacía: permitido. Se puede ir guardando celda a celda; saveFormFormulaDrafts
      // simplemente no escribe (o borra) la fórmula de las calculadas aún vacías.
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
      const resolved = resolveRefDetailed(ref, d.codigo_tabla, refMap, cells);
      if (!resolved.ok) {
        issues.push({
          codigo_celda: d.codigo_celda,
          message: `${d.cellLabel}: ${resolved.hint}`,
        });
      } else if (resolved.codigo_celda === d.codigo_celda) {
        issues.push({
          codigo_celda: d.codigo_celda,
          message: `${d.cellLabel}: la fórmula no puede referenciarse a sí misma.`,
        });
      }
    }
  }

  // Ciclos A→B→A (u otros) entre celdas con fórmula.
  const graph = new Map<number, number[]>();
  for (const d of drafts) {
    const exp = d.expresion.trim();
    if (!exp) continue;
    const compiled = formulaApi.compile(exp);
    if (!compiled.ok) continue;
    const deps: number[] = [];
    for (const ref of compiled.refs) {
      const resolved = resolveRefDetailed(ref, d.codigo_tabla, refMap, cells);
      if (resolved.ok && resolved.codigo_celda !== d.codigo_celda) {
        deps.push(resolved.codigo_celda);
      }
    }
    graph.set(d.codigo_celda, deps);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<number, number>();
  const stack: number[] = [];
  const cycleCells = new Set<number>();

  const dfs = (node: number): boolean => {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of graph.get(node) || []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const idx = stack.indexOf(next);
        for (const n of stack.slice(idx >= 0 ? idx : 0)) cycleCells.add(n);
        cycleCells.add(node);
        return true;
      }
      if (c === WHITE && dfs(next)) return true;
    }
    stack.pop();
    color.set(node, BLACK);
    return false;
  };

  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) dfs(node);
  }

  if (cycleCells.size > 0) {
    for (const id of cycleCells) {
      const d = drafts.find((x) => x.codigo_celda === id);
      if (!d) continue;
      if (issues.some((i) => i.codigo_celda === id && i.message.includes("cíclica"))) continue;
      issues.push({
        codigo_celda: id,
        message: `${d.cellLabel}: dependencia cíclica con otras fórmulas (A→B→A). Quita el ciclo.`,
      });
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

  const ids = [...allowed];
  const targeted = await Promise.all(
    ids.map(async (id) => {
      const [cRes, colRes, fRes] = await Promise.all([
        celdaService.getByTabla(id),
        columnaService.getByTabla(id),
        formulaService.getByTabla(id),
      ]);
      return {
        cells: asArray(cRes.data),
        cols: asArray(colRes.data),
        formulas: asArray(fRes.data),
      };
    })
  ).catch(() => null);

  let allCells: Celda[];
  let allCols: Columna[];
  let allFormulas: Formula[];
  if (targeted) {
    allCells = targeted.flatMap((t) => t.cells);
    allCols = targeted.flatMap((t) => t.cols);
    allFormulas = targeted.flatMap((t) => t.formulas);
  } else {
    const [cRes, colRes, fRes] = await Promise.all([
      celdaService.getAll().catch(() => ({ data: [] as Celda[] })),
      columnaService.getAll().catch(() => ({ data: [] as Columna[] })),
      formulaService.getAll().catch(() => ({ data: [] as Formula[] })),
    ]);
    allCells = asArray(cRes.data).filter(
      (c) => c.codigo_tabla != null && allowed.has(c.codigo_tabla)
    );
    allCols = asArray(colRes.data).filter(
      (c) => c.codigo_tabla != null && allowed.has(c.codigo_tabla)
    );
    allFormulas = asArray(fRes.data);
  }

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
    tipo_dato: String(c.tipo_dato || "texto"),
    rowspan: Math.max(1, c.rowspan || 1),
    colspan: Math.max(1, c.colspan || 1),
  }));

  const refMap = buildRefMap(cells);

  const drafts: FormulaDraft[] = cells
    .filter((c) => isFormulaEligible(c.tipo_celda, c.tipo_dato))
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
  const calculatedCells = ctx.cells.filter((c) => isFormulaEligible(c.tipo_celda, c.tipo_dato));

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

    // Reconciliar dependencias en vez de borrar+recrear todo: "borrar" es en realidad un
    // soft-delete (estado='I') en el backend, así que recrear sin cambios acumula filas
    // muertas en cada guardado. Solo se tocan las que realmente cambiaron.
    const existingDeps = allDeps.filter((d) => d.codigo_formula === codigoFormula);
    const requiredCellIds = new Set<number>();
    for (const ref of compiled.refs) {
      const depCell = resolveRefToCell(ref, cell.codigo_tabla, ctx.refMap, ctx.cells);
      if (depCell) requiredCellIds.add(depCell);
    }
    const existingCellIds = new Set(
      existingDeps.map((d) => d.codigo_celda).filter((id): id is number => id != null)
    );

    for (const dep of existingDeps) {
      if (dep.codigo_celda != null && !requiredCellIds.has(dep.codigo_celda) && dep.codigo_dependencia) {
        await silentDelete(() => dependenciasService.delete(dep.codigo_dependencia));
      }
    }

    for (const depCell of requiredCellIds) {
      if (!existingCellIds.has(depCell)) {
        await dependenciasService.save({
          codigo_dependencia: 0,
          codigo_formula: codigoFormula,
          codigo_celda: depCell,
          estado: "A",
        });
      }
    }
  }

  for (const cell of ctx.cells) {
    if (isFormulaEligible(cell.tipo_celda, cell.tipo_dato)) continue;
    const existing = formulaByCell.get(cell.codigo_celda);
    if (existing?.codigo_formula) {
      await silentDelete(() => formulaService.delete(existing.codigo_formula!));
    }
  }
}

export function tableDisplayName(tabla: Tabla | undefined, codigoTabla: number): string {
  return tabla?.nombre_tabla?.trim() || `Tabla #${codigoTabla}`;
}

/** Elimina fórmulas de celdas que ya no son elegibles para fórmula (Editor de Tablas). */
export async function purgeOrphanFormulasForTable(
  codigoTabla: number,
  eligibleCellIds: Set<number>
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
    if (!eligibleCellIds.has(f.codigo_celda)) {
      await silentDelete(() => formulaService.delete(f.codigo_formula!));
    }
  }
}

function cellMatchKey(alias: string, fila: number, col: number): string {
  const a = (alias || "").trim().toLowerCase();
  if (a) return `a:${a}`;
  return `p:${fila}:${col}`;
}

/**
 * Al reemplazar tabla fromId → toId en un formulario (o al versionar):
 * 1) Copia fórmulas de celdas viejas a celdas nuevas (match por alias o fila:col).
 * 2) Reescribe T{fromId}.* → T{toId}.* en expresiones de fórmulas cuyo celda
 *    pertenece a `scopeTableIds` (tablas del formulario tras el cambio).
 *
 * Así se pueden guardar varias fórmulas a la vez sin refs huérfanas a la versión vieja.
 */
export async function migrateFormulasOnTableReplace(
  fromTableId: number,
  toTableId: number,
  scopeTableIds: number[]
): Promise<{ copied: number; rewritten: number }> {
  if (!fromTableId || !toTableId || fromTableId === toTableId) {
    return { copied: 0, rewritten: 0 };
  }

  const [cRes, fRes] = await Promise.all([
    celdaService.getAll().catch(() => ({ data: [] as Celda[] })),
    formulaService.getAll().catch(() => ({ data: [] as Formula[] })),
  ]);
  const allCells = asArray(cRes.data).filter((c) => c.codigo_celda);
  const allFormulas = asArray(fRes.data);

  const fromCells = allCells.filter((c) => c.codigo_tabla === fromTableId);
  const toCells = allCells.filter((c) => c.codigo_tabla === toTableId);

  const toByKey = new Map<string, Celda>();
  for (const c of toCells) {
    toByKey.set(cellMatchKey(c.alias || "", c.fila || 1, c.col || 1), c);
  }

  const formulaByCell = new Map<number, Formula>();
  for (const f of allFormulas) {
    if (f.codigo_celda) formulaByCell.set(f.codigo_celda, f);
  }

  let copied = 0;
  for (const fromCel of fromCells) {
    const f = formulaByCell.get(fromCel.codigo_celda!);
    const exp = f?.expresion?.trim() || "";
    if (!exp) continue;

    const toCel =
      toByKey.get(cellMatchKey(fromCel.alias || "", fromCel.fila || 1, fromCel.col || 1)) ||
      toByKey.get(cellMatchKey("", fromCel.fila || 1, fromCel.col || 1));
    if (!toCel?.codigo_celda) continue;

    const newExp = rewriteTableRefsInExpression(exp, fromTableId, toTableId);
    const compiled = formulaApi.compile(newExp);
    const existingOnTarget = formulaByCell.get(toCel.codigo_celda);

    await formulaService.save({
      codigo_formula: existingOnTarget?.codigo_formula || 0,
      codigo_celda: toCel.codigo_celda,
      nombre: f?.nombre || toCel.alias || `Fórmula ${toCel.codigo_celda}`,
      expresion: newExp,
      latex: compiled.ok ? compiled.latex : f?.latex || "",
      ambito: "CELDA",
      estado: "A",
    });
    copied += 1;
  }

  const scopeSet = new Set(scopeTableIds.filter((id) => id && id !== fromTableId));
  scopeSet.add(toTableId);
  const scopeCellIds = new Set(
    allCells
      .filter((c) => c.codigo_tabla != null && scopeSet.has(c.codigo_tabla) && c.codigo_celda)
      .map((c) => c.codigo_celda!)
  );

  let rewritten = 0;
  // Recargar fórmulas por si el copy creó/actualizó filas.
  const fRes2 = await formulaService.getAll().catch(() => ({ data: [] as Formula[] }));
  for (const f of asArray(fRes2.data)) {
    if (!f.codigo_celda || !f.codigo_formula) continue;
    if (!scopeCellIds.has(f.codigo_celda)) continue;
    const exp = f.expresion || "";
    if (!new RegExp(`T${fromTableId}\\.`, "i").test(exp)) continue;
    const newExp = rewriteTableRefsInExpression(exp, fromTableId, toTableId);
    if (newExp === exp) continue;
    const compiled = formulaApi.compile(newExp);
    await formulaService.save({
      codigo_formula: f.codigo_formula,
      codigo_celda: f.codigo_celda,
      nombre: f.nombre,
      expresion: newExp,
      latex: compiled.ok ? compiled.latex : f.latex,
      ambito: f.ambito || "CELDA",
      estado: f.estado || "A",
    });
    rewritten += 1;
  }

  return { copied, rewritten };
}

/** Reescribe T{from}.* → T{to}.* en drafts en memoria (tras recargar contexto). */
export function rewriteTableRefsInDrafts(
  drafts: FormulaDraft[],
  fromTableId: number,
  toTableId: number
): FormulaDraft[] {
  if (fromTableId === toTableId) return drafts;
  return drafts.map((d) => {
    const exp = d.expresion || "";
    if (!new RegExp(`T${fromTableId}\\.`, "i").test(exp)) return d;
    const expresion = rewriteTableRefsInExpression(exp, fromTableId, toTableId);
    const compiled = formulaApi.compile(expresion);
    return {
      ...d,
      expresion,
      latex: compiled.ok ? compiled.latex : d.latex,
      cellLabel: d.cellLabel.replace(
        new RegExp(`^T${fromTableId}\\.`, "i"),
        `T${toTableId}.`
      ),
    };
  });
}

/**
 * Si un draft referencia T{vieja} y esa tabla ya no está en el formulario,
 * pero hay exactamente una tabla activa en el form con el mismo nombre (y tipo
 * de ensayo), reescribe las refs. Cubre el caso "ya cambié la sección pero las
 * expresiones siguen con el codigo_tabla viejo".
 */
export function healStaleTableRefsInDrafts(
  drafts: FormulaDraft[],
  tableIds: number[],
  tablas: Tabla[]
): { drafts: FormulaDraft[]; remaps: Array<{ from: number; to: number }> } {
  const present = new Set(tableIds);
  const missing = new Set<number>();
  const refRe = /\bT(\d+)\./gi;

  for (const d of drafts) {
    const exp = d.expresion || "";
    let m: RegExpExecArray | null;
    refRe.lastIndex = 0;
    while ((m = refRe.exec(exp))) {
      const id = Number(m[1]);
      if (id && !present.has(id)) missing.add(id);
    }
  }

  if (missing.size === 0) return { drafts, remaps: [] };

  const remaps: Array<{ from: number; to: number }> = [];
  let next = drafts;

  for (const fromId of missing) {
    const oldTabla = tablas.find((t) => t.codigo_tabla === fromId);
    const nombre = (oldTabla?.nombre_tabla || "").trim().toLowerCase();
    if (!nombre) continue;

    const candidates = tableIds.filter((id) => {
      const t = tablas.find((x) => x.codigo_tabla === id);
      if (!t || (t.estado || "A") === "I") return false;
      if ((t.nombre_tabla || "").trim().toLowerCase() !== nombre) return false;
      if (
        oldTabla?.codigo_tipo_ensayo != null &&
        t.codigo_tipo_ensayo != null &&
        oldTabla.codigo_tipo_ensayo !== t.codigo_tipo_ensayo
      ) {
        return false;
      }
      return true;
    });

    if (candidates.length !== 1) continue;
    const toId = candidates[0];
    remaps.push({ from: fromId, to: toId });
    next = rewriteTableRefsInDrafts(next, fromId, toId);
  }

  return { drafts: next, remaps };
}
