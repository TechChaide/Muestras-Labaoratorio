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
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";
import type { Formulario, FormularioTabla, Tabla } from "@/types/interfaces";
import { formularioTablaService } from "@/services/muestrasLaboratorio/formularioTabla.service";
import { tablaService } from "@/services/muestrasLaboratorio/tabla.service";
import FormularioPreview, { type FormSectionPreview } from "@/app/dashboard/opciones/formularios/components/formulario-preview";
import { cn } from "@/lib/utils";

interface FormularioPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formularios: Formulario[];
  selectedId?: string;
  onConfirm: (formulario: Formulario) => void;
}

const asArray = <T,>(data: T | T[] | undefined): T[] => (Array.isArray(data) ? data : data ? [data] : []);

/** Modal estilo visor de PDF: lista de formularios a la izquierda, preview en vivo a la derecha. */
export function FormularioPreviewModal({
  open,
  onOpenChange,
  formularios,
  selectedId,
  onConfirm,
}: FormularioPreviewModalProps) {
  const [activeId, setActiveId] = useState<string | undefined>(selectedId);
  const [tablas, setTablas] = useState<Tabla[]>([]);
  const [links, setLinks] = useState<FormularioTabla[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setActiveId(selectedId || String(formularios[0]?.codigo_formulario || ""));
    setLoading(true);
    Promise.all([tablaService.getAll(), formularioTablaService.getAll()])
      .then(([tRes, lRes]) => {
        setTablas(asArray(tRes.data));
        setLinks(asArray(lRes.data));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeSections = useMemo<FormSectionPreview[]>(() => {
    const codigo = Number(activeId);
    if (!codigo) return [];
    return links
      .filter((l) => l.codigo_formulario === codigo && (l.estado || "A") !== "I")
      .sort((a, b) => (Number(a.posicion) || 0) - (Number(b.posicion) || 0))
      .map((l, i) => ({
        _localId: `f${l.codigo_formulario_tabla ?? i}`,
        codigo_tabla: l.codigo_tabla,
        cabecera: l.cabecera_formulario || "",
        posicion: Number(l.posicion) || i + 1,
      }));
  }, [links, activeId]);

  const activeFormulario = formularios.find((f) => String(f.codigo_formulario) === activeId);

  const handleConfirm = () => {
    if (activeFormulario) onConfirm(activeFormulario);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>Seleccionar formulario</DialogTitle>
          <DialogDescription>
            Elige un formulario de la lista para previsualizarlo antes de asignarlo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          <div className="w-64 shrink-0 border-r overflow-y-auto p-2">
            {formularios.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">Sin formularios disponibles.</p>
            ) : (
              formularios.map((f) => {
                const id = String(f.codigo_formulario);
                const isActive = id === activeId;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveId(id)}
                    className={cn(
                      "w-full flex items-start gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                      isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    )}
                  >
                    <FileText className="h-4 w-4 mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{f.nombre_formulario || `Formulario #${id}`}</span>
                      {f.version_formulario ? (
                        <span className={cn("block text-xs", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
                          v{f.version_formulario}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : !activeFormulario ? (
              <p className="text-sm text-muted-foreground">Selecciona un formulario para ver su vista previa.</p>
            ) : (
              <div className="bg-white rounded-lg border shadow-sm p-4">
                <FormularioPreview sections={activeSections} tablas={tablas} />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!activeFormulario}>
            Usar este formulario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
