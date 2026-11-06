import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { rutasPosiblesInforme } from "@/lib/informe/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ nombre: string }> }
) {
  const { nombre } = await params;
  const candidatos = rutasPosiblesInforme(nombre);
  if (candidatos.length === 0) {
    return NextResponse.json({ error: "Nombre inválido." }, { status: 400 });
  }

  for (const target of candidatos) {
    try {
      const contenido = await readFile(target, "utf8");
      let codigo_familia: number | undefined;
      let codigo_tipo_ensayo: number | undefined;
      try {
        const meta = JSON.parse(await readFile(target.replace(/\.txt$/i, ".meta.json"), "utf8"));
        if (typeof meta?.codigo_familia === "number") codigo_familia = meta.codigo_familia;
        if (typeof meta?.codigo_tipo_ensayo === "number") codigo_tipo_ensayo = meta.codigo_tipo_ensayo;
      } catch {
        // informe legado o nunca clasificado — no es un error
      }
      return NextResponse.json({ data: { nombre, contenido, codigo_familia, codigo_tipo_ensayo } });
    } catch {
      // probar el siguiente candidato
    }
  }

  return NextResponse.json({ error: "Informe no encontrado." }, { status: 404 });
}
