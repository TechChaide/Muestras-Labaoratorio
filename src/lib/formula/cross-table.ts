/**
 * Referencias entre tablas dentro de un Formulario.
 *
 * El minimotor ya tokeniza idents con puntos (`T12.A1`).
 * Convención: `T{codigo_tabla}.{alias_celda}` evita colisiones de alias
 * cuando varias tablas del mismo formulario usan A1, B2, etc.
 *
 * Las Dependencias apuntan a `codigo_celda` (global), así que el grafo
 * cross-table ya está soportado en el modelo lógico V2.
 */

import { tokenize } from "./tokenize";

export function tableRefPrefix(codigoTabla: number): string {
  return `T${codigoTabla}`;
}

/** Alias cualificado: T12.A1 */
export function qualifyAlias(codigoTabla: number, alias: string): string {
  const clean = (alias || "").trim();
  if (!clean) return "";
  if (/^T\d+\./i.test(clean)) return clean;
  return `${tableRefPrefix(codigoTabla)}.${clean}`;
}

/** Extrae { codigoTabla, alias } de un ref cualificado; si no, alias local. */
export function parseQualifiedRef(ref: string): {
  codigoTabla: number | null;
  alias: string;
} {
  const m = /^T(\d+)\.(.+)$/i.exec((ref || "").trim());
  if (!m) return { codigoTabla: null, alias: (ref || "").trim() };
  return { codigoTabla: Number(m[1]), alias: m[2] };
}

export function isCrossTableRef(ref: string): boolean {
  return parseQualifiedRef(ref).codigoTabla != null;
}

/**
 * Reescribe refs cualificadas T{fromId}.* → T{toId}.* en una expresión.
 * Usado al versionar / reemplazar una tabla en un formulario.
 */
export function rewriteTableRefsInExpression(
  expresion: string,
  fromTableId: number,
  toTableId: number
): string {
  if (!expresion?.trim() || fromTableId === toTableId) return expresion;
  const { tokens, error } = tokenize(expresion);
  if (error) {
    return expresion.replace(
      new RegExp(`\\bT${fromTableId}\\.`, "gi"),
      `T${toTableId}.`
    );
  }
  const fromPrefix = `T${fromTableId}.`;
  const toPrefix = `T${toTableId}.`;
  return tokens
    .map((t) => {
      if (t.type !== "ident") return t.raw;
      if (t.value.toUpperCase().startsWith(fromPrefix.toUpperCase())) {
        return toPrefix + t.value.slice(fromPrefix.length);
      }
      return t.raw;
    })
    .join("");
}
