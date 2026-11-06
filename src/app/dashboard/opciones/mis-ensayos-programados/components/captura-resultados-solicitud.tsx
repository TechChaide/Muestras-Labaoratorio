"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Loader2, Send, XCircle } from "lucide-react";
import { EnsayoContexto } from "@/components/agendamiento/ensayo-contexto";
import { etiquetaEnsayo, type EnsayoAgendable } from "@/components/agendamiento/types";
import { ensayoCategoriaEnsayoService } from "@/services/muestrasLaboratorio/ensayoCategoriaEnsayo.service";
import { configuracionService } from "@/services/seguridades/configuracion.service";
import CapturaResultados from "./captura-resultados";

interface CapturaResultadosSolicitudProps {
  /** Todos los ensayos (Ensayo_categoria_ensayo) que pertenecen a la misma solicitud. */
  ensayos: EnsayoAgendable[];
  onBack: () => void;
  /** Modo revisión (jefe de área): ver CapturaResultados. */
  soloLectura?: boolean;
  /** Consulta de datos ya capturados (periodo vencido): grilla en solo lectura, sin aprobación ni notificación. */
  soloConsulta?: boolean;
  onDecidido?: () => void;
}

type EstadoCaptura = {
  todoCompletado: boolean;
  estadoAprobacion?: string;
};

/** Contenedor de captura por solicitud: si hay varios ensayos, se muestran en
 * pestañas. La notificación al jefe SOLO se habilita cuando TODOS los ensayos
 * de la solicitud tienen la captura al 100% (una sola notificación). */
export default function CapturaResultadosSolicitud({
  ensayos,
  onBack,
  soloLectura,
  soloConsulta,
  onDecidido,
}: Readonly<CapturaResultadosSolicitudProps>) {
  const { toast } = useToast();
  const [estados, setEstados] = useState<Record<number, EstadoCaptura>>(() => {
    const init: Record<number, EstadoCaptura> = {};
    for (const e of ensayos) {
      init[e.codigo_ensayo_categoria_ensayo] = {
        todoCompletado: false,
        estadoAprobacion: e.codigo_estado_aprobacion,
      };
    }
    return init;
  });
  const [notificando, setNotificando] = useState(false);
  const persistRegistry = useRef(new Map<number, () => Promise<void>>());

  const handleEstadoCapturaChange = useCallback(
    (estado: { codigoEnsayo: number; todoCompletado: boolean; estadoAprobacion?: string }) => {
      setEstados((prev) => ({
        ...prev,
        [estado.codigoEnsayo]: {
          todoCompletado: estado.todoCompletado,
          estadoAprobacion: estado.estadoAprobacion,
        },
      }));
    },
    []
  );

  const resumen = useMemo(() => {
    return ensayos.map((e) => {
      const st = estados[e.codigo_ensayo_categoria_ensayo];
      const yaNotificado = st?.estadoAprobacion === "PA" || st?.estadoAprobacion === "AP";
      const listo = !!st?.todoCompletado || yaNotificado;
      return {
        ensayo: e,
        listo,
        estadoAprobacion: st?.estadoAprobacion,
        yaNotificado,
      };
    });
  }, [ensayos, estados]);

  const todosListos = resumen.length > 0 && resumen.every((r) => r.listo);
  const yaNotificada =
    resumen.length > 0 &&
    resumen.every((r) => r.estadoAprobacion === "PA" || r.estadoAprobacion === "AP");
  const codigoSolicitud = ensayos[0]?.codigo_solicitud;

  const handleNotificarSolicitud = async () => {
    if (!codigoSolicitud) return;
    if (!todosListos) {
      toast({
        title: "Aún faltan ensayos",
        description: "Debes culminar la captura de todos los tipos de ensayo de la solicitud antes de notificar.",
        variant: "destructive",
      });
      return;
    }
    setNotificando(true);
    try {
      // Persistir avances de cada pestaña antes de marcar PA.
      const persistFns = Array.from(persistRegistry.current.values());
      await Promise.all(persistFns.map((fn) => fn()));

      const correoJefe = await configuracionService.getValorConfiguracion("JEFE_LABORATORIO");
      if (!correoJefe) {
        toast({
          title: "Falta configuración",
          description: "No se encontró un correo configurado para JEFE_LABORATORIO (APP_ENSAYOS_LABORATORIO).",
          variant: "destructive",
        });
        return;
      }

      await ensayoCategoriaEnsayoService.marcarSolicitudPendienteAprobacion(codigoSolicitud, correoJefe);

      setEstados((prev) => {
        const next = { ...prev };
        for (const e of ensayos) {
          const id = e.codigo_ensayo_categoria_ensayo;
          next[id] = {
            todoCompletado: true,
            estadoAprobacion: next[id]?.estadoAprobacion === "AP" ? "AP" : "PA",
          };
        }
        return next;
      });

      toast({
        title: "Notificación enviada",
        description: `Se avisó al Jefe de Laboratorio que la solicitud ${etiquetaEnsayo(ensayos[0])} culminó todos sus ensayos.`,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo enviar la notificación.",
        variant: "destructive",
      });
    } finally {
      setNotificando(false);
    }
  };

  const capturaProps = {
    onBack,
    soloLectura,
    soloConsulta,
    onDecidido,
    ocultarNotificacion: !soloLectura || !!soloConsulta,
    onEstadoCapturaChange: handleEstadoCapturaChange,
    persistRegistry,
  };

  const panelNotificacionSolicitud = !soloLectura && !soloConsulta && (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Culminación de la solicitud</CardTitle>
        <CardDescription>
          La notificación al Jefe de Laboratorio solo se habilita cuando{" "}
          <strong>todos</strong> los tipos de ensayo de esta solicitud tienen la captura al 100%.
          Se envía un único aviso para la solicitud completa.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="space-y-2">
          {resumen.map(({ ensayo, listo, estadoAprobacion, yaNotificado }) => (
            <li
              key={ensayo.codigo_ensayo_categoria_ensayo}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <span className="font-medium truncate">
                {ensayo.tipo_ensayo?.nombre_tipo_ensayo || etiquetaEnsayo(ensayo)}
              </span>
              <span className="flex items-center gap-1.5 shrink-0 text-xs">
                {estadoAprobacion === "AP" ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Aprobado</span>
                  </>
                ) : yaNotificado ? (
                  <>
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-amber-700">Notificado</span>
                  </>
                ) : listo ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Captura completa</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5 text-rose-500" />
                    <span className="text-rose-700">Pendiente de completar</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>

        {yaNotificada ? (
          <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <Clock className="h-4 w-4 shrink-0" />
            La solicitud ya fue notificada al Jefe de Laboratorio. Pendiente de revisión.
          </div>
        ) : !todosListos ? (
          <p className="text-xs text-muted-foreground">
            Completa la captura de todos los ensayos listados arriba para habilitar la notificación.
          </p>
        ) : null}

        <div>
          <Button
            type="button"
            onClick={handleNotificarSolicitud}
            disabled={notificando || !todosListos || yaNotificada}
          >
            {notificando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Notificar culminación de la solicitud
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (ensayos.length <= 1) {
    return (
      <div className="space-y-4">
        <CapturaResultados item={ensayos[0]} {...capturaProps} />
        {panelNotificacionSolicitud}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            <EnsayoContexto item={ensayos[0]} />
          </CardTitle>
          <CardDescription>
            {ensayos.length} tipo{ensayos.length === 1 ? "" : "s"} de ensayo de esta solicitud
          </CardDescription>
        </CardHeader>
      </Card>
      <Tabs defaultValue={String(ensayos[0].codigo_ensayo_categoria_ensayo)} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-slate-100 p-1">
          {ensayos.map((ensayo) => {
            const st = estados[ensayo.codigo_ensayo_categoria_ensayo];
            const listo = st?.todoCompletado || st?.estadoAprobacion === "PA" || st?.estadoAprobacion === "AP";
            return (
              <TabsTrigger
                key={ensayo.codigo_ensayo_categoria_ensayo}
                value={String(ensayo.codigo_ensayo_categoria_ensayo)}
                className="rounded-lg px-3 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                {listo && !soloLectura && (
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                )}
                {ensayo.tipo_ensayo?.nombre_tipo_ensayo || etiquetaEnsayo(ensayo)}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {ensayos.map((ensayo) => (
          <TabsContent
            key={ensayo.codigo_ensayo_categoria_ensayo}
            value={String(ensayo.codigo_ensayo_categoria_ensayo)}
            className="mt-0"
          >
            <CapturaResultados item={ensayo} {...capturaProps} contextoEnPadre />
          </TabsContent>
        ))}
      </Tabs>
      {panelNotificacionSolicitud}
    </div>
  );
}
