"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, ClipboardList, Loader2, Search, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generarInformePdfBlob } from "@/lib/informe/pdf";
import type { InformeBlock } from "@/lib/informe/parser";
import { informeEntregaService } from "@/services/muestrasLaboratorio/informe-entrega.service";
import { solicitudService } from "@/services/muestrasLaboratorio/solicitud.service";
import { configuracionService } from "@/services/seguridades/configuracion.service";
import type { Solicitud } from "@/types/interfaces";
import { cn } from "@/lib/utils";

const ENCUESTA_SATISFACCION_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSeC1yAwFWuM9BE2w_avtzi4wvv4Hm4pJcIuufsASK08ZrCb1w/viewform?usp=dialog";

const asArray = <T,>(data: T | T[] | undefined): T[] =>
  Array.isArray(data) ? data : data ? [data] : [];

function mergeCorreos(...partes: (string | undefined | null)[]): string {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const parte of partes) {
    if (!parte) continue;
    for (const raw of parte.split(",")) {
      const c = raw.trim();
      if (!c || !c.includes("@")) continue;
      const key = c.toLowerCase();
      if (vistos.has(key)) continue;
      vistos.add(key);
      out.push(c);
    }
  }
  return out.join(", ");
}

function cuerpoEntregaHtml(): string {
  return `
    <p>Estimado/a,</p>
    <p>Por medio del presente, se informa que se ha finalizado el análisis de la
    muestra solicitada por su área.</p>
    <p>Los resultados obtenidos se encuentran detallados en el informe de resultados
    adjunto. Se solicita revisar la información contenida en el documento y, en caso
    de requerir alguna aclaración o información adicional relacionada con los
    resultados, metodología o condiciones del ensayo, comunicarse con el
    personal del Laboratorio de Calidad de Chaide.</p>
    <p>Agradecemos su confianza en nuestros servicios y con el objetivo de continuar
    mejorando la calidad y oportunidad de atención, le invitamos a evaluar el
    servicio recibido mediante nuestra Encuesta de Satisfacción:</p>
    <p><a href="${ENCUESTA_SATISFACCION_URL}">${ENCUESTA_SATISFACCION_URL}</a></p>
    <p>Su opinión es importante para identificar oportunidades de mejora en nuestros
    procesos y servicios.</p>
    <p>Saludos cordiales,<br/>
    Centro de Investigación del Descanso (CID)<br/>
    Chaide y Chaide S.A.</p>
  `;
}

async function blobABase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binario = "";
  const TAM = 0x8000;
  for (let i = 0; i < bytes.length; i += TAM) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TAM));
  }
  return btoa(binario);
}

function formatFecha(fecha?: Date | string): string {
  if (!fecha) return "—";
  try {
    return new Date(fecha).toLocaleDateString("es-EC", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocks: InformeBlock[];
  nombreArchivoPdf: string;
}

export default function EnviarInformeDialog({
  open,
  onOpenChange,
  blocks,
  nombreArchivoPdf,
}: Readonly<Props>) {
  const { toast } = useToast();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [codigoSolicitud, setCodigoSolicitud] = useState<number | null>(null);
  const [filtro, setFiltro] = useState("");
  const [correoJefe, setCorreoJefe] = useState("");
  const [cargandoDestinos, setCargandoDestinos] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargarDestinos = useCallback(async () => {
    setCargandoDestinos(true);
    try {
      const [solRes, jefe] = await Promise.all([
        solicitudService.getAll().catch(() => ({ data: [] as Solicitud[] })),
        configuracionService.getValorConfiguracion("JEFE_LABORATORIO").catch(() => ""),
      ]);
      const lista = asArray<Solicitud>(solRes.data).filter(
        (s) => s.codigo_solicitud != null && (s.estado || "A") !== "I"
      );
      lista.sort((a, b) => (b.codigo_solicitud || 0) - (a.codigo_solicitud || 0));
      setSolicitudes(lista);
      setCorreoJefe((jefe || "").trim());
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las solicitudes.",
        variant: "destructive",
      });
    } finally {
      setCargandoDestinos(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    setCodigoSolicitud(null);
    setFiltro("");
    cargarDestinos();
  }, [open, cargarDestinos]);

  const filtradas = useMemo(() => {
    if (!filtro.trim()) return solicitudes;
    const f = filtro.toLowerCase().trim();
    return solicitudes.filter((s) => {
      const id = (s.identificador_ensayo || "").toLowerCase();
      const desc = (s.descripcion || "").toLowerCase();
      const estado = (s.estado_solicitud || "").toLowerCase();
      const codigo = String(s.codigo_solicitud);
      return (
        id.includes(f) ||
        desc.includes(f) ||
        estado.includes(f) ||
        codigo.includes(f)
      );
    });
  }, [solicitudes, filtro]);

  const solicitudSeleccionada = useMemo(
    () => solicitudes.find((s) => s.codigo_solicitud === codigoSolicitud) || null,
    [solicitudes, codigoSolicitud]
  );

  const destinatarios = useMemo(
    () => mergeCorreos(solicitudSeleccionada?.correos_objetivo, correoJefe),
    [solicitudSeleccionada, correoJefe]
  );

  const handleEnviar = async () => {
    if (!solicitudSeleccionada) {
      toast({
        title: "Solicitud requerida",
        description: "Elige la solicitud para enviar el informe.",
        variant: "destructive",
      });
      return;
    }
    if (!destinatarios) {
      toast({
        title: "Sin destinatarios",
        description:
          "La solicitud no tiene correos registrados y/o falta JEFE_LABORATORIO en configuración.",
        variant: "destructive",
      });
      return;
    }
    setEnviando(true);
    try {
      const blob = await generarInformePdfBlob(blocks);
      const pdfBase64 = await blobABase64(blob);
      const id =
        solicitudSeleccionada.identificador_ensayo?.trim() ||
        `solicitud-${solicitudSeleccionada.codigo_solicitud}`;
      await informeEntregaService.enviarResultados({
        correos: destinatarios,
        asunto: `Informe de resultados — ${id} — Laboratorio de Calidad`,
        cuerpoHtml: cuerpoEntregaHtml(),
        pdfBase64,
        nombreArchivo: nombreArchivoPdf,
      });
      toast({
        title: "Enviado",
        description: `Informe enviado (${id}).`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error al enviar",
        description:
          error instanceof Error ? error.message : "No se pudo enviar el informe.",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0 sm:rounded-xl">
        <div className="h-1 bg-gradient-to-r from-[#0055b8] via-sky-500 to-emerald-400" />
        <DialogHeader className="space-y-2 border-b border-slate-100 px-6 py-5 text-left">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            <Send className="h-3.5 w-3.5 text-[#0055b8]" />
            Entrega de resultados
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-slate-900">
            Enviar reporte
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            Elige la solicitud. Destinatarios, asunto y cuerpo se generan
            automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-6 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar por identificador, descripción o estado…"
              className="pl-9"
              disabled={cargandoDestinos || enviando}
            />
          </div>

          <ScrollArea className="h-[340px] pr-3">
            {cargandoDestinos ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-[88px] w-full rounded-lg" />
                ))}
              </div>
            ) : filtradas.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-14 text-center">
                <ClipboardList className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">
                  {filtro.trim()
                    ? "Sin coincidencias"
                    : "No hay solicitudes disponibles"}
                </p>
                <p className="text-xs text-slate-400">
                  {filtro.trim()
                    ? "Prueba con otro término de búsqueda."
                    : "Registra una solicitud para poder enviar el informe."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtradas.map((s) => {
                  const seleccionada = s.codigo_solicitud === codigoSolicitud;
                  const id =
                    s.identificador_ensayo?.trim() ||
                    `Solicitud #${s.codigo_solicitud}`;
                  return (
                    <button
                      key={s.codigo_solicitud}
                      type="button"
                      disabled={enviando}
                      onClick={() => setCodigoSolicitud(s.codigo_solicitud)}
                      className={cn(
                        "w-full rounded-lg border p-3.5 text-left transition-all",
                        "hover:border-sky-300 hover:bg-sky-50/60",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400",
                        seleccionada
                          ? "border-[#0055b8] bg-sky-50 shadow-sm ring-1 ring-[#0055b8]/40"
                          : "border-slate-200 bg-white"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                            seleccionada
                              ? "bg-[#0055b8] text-white"
                              : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {seleccionada ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <ClipboardList className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-900">
                              {id}
                            </span>
                            {s.estado_solicitud && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] font-medium"
                              >
                                {s.estado_solicitud}
                              </Badge>
                            )}
                          </div>
                          {s.descripcion?.trim() && (
                            <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">
                              {s.descripcion.trim()}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                            <span>#{s.codigo_solicitud}</span>
                            <span>Fab/Adq: {formatFecha(s.fecha_fab_adq)}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {!cargandoDestinos && solicitudes.length > 0 && (
            <p className="text-[11px] text-slate-400">
              {filtradas.length} de {solicitudes.length} solicitud
              {solicitudes.length === 1 ? "" : "es"}
              {codigoSolicitud != null ? " · 1 seleccionada" : ""}
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleEnviar}
            disabled={enviando || cargandoDestinos || codigoSolicitud == null}
          >
            {enviando ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            {enviando ? "Enviando…" : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
