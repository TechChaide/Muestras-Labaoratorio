import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { environment } from "@/environments/environments.prod";

/** Sube una plantilla de informe (para la futura generación de PDF, aún sin
 * implementar). Se guarda SIEMPRE en environment.pantillasFormatos (no en
 * public/) — en producción esa ruta la monta docker-compose.yml sobre el
 * recurso compartido de Windows; en local es la ruta tal cual queda en el
 * filesystem de quien corre `npm run dev`. Se sirve de vuelta vía
 * /api/plantillas/[...path] (ver esa ruta), no por el estático de Next.
 *
 * Tipos permitidos provisionales: .docx, .html, .pdf — ajustar cuando se
 * defina el mecanismo real de generación de PDF (docxtemplater, puppeteer, etc). */

const UPLOAD_DIR = environment.pantillasFormatos;
const ALLOWED_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/html",
  "application/pdf",
]);
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("plantilla");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Archivo inválido o no enviado." },
      { status: 400 }
    );
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Formato no permitido. Use docx, html o pdf." },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "La plantilla supera el tamaño máximo permitido (20MB)." },
      { status: 400 }
    );
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const ext = path.extname(file.name || "").toLowerCase() || ".bin";
  const filename = `${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return NextResponse.json(
    { data: { url: `/api/plantillas/${filename}` } },
    { status: 201 }
  );
}
