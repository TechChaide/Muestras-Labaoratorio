"use client";

import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { addDays, format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { FileText, Loader2 } from "lucide-react";
import type { Formulario } from "@/types/interfaces";
import { ensayoCategoriaEnsayoService } from "@/services/muestrasLaboratorio/ensayoCategoriaEnsayo.service";
import { formularioService } from "@/services/muestrasLaboratorio/formulario.service";
import { ResponsableCombobox, extractEmpleadoCorreo } from "@/components/agendamiento/responsable-combobox";
import { etiquetaEnsayo, type EnsayoAgendable } from "@/components/agendamiento/types";
import {
  getFormulariosPorFamilia,
  getFormulariosPorTipoEnsayo,
  pickUltimoFormularioActivo,
} from "@/components/agendamiento/formularios-por-tipo-ensayo";
import { FormularioPreviewModal } from "@/components/agendamiento/formulario-preview-modal";

interface EnsayoProgramacionCardProps {
  item: EnsayoAgendable;
  /** Se llama luego de guardar exitosamente este ensayo. */
  onSaved: () => void;
  /** Texto del botón principal (p.ej. "Programar", "Guardar y continuar", "Guardar y finalizar"). */
  submitLabel: string;
  /** Si se pasa, se muestra un botón "Cancelar" junto al de guardar (uso standalone, fuera de un wizard). */
  onCancel?: () => void;
  /** Valores globales del wizard (compartidos por todos los ensayos). */
  responsableDefault?: string;
  correoResponsableDefault?: string;
  periodoDefault?: DateRange | undefined;
  /**
   * En el wizard: responsable/correo/período solo vienen de los defaults globales
   * (no se editan por ensayo). En reprogramación standalone se dejan editables.
   */
  sharedScheduling?: boolean;
  /** Autoasigna el último formulario activo del tipo de ensayo, y permite cambiarlo
   * entre los formularios activos de la misma familia. */
  autoSelectFormulario?: boolean;
}

const toDateInput = (value?: Date | string): string => {
  if (!value) return "";
  const s = typeof value === "string" ? value : value.toISOString();
  return s.split("T")[0];
};

const toDateObj = (value?: Date | string): Date | undefined => {
  const s = toDateInput(value);
  return s ? new Date(`${s}T00:00:00`) : undefined;
};

/** Tarjeta de programación de UN ensayo. Reutilizada tanto standalone
 * (reprogramar desde el Gantt) como paso a paso dentro del wizard por solicitud. */
export default function EnsayoProgramacionCard({
  item,
  onSaved,
  submitLabel,
  onCancel,
  responsableDefault,
  correoResponsableDefault,
  periodoDefault,
  sharedScheduling = false,
  autoSelectFormulario = false,
}: EnsayoProgramacionCardProps) {
  const { toast } = useToast();
  const [responsable, setResponsable] = useState(item.responsable_ensayo || responsableDefault || "");
  const [correoResponsable, setCorreoResponsable] = useState(
    item.correo_responsable_ensayo || correoResponsableDefault || ""
  );
  const [rango, setRango] = useState<DateRange | undefined>({
    from: toDateObj(item.fecha_inicio) ?? periodoDefault?.from,
    to: toDateObj(item.fecha_fin) ?? periodoDefault?.to,
  });
  const [fechaExtension, setFechaExtension] = useState(toDateInput(item.fecha_extension));
  const [formularioId, setFormularioId] = useState(item.codigo_formulario ? String(item.codigo_formulario) : "");
  const [formulariosDisponibles, setFormulariosDisponibles] = useState<Formulario[]>([]);
  const [loadingFormularios, setLoadingFormularios] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [responsableTouched, setResponsableTouched] = useState(false);
  const [correoTouched, setCorreoTouched] = useState(false);
  const [rangoTouched, setRangoTouched] = useState(false);

  const yaProgramado = !!(item.fecha_inicio && item.fecha_fin && item.responsable_ensayo);

  // Heredar globals del wizard (o aplicar siempre si sharedScheduling).
  useEffect(() => {
    if (sharedScheduling) {
      if (responsableDefault) setResponsable(responsableDefault);
      return;
    }
    if (item.responsable_ensayo || responsableTouched) return;
    if (responsableDefault) setResponsable(responsableDefault);
  }, [responsableDefault, item.responsable_ensayo, responsableTouched, sharedScheduling]);

  useEffect(() => {
    if (sharedScheduling) {
      if (correoResponsableDefault !== undefined) setCorreoResponsable(correoResponsableDefault);
      return;
    }
    if (item.correo_responsable_ensayo || correoTouched) return;
    if (correoResponsableDefault !== undefined) {
      setCorreoResponsable(correoResponsableDefault);
    }
  }, [correoResponsableDefault, item.correo_responsable_ensayo, correoTouched, sharedScheduling]);

  useEffect(() => {
    if (sharedScheduling) {
      if (periodoDefault?.from || periodoDefault?.to) setRango(periodoDefault);
      return;
    }
    if (item.fecha_inicio || item.fecha_fin || rangoTouched) return;
    if (periodoDefault?.from || periodoDefault?.to) setRango(periodoDefault);
  }, [periodoDefault, item.fecha_inicio, item.fecha_fin, rangoTouched, sharedScheduling]);

  useEffect(() => {
    if (!item.codigo_tipo_ensayo) {
      setLoadingFormularios(false);
      setFormulariosDisponibles([]);
      return;
    }
    setLoadingFormularios(true);
    const codigoFamilia = item.tipo_ensayo?.codigo_familia;
    Promise.all([
      getFormulariosPorTipoEnsayo(item.codigo_tipo_ensayo),
      codigoFamilia ? getFormulariosPorFamilia(codigoFamilia) : Promise.resolve([] as Formulario[]),
    ])
      .then(async ([formsTipo, formsFamilia]) => {
        let pool = autoSelectFormulario && formsFamilia.length > 0 ? formsFamilia : formsTipo;
        if (
          item.codigo_formulario &&
          !pool.some((f) => f.codigo_formulario === item.codigo_formulario)
        ) {
          try {
            const propio = await formularioService.getById(item.codigo_formulario);
            const form = propio.data;
            if (form?.codigo_formulario) pool = [form, ...pool];
          } catch {
            /* el formulario asignado puede estar inactivo; se mantiene el id */
          }
        }
        setFormulariosDisponibles(pool);
        if (item.codigo_formulario) {
          setFormularioId(String(item.codigo_formulario));
        } else if (autoSelectFormulario) {
          const latest = pickUltimoFormularioActivo(formsTipo) ?? pickUltimoFormularioActivo(pool);
          setFormularioId(latest ? String(latest.codigo_formulario) : "");
        }
      })
      .catch((err) => toast({ title: "Error", description: err.message, variant: "destructive" }))
      .finally(() => setLoadingFormularios(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.codigo_tipo_ensayo, item.tipo_ensayo?.codigo_familia, autoSelectFormulario]);

  const formularioSeleccionado = formulariosDisponibles.find((f) => String(f.codigo_formulario) === formularioId);
  const sinFormulario = !loadingFormularios && formulariosDisponibles.length === 0;

  const fechaInicio = rango?.from ? format(rango.from, "yyyy-MM-dd") : "";
  const fechaFin = rango?.to ? format(rango.to, "yyyy-MM-dd") : "";
  const hoy = format(new Date(), "yyyy-MM-dd");
  const minExtension = fechaFin ? format(addDays(new Date(`${fechaFin}T00:00:00`), 1), "yyyy-MM-dd") : undefined;

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!responsable) errs.responsable = "Selecciona un responsable.";
    if (!correoResponsable.trim()) {
      errs.correoResponsable = "Ingresa el correo del responsable (se usa para notificarle la asignación).";
    } else if (!EMAIL_REGEX.test(correoResponsable.trim())) {
      errs.correoResponsable = "Ingresa un correo válido.";
    }
    if (!fechaInicio || !fechaFin) {
      errs.rango = sharedScheduling
        ? "Define el período del ensayo en la cabecera de la solicitud."
        : "Selecciona el rango de fechas del ensayo.";
    } else if (fechaInicio < hoy) {
      errs.rango = "La fecha de inicio no puede ser anterior a hoy.";
    }
    if (fechaExtension && fechaFin && fechaExtension <= fechaFin) {
      errs.fechaExtension = "La extensión siempre debe ser posterior a la fecha de fin del intervalo.";
    }
    if (sinFormulario) {
      errs.formulario = "No hay formulario activo para este tipo de ensayo. Configúralo en el editor de formularios.";
    } else if (formulariosDisponibles.length > 0 && !formularioId) {
      errs.formulario = "No se pudo asignar un formulario automáticamente.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      toast({ title: "Faltan datos", description: "Revisa los campos marcados.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await ensayoCategoriaEnsayoService.save({
        ...item,
        responsable_ensayo: responsable,
        correo_responsable_ensayo: correoResponsable.trim(),
        fecha_inicio: new Date(fechaInicio) as unknown as Date,
        fecha_fin: new Date(fechaFin) as unknown as Date,
        fecha_extension: fechaExtension ? (new Date(fechaExtension) as unknown as Date) : undefined,
        codigo_formulario: formularioId ? Number(formularioId) : undefined,
      });
      toast({
        title: yaProgramado ? "Ensayo reprogramado" : "Ensayo programado",
        description: `${etiquetaEnsayo(item)} · ${item.tipo_ensayo?.nombre_tipo_ensayo || ""} actualizado correctamente.`,
        variant: "success",
      });
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar el agendamiento.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {!sharedScheduling && (
        <>
          <div className="space-y-1.5">
            <Label>Responsable</Label>
            <ResponsableCombobox
              value={responsable}
              onChange={(codigo, empleado) => {
                setResponsableTouched(true);
                setResponsable(codigo);
                const correoFicha = extractEmpleadoCorreo(empleado);
                if (correoFicha) {
                  setCorreoTouched(true);
                  setCorreoResponsable(correoFicha);
                }
              }}
            />
            {errors.responsable && <p className="text-xs text-destructive">{errors.responsable}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Correo del responsable</Label>
            <Input
              type="email"
              value={correoResponsable}
              onChange={(e) => {
                setCorreoTouched(true);
                setCorreoResponsable(e.target.value);
              }}
              placeholder="responsable@chaideychaide.com"
            />
            <p className="text-[11px] text-muted-foreground">
              Se usa para notificarle la asignación del ensayo por correo.
            </p>
            {errors.correoResponsable && <p className="text-xs text-destructive">{errors.correoResponsable}</p>}
          </div>
        </>
      )}

      {sharedScheduling && (
        <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-muted-foreground space-y-1">
          <p>
            <span className="font-medium text-foreground">Responsable:</span>{" "}
            {responsable || "— (elige uno en la cabecera)"}
          </p>
          <p>
            <span className="font-medium text-foreground">Correo:</span>{" "}
            {correoResponsable || "—"}
          </p>
          <p>
            <span className="font-medium text-foreground">Período:</span>{" "}
            {fechaInicio && fechaFin ? `${fechaInicio} → ${fechaFin}` : "— (elige el rango en la cabecera)"}
          </p>
          {(errors.responsable || errors.correoResponsable || errors.rango) && (
            <p className="text-destructive">
              {errors.responsable || errors.correoResponsable || errors.rango}
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Formulario</Label>
        {loadingFormularios ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> Cargando formularios disponibles...
          </p>
        ) : sinFormulario ? (
          <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            No hay formulario activo para {item.tipo_ensayo?.nombre_tipo_ensayo || "este tipo de ensayo"}.
            El chip de este ensayo aparece en rosa hasta que configures uno.
          </div>
        ) : autoSelectFormulario ? (
          <div className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
            <FileText className="h-4 w-4 shrink-0 opacity-60" />
            <span className="min-w-0 flex-1 truncate">
              {formularioSeleccionado
                ? `${formularioSeleccionado.nombre_formulario}${formularioSeleccionado.version_formulario ? ` (v${formularioSeleccionado.version_formulario})` : ""} — asignado automáticamente`
                : "Formulario no asignado"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0"
              onClick={() => setPreviewOpen(true)}
              disabled={formulariosDisponibles.length === 0}
            >
              Cambiar
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start font-normal"
            onClick={() => setPreviewOpen(true)}
          >
            <FileText className="mr-2 h-4 w-4 shrink-0 opacity-60" />
            <span className="truncate">
              {formularioSeleccionado
                ? `${formularioSeleccionado.nombre_formulario}${formularioSeleccionado.version_formulario ? ` (v${formularioSeleccionado.version_formulario})` : ""}`
                : "Ver formularios y seleccionar..."}
            </span>
          </Button>
        )}
        {autoSelectFormulario && formulariosDisponibles.length > 1 && (
          <p className="text-[11px] text-muted-foreground">
            Se asignó el más reciente de este tipo de ensayo. Puedes cambiarlo por otro de la misma familia.
          </p>
        )}
        {errors.formulario && <p className="text-xs text-destructive">{errors.formulario}</p>}
        <FormularioPreviewModal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          formularios={formulariosDisponibles}
          selectedId={formularioId}
          onConfirm={(f) => {
            setFormularioId(String(f.codigo_formulario));
            setPreviewOpen(false);
          }}
        />
      </div>

      {!sharedScheduling && (
        <div className="space-y-1.5">
          <Label>Período del ensayo (inicio ~ fin)</Label>
          <DateRangePicker
            value={rango}
            onChange={(next) => {
              setRangoTouched(true);
              setRango(next);
            }}
            placeholder="Selecciona el rango de fechas"
            minDate={new Date()}
          />
          {errors.rango && <p className="text-xs text-destructive">{errors.rango}</p>}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Fecha de extensión (opcional)</Label>
        <Input type="date" value={fechaExtension} min={minExtension} onChange={(e) => setFechaExtension(e.target.value)} />
        <p className="text-[11px] text-muted-foreground">Siempre debe ser posterior a la fecha de fin del intervalo.</p>
        {errors.fechaExtension && <p className="text-xs text-destructive">{errors.fechaExtension}</p>}
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        )}
        <Button type="button" onClick={handleSubmit} disabled={saving || sinFormulario}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
