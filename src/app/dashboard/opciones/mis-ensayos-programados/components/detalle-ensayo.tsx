"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardEdit, Eye, Loader2 } from "lucide-react";
import { EnsayoContexto } from "@/components/agendamiento/ensayo-contexto";
import { type EnsayoAgendable } from "@/components/agendamiento/types";
import { EnsayoTimeline } from "@/components/agendamiento/ensayo-timeline";
import { resultadoService } from "@/services/muestrasLaboratorio/resultado.service";
import type { Resultado } from "@/types/interfaces";

interface DetalleEnsayoProps {
  item: EnsayoAgendable;
  /** Todos los ensayos de la misma solicitud (para vencimiento y datos a nivel identificador). */
  ensayosSolicitud?: EnsayoAgendable[];
  onProceder: (item: EnsayoAgendable, modo?: "captura" | "consulta") => void;
}

const formatDate = (value?: Date | string): string => {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("es-EC");
};

const toDate = (value?: Date | string): Date | null => {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

const limiteDe = (item: EnsayoAgendable): Date | null => toDate(item.fecha_extension || item.fecha_fin);

const diasRestantesGrupo = (ensayos: EnsayoAgendable[]): number | null => {
  const limites = ensayos.map(limiteDe).filter((d): d is Date => !!d);
  if (!limites.length) return null;
  const fin = new Date(Math.max(...limites.map((d) => d.getTime())));
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
};

const resultadoTieneDato = (r: Resultado): boolean => {
  if ((r.estado || "A") !== "A") return false;
  if (r.valor != null && Number.isFinite(Number(r.valor))) return true;
  return !!(r.resultados && String(r.resultados).trim());
};

export default function DetalleEnsayo({
  item,
  ensayosSolicitud,
  onProceder,
}: Readonly<DetalleEnsayoProps>) {
  const ensayos = ensayosSolicitud?.length ? ensayosSolicitud : [item];
  const dias = diasRestantesGrupo(ensayos);
  const vencido = dias !== null && dias < 0;
  const tieneRango = !!(item.fecha_inicio && item.fecha_fin);
  const tieneFormulario = ensayos.some((e) => e.codigo_formulario);

  const [hayDatos, setHayDatos] = useState(false);
  const [cargandoDatos, setCargandoDatos] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const ids = ensayos
      .map((e) => e.codigo_ensayo_categoria_ensayo)
      .filter((id): id is number => Number.isFinite(id) && id > 0);
    setCargandoDatos(true);
    resultadoService
      .getByEnsayos(ids)
      .then((res) => {
        if (cancelado) return;
        const lista = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
        setHayDatos(lista.some(resultadoTieneDato));
      })
      .catch(() => {
        if (!cancelado) setHayDatos(false);
      })
      .finally(() => {
        if (!cancelado) setCargandoDatos(false);
      });
    return () => {
      cancelado = true;
    };
  }, [item.codigo_ensayo_categoria_ensayo, item.codigo_solicitud]);

  const bloquearPorVencidoSinDatos = vencido && !hayDatos;
  const verDatos = vencido && hayDatos;
  const deshabilitado = !tieneFormulario || cargandoDatos || bloquearPorVencidoSinDatos;
  const tituloBoton = !tieneFormulario
    ? "Este ensayo aún no tiene un formulario asignado; asígnalo desde Agendamiento."
    : bloquearPorVencidoSinDatos
      ? "El periodo venció y no hay datos capturados."
      : undefined;

  return (
    <Card className="border-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="min-w-0 flex-1 text-lg">
          <EnsayoContexto item={item} />
        </CardTitle>
        {dias !== null && (
          <Badge variant={vencido ? "destructive" : "secondary"}>
            {vencido ? "Vencido" : dias === 0 ? "Vence hoy" : `${dias} día${dias === 1 ? "" : "s"}`}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className={tieneRango ? "grid grid-cols-1 md:grid-cols-2 gap-8" : undefined}>
          {tieneRango && (
            <div>
              <EnsayoTimeline
                fechaInicio={item.fecha_inicio!}
                fechaFin={item.fecha_fin!}
                fechaExtension={item.fecha_extension}
              />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Tipo de ensayo</p>
              <p className="text-sm font-medium">{item.tipo_ensayo?.nombre_tipo_ensayo || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Fecha de inicio</p>
              <p className="text-sm font-medium">{formatDate(item.fecha_inicio)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Fecha de fin</p>
              <p className="text-sm font-medium">{formatDate(item.fecha_fin)}</p>
            </div>
            {item.fecha_extension && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Extensión</p>
                <p className="text-sm font-medium">{formatDate(item.fecha_extension)}</p>
              </div>
            )}
          </div>
        </div>
        {bloquearPorVencidoSinDatos && !cargandoDatos && (
          <p className="mt-4 text-sm text-destructive">
            El periodo de este ensayo ya venció y no hay datos capturados. No se puede continuar.
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          type="button"
          onClick={() => onProceder(item, verDatos ? "consulta" : "captura")}
          disabled={deshabilitado}
          title={tituloBoton}
        >
          {cargandoDatos ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : verDatos ? (
            <Eye className="mr-2 h-4 w-4" />
          ) : (
            <ClipboardEdit className="mr-2 h-4 w-4" />
          )}
          {verDatos ? "Ver datos" : "Proceder"}
        </Button>
      </CardFooter>
    </Card>
  );
}
