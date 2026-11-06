"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Loader2 } from "lucide-react";
import { environment } from "@/environments/environments.prod";

/** Ruta relativa dentro de pantillasFormatos (incluye subcarpeta informes). */
export const TERMINOS_PDF_PATH = "informes/LAB-TEC-R14 Solicitud de Ensayos Ver11.pdf";
export const TERMINOS_PDF_FILENAME = "LAB-TEC-R14 Solicitud de Ensayos Ver11.pdf";

const ESCALA_RENDER = 1.35;

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

export function terminosPdfUrl(): string {
  const segments = TERMINOS_PDF_PATH.split("/").map(encodeURIComponent).join("/");
  return `${environment.basePath}/api/plantillas/${segments}`;
}

interface TerminosCondicionesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Modal solo para leer los términos y condiciones (sin descarga). */
export function TerminosCondicionesDialog({ open, onOpenChange }: Readonly<TerminosCondicionesDialogProps>) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numPaginas, setNumPaginas] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!open) return;

    const miToken = ++tokenRef.current;
    setCargando(true);
    setError(null);
    setNumPaginas(0);

    (async () => {
      try {
        const [pdfjsLib, res] = await Promise.all([cargarPdfJs(), fetch(terminosPdfUrl())]);
        if (tokenRef.current !== miToken) return;

        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "No se encontró el archivo de términos en plantillas."
              : "No se pudo cargar el PDF de términos."
          );
        }

        const buffer = await res.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (tokenRef.current !== miToken) return;

        const contenedor = contenedorRef.current;
        if (!contenedor) return;
        contenedor.replaceChildren();

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
          canvas.className = "mx-auto mb-3 rounded border border-slate-200 bg-white shadow-sm";

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (tokenRef.current !== miToken) return;
          contenedor.appendChild(canvas);
        }

        setNumPaginas(pdf.numPages);
      } catch (e) {
        if (tokenRef.current !== miToken) return;
        setError(e instanceof Error ? e.message : "Error al mostrar el PDF.");
      } finally {
        if (tokenRef.current === miToken) setCargando(false);
      }
    })();

    return () => {
      tokenRef.current += 1;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <div className="h-1 shrink-0 bg-gradient-to-r from-[#0055b8] via-sky-500 to-emerald-400" />
        <DialogHeader className="space-y-1 border-b border-slate-100 px-5 py-4 text-left">
          <div className="min-w-0 space-y-1 pr-8">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <FileText className="h-3.5 w-3.5 text-[#0055b8]" />
              Documento legal
            </div>
            <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">
              Términos y condiciones
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              LAB-TEC-R14 Solicitud de Ensayos — léelo aquí antes de aceptar.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-y-auto bg-slate-100/80 px-4 py-4">
          {cargando && (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-[#0055b8]" />
              Cargando términos…
            </div>
          )}
          {error && !cargando && (
            <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900">
              <p className="font-semibold">No se pudo mostrar el PDF</p>
              <p className="mt-1 text-xs text-amber-800/80">{error}</p>
              <p className="mt-3 text-xs text-amber-700">
                Verifica que el archivo exista en la carpeta de plantillas con el nombre exacto.
              </p>
            </div>
          )}
          <div ref={contenedorRef} className={cargando || error ? "hidden" : undefined} />
          {!cargando && !error && numPaginas > 0 && (
            <p className="mt-2 text-center text-[11px] text-slate-400">
              {numPaginas} página{numPaginas === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
