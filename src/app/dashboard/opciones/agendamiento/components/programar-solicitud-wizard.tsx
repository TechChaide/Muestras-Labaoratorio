"use client";

import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Check, ChevronLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { etiquetaEnsayo, type EnsayoAgendable } from "@/components/agendamiento/types";
import { ResponsableCombobox, extractEmpleadoCorreo } from "@/components/agendamiento/responsable-combobox";
import { getFormulariosPorFamilia, getFormulariosPorTipoEnsayo } from "@/components/agendamiento/formularios-por-tipo-ensayo";
import EnsayoProgramacionCard from "./ensayo-programacion-card";

interface ProgramarSolicitudWizardProps {
  /** Todos los tipos de ensayo pendientes de UNA solicitud. */
  items: EnsayoAgendable[];
  onSuccess: () => void;
  onCancel: () => void;
}

/** Wizard: una solicitud puede traer varios tipos de ensayo.
 * Responsable, correo y período son comunes a todos; el formulario se autoasigna
 * (última versión del tipo) y se puede cambiar entre los de la familia. */
export default function ProgramarSolicitudWizard({ items, onSuccess, onCancel }: Readonly<ProgramarSolicitudWizardProps>) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [responsableSolicitud, setResponsableSolicitud] = useState("");
  const [correoResponsableSolicitud, setCorreoResponsableSolicitud] = useState("");
  const [periodoSolicitud, setPeriodoSolicitud] = useState<DateRange | undefined>();
  /** codigo_ensayo_categoria_ensayo → cantidad de formularios activos disponibles */
  const [formCountByEnsayo, setFormCountByEnsayo] = useState<Record<number, number>>({});
  const [loadingFormsMeta, setLoadingFormsMeta] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingFormsMeta(true);
    Promise.all(
      items.map(async (it) => {
        const tipo = it.codigo_tipo_ensayo;
        const familia = it.tipo_ensayo?.codigo_familia;
        if (!tipo && !familia) return [it.codigo_ensayo_categoria_ensayo, 0] as const;
        try {
          const forms = familia
            ? await getFormulariosPorFamilia(familia)
            : await getFormulariosPorTipoEnsayo(tipo!);
          return [it.codigo_ensayo_categoria_ensayo, forms.length] as const;
        } catch {
          return [it.codigo_ensayo_categoria_ensayo, 0] as const;
        }
      })
    ).then((pairs) => {
      if (cancelled) return;
      const map: Record<number, number> = {};
      for (const [id, count] of pairs) map[id] = count;
      setFormCountByEnsayo(map);
      setLoadingFormsMeta(false);
    });
    return () => { cancelled = true; };
  }, [items]);

  if (items.length === 0) return null;

  const current = items[currentIndex];
  const isLast = currentIndex === items.length - 1;

  const handleSaved = () => {
    setSavedIds((prev) => new Set(prev).add(current.codigo_ensayo_categoria_ensayo));
    if (isLast) {
      onSuccess();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <SheetHeader>
        <SheetTitle>Programar solicitud</SheetTitle>
        <SheetDescription>
          {etiquetaEnsayo(items[0])} requiere {items.length} programación{items.length === 1 ? "" : "es"} — una por
          tipo de ensayo. Responsable, correo y período se aplican a todos.
        </SheetDescription>
      </SheetHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4 border-b">
        <div className="space-y-1.5">
          <Label>Responsable de la solicitud</Label>
          <ResponsableCombobox
            value={responsableSolicitud}
            onChange={(codigo, empleado) => {
              setResponsableSolicitud(codigo);
              const correoFicha = extractEmpleadoCorreo(empleado);
              if (correoFicha) setCorreoResponsableSolicitud(correoFicha);
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Se aplica automáticamente a todos los tipos de ensayo de esta solicitud.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Correo del responsable</Label>
          <Input
            type="email"
            value={correoResponsableSolicitud}
            onChange={(e) => setCorreoResponsableSolicitud(e.target.value)}
            placeholder="responsable@chaideychaide.com"
          />
          <p className="text-[11px] text-muted-foreground">
            También se aplica a todos los ensayos (se rellena al elegir al responsable si la ficha trae correo).
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Período del ensayo (inicio ~ fin)</Label>
          <DateRangePicker
            value={periodoSolicitud}
            onChange={setPeriodoSolicitud}
            placeholder="Selecciona el rango de fechas"
            minDate={new Date()}
          />
          <p className="text-[11px] text-muted-foreground">
            El mismo período se usa en todos los tipos de ensayo de esta solicitud.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 py-4 border-b">
        {loadingFormsMeta && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 w-full mb-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Verificando formularios disponibles...
          </p>
        )}
        {items.map((it, idx) => {
          const done = savedIds.has(it.codigo_ensayo_categoria_ensayo);
          const active = idx === currentIndex;
          const formCount = formCountByEnsayo[it.codigo_ensayo_categoria_ensayo];
          const sinFormulario = !loadingFormsMeta && formCount === 0;
          return (
            <button
              key={it.codigo_ensayo_categoria_ensayo}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              title={sinFormulario ? "Sin formulario activo para esta familia" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active && !sinFormulario && "border-primary bg-primary text-primary-foreground",
                active && sinFormulario && "border-rose-600 bg-rose-600 text-white",
                !active && done && !sinFormulario && "border-green-500 bg-green-50 text-green-700",
                !active && sinFormulario && "border-rose-400 bg-rose-50 text-rose-700 hover:bg-rose-100",
                !active && !done && !sinFormulario && "border-muted-foreground/30 text-muted-foreground hover:bg-accent"
              )}
            >
              {done ? <Check className="h-3 w-3" /> : <span>{idx + 1}</span>}
              {it.tipo_ensayo?.nombre_tipo_ensayo || `Ensayo ${idx + 1}`}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <p className="text-sm font-semibold mb-4">
          Ensayo {currentIndex + 1} de {items.length}: {current.tipo_ensayo?.nombre_tipo_ensayo || "Tipo de ensayo"}
        </p>
        <EnsayoProgramacionCard
          key={current.codigo_ensayo_categoria_ensayo}
          item={current}
          onSaved={handleSaved}
          submitLabel={isLast ? "Guardar y finalizar" : "Guardar y continuar"}
          responsableDefault={responsableSolicitud}
          correoResponsableDefault={correoResponsableSolicitud}
          periodoDefault={periodoSolicitud}
          sharedScheduling
          autoSelectFormulario
        />
      </div>

      <div className="flex justify-between border-t pt-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Anterior
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
