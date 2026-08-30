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
