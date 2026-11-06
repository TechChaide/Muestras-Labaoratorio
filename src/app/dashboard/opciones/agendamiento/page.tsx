"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ensayoCategoriaEnsayoService } from "@/services/muestrasLaboratorio/ensayoCategoriaEnsayo.service";
import { familiaService } from "@/services/muestrasLaboratorio/familia.service";
import { tipoEnsayoService } from "@/services/muestrasLaboratorio/tipoEnsayo.service";
import type { Familia, TipoEnsayo } from "@/types/interfaces";
import { etiquetaEnsayo, isProgramado, type EnsayoAgendable } from "@/components/agendamiento/types";
import { EnsayoGanttChart } from "@/components/agendamiento/ensayo-gantt-chart";
import BacklogPanel from "./components/backlog-panel";
import FormularioAgendamiento from "./components/formulario-agendamiento";
import ProgramarSolicitudWizard from "./components/programar-solicitud-wizard";

export default function AgendamientoPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<EnsayoAgendable[]>([]);
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [tiposEnsayo, setTiposEnsayo] = useState<TipoEnsayo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedItem, setSelectedItem] = useState<EnsayoAgendable | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [wizardItems, setWizardItems] = useState<EnsayoAgendable[] | null>(null);
  const [filtroMuestra, setFiltroMuestra] = useState<string>("");

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
      const message = error instanceof Error ? error.message : "No se pudieron cargar los requerimientos de ensayo.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pendientes = items.filter((i) => !isProgramado(i));
  const programados = items.filter(isProgramado);

  // Identificadores únicos (de la solicitud/muestra) presentes en los ensayos ya
  // programados, para poblar el filtro sin depender de un catálogo aparte.
  const identificadoresDisponibles = Array.from(new Set(programados.map(etiquetaEnsayo))).sort();
  const programadosFiltrados = filtroMuestra
    ? programados.filter((i) => etiquetaEnsayo(i) === filtroMuestra)
    : programados;

  // Reprogramar/reasignar UN ensayo ya existente (click en una barra del Gantt).
  const openForm = (item: EnsayoAgendable) => {
    setSelectedItem(item);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setSelectedItem(null);
  };

  const handleSuccess = () => {
    closeForm();
    fetchData();
  };

  // Programar TODOS los tipos de ensayo pendientes de una solicitud, uno por uno (wizard).
  const openWizard = (solicitudItems: EnsayoAgendable[]) => setWizardItems(solicitudItems);

  const closeWizard = () => {
    setWizardItems(null);
    // Se recarga siempre: dentro del wizard cada ensayo se guarda al confirmarlo,
    // aunque se cierre antes de llegar al último paso.
    fetchData();
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Agendamiento de Ensayos</CardTitle>
          <CardDescription>
            Asigna responsable y fechas a los requerimientos de ensayo entrantes, y reprograma en cualquier momento.
          </CardDescription>
        </CardHeader>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando...</p>
      ) : (
        <>
          <BacklogPanel items={pendientes} onProgramarSolicitud={openWizard} />

          {programados.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Filtro de Muestra</label>
              <select
                className="flex h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={filtroMuestra}
                onChange={(e) => setFiltroMuestra(e.target.value)}
              >
                <option value="">Todas</option>
                {identificadoresDisponibles.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </div>
          )}

          <EnsayoGanttChart
            items={programadosFiltrados}
            familias={familias}
            tiposEnsayo={tiposEnsayo}
            selectedYear={selectedYear}
            onSelectedYearChange={setSelectedYear}
            editable
            onSelectItem={openForm}
          />
        </>
      )}

      <Sheet open={isFormOpen} onOpenChange={(open) => (open ? undefined : closeForm())}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-6">
          {selectedItem && (
            <FormularioAgendamiento item={selectedItem} onSuccess={handleSuccess} onCancel={closeForm} />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!wizardItems} onOpenChange={(open) => (open ? undefined : closeWizard())}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-6">
          {wizardItems && (
            <ProgramarSolicitudWizard items={wizardItems} onSuccess={closeWizard} onCancel={closeWizard} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
