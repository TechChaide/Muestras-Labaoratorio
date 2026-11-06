import type { Formulario, FormularioTabla } from "@/types/interfaces";

/** Calcula la siguiente versión (1 → 2, 2 → 3, …). */
export function bumpVersion(current?: string | number | null): string {
  const raw = current != null ? String(current).trim() : "";
  if (!raw) return "2";
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && /^\d+$/.test(raw)) return String(n + 1);
  return `${raw}.1`;
}

export type FormularioAfectado = {
  codigo_formulario: number;
  nombre_formulario?: string;
  cabecera?: string;
};

/** Formularios que referencian una tabla (por codigo_tabla en FormularioTabla). */
export function findFormulariosUsingTabla(
  codigoTabla: number,
  links: FormularioTabla[],
  formularios: Formulario[]
): FormularioAfectado[] {
  const byForm = new Map<number, FormularioAfectado>();
  for (const link of links) {
    if (link.codigo_tabla !== codigoTabla || !link.codigo_formulario) continue;
    const form = formularios.find((f) => f.codigo_formulario === link.codigo_formulario);
    if (!byForm.has(link.codigo_formulario)) {
      byForm.set(link.codigo_formulario, {
        codigo_formulario: link.codigo_formulario,
        nombre_formulario: form?.nombre_formulario,
        cabecera: link.cabecera_formulario,
      });
    }
  }
  return Array.from(byForm.values()).sort((a, b) =>
    (a.nombre_formulario || "").localeCompare(b.nombre_formulario || "")
  );
}

/** Firma ordenada de las tablas de un formulario (detecta cambio de versión). */
export function fingerprintTablasFormulario(
  sections: Array<{ codigo_tabla?: number | null }>
): string {
  return sections.map((s) => String(s.codigo_tabla ?? "")).join("|");
}

export function linajeTablaKey(t: {
  nombre_tabla?: string | null;
  codigo_tipo_ensayo?: number | null;
}): string {
  return `${t.codigo_tipo_ensayo ?? ""}::${(t.nombre_tabla || "").trim().toLowerCase()}`;
}

export type TablaVersionCaptura = {
  codigo_tabla: number;
  version?: string | number | null;
  nombre_tabla?: string | null;
  estado?: string | null;
  total: number;
};

/**
 * Elige la versión de tabla a pintar: si el ensayo ya tiene resultados en una
 * `codigo_tabla`, esa gana. Si no hay datos, la versión activa (o la de mayor
 * versión) del mismo linaje.
 */
export function resolverTablaDeLinaje<T extends {
  codigo_tabla: number;
  nombre_tabla?: string | null;
  codigo_tipo_ensayo?: number | null;
  version?: string | number | null;
  estado?: string | null;
}>(candidatas: T[], versionesConDatos: TablaVersionCaptura[]): T | undefined {
  if (candidatas.length === 0) return undefined;
  if (candidatas.length === 1) return candidatas[0];

  const totalPorTabla = new Map(versionesConDatos.map((v) => [v.codigo_tabla, v.total]));
  const conDatos = candidatas.filter((t) => (totalPorTabla.get(t.codigo_tabla) || 0) > 0);
  const pool = conDatos.length > 0
    ? conDatos
    : candidatas.filter((t) => (t.estado || "A") !== "I");
  const lista = pool.length > 0 ? pool : candidatas;

  const ver = (t: T) => Number.parseInt(String(t.version ?? "0"), 10) || 0;
  lista.sort((a, b) => {
    const da = totalPorTabla.get(a.codigo_tabla) || 0;
    const db = totalPorTabla.get(b.codigo_tabla) || 0;
    if (db !== da) return db - da;
    if (ver(b) !== ver(a)) return ver(b) - ver(a);
    return b.codigo_tabla - a.codigo_tabla;
  });
  return lista[0];
}

export function formatTablaLabel(t: {
  codigo_tabla: number;
  nombre_tabla?: string;
  version?: string;
  estado?: string;
}): string {
  const name = t.nombre_tabla || "Sin nombre";
  const ver = t.version ? ` v${t.version}` : "";
  const inactive = t.estado === "I" ? " (inactiva)" : "";
  return `#${t.codigo_tabla} — ${name}${ver}${inactive}`;
}

/** Firma estructural de la grilla (posiciones de columnas y celdas ancla). */
export type TablaStructureSnap = {
  colIndices: number[];
  cellKeys: string[];
};

export function cellStructureKey(fila: number, col: number): string {
  return `${fila}:${col}`;
}

export function buildTablaStructureSnap(
  columnas: Array<{ indice: number }>,
  celdas: Array<{ fila: number; col: number }>
): TablaStructureSnap {
  return {
    colIndices: columnas.map((c) => c.indice).sort((a, b) => a - b),
    cellKeys: celdas
      .map((c) => cellStructureKey(c.fila, c.col))
      .sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * True si se agregaron o eliminaron columnas o celdas (anclas) respecto al
 * baseline. Cambios de tipo_dato, alias, tipo_celda, nombre, etc. NO cuentan.
 */
export function hasStructuralGridChange(
  baseline: TablaStructureSnap,
  columnas: Array<{ indice: number }>,
  celdas: Array<{ fila: number; col: number }>
): boolean {
  const current = buildTablaStructureSnap(columnas, celdas);
  if (current.colIndices.length !== baseline.colIndices.length) return true;
  if (current.cellKeys.length !== baseline.cellKeys.length) return true;

  for (let i = 0; i < current.colIndices.length; i++) {
    if (current.colIndices[i] !== baseline.colIndices[i]) return true;
  }
  for (let i = 0; i < current.cellKeys.length; i++) {
    if (current.cellKeys[i] !== baseline.cellKeys[i]) return true;
  }
  return false;
}
