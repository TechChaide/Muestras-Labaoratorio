"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, FlaskConical, Loader2, Search, Table2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { FormularioTabla, Tabla } from "@/types/interfaces";
import { ensayoCategoriaEnsayoService } from "@/services/muestrasLaboratorio/ensayoCategoriaEnsayo.service";
import { formularioTablaService } from "@/services/muestrasLaboratorio/formularioTabla.service";
import { tablaService } from "@/services/muestrasLaboratorio/tabla.service";
import { etiquetaEnsayo, type EnsayoAgendable } from "@/components/agendamiento/types";
import { construirSnapshotTabla } from "@/lib/informe/tabla-snapshot";
import { serializeTablaBlock } from "@/lib/informe/parser";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (bloqueTexto: string) => void;
  /** Si viene con elementos, se usan directo (elegidos en el stepper inicial
   * del editor — paso 2) en vez de traer TODOS los ensayos del sistema. */
  ensayosPermitidos?: EnsayoAgendable[];
}

const asArray = <T,>(data: T | T[] | undefined): T[] => (Array.isArray(data) ? data : data ? [data] : []);

type Seccion = { codigoFormularioTabla: number; codigoTabla: number; nombre: string };

export default function InsertarTablaDialog({ open, onOpenChange, onInsert, ensayosPermitidos }: Readonly<Props>) {
  const { toast } = useToast();
  const [loadingEnsayos, setLoadingEnsayos] = useState(false);
  const [ensayos, setEnsayos] = useState<EnsayoAgendable[]>([]);
  const [filtro, setFiltro] = useState("");
  const [ensayoSeleccionado, setEnsayoSeleccionado] = useState<EnsayoAgendable | null>(null);

  const [loadingSecciones, setLoadingSecciones] = useState(false);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [insertando, setInsertando] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setEnsayoSeleccionado(null);
      setSecciones([]);
      setFiltro("");
      return;
    }
    if (ensayosPermitidos && ensayosPermitidos.length > 0) {
      setEnsayos(ensayosPermitidos);
      return;
    }
    setLoadingEnsayos(true);
    ensayoCategoriaEnsayoService
      .getAll()
      .then((res) => setEnsayos(asArray(res.data).filter((e) => e.estado === "A")))
      .catch(() =>
        toast({ title: "Error", description: "No se pudo cargar la lista de ensayos.", variant: "destructive" })
      )
      .finally(() => setLoadingEnsayos(false));
  }, [open, ensayosPermitidos, toast]);

  const ensayosFiltrados = useMemo(() => {
    if (!filtro.trim()) return ensayos;
    const f = filtro.toLowerCase();
    return ensayos.filter(
      (e) =>
        etiquetaEnsayo(e).toLowerCase().includes(f) ||
        (e.tipo_ensayo?.nombre_tipo_ensayo || "").toLowerCase().includes(f)
    );
  }, [ensayos, filtro]);

  const handleElegirEnsayo = async (ensayo: EnsayoAgendable) => {
    setEnsayoSeleccionado(ensayo);
    setSecciones([]);
    if (!ensayo.codigo_formulario) {
      toast({
        title: "Sin formulario",
        description: "Este ensayo no tiene un formulario asignado.",
        variant: "destructive",
      });
      return;
    }
    setLoadingSecciones(true);
    try {
      const [linksRes, tablasRes] = await Promise.all([
        formularioTablaService.getAll(),
        tablaService.getAll(),
      ]);
      const links = asArray<FormularioTabla>(linksRes.data).filter(
        (l) => l.codigo_formulario === ensayo.codigo_formulario && (l.estado || "A") !== "I"
      );
      const tablas = asArray<Tabla>(tablasRes.data);
      const nuevasSecciones: Seccion[] = links
        .map((l) => {
          const tabla = tablas.find((t) => t.codigo_tabla === l.codigo_tabla);
          if (!tabla || !l.codigo_tabla) return null;
          return {
            codigoFormularioTabla: l.codigo_formulario_tabla,
            codigoTabla: l.codigo_tabla,
            nombre: l.cabecera_formulario || tabla.nombre_tabla || `Tabla #${tabla.codigo_tabla}`,
          };
        })
        .filter((s): s is Seccion => !!s);
      setSecciones(nuevasSecciones);
    } catch {
      toast({ title: "Error", description: "No se pudieron cargar las tablas del formulario.", variant: "destructive" });
    } finally {
      setLoadingSecciones(false);
    }
  };

  const handleInsertarSeccion = async (seccion: Seccion) => {
    if (!ensayoSeleccionado?.codigo_ensayo_categoria_ensayo) return;
    setInsertando(seccion.codigoFormularioTabla);
    try {
      const snapshot = await construirSnapshotTabla(
        ensayoSeleccionado.codigo_ensayo_categoria_ensayo,
        seccion.codigoTabla,
        `${seccion.nombre} — ${etiquetaEnsayo(ensayoSeleccionado)}`
      );
      const bloque = serializeTablaBlock(snapshot.titulo, snapshot.columnas, snapshot.filas);
      onInsert(bloque);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo construir la tabla.",
        variant: "destructive",
      });
    } finally {
      setInsertando(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:rounded-xl">
        <div className="h-1 bg-gradient-to-r from-[#0055b8] via-sky-500 to-emerald-400" />
        <DialogHeader className="space-y-2 border-b border-slate-100 px-6 py-5 text-left">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            <Table2 className="h-3.5 w-3.5 text-[#0055b8]" />
            Editor de informes
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-slate-900">
            Insertar tabla de un ensayo
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            Se inserta una foto de los datos ya capturados en ese ensayo — no se actualiza sola después.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          {!ensayoSeleccionado ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Buscar ensayo por solicitud, muestra o tipo..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  className="h-11 rounded-xl border-slate-200 bg-slate-50/80 pl-9 focus-visible:bg-white"
                />
              </div>

              <div className="flex items-center justify-between px-0.5 text-xs text-slate-500">
                <span>Selecciona un ensayo</span>
                {!loadingEnsayos && (
                  <Badge variant="secondary" className="font-semibold tabular-nums">
                    {ensayosFiltrados.length}
                  </Badge>
                )}
              </div>

              <ScrollArea className="h-80 rounded-xl border border-slate-200 bg-slate-50/40">
                {loadingEnsayos ? (
                  <div className="flex h-80 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-[#0055b8]" />
                    Cargando ensayos…
                  </div>
                ) : ensayosFiltrados.length === 0 ? (
                  <div className="flex h-80 flex-col items-center justify-center gap-2 px-6 text-center">
                    <FlaskConical className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-600">Sin resultados</p>
                    <p className="text-xs text-slate-400">Prueba con otro término de búsqueda.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 p-3">
                    {ensayosFiltrados.map((e) => (
                      <button
                        key={e.codigo_ensayo_categoria_ensayo}
                        type="button"
                        onClick={() => handleElegirEnsayo(e)}
                        className={cn(
                          "group flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left shadow-sm",
                          "transition-all hover:border-[#0055b8]/35 hover:bg-sky-50/60 hover:shadow-md",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055b8]/40"
                        )}
                      >
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-[#0055b8] ring-1 ring-sky-100 transition-colors group-hover:bg-[#0055b8] group-hover:text-white group-hover:ring-[#0055b8]">
                          <FlaskConical className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {etiquetaEnsayo(e)}
                          </span>
                          <span className="block truncate text-xs leading-snug text-slate-500">
                            {e.tipo_ensayo?.nombre_tipo_ensayo || "Tipo de ensayo"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-3.5 py-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-slate-600"
                  onClick={() => setEnsayoSeleccionado(null)}
                >
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                  Cambiar
                </Button>
                <div className="min-w-0 flex-1 border-l border-slate-200 pl-3">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {etiquetaEnsayo(ensayoSeleccionado)}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {ensayoSeleccionado.tipo_ensayo?.nombre_tipo_ensayo || "Tipo de ensayo"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between px-0.5 text-xs text-slate-500">
                <span>Elige la tabla a insertar</span>
                {!loadingSecciones && secciones.length > 0 && (
                  <Badge variant="secondary" className="font-semibold tabular-nums">
                    {secciones.length}
                  </Badge>
                )}
              </div>

              <ScrollArea className="h-72 rounded-xl border border-slate-200 bg-slate-50/40">
                {loadingSecciones ? (
                  <div className="flex h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-[#0055b8]" />
                    Cargando tablas…
                  </div>
                ) : secciones.length === 0 ? (
                  <div className="flex h-72 flex-col items-center justify-center gap-2 px-6 text-center">
                    <Table2 className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-600">Sin tablas</p>
                    <p className="text-xs text-slate-400">Este formulario no tiene tablas configuradas.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 p-3">
                    {secciones.map((s, idx) => (
                      <button
                        key={s.codigoFormularioTabla}
                        type="button"
                        onClick={() => handleInsertarSeccion(s)}
                        disabled={insertando !== null}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left shadow-sm",
                          "transition-all hover:border-[#0055b8]/35 hover:bg-sky-50/60 hover:shadow-md",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055b8]/40",
                          "disabled:pointer-events-none disabled:opacity-50"
                        )}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0055b8] text-xs font-bold text-white shadow-sm">
                          {insertando === s.codigoFormularioTabla ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            idx + 1
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">{s.nombre}</span>
                          <span className="block text-xs text-slate-500">Insertar en el informe</span>
                        </span>
                        <Table2 className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[#0055b8]" />
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
