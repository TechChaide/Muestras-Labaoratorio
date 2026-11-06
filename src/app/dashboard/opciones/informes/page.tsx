"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { informeService } from "@/services/muestrasLaboratorio/informe.service";
import type { EnsayoAgendable } from "@/components/agendamiento/types";
import type { Solicitud } from "@/types/interfaces";
import InformeEditor from "./components/informe-editor";
import PlantillaStepperDialog, { type PlantillaSeleccion } from "./components/plantilla-stepper-dialog";

interface ConfiguracionInicial {
  contenidoInicial?: string;
  nombreInicial?: string;
  ensayosPermitidos: EnsayoAgendable[];
  solicitud?: Solicitud;
}

export default function InformesPage() {
  const { toast } = useToast();
  const [stepperOpen, setStepperOpen] = useState(true);
  const [cargandoPlantilla, setCargandoPlantilla] = useState(false);
  const [config, setConfig] = useState<ConfiguracionInicial | null>(null);

  const handleCompletar = async (seleccion: PlantillaSeleccion) => {
    if (!seleccion.informeExistente) {
      setConfig({ ensayosPermitidos: seleccion.ensayos, solicitud: seleccion.solicitud });
      setStepperOpen(false);
      return;
    }
    setCargandoPlantilla(true);
    try {
      const cargado = await informeService.cargar(seleccion.informeExistente.nombre);
      setConfig({
        contenidoInicial: cargado.contenido,
        nombreInicial: cargado.nombre,
        ensayosPermitidos: seleccion.ensayos,
        solicitud: seleccion.solicitud,
      });
      setStepperOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo cargar la plantilla elegida.",
        variant: "destructive",
      });
    } finally {
      setCargandoPlantilla(false);
    }
  };

  const handleOmitir = () => {
    setConfig({ ensayosPermitidos: [] });
    setStepperOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Editor de Informes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Escribe texto libre y trae tablas con los datos ya capturados de un ensayo. La vista
            previa de la derecha se actualiza en vivo; el botón &quot;Generar PDF&quot; exporta el
            documento real.
          </p>
        </CardContent>
      </Card>

      <PlantillaStepperDialog open={stepperOpen} onCompletar={handleCompletar} onOmitir={handleOmitir} />

      {config && !cargandoPlantilla && (
        <InformeEditor
          key={config.nombreInicial ?? "blanco"}
          contenidoInicial={config.contenidoInicial}
          nombreInicial={config.nombreInicial}
          ensayosPermitidos={config.ensayosPermitidos}
          solicitud={config.solicitud}
        />
      )}
    </div>
  );
}
