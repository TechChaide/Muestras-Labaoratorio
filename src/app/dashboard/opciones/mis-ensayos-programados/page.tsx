"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ensayoCategoriaEnsayoService } from "@/services/muestrasLaboratorio/ensayoCategoriaEnsayo.service";
import { familiaService } from "@/services/muestrasLaboratorio/familia.service";
import { tipoEnsayoService } from "@/services/muestrasLaboratorio/tipoEnsayo.service";
import type { Familia, TipoEnsayo } from "@/types/interfaces";
import { isProgramado, type EnsayoAgendable } from "@/components/agendamiento/types";
import { EnsayoGanttChart } from "@/components/agendamiento/ensayo-gantt-chart";
import DetalleEnsayo from "./components/detalle-ensayo";
import CapturaResultadosSolicitud from "./components/captura-resultados-solicitud";

const getCurrentCodigoEmpleado = (): string | null => {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("user") : null;
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user?.codigo_empleado ? String(user.codigo_empleado) : null;
  } catch {
    return null;
  }
};

export default function MisEnsayosProgramadosPage() {
  const { toast } = useToast();
  const now = new Date();
  const [items, setItems] = useState<EnsayoAgendable[]>([]);
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [tiposEnsayo, setTiposEnsayo] = useState<TipoEnsayo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedItem, setSelectedItem] = useState<EnsayoAgendable | null>(null);
  const [capturando, setCapturando] = useState<EnsayoAgendable | null>(null);
  const [soloConsulta, setSoloConsulta] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [itemsRes, familiasRes, tiposRes] = await Promise.all([
        ensayoCategoriaEnsayoService.getAll(),
        familiaService.getAll(),
        tipoEnsayoService.getAll(),
      ]);
      const itemsData = itemsRes.data || [];
      setItems((Array.isArray(itemsData) ? itemsData : [itemsData]) as EnsayoAgendable[]);
      setFamilias(familiasRes.data || []);
      setTiposEnsayo(tiposRes.data || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar tus ensayos programados.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const codigoEmpleado = getCurrentCodigoEmpleado();
  const misProgramados = items.filter(
    (i) => isProgramado(i) && codigoEmpleado != null && String(i.responsable_ensayo).trim() === codigoEmpleado.trim()
  );

  if (capturando) {
    const ensayosDeLaSolicitud = items.filter((i) => i.codigo_solicitud === capturando.codigo_solicitud);
    return (
      <CapturaResultadosSolicitud
        ensayos={ensayosDeLaSolicitud.length > 0 ? ensayosDeLaSolicitud : [capturando]}
        soloConsulta={soloConsulta}
        onBack={() => {
          setCapturando(null);
          setSoloConsulta(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Mis Ensayos Programados</CardTitle>
          <CardDescription>Visualiza los ensayos que tienes agendados como responsable.</CardDescription>
        </CardHeader>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando...</p>
      ) : !codigoEmpleado ? (
        <Card className="border-destructive/40">
          <CardContent className="py-6 text-sm text-destructive">
            No se pudo identificar tu código de empleado. Vuelve a iniciar sesión.
          </CardContent>
        </Card>
      ) : (
        <>
          <EnsayoGanttChart
            items={misProgramados}
            familias={familias}
            tiposEnsayo={tiposEnsayo}
            selectedYear={selectedYear}
            onSelectedYearChange={setSelectedYear}
            selectedMonth={selectedMonth}
            onSelectedMonthChange={setSelectedMonth}
            compactoPorSolicitud
            editable={false}
            onSelectItem={setSelectedItem}
            title="Diagrama de Gantt — Mis Ensayos"
            description="Ensayos del mes en curso. Una barra por identificador."
          />
          {selectedItem && (
            <DetalleEnsayo
              item={selectedItem}
              ensayosSolicitud={items.filter((i) => i.codigo_solicitud === selectedItem.codigo_solicitud)}
              onProceder={(item, modo) => {
                setSoloConsulta(modo === "consulta");
                setCapturando(item);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
