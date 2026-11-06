import type {
  EnsayoCategoriaEnsayo,
  Formulario,
  Muestra,
  Solicitud,
  TipoEnsayo,
} from "@/types/interfaces";

/** ensayo_categoria_ensayo con las relaciones que ya trae el `include` del backend. */
export type EnsayoAgendable = EnsayoCategoriaEnsayo & {
  solicitud?: Solicitud;
  muestra?: Muestra;
  tipo_ensayo?: TipoEnsayo;
  formulario?: Formulario;
};

export function isProgramado(item: EnsayoAgendable): boolean {
  return !!(item.fecha_inicio && item.fecha_fin && item.responsable_ensayo);
}

export function etiquetaEnsayo(item: EnsayoAgendable): string {
  return (
    item.solicitud?.identificador_ensayo ||
    item.muestra?.nombre_material_muestra ||
    `Solicitud #${item.codigo_solicitud ?? "?"}`
  );
}

/** Identificador de la solicitud/ensayo (ESP-OCT-26-013). */
export function identificadorEnsayo(item: EnsayoAgendable): string {
  const id = item.solicitud?.identificador_ensayo?.trim();
  return id || etiquetaEnsayo(item);
}

/** Descripción del material en `muestra` (nombre + detalle opcional). */
export function descripcionMaterialMuestra(item: EnsayoAgendable): {
  nombre: string;
  detalle: string;
} {
  return {
    nombre: (item.muestra?.nombre_material_muestra || "").trim(),
    detalle: (item.muestra?.detalle_material || "").trim(),
  };
}

