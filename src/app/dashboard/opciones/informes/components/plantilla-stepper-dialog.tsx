"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, FilePlus, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { solicitudService } from "@/services/muestrasLaboratorio/solicitud.service";
import { ensayoCategoriaEnsayoService } from "@/services/muestrasLaboratorio/ensayoCategoriaEnsayo.service";
import { informeService, type InformeListado } from "@/services/muestrasLaboratorio/informe.service";
import { etiquetaEnsayo, type EnsayoAgendable } from "@/components/agendamiento/types";
import type { Solicitud } from "@/types/interfaces";

export interface PlantillaSeleccion {
  solicitud: Solicitud;
  ensayos: EnsayoAgendable[];
  informeExistente?: InformeListado;
}

interface Props {
  open: boolean;
  onCompletar: (seleccion: PlantillaSeleccion) => void;
  /** Cerrar sin elegir nada (X, Esc, click afuera) — arranca el editor en
   * blanco y sin ensayos asociados (igual que el comportamiento de antes). */
  onOmitir: () => void;
}

const asArray = <T,>(data: T | T[] | undefined): T[] => (Array.isArray(data) ? data : data ? [data] : []);

const PASOS = [
  { id: 1, titulo: "Solicitud", subtitulo: "¿Sobre qué solicitud es este informe?" },
  { id: 2, titulo: "Ensayos", subtitulo: "¿Qué ensayos vas a incluir?" },
  { id: 3, titulo: "Plantilla", subtitulo: "¿Partir de una plantilla o en blanco?" },
] as const;

/** Modal con stepper que se muestra al entrar al editor de informes, ANTES de
 * poder escribir nada: primero se elige la solicitud y los ensayos sobre los
 * que trata el informe (eso acota después qué tablas se pueden insertar —
 * ver InsertarTablaDialog con `ensayosPermitidos`), y recién al final si se
 * arranca en blanco o desde una plantilla ya guardada. */
export default function PlantillaStepperDialog({ open, onCompletar, onOmitir }: Readonly<Props>) {
  const { toast } = useToast();
  const [paso, setPaso] = useState<1 | 2 | 3>(1);

  const [loadingSolicitudes, setLoadingSolicitudes] = useState(false);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [filtroSolicitud, setFiltroSolicitud] = useState("");
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState<Solicitud | null>(null);

  const [loadingEnsayos, setLoadingEnsayos] = useState(false);
  const [ensayosDisponibles, setEnsayosDisponibles] = useState<EnsayoAgendable[]>([]);
  const [ensayosSeleccionados, setEnsayosSeleccionados] = useState<Set<number>>(new Set());

  const [origen, setOrigen] = useState<"blanco" | "existente" | null>(null);
  const [loadingInformes, setLoadingInformes] = useState(false);
  const [informesGuardados, setInformesGuardados] = useState<InformeListado[]>([]);
  const [informeElegido, setInformeElegido] = useState<InformeListado | null>(null);

  useEffect(() => {
    if (!open) return;
    setPaso(1);
    setFiltroSolicitud("");
    setSolicitudSeleccionada(null);
    setEnsayosDisponibles([]);
    setEnsayosSeleccionados(new Set());
    setOrigen(null);
    setInformeElegido(null);
    setLoadingSolicitudes(true);
    solicitudService
      .getAll()
      .then((res) => setSolicitudes(asArray(res.data).filter((s) => (s.estado || "A") !== "I")))
      .catch(() =>
        toast({ title: "Error", description: "No se pudieron cargar las solicitudes.", variant: "destructive" })
      )
      .finally(() => setLoadingSolicitudes(false));
  }, [open, toast]);

  const solicitudesFiltradas = useMemo(() => {
    const f = filtroSolicitud.trim().toLowerCase();
    if (!f) return solicitudes;
    return solicitudes.filter((s) =>
      [s.identificador_ensayo, s.descripcion].filter(Boolean).some((v) => String(v).toLowerCase().includes(f))
    );
  }, [solicitudes, filtroSolicitud]);

  const elegirSolicitud = (s: Solicitud) => {
    if (solicitudSeleccionada?.codigo_solicitud === s.codigo_solicitud) return;
    setSolicitudSeleccionada(s);
    setEnsayosSeleccionados(new Set());
    setLoadingEnsayos(true);
    ensayoCategoriaEnsayoService
      .getAll()
      .then((res) => {
        const propios = asArray(res.data).filter(
          (e) => e.codigo_solicitud === s.codigo_solicitud && e.estado === "A"
        );
        setEnsayosDisponibles(propios as EnsayoAgendable[]);
      })
      .catch(() =>
        toast({ title: "Error", description: "No se pudieron cargar los ensayos de la solicitud.", variant: "destructive" })
      )
      .finally(() => setLoadingEnsayos(false));
  };

  const toggleEnsayo = (codigo: number) => {
    setEnsayosSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  const elegirOrigen = (o: "blanco" | "existente") => {
    setOrigen(o);
    setInformeElegido(null);
    if (o === "existente") {
      setLoadingInformes(true);
      informeService
        .listar()
        .then(setInformesGuardados)
        .catch(() =>
          toast({ title: "Error", description: "No se pudo listar los informes guardados.", variant: "destructive" })
        )
        .finally(() => setLoadingInformes(false));
    }
  };

  const puedeAvanzar =
    (paso === 1 && !!solicitudSeleccionada) ||
    (paso === 2 && ensayosSeleccionados.size > 0) ||
    paso === 3;
  const puedeFinalizar = origen === "blanco" || (origen === "existente" && !!informeElegido);

  const handleFinalizar = () => {
    if (!solicitudSeleccionada || !puedeFinalizar) return;
    const ensayos = ensayosDisponibles.filter((e) => ensayosSeleccionados.has(e.codigo_ensayo_categoria_ensayo));
    onCompletar({
      solicitud: solicitudSeleccionada,
      ensayos,
      informeExistente: origen === "existente" ? informeElegido ?? undefined : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOmitir()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <div className="flex min-h-[480px]">
          {/* ── Rail de pasos ─────────────────────────────── */}
          <div className="w-56 shrink-0 bg-slate-50 border-r flex flex-col p-5">
            {PASOS.map((p, idx) => (
              <div key={p.id} className="relative">
                {idx < PASOS.length - 1 && (
                  <div
                    className={`absolute left-[15px] top-9 w-0.5 h-8 transition-colors ${
                      paso > p.id ? "bg-primary" : "bg-gray-200"
                    }`}
                  />
                )}
                <div className="flex items-start gap-2.5 py-2.5">
                  <div
                    className={[
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors",
                      paso === p.id ? "bg-primary text-white ring-4 ring-blue-100" : "",
                      paso > p.id ? "bg-primary text-white" : "",
                      paso < p.id ? "border-2 border-gray-300 text-gray-400 bg-white" : "",
                    ].join(" ")}
                  >
                    {paso > p.id ? <Check className="h-3.5 w-3.5" /> : p.id}
                  </div>
                  <div className="pt-0.5">
                    <p
                      className={`text-xs font-semibold leading-tight ${
                        paso === p.id ? "text-primary" : paso > p.id ? "text-gray-700" : "text-gray-400"
                      }`}
                    >
                      {p.titulo}
                    </p>
                    <p className={`text-[11px] mt-0.5 ${paso >= p.id ? "text-gray-500" : "text-gray-300"}`}>
                      {p.subtitulo}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={onOmitir}
              className="mt-auto text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 text-left"
            >
              Omitir y empezar en blanco
            </button>
          </div>

          {/* ── Contenido del paso ─────────────────────────── */}
          <div className="flex-1 flex flex-col p-6 min-w-0">
            <DialogHeader className="mb-3">
              <DialogTitle>Nuevo informe</DialogTitle>
              <DialogDescription>{PASOS[paso - 1].subtitulo}</DialogDescription>
            </DialogHeader>

            {paso === 1 && (
              <div className="flex flex-col gap-3 min-h-0 flex-1">
                <Input
                  placeholder="Buscar solicitud por identificador o descripción..."
                  value={filtroSolicitud}
                  onChange={(e) => setFiltroSolicitud(e.target.value)}
                />
                <ScrollArea className="h-72 rounded-md border">
                  {loadingSolicitudes ? (
                    <div className="flex items-center justify-center h-72 text-muted-foreground text-sm">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Cargando...
                    </div>
                  ) : solicitudesFiltradas.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">Sin resultados.</p>
                  ) : (
                    <div className="divide-y">
                      {solicitudesFiltradas.map((s) => (
                        <button
                          key={s.codigo_solicitud}
                          type="button"
                          onClick={() => elegirSolicitud(s)}
                          className={`w-full flex items-center justify-between text-left px-3 py-2 hover:bg-muted/60 text-sm ${
                            solicitudSeleccionada?.codigo_solicitud === s.codigo_solicitud ? "bg-primary/5" : ""
                          }`}
                        >
                          <span>
                            <span className="block font-medium">
                              {s.identificador_ensayo || `Solicitud #${s.codigo_solicitud}`}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {s.descripcion || "Sin descripción"}
                            </span>
                          </span>
                          {solicitudSeleccionada?.codigo_solicitud === s.codigo_solicitud && (
                            <Check className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}

            {paso === 2 && (
              <div className="flex flex-col gap-3 min-h-0 flex-1">
                <ScrollArea className="h-80 rounded-md border">
                  {loadingEnsayos ? (
                    <div className="flex items-center justify-center h-80 text-muted-foreground text-sm">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Cargando ensayos...
                    </div>
                  ) : ensayosDisponibles.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">
                      Esta solicitud no tiene ensayos registrados.
                    </p>
                  ) : (
                    <div className="divide-y">
                      {ensayosDisponibles.map((e) => (
                        <label
                          key={e.codigo_ensayo_categoria_ensayo}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-muted/60 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={ensayosSeleccionados.has(e.codigo_ensayo_categoria_ensayo)}
                            onCheckedChange={() => toggleEnsayo(e.codigo_ensayo_categoria_ensayo)}
                          />
                          <span>
                            <span className="block font-medium">{e.tipo_ensayo?.nombre_tipo_ensayo || etiquetaEnsayo(e)}</span>
                            <span className="block text-xs text-muted-foreground">
                              {e.muestra?.nombre_material_muestra || "Sin muestra"}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                <p className="text-xs text-muted-foreground">
                  {ensayosSeleccionados.size} ensayo(s) seleccionado(s) — luego solo podrás insertar tablas de estos.
                </p>
              </div>
            )}

            {paso === 3 && (
              <div className="flex flex-col gap-3 min-h-0 flex-1">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => elegirOrigen("blanco")}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-5 text-sm hover:bg-muted/40 ${
                      origen === "blanco" ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <FilePlus className="h-7 w-7 text-muted-foreground" />
                    <span className="font-medium">Empezar en blanco</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => elegirOrigen("existente")}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-5 text-sm hover:bg-muted/40 ${
                      origen === "existente" ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <FileText className="h-7 w-7 text-muted-foreground" />
                    <span className="font-medium">Usar una plantilla existente</span>
                  </button>
                </div>

                {origen === "existente" && (
                  <ScrollArea className="h-56 rounded-md border">
                    {loadingInformes ? (
                      <div className="flex items-center justify-center h-56 text-muted-foreground text-sm">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Cargando...
                      </div>
                    ) : informesGuardados.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground text-center">
                        No hay plantillas .txt. El editor solo lista informes guardados desde esta pantalla, no Word ni PDF de la carpeta.
                      </p>
                    ) : (
                      <div className="divide-y">
                        {informesGuardados.map((inf) => (
                          <button
                            key={inf.nombre}
                            type="button"
                            onClick={() => setInformeElegido(inf)}
                            className={`w-full flex items-center justify-between text-left px-3 py-2 hover:bg-muted/60 text-sm ${
                              informeElegido?.nombre === inf.nombre ? "bg-primary/5" : ""
                            }`}
                          >
                            {inf.nombre}
                            {informeElegido?.nombre === inf.nombre && <Check className="h-4 w-4 text-primary shrink-0" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                )}
              </div>
            )}

            <DialogFooter className="mt-4">
              {paso > 1 && (
                <Button type="button" variant="outline" onClick={() => setPaso((p) => (p - 1) as 1 | 2)}>
                  Atrás
                </Button>
              )}
              {paso < 3 ? (
                <Button type="button" onClick={() => setPaso((p) => (p + 1) as 2 | 3)} disabled={!puedeAvanzar}>
                  Siguiente
                </Button>
              ) : (
                <Button type="button" onClick={handleFinalizar} disabled={!puedeFinalizar}>
                  Empezar
                </Button>
              )}
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
