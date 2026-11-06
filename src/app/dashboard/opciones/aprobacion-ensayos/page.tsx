"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, FlaskConical } from "lucide-react";
import { ensayoCategoriaEnsayoService } from "@/services/muestrasLaboratorio/ensayoCategoriaEnsayo.service";
import { EnsayoContexto } from "@/components/agendamiento/ensayo-contexto";
import { type EnsayoAgendable } from "@/components/agendamiento/types";
import { useUsersInfo } from "@/hooks/use-users-info";
import CapturaResultadosSolicitud from "../mis-ensayos-programados/components/captura-resultados-solicitud";

const asArray = <T,>(data: T | T[] | undefined): T[] => (Array.isArray(data) ? data : data ? [data] : []);

/** Vista del jefe de área: lista los ensayos que ya culminaron su fase de
 * captura de datos (codigo_estado_aprobacion = 'PA') agrupados por solicitud,
 * y permite revisar los resultados capturados para aprobarlos o rechazarlos. */
export default function AprobacionEnsayosPage() {
  const { toast } = useToast();
  const { usersInfo } = useUsersInfo();
  const [items, setItems] = useState<EnsayoAgendable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revisando, setRevisando] = useState<EnsayoAgendable[] | null>(null);

  const nombreEmpleado = (codigo?: string) => {
    if (!codigo) return "Sin asignar";
    const u = usersInfo.find((e) => String(e.CODIGO).trim() === String(codigo).trim());
    return u?.NOMBRE || codigo;
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await ensayoCategoriaEnsayoService.getPendientesAprobacion();
      setItems(asArray(res.data) as EnsayoAgendable[]);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudieron cargar los ensayos pendientes de aprobación.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Agrupa por solicitud para revisar juntos todos los tipos de ensayo de un
  // mismo requerimiento (misma UX que la toma de datos del técnico).
  const grupos = useMemo(() => {
    const map = new Map<number, EnsayoAgendable[]>();
    for (const it of items) {
      const key = it.codigo_solicitud ?? -1;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries()).map(([codigoSolicitud, ensayos]) => ({ codigoSolicitud, ensayos }));
  }, [items]);

  const volverAlListado = () => {
    setRevisando(null);
    fetchData();
  };

  if (revisando) {
    return (
      <CapturaResultadosSolicitud
        ensayos={revisando}
        onBack={volverAlListado}
        soloLectura
        onDecidido={fetchData}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Aprobación de Resultados</CardTitle>
          <CardDescription>
            Revisa los ensayos que ya culminaron su fase de captura de datos y registra tu aprobación o rechazo.
          </CardDescription>
        </CardHeader>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando...</p>
      ) : grupos.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <ClipboardCheck className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">No hay ensayos pendientes de aprobación</p>
            <p className="text-sm text-muted-foreground">
              Aquí aparecerán en cuanto un técnico notifique la culminación de su fase de captura de datos.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {grupos.map(({ codigoSolicitud, ensayos }) => (
            <Card key={codigoSolicitud}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-primary shrink-0" />
                  <EnsayoContexto item={ensayos[0]} className="flex-1" />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  {ensayos.map((e) => (
                    <div key={e.codigo_ensayo_categoria_ensayo} className="flex items-center justify-between gap-2">
                      <Badge variant="secondary" className="shrink-0">
                        {e.tipo_ensayo?.nombre_tipo_ensayo || "Tipo de ensayo"}
                      </Badge>
                      <span className="truncate text-xs text-muted-foreground">
                        {nombreEmpleado(e.responsable_ensayo)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {ensayos.length} ensayo{ensayos.length === 1 ? "" : "s"} pendiente{ensayos.length === 1 ? "" : "s"} de revisión
                </p>
                <Button type="button" size="sm" onClick={() => setRevisando(ensayos)}>
                  Revisar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
