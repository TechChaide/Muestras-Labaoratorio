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
