import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { environment } from "@/environments/environments.prod";

/** Sube una imagen para una celda tipo_dato = 'imagen' del editor de tablas.
 * Se guarda SIEMPRE en environment.evidenciasFotosURL (no en public/) — en
 * producción esa ruta la monta docker-compose.yml sobre el recurso
 * compartido de Windows; en local es la ruta tal cual queda en el
 * filesystem de quien corre `npm run dev`. Se sirve de vuelta vía
 * /api/imagenes/[...path] (ver esa ruta), no por el estático de Next. */

const UPLOAD_DIR = path.join(environment.evidenciasFotosURL, "celdas-imagen");
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("imagen");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Archivo inválido o no enviado." },
      { status: 400 }
    );
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Formato no permitido. Use jpeg, png, webp o gif." },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "La imagen supera el tamaño máximo permitido (8MB)." },
      { status: 400 }
    );
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const ext = path.extname(file.name || "").toLowerCase() || ".jpg";
  const filename = `${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return NextResponse.json(
    { data: { url: `/api/imagenes/celdas-imagen/${filename}` } },
    { status: 201 }
  );
}
