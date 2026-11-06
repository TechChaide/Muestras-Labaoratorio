import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { INFORMES_DIR, listarInformesTxt } from "@/lib/informe/storage";

/** Guarda y lista informes (.txt en el formato de src/lib/informe/parser.ts)
 * dentro de environment.pantillasFormatos/informes — misma ruta configurable
 * ya usada para plantillas, no bajo public/ (ver upload/plantilla/route.ts).
 *
 * La clasificación (familia/tipo de ensayo) vive en un archivo "sidecar"
 * NOMBRE.meta.json junto al NOMBRE.txt — así el formato del .txt (el texto
 * plano del informe) no cambia para nada, y los informes guardados antes de
 * que existiera esta clasificación simplemente no tienen sidecar (se leen
 * igual, solo que "sin clasificar"). */

/** Nombre de archivo seguro: solo letras/números/espacios/guiones, sin rutas. */
function sanitizeNombre(nombre: string): string {
  return nombre
    .trim()
    .replace(/[\\/]/g, "-")
    .replace(/[^\w\s.-]/g, "")
    .slice(0, 150) || "informe-sin-titulo";
}

export async function GET() {
  try {
    await mkdir(INFORMES_DIR, { recursive: true });
    const informes = await listarInformesTxt();
    return NextResponse.json({
      data: informes.map(({ nombre, fecha_modificacion, codigo_familia, codigo_tipo_ensayo }) => ({
        nombre,
        fecha_modificacion,
        codigo_familia,
        codigo_tipo_ensayo,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo listar los informes." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const nombre = typeof body?.nombre === "string" ? body.nombre : "";
  const contenido = typeof body?.contenido === "string" ? body.contenido : "";
  const codigo_familia = typeof body?.codigo_familia === "number" ? body.codigo_familia : undefined;
  const codigo_tipo_ensayo = typeof body?.codigo_tipo_ensayo === "number" ? body.codigo_tipo_ensayo : undefined;

  if (!nombre.trim()) {
    return NextResponse.json({ error: "El informe necesita un nombre." }, { status: 400 });
  }

  await mkdir(INFORMES_DIR, { recursive: true });
  const nombreSeguro = sanitizeNombre(nombre);
  await writeFile(path.join(INFORMES_DIR, `${nombreSeguro}.txt`), contenido, "utf8");
  await writeFile(
    path.join(INFORMES_DIR, `${nombreSeguro}.meta.json`),
    JSON.stringify({ codigo_familia, codigo_tipo_ensayo }),
    "utf8"
  );

  return NextResponse.json({ data: { nombre: nombreSeguro } }, { status: 201 });
}
