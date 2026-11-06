"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FlaskConical, Loader2, Plus, Trash2 } from "lucide-react";
import type { Muestra, Solicitud, TipoEnsayo } from "@/types/interfaces";
import { ORIGENES_SOLICITUD } from "@/types/interfaces";
import { solicitudService } from "@/services/muestrasLaboratorio/solicitud.service";
import { tipoEnsayoService } from "@/services/muestrasLaboratorio/tipoEnsayo.service";
import { ensayoCategoriaEnsayoService } from "@/services/muestrasLaboratorio/ensayoCategoriaEnsayo.service";
import { resultadoService } from "@/services/muestrasLaboratorio/resultado.service";
import type { EnsayoAgendable } from "@/components/agendamiento/types";
import { isProgramado } from "@/components/agendamiento/types";
import MuestraStepSelector from "@/components/muestras/muestra-step-selector";

interface SolicitudEditPanelProps {
  solicitud: Solicitud;
  onSuccess: () => void;
  onCancel: () => void;
}

/** YYYY-MM-DD → Date a medianoche local (evita desfase UTC de `new Date("YYYY-MM-DD")`). */
const dateInputToLocalDate = (value: string): Date => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const toDateInput = (value?: Date | string): string => {
  if (!value) return "";
  if (typeof value === "string") {
    // ISO o solo fecha: tomar YYYY-MM-DD sin pasar por UTC.
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getCurrentUser = (): { id_usuario?: string } => {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("user") : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export default function SolicitudEditPanel({ solicitud, onSuccess, onCancel }: SolicitudEditPanelProps) {
  const { toast } = useToast();

  // ── Datos de la solicitud ──
  const [identificador] = useState(solicitud.identificador_ensayo || "");
  const [descripcion, setDescripcion] = useState(solicitud.descripcion || "");
  const [fechaFabAdq, setFechaFabAdq] = useState(toDateInput(solicitud.fecha_fab_adq));
  const [loteSerial, setLoteSerial] = useState(solicitud.lote_serial || "");
  const [fechaFabricacion, setFechaFabricacion] = useState(toDateInput(solicitud.fecha_fabricacion));
  const [origenSolicitud, setOrigenSolicitud] = useState(solicitud.origen_solicitud || "");
  const [correos, setCorreos] = useState(solicitud.correos_objetivo || "");
  const [savingDatos, setSavingDatos] = useState(false);

  // ── Tipos de ensayo asignados ──
  const [ensayosAsignados, setEnsayosAsignados] = useState<EnsayoAgendable[]>([]);
  const [tiposEnsayo, setTiposEnsayo] = useState<TipoEnsayo[]>([]);
  const [loadingEnsayos, setLoadingEnsayos] = useState(true);
  const [nuevoTipoId, setNuevoTipoId] = useState<string>("");
  const [addingTipo, setAddingTipo] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<EnsayoAgendable | null>(null);
  const [savingMuestra, setSavingMuestra] = useState(false);
  const [confirmQuitarMuestra, setConfirmQuitarMuestra] = useState(false);
  /** undefined = usar la muestra guardada; null = selector vacío (cambiar/crear). */
  const [muestraOverride, setMuestraOverride] = useState<Muestra | null | undefined>(undefined);

  const fetchEnsayosAsignados = () => {
    setLoadingEnsayos(true);
    Promise.all([ensayoCategoriaEnsayoService.getAll(), tipoEnsayoService.getAll()])
      .then(([ecRes, teRes]) => {
        const ecData = (ecRes.data || []) as EnsayoAgendable[];
        const propios = (Array.isArray(ecData) ? ecData : [ecData]).filter(
          (e) => e.codigo_solicitud === solicitud.codigo_solicitud && e.estado === "A"
        );
        setEnsayosAsignados(propios);
        setMuestraOverride(undefined);
        const teData = teRes.data || [];
        setTiposEnsayo(Array.isArray(teData) ? teData : [teData]);
      })
      .catch((err) => toast({ title: "Error", description: err.message, variant: "destructive" }))
      .finally(() => setLoadingEnsayos(false));
  };

  useEffect(() => {
    fetchEnsayosAsignados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitud.codigo_solicitud]);

  // La familia se infiere de los tipos ya asignados (todos comparten familia, regla del wizard de creación).
  const familiaInferida = useMemo(() => {
    for (const e of ensayosAsignados) {
      if (e.tipo_ensayo?.codigo_familia) return e.tipo_ensayo.codigo_familia;
    }
    return null;
  }, [ensayosAsignados]);

  const tiposDisponiblesParaAgregar = useMemo(() => {
    const asignadosIds = new Set(ensayosAsignados.map((e) => e.codigo_tipo_ensayo));
    return tiposEnsayo.filter(
      (t) =>
        (t.estado || "A") === "A" &&
        (familiaInferida == null || t.codigo_familia === familiaInferida) &&
        !asignadosIds.has(t.codigo_tipo_ensayo)
    );
  }, [tiposEnsayo, ensayosAsignados, familiaInferida]);

  // Muestra que comparten todas las filas activas (si la hay), para heredarla en el nuevo tipo de ensayo.
  const muestraComun = useMemo(() => {
    const muestras = new Set(ensayosAsignados.map((e) => e.codigo_muestra).filter((m): m is number => !!m));
    return muestras.size === 1 ? [...muestras][0] : undefined;
  }, [ensayosAsignados]);

  const muestraActual = useMemo<Muestra | null>(() => {
    const conMuestra = ensayosAsignados.find((e) => e.muestra);
    return conMuestra?.muestra ?? null;
  }, [ensayosAsignados]);

  const esSolicitudExterna = solicitud.origen_solicitud === "Solicitud externa";

  const solicitudTieneResultados = async (): Promise<boolean> => {
    const ids = ensayosAsignados.map((e) => e.codigo_ensayo_categoria_ensayo);
    const resultadosRes = await resultadoService.getByEnsayos(ids);
    const lista = Array.isArray(resultadosRes.data)
      ? resultadosRes.data
      : resultadosRes.data
        ? [resultadosRes.data]
        : [];
    return lista.some((r) => (r.estado || "A") === "A");
  };

  const persistirMuestra = async (muestra: Muestra | null) => {
    if (!ensayosAsignados.length) {
      toast({
        title: "Sin tipos de ensayo",
        description: "Agrega al menos un tipo de ensayo antes de asignar la muestra.",
        variant: "destructive",
      });
      return;
    }
    const cambiaOQuita =
      !muestra || (muestraComun != null && muestra.codigo_muestra !== muestraComun);
    if (cambiaOQuita) {
      try {
        if (await solicitudTieneResultados()) {
          toast({
            title: "No se puede modificar la muestra",
            description: "Esta solicitud ya tiene resultados capturados.",
            variant: "destructive",
          });
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo verificar si hay resultados.";
        toast({ title: "Error", description: message, variant: "destructive" });
        return;
      }
    }
    setSavingMuestra(true);
    try {
      await Promise.all(
        ensayosAsignados.map((e) =>
          ensayoCategoriaEnsayoService.save({
            codigo_ensayo_categoria_ensayo: e.codigo_ensayo_categoria_ensayo,
            codigo_muestra: muestra?.codigo_muestra ?? null,
          })
        )
      );
      toast({
        title: muestra ? "Muestra actualizada" : "Muestra quitada",
        description: muestra
          ? `Se asignó “${muestra.nombre_material_muestra}” a la solicitud.`
          : "La muestra se desasignó de esta solicitud.",
        variant: "success",
      });
      fetchEnsayosAsignados();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar la muestra.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSavingMuestra(false);
    }
  };

  const handleGuardarDatos = async () => {
    if (!identificador.trim()) {
      toast({ title: "Falta el identificador", description: "El identificador de ensayo es requerido.", variant: "destructive" });
      return;
    }
    setSavingDatos(true);
    try {
      await solicitudService.save({
        ...solicitud,
        identificador_ensayo: identificador,
        descripcion,
        fecha_fab_adq: fechaFabAdq ? dateInputToLocalDate(fechaFabAdq) : undefined,
        lote_serial: loteSerial || undefined,
        fecha_fabricacion: fechaFabricacion || undefined,
        origen_solicitud: origenSolicitud || undefined,
        correos_objetivo: correos,
      });
      toast({ title: "Datos actualizados", description: "La solicitud se guardó correctamente.", variant: "success" });
      onSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar la solicitud.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSavingDatos(false);
    }
  };

  const handleAgregarTipo = async () => {
    if (!nuevoTipoId) return;
    setAddingTipo(true);
    try {
      const currentUser = getCurrentUser();
      await ensayoCategoriaEnsayoService.save({
        codigo_ensayo_categoria_ensayo: 0,
        codigo_solicitud: solicitud.codigo_solicitud,
        codigo_muestra: muestraComun,
        codigo_tipo_ensayo: Number(nuevoTipoId),
        responsable_ensayo: undefined,
        fecha_inicio: undefined,
        fecha_fin: undefined,
        fecha_extension: undefined,
        estado: "A",
        fecha_creacion: new Date(),
        usuario_creacion: currentUser?.id_usuario,
      });
      toast({ title: "Tipo de ensayo agregado", variant: "success" });
      setNuevoTipoId("");
      fetchEnsayosAsignados();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo agregar el tipo de ensayo.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setAddingTipo(false);
    }
  };

  const requestRemove = async (item: EnsayoAgendable) => {
    if (isProgramado(item)) {
      toast({
        title: "No se puede quitar",
        description: "Este ensayo ya está programado en el agendamiento. Cancela la programación antes de quitarlo.",
        variant: "destructive",
      });
      return;
    }
    try {
      const resultadosRes = await resultadoService.getByEnsayos([item.codigo_ensayo_categoria_ensayo]);
      const resultados = resultadosRes.data || [];
      const lista = Array.isArray(resultados) ? resultados : [resultados];
      const tieneResultados = lista.some((r) => r.codigo_ensayo_categoria_ensayo === item.codigo_ensayo_categoria_ensayo);
      if (tieneResultados) {
        toast({
          title: "No se puede quitar",
          description: "Este ensayo ya tiene resultados registrados. No puede eliminarse.",
          variant: "destructive",
        });
        return;
      }
      setConfirmRemove(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo verificar si el ensayo tiene resultados.";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const confirmarRemover = async () => {
    if (!confirmRemove) return;
    setRemovingId(confirmRemove.codigo_ensayo_categoria_ensayo);
    try {
      await ensayoCategoriaEnsayoService.delete(confirmRemove.codigo_ensayo_categoria_ensayo);
      toast({ title: "Tipo de ensayo quitado", variant: "success" });
      setConfirmRemove(null);
      fetchEnsayosAsignados();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo quitar el tipo de ensayo.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Datos de la Solicitud</CardTitle>
          <CardDescription>Código #{solicitud.codigo_solicitud}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Identificador del Ensayo</label>
            <Input
              value={identificador}
              readOnly
              disabled
              className="bg-muted font-mono"
              title="El identificador se asigna al crear la solicitud y no se modifica"
            />
            <p className="text-[11px] text-muted-foreground">
              Generado al crear la solicitud; no editable para conservar la secuencia FAMILIA-MES-AA-###.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Fecha de Ingreso</label>
            <Input type="date" value={fechaFabAdq} onChange={(e) => setFechaFabAdq(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Origen de la solicitud</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={origenSolicitud}
              onChange={(e) => setOrigenSolicitud(e.target.value)}
            >
              <option value="">Sin especificar</option>
              {ORIGENES_SOLICITUD.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Lote / Serial</label>
            <Input
              placeholder="Ej: L-2026-0912"
              value={loteSerial}
              onChange={(e) => setLoteSerial(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Fecha de fabricación</label>
            <Input
              type="date"
              value={fechaFabricacion}
              onChange={(e) => setFechaFabricacion(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Especificaciones extras</label>
            <Textarea
              rows={3}
              maxLength={500}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="En caso de necesitar comparar su muestra con un resultado histórico de otra muestra, indique con que muestra se desea realizarla comparación."
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Correos Objetivo</label>
            <Input value={correos} onChange={(e) => setCorreos(e.target.value)} />
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cerrar</Button>
          <Button onClick={handleGuardarDatos} disabled={savingDatos}>
            {savingDatos && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar datos
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Muestra
          </CardTitle>
          <CardDescription>
            Añade, cambia o quita el material asociado a esta solicitud. Aplica a todos los tipos de ensayo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingEnsayos ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : ensayosAsignados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Agrega al menos un tipo de ensayo antes de asignar una muestra.
            </p>
          ) : (
            <div className={savingMuestra ? "pointer-events-none opacity-70" : undefined}>
              <MuestraStepSelector
                value={muestraOverride === undefined ? muestraActual : muestraOverride}
                onChange={(m) => {
                  if (m) void persistirMuestra(m);
                  else setMuestraOverride(null);
                }}
                allowClear={!!(muestraOverride === undefined ? muestraActual : muestraOverride)}
                onClear={() => setConfirmQuitarMuestra(true)}
                createOnly={esSolicitudExterna}
                allowMaterialSearch={!esSolicitudExterna}
              />
              {savingMuestra && (
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando muestra...
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tipos de ensayo asignados</CardTitle>
          <CardDescription>Agrega o quita los tipos de ensayo que se realizarán en esta solicitud.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingEnsayos ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : (
            <>
              <div className="divide-y">
                {ensayosAsignados.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-3">Sin tipos de ensayo asignados.</p>
                ) : (
                  ensayosAsignados.map((item) => (
                    <div key={item.codigo_ensayo_categoria_ensayo} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{item.tipo_ensayo?.nombre_tipo_ensayo || "Tipo de ensayo"}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <Badge variant="outline">
                            {item.muestra?.nombre_material_muestra ? `Muestra: ${item.muestra.nombre_material_muestra}` : "Sin muestra"}
                          </Badge>
                          {item.fecha_inicio && item.fecha_fin ? (
                            <Badge variant="secondary">Agendado</Badge>
                          ) : (
                            <Badge variant="outline">Sin programar</Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive shrink-0"
                        onClick={() => requestRemove(item)}
                        disabled={removingId === item.codigo_ensayo_categoria_ensayo || isProgramado(item)}
                        title={
                          isProgramado(item)
                            ? "Ensayo ya programado — no se puede quitar"
                            : "Quitar tipo de ensayo"
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t">
                <select
                  value={nuevoTipoId}
                  onChange={(e) => setNuevoTipoId(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Selecciona un tipo de ensayo...</option>
                  {tiposDisponiblesParaAgregar.map((t) => (
                    <option key={t.codigo_tipo_ensayo} value={t.codigo_tipo_ensayo}>
                      {t.nombre_tipo_ensayo}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={handleAgregarTipo} disabled={!nuevoTipoId || addingTipo}>
                  {addingTipo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Agregar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmQuitarMuestra} onOpenChange={setConfirmQuitarMuestra}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar la muestra de esta solicitud?</AlertDialogTitle>
            <AlertDialogDescription>
              El material se desasigna de los tipos de ensayo. La muestra no se elimina del catálogo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmQuitarMuestra(false);
                void persistirMuestra(null);
              }}
            >
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmRemove} onOpenChange={(open) => !open && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar este tipo de ensayo?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove?.tipo_ensayo?.nombre_tipo_ensayo} se desactivará de esta solicitud. Esta acción se
              puede revertir solo desde soporte técnico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarRemover}>Quitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
