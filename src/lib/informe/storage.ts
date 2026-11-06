import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import { environment } from "@/environments/environments.prod";

/** Carpeta raíz de plantillas (recurso compartido / volumen Docker). */
export const PLANTILLAS_DIR = path.resolve(environment.pantillasFormatos);
/** Informes del editor: `pantillasFormatos/informes/*.txt`. */
export const INFORMES_DIR = path.resolve(PLANTILLAS_DIR, "informes");

export interface InformeMeta {
  codigo_familia?: number;
  codigo_tipo_ensayo?: number;
}

export interface InformeListadoFs {
  nombre: string;
  archivo: string;
  fecha_modificacion: string;
  codigo_familia?: number;
  codigo_tipo_ensayo?: number;
}

async function leerMetaAlLado(archivoTxt: string): Promise<InformeMeta> {
  try {
    const raw = await readFile(archivoTxt.replace(/\.txt$/i, ".meta.json"), "utf8");
    const parsed = JSON.parse(raw);
    return {
      codigo_familia: typeof parsed?.codigo_familia === "number" ? parsed.codigo_familia : undefined,
      codigo_tipo_ensayo: typeof parsed?.codigo_tipo_ensayo === "number" ? parsed.codigo_tipo_ensayo : undefined,
    };
  } catch {
    return {};
  }
}

async function txtEnCarpeta(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.toLowerCase().endsWith(".txt")).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Lista plantillas `.txt` en `informes/` y también en la raíz de plantillas
 * (por si se copiaron ahí a mano). Si el mismo nombre está en ambos, gana
 * el de `informes/`.
 */
export async function listarInformesTxt(): Promise<InformeListadoFs[]> {
  const enInformes = await txtEnCarpeta(INFORMES_DIR);
  const enRaiz = await txtEnCarpeta(PLANTILLAS_DIR);
  const porNombre = new Map<string, string>();
  for (const archivo of enRaiz) {
    porNombre.set(path.basename(archivo).replace(/\.txt$/i, ""), archivo);
  }
  for (const archivo of enInformes) {
    porNombre.set(path.basename(archivo).replace(/\.txt$/i, ""), archivo);
  }

  const informes = await Promise.all(
    [...porNombre.entries()].map(async ([nombre, archivo]) => {
      const [info, meta] = await Promise.all([stat(archivo), leerMetaAlLado(archivo)]);
      return {
        nombre,
        archivo,
        fecha_modificacion: info.mtime.toISOString(),
        codigo_familia: meta.codigo_familia,
        codigo_tipo_ensayo: meta.codigo_tipo_ensayo,
      };
    })
  );
  informes.sort((a, b) => b.fecha_modificacion.localeCompare(a.fecha_modificacion));
  return informes;
}

/** Resuelve el `.txt` de un informe: primero `informes/`, luego la raíz. */
export function rutasPosiblesInforme(nombre: string): string[] {
  const base = path.basename(nombre);
  return [
    path.resolve(INFORMES_DIR, `${base}.txt`),
    path.resolve(PLANTILLAS_DIR, `${base}.txt`),
  ].filter((target) => {
    const root = target.startsWith(INFORMES_DIR) ? INFORMES_DIR : PLANTILLAS_DIR;
    return target !== root && target.startsWith(root + path.sep);
  });
}
