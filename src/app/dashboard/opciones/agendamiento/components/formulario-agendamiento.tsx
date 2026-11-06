"use client";

import {
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { etiquetaEnsayo, type EnsayoAgendable } from "@/components/agendamiento/types";
import EnsayoProgramacionCard from "./ensayo-programacion-card";

interface FormularioAgendamientoProps {
  item: EnsayoAgendable;
  onSuccess: () => void;
  onCancel: () => void;
}

/** Reprogramar/asignar UN solo ensayo ya existente (uso: click en una barra del Gantt). */
export default function FormularioAgendamiento({ item, onSuccess, onCancel }: FormularioAgendamientoProps) {
  const yaProgramado = !!(item.fecha_inicio && item.fecha_fin && item.responsable_ensayo);

  return (
    <div className="flex flex-col h-full">
      <SheetHeader>
        <SheetTitle>{yaProgramado ? "Reprogramar ensayo" : "Programar ensayo"}</SheetTitle>
        <SheetDescription>
          {etiquetaEnsayo(item)} · {item.tipo_ensayo?.nombre_tipo_ensayo || "Tipo de ensayo"}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 py-6 overflow-y-auto">
        <EnsayoProgramacionCard
          item={item}
          onSaved={onSuccess}
          onCancel={onCancel}
          submitLabel={yaProgramado ? "Guardar cambios" : "Programar"}
        />
      </div>
    </div>
  );
}
