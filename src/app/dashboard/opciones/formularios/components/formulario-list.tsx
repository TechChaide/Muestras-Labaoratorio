"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit, Plus } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Formulario, FormularioTabla } from "@/types/interfaces";

interface Props {
  formularios: Formulario[];
  links: FormularioTabla[];
  isLoading: boolean;
  onEdit: (f: Formulario) => void;
  onAddNew: () => void;
}

export default function FormularioList({
  formularios,
  links,
  isLoading,
  onEdit,
  onAddNew,
}: Props) {
  const [filter, setFilter] = useState("");

  const tablasCount = (codigo?: number) =>
    links.filter(
      (l) => l.codigo_formulario === codigo && (l.estado || "A") !== "I"
    ).length;

  const filtered = useMemo(() => {
    if (!filter.trim()) return formularios;
    const f = filter.toLowerCase();
    return formularios.filter((x) =>
      (x.nombre_formulario || "").toLowerCase().includes(f)
    );
  }, [formularios, filter]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Formularios</CardTitle>
          <CardDescription>
            Un formulario agrupa tablas reutilizables (secciones) en un orden
            definido. Las fórmulas pueden referenciar celdas de otras tablas del
            mismo formulario.
          </CardDescription>
        </div>
        <Button onClick={onAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo formulario
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Input
            placeholder="Filtrar por nombre..."
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
                <TableHead>Versión</TableHead>
                <TableHead>Tablas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(4)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : filtered.length === 0
                  ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-8"
                      >
                        No hay formularios. Crea uno y asocia tablas desde el
                        editor.
                      </TableCell>
                    </TableRow>
                    )
                  : filtered.map((f) => (
                      <TableRow key={f.codigo_formulario}>
                        <TableCell>{f.codigo_formulario}</TableCell>
                        <TableCell className="font-medium">
                          {f.nombre_formulario || "—"}
                        </TableCell>
                        <TableCell>{f.version_formulario ?? "—"}</TableCell>
                        <TableCell>{tablasCount(f.codigo_formulario)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={f.estado === "A" ? "default" : "destructive"}
                            className={f.estado === "A" ? "bg-green-600" : ""}
                          >
                            {f.estado === "A" ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEdit(f)}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
