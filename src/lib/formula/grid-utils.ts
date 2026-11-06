import { tokenize } from "./tokenize";

/** Convierte índice de columna 1-based a letra Excel (1→A, 27→AA). */
export function colLetter(n: number): string {
  let x = n;
  let s = "";
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s || "A";
}

/** Token de referencia por posición cuando no hay alias. */
export function cellPositionRef(col: number, fila: number): string {
  return `${colLetter(col)}${fila}`;
}

/** Inversa de colLetter: A→1, B→2, ..., Z→26, AA→27. */
export function letterToCol(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

// Debe coincidir EXACTO con el token completo (ancla ^...$): así "B3_1" (alias) nunca
// se confunde con una referencia por posición, y "T3." nunca se lee por error como si
// la "T" fuera una letra de columna.
const PURE_POSITION_RE = /^(?:T(\d+)\.)?([A-Z]+)(\d+)$/;

// Alias de celdas por muestra / sublectura: Letras + N° muestra + opcional _índice
// (ej. B3_1, B3_2, AA12_3). El N° de muestra se desplaza entre muestras; el índice
// tras "_" se desplaza entre celdas divididas de la misma muestra.
const GROUP_ALIAS_RE = /^(?:T(\d+)\.)?([A-Z]+)(\d+)(?:_(\d+))?$/;

export interface ParsedGroupAlias {
  tablaStr?: string;
  letters: string;
  sample: number;
  suffix: number | null;
}

export function parseGroupAlias(raw: string): ParsedGroupAlias | null {
  const m = GROUP_ALIAS_RE.exec((raw || "").trim());
  if (!m) return null;
  return {
    tablaStr: m[1] || undefined,
    letters: m[2],
    sample: Number(m[3]),
    suffix: m[4] != null ? Number(m[4]) : null,
  };
}

/** Alias de la columna Muestra: "(1)", "(2)", "3". */
const MUESTRA_ALIAS_RE = /^\(?(\d+)\)?$/;

export type CeldaTomaRef = {
  fila: number;
  col: number;
  codigo_tabla: number;
  alias?: string;
};

/**
 * Número de toma/muestra. Sale de la primera columna de la fila (o de una fila
 * hacia arriba si esa celda es una sublectura), p.ej. alias "(2)" → 2.
 * Vive en Resultado.toma, nunca concatenado con Resultado.valor.
 */
export function tomaDeCelda(
  cell: { fila?: number; col?: number; codigo_tabla?: number; alias?: string },
  allCells: CeldaTomaRef[] = []
): number {
  const tabla = Number(cell.codigo_tabla);
  const fila = Number(cell.fila) || 1;
  if (tabla && allCells.length > 0) {
    const sameTable = allCells.filter((c) => c.codigo_tabla === tabla);
    for (let f = fila; f >= 1; f--) {
      const marker = sameTable.find((c) => c.fila === f && c.col === 1);
      const m = MUESTRA_ALIAS_RE.exec((marker?.alias || "").trim());
      if (m) {
        const n = Number(m[1]);
        if (Number.isInteger(n) && n > 0) return n;
      }
    }
  }
  return 1;
}

/** Lee Resultado.valor sin mezclarlo con toma ni con el texto de resultados. */
export function parseValorNumerico(valor: unknown): number | undefined {
  if (valor == null || valor === "") return undefined;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : undefined;
  const s = String(valor).trim().replace(",", ".");
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export interface AutofillShift {
  deltaRow: number;
  deltaCol: number;
  /** Desplaza el N° de muestra en alias tipo B3_1 → B4_1. */
  deltaSample: number;
  /** Desplaza el índice de sublectura B3_1 → B3_2 (celdas divididas). */
  deltaSuffix: number;
}

/**
 * Calcula cómo desplazar refs al rellenar desde `sourceAlias`/`sourcePos`
 * hacia `targetAlias`/`targetPos`.
 *
 * - Misma muestra, distinto _índice (B5_1 → B5_2): mueve el sufijo.
 * - Mismo sufijo, distinta muestra (B5_1 → B6_1): mueve el N° de muestra.
 * - Caso general: mueve fila/columna de grilla.
 */
export function computeAutofillShift(
  source: { alias: string; fila: number; col: number },
  target: { alias: string; fila: number; col: number }
): AutofillShift {
  const sAlias = (source.alias || "").trim() || cellPositionRef(source.col, source.fila);
  const tAlias = (target.alias || "").trim() || cellPositionRef(target.col, target.fila);
  const s = parseGroupAlias(sAlias);
  const t = parseGroupAlias(tAlias);

  if (s && t && s.letters === t.letters) {
    if (
      s.sample === t.sample &&
      s.suffix != null &&
      t.suffix != null &&
      s.suffix !== t.suffix
    ) {
      return {
        deltaRow: 0,
        deltaCol: 0,
        deltaSample: 0,
        deltaSuffix: t.suffix - s.suffix,
      };
    }
    if (
      s.sample !== t.sample &&
      (s.suffix ?? null) === (t.suffix ?? null)
    ) {
      return {
        deltaRow: 0,
        deltaCol: 0,
        deltaSample: t.sample - s.sample,
        deltaSuffix: 0,
      };
    }
  }

  return {
    deltaRow: target.fila - source.fila,
    deltaCol: target.col - source.col,
    deltaSample: 0,
    deltaSuffix: 0,
  };
}

/**
 * Desplaza las referencias de una expresión al arrastrar una fórmula (autofill).
 * - Posición pura (C2, T9.C2): +deltaRow / +deltaCol.
 * - Alias de grupo (B3_1): +deltaSample al N° de muestra y/o +deltaSuffix al _índice.
 * Refs a otras tablas y alias libres no se tocan.
 *
 * `deltaGroup` se mantiene como alias de `deltaSample` por compatibilidad.
 */
export function shiftRefsInExpression(
  expresion: string,
  codigoTabla: number,
  deltaRow: number,
  deltaCol: number,
  deltaGroupOrSample = 0,
  deltaSuffix = 0
): string {
  const deltaSample = deltaGroupOrSample;
  if (!deltaRow && !deltaCol && !deltaSample && !deltaSuffix) return expresion;

  const { tokens, error } = tokenize(expresion);
  if (error) return expresion;

  return tokens
    .map((t) => {
      if (t.type !== "ident") return t.raw;

      const group =
        (deltaSample || deltaSuffix) && deltaCol === 0
          ? GROUP_ALIAS_RE.exec(t.value)
          : null;
      if (group) {
        const [, tablaStr, letters, numStr, suffixStr] = group;
        const tabla = tablaStr ? Number(tablaStr) : codigoTabla;
        if (tabla !== codigoTabla) return t.raw;
        const newSample = Math.max(1, Number(numStr) + deltaSample);
        let suffixPart = "";
        if (suffixStr != null) {
          const newSuffix = Math.max(1, Number(suffixStr) + deltaSuffix);
          suffixPart = `_${newSuffix}`;
        } else if (deltaSuffix) {
          // Ref sin sufijo (B3) hacia sublectura: B3 → B3_2 si deltaSuffix=+1 desde _1 implícito?
          // Mejor no inventar sufijo si la ref original no lo tenía.
          suffixPart = "";
        }
        const prefix = tablaStr ? `T${tablaStr}.` : "";
        return `${prefix}${letters}${newSample}${suffixPart}`;
      }

      const m = PURE_POSITION_RE.exec(t.value);
      if (!m) return t.raw;
      const [, tablaStr, letters, rowStr] = m;
      const tabla = tablaStr ? Number(tablaStr) : codigoTabla;
      if (tabla !== codigoTabla) return t.raw;
      // Si también matchea grupo con sufijo ya se manejó arriba; aquí posición pura.
      const newCol = Math.max(1, letterToCol(letters) + deltaCol);
      const newRow = Math.max(1, Number(rowStr) + deltaRow);
      const prefix = tablaStr ? `T${tablaStr}.` : "";
      return `${prefix}${colLetter(newCol)}${newRow}`;
    })
    .join("");
}
