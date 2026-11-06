/** Caracteres que Windows / el navegador rechazan en un nombre de archivo. */
const ILEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * Nombre del PDF generado:
 * `N° Solicitud Externa con Informe-{año}-({cód único muestra}).pdf`
 *
 * El código único es `codigo_muestra`; si no hay, se usa el identificador
 * de la solicitud. El año es el de generación del archivo.
 */
export function nombreArchivoInformePdf(codigoUnicoMuestra: string | number | null | undefined): string {
  const anio = new Date().getFullYear();
  const codigo = String(codigoUnicoMuestra ?? "").trim() || "sin-codigo";
  const base = `N° Solicitud Externa con Informe-${anio}-(${codigo})`
    .replace(ILEGAL, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${base}.pdf`;
}

export function codigoUnicoMuestraDesdeEnsayos(
  ensayos?: { codigo_muestra?: number | null }[] | null
): number | undefined {
  const ids = [
    ...new Set(
      (ensayos ?? [])
        .map((e) => e.codigo_muestra)
        .filter((c): c is number => c != null && Number.isFinite(c) && c > 0)
    ),
  ];
  return ids[0];
}
