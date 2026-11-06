"use client";

import { cn } from "@/lib/utils";
import {
  descripcionMaterialMuestra,
  identificadorEnsayo,
  type EnsayoAgendable,
} from "./types";

interface EnsayoContextoProps {
  item: EnsayoAgendable;
  className?: string;
}

/** Identificador y descripción del material en una sola línea. */
export function EnsayoContexto({ item, className }: Readonly<EnsayoContextoProps>) {
  const identificador = identificadorEnsayo(item);
  const { nombre, detalle } = descripcionMaterialMuestra(item);
  const material = nombre || "Sin muestra asignada";
  const linea = detalle ? `${identificador} · ${material} — ${detalle}` : `${identificador} · ${material}`;

  return (
    <p className={cn("min-w-0 truncate", className)} title={linea}>
      <span className="font-semibold">{identificador}</span>
      <span className="mx-2 font-normal text-slate-300">·</span>
      <span className="font-medium text-slate-700">{material}</span>
      {detalle ? <span className="font-normal text-slate-500"> — {detalle}</span> : null}
    </p>
  );
}
