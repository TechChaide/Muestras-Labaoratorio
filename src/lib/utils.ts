import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Alias de celda/columna para mostrar al usuario: internamente los espacios se
 * guardan como "_" (los identificadores del DSL de fórmulas no admiten espacios),
 * pero en vistas de solo lectura (preview, captura de resultados) se ven mejor
 * como espacios reales. No usar para el valor que se envía al backend/DSL. */
export function formatAliasDisplay(alias?: string | null): string {
  if (!alias) return "";
  return alias.replace(/_+/g, " ").trim();
}
