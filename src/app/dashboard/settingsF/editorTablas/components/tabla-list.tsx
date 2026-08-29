"use client";

import { useMemo, useState } from "react";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tabla, TipoEnsayo } from "@/types/interfaces";

interface Props {
  tablas: Tabla[];
  tiposEnsayo: TipoEnsayo[];
  isLoading: boolean;
  onEdit: (tabla: Tabla) => void;
  onAddNew: () => void;
}

export default function TablaList({ tablas, tiposEnsayo, isLoading, onEdit, onAddNew }: Props) {
  const [filter, setFilter] = useState("");

  const nombreTipo = (codigo?: number) =>
    tiposEnsayo.find((t) => t.codigo_tipo_ensayo === codigo)?.nombre_tipo_ensayo ||
    (codigo ? `#${codigo}` : "-");

  const filtered = useMemo(() => {
    if (!filter.trim()) return tablas;
    const f = filter.toLowerCase();
    return tablas.filter(
      (t) =>
        (t.nombre_tabla || "").toLowerCase().includes(f) ||
        nombreTipo(t.codigo_tipo_ensayo).toLowerCase().includes(f)
    );
  }, [tablas, filter, tiposEnsayo]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Tablas definidas</CardTitle>
          <CardDescription>Selecciona una tabla para editar su estructura interna.</CardDescription>
        </div>
        <Button onClick={onAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva tabla
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Input
            placeholder="Filtrar por nombre o tipo de ensayo..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo ensayo</TableHead>
                <TableHead>Filas</TableHead>
                <TableHead>Cols</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(4)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : filtered.map((t) => (
                    <TableRow key={t.codigo_tabla}>
                      <TableCell>{t.codigo_tabla}</TableCell>
                      <TableCell className="font-medium">{t.nombre_tabla}</TableCell>
                      <TableCell>{nombreTipo(t.codigo_tipo_ensayo)}</TableCell>
                      <TableCell>{t.filas_muestra}</TableCell>
                      <TableCell>{t.numero_columnas ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={t.estado === "A" ? "default" : "destructive"}
                          className={t.estado === "A" ? "bg-green-600" : ""}
                        >
                          {t.estado === "A" ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => onEdit(t)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Editar estructura
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No hay tablas. Crea la primera para definir la grilla.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
