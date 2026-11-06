import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { environment } from "@/environments/environments.prod";

/** Sirve las plantillas guardadas por src/app/api/upload/plantilla/route.ts
 * desde environment.pantillasFormatos — no viven bajo public/, así que Next
 * no las sirve solo; esta ruta las lee del disco y las devuelve. */

const BASE_DIR = path.resolve(environment.pantillasFormatos);

const MIME_BY_EXT: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".html": "text/html",
  ".pdf": "application/pdf",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

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
    return NextResponse.json({ error: "Plantilla no encontrada." }, { status: 404 });
  }
}
