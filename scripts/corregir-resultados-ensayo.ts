/**
 * Corrige Resultado.valor / Resultado.toma ensayo por ensayo, con el mismo
 * motor de fórmulas que la captura (lo que se ve en pantalla).
 *
 * Semilla: celdas SIN fórmula (lo tipeado). Las celdas CON fórmula se
 * recalculan. Si el valor en BD tiene pegado el dígito de tabla/muestras
 * (301.99 → 3051.99, 396 → 3596), se reemplaza por el número en vivo.
 *
 *   npx tsx scripts/corregir-resultados-ensayo.ts
 *   npx tsx scripts/corregir-resultados-ensayo.ts --apply
 */
import dotenv from "dotenv";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import {
  bindLiveFormulas,
  buildRefMap,
  cellRefToken,
  formulaApi,
  isFormulaEligible,
  parseValorNumerico,
  tomaDeCelda,
  type FormCellSnapshot,
  type FormulaDraft,
} from "../src/lib/formula";

const APPLY = process.argv.includes("--apply");
const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..", "..", "MuestrasLaboratorio-backtend");
dotenv.config({ path: path.join(backendRoot, ".env") });

const require = createRequire(path.join(backendRoot, "package.json"));
const sql = require("mssql") as typeof import("mssql");

const MUESTRA_RE = /^\(?(\d+)\)?$/;

type Row = Record<string, unknown>;

function parseNum(v: unknown): number | null {
  const n = parseValorNumerico(v);
  return n == null ? null : n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function nMuestrasDeTabla(celdas: FormCellSnapshot[]): number {
  let max = 1;
  for (const c of celdas) {
    if (c.col !== 1) continue;
    const m = MUESTRA_RE.exec((c.alias || "").trim());
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max;
}

function candidatosSinDigito(valor: unknown, D: number): number[] {
  const original = parseNum(valor);
  if (original == null) return [];
  const s = String(valor).trim();
  const d = String(D);
  const sign = s.startsWith("-") ? "-" : "";
  const body = sign ? s.slice(1) : s;
  const dot = body.indexOf(".");
  const intPart = dot < 0 ? body : body.slice(0, dot);
  const decPart = dot < 0 ? null : body.slice(dot + 1);
  const out: number[] = [];
  const seen = new Set<number>();
  const push = (cand: string) => {
    const n = parseNum(cand);
    if (n == null || n === original || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  if (intPart.startsWith(d) && intPart.length > d.length) {
    push(sign + intPart.slice(d.length) + (decPart != null ? `.${decPart}` : ""));
  }
  for (let i = 0; i < intPart.length; i++) {
    if (intPart[i] !== d) continue;
    const candInt = intPart.slice(0, i) + intPart.slice(i + 1);
    if (!candInt) continue;
    push(sign + candInt + (decPart != null ? `.${decPart}` : ""));
  }
  return out;
}

function parecePegado(stored: number, live: number, digits: number[]): boolean {
  if (Math.abs(stored - live) <= 1e-4) return false;
  for (const D of digits) {
    if (!Number.isInteger(D) || D < 1) continue;
    const concat = Number(`${D}${String(live)}`);
    if (Number.isFinite(concat) && Math.abs(concat - stored) <= 0.051) return true;
    for (const c of candidatosSinDigito(stored, D)) {
      if (Math.abs(c - live) <= 0.051) return true;
    }
  }
  return false;
}

async function query(pool: { request: () => { query: (q: string) => Promise<{ recordset: Row[] }> } }, q: string) {
  const res = await pool.request().query(q);
  return res.recordset;
}

async function main() {
  const pool = await sql.connect({
    server: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: process.env.DB_ENCRYPT === "true",
      trustServerCertificate: process.env.DB_TRUST_CERT !== "false",
    },
    requestTimeout: 120000,
  });

  const ensayos = await query(
    pool,
    `
    SELECT
      e.codigo_ensayo_categoria_ensayo,
      e.codigo_formulario,
      s.identificador_ensayo
    FROM dbo.ensayo_categoria_ensayo e
    LEFT JOIN dbo.solicitud s ON s.codigo_solicitud = e.codigo_solicitud
    WHERE e.estado = 'A'
      AND e.codigo_formulario IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM dbo.resultado r
        WHERE r.codigo_ensayo_categoria_ensayo = e.codigo_ensayo_categoria_ensayo
          AND r.estado = 'A'
      )
    ORDER BY s.identificador_ensayo, e.codigo_ensayo_categoria_ensayo
    `
  );

  const celdasDb = await query(
    pool,
    `
    SELECT codigo_celda, codigo_tabla, fila, col, alias, tipo_celda, tipo_dato, rowspan, colspan
    FROM dbo.celda
    WHERE estado = 'A' OR estado IS NULL
    `
  );
  const formulasDb = await query(
    pool,
    `
    SELECT codigo_formula, codigo_celda, nombre, expresion
    FROM dbo.formula
    WHERE estado = 'A' OR estado IS NULL
    `
  );
  const linksDb = await query(
    pool,
    `
    SELECT codigo_formulario, codigo_tabla
    FROM dbo.formulario_tabla
    WHERE estado = 'A' OR estado IS NULL
    `
  );

  const celdasPorTabla = new Map<number, FormCellSnapshot[]>();
  const celdaPorId = new Map<number, FormCellSnapshot>();
  for (const raw of celdasDb) {
    const cell: FormCellSnapshot = {
      codigo_celda: Number(raw.codigo_celda),
      codigo_tabla: Number(raw.codigo_tabla),
      fila: Number(raw.fila) || 1,
      col: Number(raw.col) || 1,
      alias: String(raw.alias || "").trim(),
      tipo_celda: String(raw.tipo_celda || "label"),
      tipo_dato: String(raw.tipo_dato || "texto"),
      rowspan: Math.max(1, Number(raw.rowspan) || 1),
      colspan: Math.max(1, Number(raw.colspan) || 1),
    };
    celdaPorId.set(cell.codigo_celda, cell);
    const list = celdasPorTabla.get(cell.codigo_tabla) || [];
    list.push(cell);
    celdasPorTabla.set(cell.codigo_tabla, list);
  }

  const formulaPorCelda = new Map<number, { nombre?: string; expresion: string; codigo_formula?: number }>();
  for (const f of formulasDb) {
    const expr = String(f.expresion || "").trim();
    if (!expr) continue;
    formulaPorCelda.set(Number(f.codigo_celda), {
      nombre: f.nombre ? String(f.nombre) : undefined,
      expresion: expr,
      codigo_formula: f.codigo_formula != null ? Number(f.codigo_formula) : undefined,
    });
  }

  const tablasPorFormulario = new Map<number, number[]>();
  for (const l of linksDb) {
    const fid = Number(l.codigo_formulario);
    const tid = Number(l.codigo_tabla);
    const list = tablasPorFormulario.get(fid) || [];
    list.push(tid);
    tablasPorFormulario.set(fid, list);
  }

  type Cambio = {
    codigo_resultado: number;
    identificador: string;
    codigo_ensayo: number;
    alias: string;
    valor_actual: number | null;
    valor_nuevo: number | null;
    toma_actual: number | null;
    toma_nueva: number;
    motivo: string;
  };
  const cambios: Cambio[] = [];

  console.log(APPLY ? "MODO APLICAR" : "MODO SIMULACIÓN (pasa --apply para escribir)");
  console.log("ensayos con resultados:", ensayos.length);

  for (const ens of ensayos) {
    const ensayoId = Number(ens.codigo_ensayo_categoria_ensayo);
    const identificador = String(ens.identificador_ensayo || `#${ensayoId}`);
    const formId = Number(ens.codigo_formulario);
    const tableIds = [...new Set(tablasPorFormulario.get(formId) || [])];
    if (tableIds.length === 0) continue;

    const cells: FormCellSnapshot[] = [];
    for (const tid of tableIds) {
      cells.push(...(celdasPorTabla.get(tid) || []));
    }
    if (cells.length === 0) continue;

    const drafts: FormulaDraft[] = [];
    const formulaIds = new Set<string>();
    for (const c of cells) {
      if (!isFormulaEligible(c.tipo_celda, c.tipo_dato)) continue;
      const f = formulaPorCelda.get(c.codigo_celda);
      const expr = f?.expresion || "";
      const label = cellRefToken(c);
      drafts.push({
        codigo_celda: c.codigo_celda,
        codigo_tabla: c.codigo_tabla,
        codigo_formula: f?.codigo_formula,
        cellLabel: label,
        nombre: f?.nombre || c.alias || label,
        expresion: expr,
        latex: "",
      });
      if (expr) formulaIds.add(label);
    }

    const refMap = buildRefMap(cells);
    const liveFormulas = bindLiveFormulas(drafts, cells, refMap);

    const resultados = await query(
      pool,
      `
      SELECT codigo_resultado, codigo_celda, toma, valor
      FROM dbo.resultado
      WHERE codigo_ensayo_categoria_ensayo = ${ensayoId}
        AND estado = 'A'
      `
    );

    const inputValues: Record<string, number> = {};
    const porCelda = new Map<number, Row>();
    for (const r of resultados) {
      const cid = Number(r.codigo_celda);
      porCelda.set(cid, r);
      const cell = celdaPorId.get(cid);
      if (!cell || cell.tipo_celda === "calculated") continue;
      const ref = cellRefToken(cell);
      if (formulaIds.has(ref)) continue;
      const n = parseNum(r.valor);
      if (n != null) inputValues[ref] = n;
    }

    const live = formulaApi.evaluateLive(liveFormulas, inputValues);
    const digitsPorTabla = new Map<number, number[]>();
    for (const tid of tableIds) {
      const nM = nMuestrasDeTabla(celdasPorTabla.get(tid) || []);
      digitsPorTabla.set(tid, [...new Set([nM, tid].filter((d) => d > 0))]);
    }

    for (const r of resultados) {
      const cid = Number(r.codigo_celda);
      const cell = celdaPorId.get(cid);
      if (!cell) continue;
      const ref = cellRefToken(cell);
      const tomaActual = r.toma == null ? null : Number(r.toma);
      const tomaNueva = tomaDeCelda(cell, cells);
      const stored = parseNum(r.valor);
      const digits = digitsPorTabla.get(cell.codigo_tabla) || [5];

      let valorNuevo: number | null = stored;
      let motivo = "";

      const digitsCelda = [...new Set([...digits, tomaNueva].filter((d) => d > 0))];

      if ((formulaIds.has(ref) || cell.tipo_celda === "calculated") && stored != null) {
        const v = live.values[ref];
        if (typeof v === "number" && Number.isFinite(v)) {
          const liveN = round2(v);
          if (parecePegado(stored, liveN, digitsCelda)) {
            valorNuevo = liveN;
            motivo = "formula-pegado";
          }
        }
      }

      const valorCambia =
        valorNuevo != null && stored != null && Math.abs(valorNuevo - stored) > 1e-4;
      const tomaCambia = tomaActual !== tomaNueva;
      if (!valorCambia && !tomaCambia) continue;

      cambios.push({
        codigo_resultado: Number(r.codigo_resultado),
        identificador,
        codigo_ensayo: ensayoId,
        alias: cell.alias || ref,
        valor_actual: stored,
        valor_nuevo: valorCambia ? valorNuevo : stored,
        toma_actual: tomaActual,
        toma_nueva: tomaNueva,
        motivo: [motivo, tomaCambia ? "toma" : ""].filter(Boolean).join("+") || "toma",
      });
    }
  }

  const porEnsayo = new Map<string, number>();
  for (const c of cambios) {
    porEnsayo.set(c.identificador, (porEnsayo.get(c.identificador) || 0) + 1);
  }
  const valorCambios = cambios.filter(
    (c) => c.valor_actual != null && c.valor_nuevo != null && Math.abs(c.valor_actual - c.valor_nuevo) > 1e-4
  );

  console.log("filas a tocar:", cambios.length);
  console.log("valores a corregir:", valorCambios.length);
  console.log("ensayos afectados:", porEnsayo.size);

  console.log("\nPor solicitud:");
  for (const [id, n] of [...porEnsayo.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const vals = valorCambios.filter((c) => c.identificador === id).length;
    console.log(`  ${id}  filas=${n}  valor=${vals}`);
  }

  console.log("\nEjemplos de valor:");
  for (const c of valorCambios.slice(0, 40)) {
    console.log(
      `  ${c.identificador}  id=${c.codigo_resultado}  ${c.alias}  ${c.valor_actual} → ${c.valor_nuevo}  (${c.motivo})`
    );
  }

  if (!APPLY) {
    console.log("\nNada escrito. Revisa y corre con --apply.");
    await pool.close();
    return;
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const chunk = 80;
    for (let i = 0; i < cambios.length; i += chunk) {
      const slice = cambios.slice(i, i + chunk);
      const ids = slice.map((c) => c.codigo_resultado);
      const valorCase = slice
        .map((c) => {
          const v = c.valor_nuevo;
          if (v == null) return `WHEN ${c.codigo_resultado} THEN valor`;
          return `WHEN ${c.codigo_resultado} THEN ${v}`;
        })
        .join(" ");
      const tomaCase = slice.map((c) => `WHEN ${c.codigo_resultado} THEN ${c.toma_nueva}`).join(" ");
      await new sql.Request(tx).query(
        `UPDATE dbo.resultado
         SET valor = CASE codigo_resultado ${valorCase} ELSE valor END,
             toma = CASE codigo_resultado ${tomaCase} ELSE toma END
         WHERE codigo_resultado IN (${ids.join(",")})`
      );
      console.log(`  ${Math.min(i + chunk, cambios.length)}/${cambios.length}`);
    }
    await tx.commit();
    console.log("\nActualizado:", cambios.length, "filas.");
  } catch (err) {
    await tx.rollback();
    throw err;
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
