"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { Familia, Tabla, TipoEnsayo } from "@/types/interfaces";
import { tablaService } from "@/services/muestrasLaboratorio/tabla.service";
import { tipoEnsayoService } from "@/services/muestrasLaboratorio/tipoEnsayo.service";
import { familiaService } from "@/services/muestrasLaboratorio/familia.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TablaList from "./components/tabla-list";
import TablaEditor from "./components/tabla-editor";

export default function EditorTablasPage() {
  const [tablas, setTablas] = useState<Tabla[]>([]);
  const [tiposEnsayo, setTiposEnsayo] = useState<TipoEnsayo[]>([]);
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [selected, setSelected] = useState<Tabla | null>(null);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tRes, teRes, fRes] = await Promise.all([
        tablaService.getAll().catch(() => ({ data: [] as Tabla[] })),
        tipoEnsayoService.getAll().catch(() => ({ data: [] as TipoEnsayo[] })),
        familiaService.getAll().catch(() => ({ data: [] as Familia[] })),
      ]);
      const tData = tRes.data || [];
      const teData = teRes.data || [];
      const fData = fRes.data || [];
      setTablas(Array.isArray(tData) ? tData : [tData]);
      setTiposEnsayo(Array.isArray(teData) ? teData : [teData]);
      setFamilias(Array.isArray(fData) ? fData : [fData]);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo cargar las tablas.",
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

  const handleEdit = (tabla: Tabla) => {
    setSelected(tabla);
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
          <CardTitle>Editor de Tablas</CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            Diseña tablas reutilizables en grilla tipo Excel (fusiones, tipos de celda y fórmulas con
            vista LaTeX). Luego podrás asociarlas a formularios.
          </p>
        </CardContent>
      </Card>

      {isEditing ? (
        <TablaEditor
          tabla={selected}
          tiposEnsayo={tiposEnsayo}
          familias={familias}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      ) : (
        <TablaList
          tablas={tablas}
          tiposEnsayo={tiposEnsayo}
          isLoading={isLoading}
          onEdit={handleEdit}
          onAddNew={handleAddNew}
        />
      )}
    </div>
  );
}
