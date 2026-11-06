import type { Formulario } from "@/types/interfaces";
import { formularioService } from "@/services/muestrasLaboratorio/formulario.service";
import { formularioTablaService } from "@/services/muestrasLaboratorio/formularioTabla.service";
import { tablaService } from "@/services/muestrasLaboratorio/tabla.service";
import { tipoEnsayoService } from "@/services/muestrasLaboratorio/tipoEnsayo.service";

const asArray = <T,>(data: T | T[] | undefined): T[] => (Array.isArray(data) ? data : data ? [data] : []);

/** Ordena formularios activos: mayor versión, luego fecha más reciente, luego código. */
export function sortFormulariosMasRecientes(formularios: Formulario[]): Formulario[] {
  return [...formularios].sort((a, b) => {
    const va = Number(a.version_formulario) || 0;
    const vb = Number(b.version_formulario) || 0;
    if (vb !== va) return vb - va;
    const fa = a.fecha_modificacion ? new Date(a.fecha_modificacion).getTime() : 0;
    const fb = b.fecha_modificacion ? new Date(b.fecha_modificacion).getTime() : 0;
    if (fb !== fa) return fb - fa;
    return (b.codigo_formulario || 0) - (a.codigo_formulario || 0);
  });
}

export function pickUltimoFormularioActivo(formularios: Formulario[]): Formulario | undefined {
  return sortFormulariosMasRecientes(formularios)[0];
}

/**
 * Un Formulario no referencia el tipo de ensayo directamente: se arma con Tablas
 * (Tabla.codigo_tipo_ensayo) enlazadas vía FormularioTabla. Esta función resuelve
 * esa cadena Tabla -> FormularioTabla -> Formulario para listar solo los
 * formularios ya armados para un tipo de ensayo dado.
 */
export async function getFormulariosPorTipoEnsayo(codigoTipoEnsayo: number): Promise<Formulario[]> {
  const [tablasRes, linksRes, formulariosRes] = await Promise.all([
    tablaService.getAll(),
    formularioTablaService.getAll(),
    formularioService.getAll(),
  ]);

  const tablasDelTipo = new Set(
    asArray(tablasRes.data)
      .filter((t) => t.codigo_tipo_ensayo === codigoTipoEnsayo && t.estado === "A")
      .map((t) => t.codigo_tabla)
  );

  const formulariosIds = new Set(
    asArray(linksRes.data)
      .filter((l) => l.estado === "A" && l.codigo_tabla != null && tablasDelTipo.has(l.codigo_tabla))
      .map((l) => l.codigo_formulario)
  );

  const activos = asArray(formulariosRes.data).filter(
    (f) => f.estado === "A" && formulariosIds.has(f.codigo_formulario)
  );
  return sortFormulariosMasRecientes(activos);
}

/**
 * Formularios activos de toda la familia: tablas de cualquier tipo de ensayo
 * de esa familia, enlazadas vía FormularioTabla. Sirve para cambiar el
 * formulario autoasignado sin salir de la familia.
 */
export async function getFormulariosPorFamilia(codigoFamilia: number): Promise<Formulario[]> {
  const [tiposRes, tablasRes, linksRes, formulariosRes] = await Promise.all([
    tipoEnsayoService.getAll(),
    tablaService.getAll(),
    formularioTablaService.getAll(),
    formularioService.getAll(),
  ]);

  const tiposIds = new Set(
    asArray(tiposRes.data)
      .filter((t) => t.codigo_familia === codigoFamilia && (t.estado || "A") === "A")
      .map((t) => t.codigo_tipo_ensayo)
  );
  if (tiposIds.size === 0) return [];

  const tablasDeLaFamilia = new Set(
    asArray(tablasRes.data)
      .filter((t) => t.codigo_tipo_ensayo != null && tiposIds.has(t.codigo_tipo_ensayo) && t.estado === "A")
      .map((t) => t.codigo_tabla)
  );

  const formulariosIds = new Set(
    asArray(linksRes.data)
      .filter((l) => l.estado === "A" && l.codigo_tabla != null && tablasDeLaFamilia.has(l.codigo_tabla))
      .map((l) => l.codigo_formulario)
  );

  const activos = asArray(formulariosRes.data).filter(
    (f) => f.estado === "A" && formulariosIds.has(f.codigo_formulario)
  );
  return sortFormulariosMasRecientes(activos);
}
