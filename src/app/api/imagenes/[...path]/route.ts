import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { environment } from "@/environments/environments.prod";

/** Sirve las imágenes guardadas por src/app/api/upload/imagen/route.ts desde
 * environment.evidenciasFotosURL — no viven bajo public/, así que Next no
 * las sirve solo; esta ruta las lee del disco y las devuelve. */

const BASE_DIR = path.resolve(environment.evidenciasFotosURL);

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  // Resuelve y verifica que el resultado siga dentro de BASE_DIR — bloquea
  // intentos de path traversal (ej. "../../..") en los segmentos de la URL.
  const target = path.resolve(BASE_DIR, ...segments);
  if (target !== BASE_DIR && !target.startsWith(BASE_DIR + path.sep)) {
    return NextResponse.json({ error: "Ruta inválida." }, { status: 400 });
  }

  const ext = path.extname(target).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    return NextResponse.json({ error: "Tipo de archivo no permitido." }, { status: 400 });
  }

  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error("not a file");
    const buffer = await readFile(target);
    const etag = `"${info.size}-${info.mtimeMs}"`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(info.size),
        ETag: etag,
        "Last-Modified": info.mtime.toUTCString(),
        "Cache-Control": "public, max-age=300, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json({ error: "Imagen no encontrada." }, { status: 404 });
  }
}
