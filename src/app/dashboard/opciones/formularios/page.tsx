"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type {
  Formulario,
  FormularioTabla,
  Tabla,
} from "@/types/interfaces";
import { formularioService } from "@/services/muestrasLaboratorio/formulario.service";
import { formularioTablaService } from "@/services/muestrasLaboratorio/formularioTabla.service";
import { tablaService } from "@/services/muestrasLaboratorio/tabla.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import FormularioList from "./components/formulario-list";
import FormularioEditor from "./components/formulario-editor";

export default function FormulariosPage() {
  const [formularios, setFormularios] = useState<Formulario[]>([]);
  const [links, setLinks] = useState<FormularioTabla[]>([]);
  const [tablas, setTablas] = useState<Tabla[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [selected, setSelected] = useState<Formulario | null>(null);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fRes, lRes, tRes] = await Promise.all([
        formularioService.getAll().catch(() => ({ data: [] as Formulario[] })),
        formularioTablaService
          .getAll()
          .catch(() => ({ data: [] as FormularioTabla[] })),
        tablaService.getAll().catch(() => ({ data: [] as Tabla[] })),
      ]);
      const fData = fRes.data || [];
      const lData = lRes.data || [];
      const tData = tRes.data || [];
      setFormularios(Array.isArray(fData) ? fData : [fData]);
      setLinks(Array.isArray(lData) ? lData : [lData]);
      setTablas(Array.isArray(tData) ? tData : [tData]);
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "No se pudo cargar los formularios.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleAddNew = () => {
    setSelected(null);
    setIsEditing(true);
  };

  const handleEdit = (f: Formulario) => {
    setSelected(f);
    setIsEditing(true);
  };

  const handleSuccess = () => {
    setIsEditing(false);
    setSelected(null);
    fetchAll();
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSelected(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Diseño de Formularios</CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            Un formulario es la unión ordenada de tablas ya diseñadas. Compón
            secciones y define aquí las fórmulas con referencias entre tablas (
            <code className="text-sm bg-muted px-1 rounded">T{"{id}"}.alias</code>
            ).
          </p>
        </CardContent>
      </Card>

      {isEditing ? (
        <FormularioEditor
          formulario={selected}
          tablas={tablas}
          existingLinks={links}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      ) : (
        <FormularioList
          formularios={formularios}
          links={links}
          isLoading={isLoading}
          onEdit={handleEdit}
          onAddNew={handleAddNew}
        />
      )}
    </div>
  );
}
