"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { InformeBlock } from "@/lib/informe/parser";
import { generarInformePdfBlob } from "@/lib/informe/pdf";
import { environment } from "@/environments/environments.prod";

interface Props {
  blocks: InformeBlock[];
}

const DEBOUNCE_MS = 500;
const ESCALA_RENDER = 1.5;

/** Carga pdfjs-dist una sola vez por sesión (dinámico: es pesado y solo hace
 * falta en el cliente) y apunta su worker al archivo estático que copiamos a
 * public/pdfjs — mismo patrón que las fuentes/imágenes: todo asset estático
 * se sirve bajo basePath, nunca por ruta absoluta "/...". */
let pdfjsLibPromise: Promise<typeof import("pdfjs-dist")> | null = null;
async function cargarPdfJs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = `${environment.basePath}/pdfjs/pdf.worker.min.mjs`;
      return mod;
    });
  }
  return pdfjsLibPromise;
}

/** Vista previa REAL del PDF — mismo docDefinition de pdfmake que "Generar
 * PDF", pero renderizado con pdf.js sobre <canvas> en vez de un
 * <iframe src="blob:...">. Se evita el iframe a propósito: en este proyecto
 * los visores de PDF embebidos en iframe dieron problemas recurrentes
 * (bloqueos silenciosos por CSP frame-src/object-src, comportamiento
 * inconsistente entre navegadores/Electron, etc.). Acá el PDF se decodifica
 * en JS puro y cada página se dibuja en su propio <canvas>, apiladas — así
 * se ve exactamente dónde corta cada hoja, sin depender de ningún visor
 * nativo ni de reglas de framing.
 *
 * Se regenera con debounce en cada cambio de contenido, y mantiene visibles
 * las páginas anteriores hasta que las nuevas están listas para dibujar (no
 * parpadea en blanco mientras se genera la siguiente versión). */
export default function InformePdfPreview({ blocks }: Readonly<Props>) {
  const [numPaginas, setNumPaginas] = useState(0);
  const [generando, setGenerando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    const miToken = ++tokenRef.current;
    setGenerando(true);
    const timer = setTimeout(async () => {
      try {
        const [pdfjsLib, blob] = await Promise.all([cargarPdfJs(), generarInformePdfBlob(blocks)]);
        if (tokenRef.current !== miToken) return;

        const buffer = await blob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (tokenRef.current !== miToken) return;

        const contenedor = contenedorRef.current;
        if (!contenedor) return;
        contenedor.replaceChildren();

        // En pantallas HiDPI/Retina (devicePixelRatio > 1) hay que dibujar el
        // canvas a la resolución física real y después achicarlo por CSS al
        // tamaño lógico — si no, el navegador estira un canvas de baja
        // resolución y se ve borroso (justo lo que se veía antes de esto).
        const dpr = window.devicePixelRatio || 1;
        for (let numPagina = 1; numPagina <= pdf.numPages; numPagina++) {
          const page = await pdf.getPage(numPagina);
          if (tokenRef.current !== miToken) return;

          const viewport = page.getViewport({ scale: ESCALA_RENDER * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / dpr}px`;
          canvas.style.height = `${viewport.height / dpr}px`;
          canvas.className = "bg-white shadow-md";
          const contexto = canvas.getContext("2d");
          if (!contexto) continue;

          await page.render({ canvasContext: contexto, viewport }).promise;
          if (tokenRef.current !== miToken) return;
          contenedor.appendChild(canvas);
        }

        setNumPaginas(pdf.numPages);
        setError(null);
      } catch (e) {
        if (tokenRef.current !== miToken) return;
        setError(e instanceof Error ? e.message : "No se pudo generar la vista previa del PDF.");
      } finally {
        if (tokenRef.current === miToken) setGenerando(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [blocks]);

  return (
    <div className="relative h-full overflow-y-auto bg-slate-200">
      <div ref={contenedorRef} className="mx-auto flex w-fit flex-col items-center gap-4 p-6" />

      {numPaginas === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {error ?? "Generando vista previa..."}
        </div>
      )}
      {generando && numPaginas > 0 && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-full border bg-white/90 px-2.5 py-1 text-[11px] text-slate-600 shadow-sm">
          <Loader2 className="h-3 w-3 animate-spin" />
          Actualizando...
        </div>
      )}
      {error && numPaginas > 0 && (
        <div className="absolute bottom-2 left-2 right-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {error}
        </div>
      )}
      {numPaginas > 0 && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">
          {numPaginas} {numPaginas === 1 ? "página" : "páginas"}
        </div>
      )}
    </div>
  );
}
