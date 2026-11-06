"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit, Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { Familia, Tabla, TipoEnsayo } from "@/types/interfaces";
import {
  tablaService,
  type TablaDependencias,
} from "@/services/muestrasLaboratorio/tabla.service";

interface Props {
  tablas: Tabla[];
  tiposEnsayo: TipoEnsayo[];
  familias: Familia[];
  isLoading: boolean;
  onEdit: (tabla: Tabla) => void;
  onAddNew: () => void;
  /** Refresca la lista tras eliminar una tabla. */
  onChanged: () => void;
}

interface TipoGroup {
  key: string;
  codigoFamilia: number;
  nombre: string;
  tablas: Tabla[];
}

interface FamiliaGroup {
  key: string;
  nombre: string;
  tipos: TipoGroup[];
  totalTablas: number;
}

export default function TablaList({
  tablas, tiposEnsayo, familias, isLoading, onEdit, onAddNew, onChanged,
}: Props) {
  const { toast } = useToast();
  const [filter, setFilter] = useState("");
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [blockDialog, setBlockDialog] = useState<{ tabla: Tabla; dependencias: TablaDependencias } | null>(
    null
  );
  const [confirmDialog, setConfirmDialog] = useState<{
    tabla: Tabla;
    dependencias: TablaDependencias;
  } | null>(null);

  const handleDeleteClick = async (tabla: Tabla) => {
    setCheckingId(tabla.codigo_tabla);
    try {
      const dependencias = await tablaService.getDependencias(tabla.codigo_tabla);
      if (dependencias.en_uso) {
        setBlockDialog({ tabla, dependencias });
      } else {
        setConfirmDialog({ tabla, dependencias });
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "No se pudo verificar el uso de la tabla.",
        variant: "destructive",
      });
    } finally {
      setCheckingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDialog) return;
    const { tabla } = confirmDialog;
    setDeletingId(tabla.codigo_tabla);
    try {
      await tablaService.delete(tabla.codigo_tabla);
      toast({
        title: "Tabla eliminada",
        description: `"${tabla.nombre_tabla || `#${tabla.codigo_tabla}`}" y sus columnas, celdas, fórmulas y dependencias fueron desactivadas.`,
      });
      setConfirmDialog(null);
      onChanged();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo eliminar la tabla.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const tipoEnsayoById = useMemo(
    () => new Map(tiposEnsayo.map((t) => [t.codigo_tipo_ensayo, t])),
    [tiposEnsayo]
  );

  const nombreTipo = (codigo?: number) =>
    tipoEnsayoById.get(codigo || 0)?.nombre_tipo_ensayo || (codigo ? `#${codigo}` : "-");

  const nombreFamilia = (codigo?: number) =>
    familias.find((f) => f.codigo_familia === codigo)?.nombre_familia ||
    (codigo ? `#${codigo}` : "-");

  const filtered = useMemo(() => {
    if (!filter.trim()) return tablas;
    const f = filter.toLowerCase();
    return tablas.filter((t) => {
      const tipoEnsayo = tipoEnsayoById.get(t.codigo_tipo_ensayo || 0);
      return (
        (t.nombre_tabla || "").toLowerCase().includes(f) ||
        (t.tipo_tabla || "").toLowerCase().includes(f) ||
        nombreTipo(t.codigo_tipo_ensayo).toLowerCase().includes(f) ||
        nombreFamilia(tipoEnsayo?.codigo_familia).toLowerCase().includes(f)
      );
    });
  }, [tablas, filter, tipoEnsayoById, familias]);

  // Nivel 1: agrupar por tipo de ensayo. Nivel 2: agrupar esos grupos por familia.
  const familiaGroups = useMemo<FamiliaGroup[]>(() => {
    const byTipo = new Map<number, Tabla[]>();
    for (const t of filtered) {
      const key = t.codigo_tipo_ensayo ?? 0;
      const list = byTipo.get(key) || [];
      list.push(t);
      byTipo.set(key, list);
    }

    const tipoGroups: TipoGroup[] = Array.from(byTipo.entries()).map(
      ([codigoTipo, tablasGrupo]) => ({
        key: `tipo-${codigoTipo}`,
        codigoFamilia: codigoTipo ? tipoEnsayoById.get(codigoTipo)?.codigo_familia ?? 0 : 0,
        nombre: codigoTipo ? nombreTipo(codigoTipo) : "Sin tipo de ensayo",
        tablas: tablasGrupo.sort((a, b) =>
          (a.nombre_tabla || "").localeCompare(b.nombre_tabla || "")
        ),
      })
    );

    const byFamilia = new Map<number, TipoGroup[]>();
    for (const g of tipoGroups) {
      const list = byFamilia.get(g.codigoFamilia) || [];
      list.push(g);
      byFamilia.set(g.codigoFamilia, list);
    }

    return Array.from(byFamilia.entries())
      .map(([codigoFamilia, tipos]) => ({
        key: `fam-${codigoFamilia}`,
        nombre: codigoFamilia ? nombreFamilia(codigoFamilia) : "Sin familia",
        tipos: tipos.sort((a, b) => a.nombre.localeCompare(b.nombre)),
        totalTablas: tipos.reduce((sum, g) => sum + g.tablas.length, 0),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [filtered, tipoEnsayoById, familias]);

  const [openFamilias, setOpenFamilias] = useState<string[]>([]);
  const [openTipos, setOpenTipos] = useState<string[]>([]);

  // Al buscar, expandir automáticamente familias y tipos con resultados.
  useEffect(() => {
    if (filter.trim()) {
      setOpenFamilias(familiaGroups.map((g) => g.key));
      setOpenTipos(familiaGroups.flatMap((g) => g.tipos.map((t) => t.key)));
    }
  }, [filter]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Tablas definidas</CardTitle>
          <CardDescription>
            Nueva versión solo al agregar o eliminar columnas/celdas si algún formulario usa la
            tabla; otros cambios actualizan la misma versión.
          </CardDescription>
        </div>
        <Button onClick={onAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva tabla
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Input
            placeholder="Filtrar por nombre, tipo de tabla, ensayo o familia..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-sm"
          />
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : familiaGroups.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-muted-foreground border rounded-md">
            No hay tablas. Crea la primera para definir la grilla.
          </div>
        ) : (
          <Accordion
            type="multiple"
            value={openFamilias}
            onValueChange={setOpenFamilias}
            className="border rounded-md"
          >
            {familiaGroups.map((fg) => (
              <AccordionItem key={fg.key} value={fg.key} className="border-b last:border-b-0 px-4">
                <AccordionTrigger>
                  <span className="font-semibold">{fg.nombre}</span>{" "}
                  <span className="font-normal text-muted-foreground ml-2">
                    ({fg.totalTablas})
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <Accordion
                    type="multiple"
                    value={openTipos}
                    onValueChange={setOpenTipos}
                    className="border rounded-md ml-2"
                  >
                    {fg.tipos.map((g) => (
                      <AccordionItem key={g.key} value={g.key} className="border-b last:border-b-0 px-4">
                        <AccordionTrigger>
                          <span className="font-medium">{g.nombre}</span>{" "}
                          <span className="font-normal text-muted-foreground ml-2">
                            ({g.tablas.length})
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="border rounded-md overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Código</TableHead>
                                  <TableHead>Nombre</TableHead>
                                  <TableHead>Tipo tabla</TableHead>
                                  <TableHead>Filas</TableHead>
                                  <TableHead>Cols</TableHead>
                                  <TableHead>Versión</TableHead>
                                  <TableHead>Estado</TableHead>
                                  <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {g.tablas.map((t) => (
                                  <TableRow key={t.codigo_tabla}>
                                    <TableCell>{t.codigo_tabla}</TableCell>
                                    <TableCell className="font-medium">{t.nombre_tabla}</TableCell>
                                    <TableCell>{t.tipo_tabla || "—"}</TableCell>
                                    <TableCell>{t.filas_muestra}</TableCell>
                                    <TableCell>{t.numero_columnas ?? "—"}</TableCell>
                                    <TableCell>v{t.version || "1"}</TableCell>
                                    <TableCell>
                                      <Badge
                                        variant={t.estado === "A" ? "default" : "destructive"}
                                        className={t.estado === "A" ? "bg-green-600" : ""}
                                      >
                                        {t.estado === "A" ? "Activo" : "Inactivo"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right space-x-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onEdit(t)}
                                        disabled={t.estado === "I"}
                                        title={
                                          t.estado === "I"
                                            ? "Solo se pueden editar tablas activas"
                                            : "Actualiza en el sitio salvo alta/baja de columnas o celdas cuando ya hay formularios (nueva versión)"
                                        }
                                      >
                                        <Edit className="mr-2 h-4 w-4" />
                                        Editar
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => handleDeleteClick(t)}
                                        disabled={t.estado === "I" || checkingId === t.codigo_tabla}
                                        title={
                                          t.estado === "I"
                                            ? "Esta tabla ya está inactiva"
                                            : "Verifica si algún formulario la usa antes de eliminarla"
                                        }
                                      >
                                        {checkingId === t.codigo_tabla ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="mr-2 h-4 w-4" />
                                        )}
                                        Eliminar
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>

      {/* Bloqueo: la tabla está en uso por al menos un formulario activo. */}
      <AlertDialog open={!!blockDialog} onOpenChange={(open) => !open && setBlockDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No se puede eliminar esta tabla</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-foreground">
                <p>
                  <strong>{blockDialog?.tabla.nombre_tabla || `#${blockDialog?.tabla.codigo_tabla}`}</strong>{" "}
                  está en uso por {blockDialog?.dependencias.formularios.length} formulario(s) activo(s).
                  Desvincúlala de esos formularios (o espera a que se archiven) antes de eliminarla.
                </p>
                {!!blockDialog?.dependencias.formularios.length && (
                  <div>
                    <p className="font-medium mb-1">Formularios:</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {blockDialog.dependencias.formularios.map((f) => (
                        <li key={f.codigo_formulario}>
                          {f.nombre_formulario || `Formulario #${f.codigo_formulario}`}
                          {f.cabecera_formulario ? ` — ${f.cabecera_formulario}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!!blockDialog?.dependencias.ensayos.length && (
                  <div>
                    <p className="font-medium mb-1">
                      Ensayos afectados ({blockDialog.dependencias.ensayos.length}):
                    </p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {blockDialog.dependencias.ensayos.map((e) => (
                        <li key={e.codigo_ensayo_categoria_ensayo}>
                          {e.nombre_tipo_ensayo || `Tipo de ensayo #${e.codigo_tipo_ensayo}`} — ensayo #
                          {e.codigo_ensayo_categoria_ensayo}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlockDialog(null)}>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación: ningún formulario activo la usa, se puede eliminar en cascada. */}
      <AlertDialog open={!!confirmDialog} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta tabla?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-foreground">
                <p>
                  Se desactivará{" "}
                  <strong>
                    {confirmDialog?.tabla.nombre_tabla || `#${confirmDialog?.tabla.codigo_tabla}`}
                  </strong>{" "}
                  junto con sus columnas, celdas, fórmulas y dependencias. Ningún formulario activo la
                  usa actualmente.
                </p>
                {!!confirmDialog && confirmDialog.dependencias.total_resultados_capturados > 0 && (
                  <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                    Esta tabla tiene {confirmDialog.dependencias.total_resultados_capturados}{" "}
                    resultado(s) capturado(s) históricamente. Quedarán asociados a una tabla inactiva.
                  </p>
                )}
                <p className="text-muted-foreground">Esta acción se puede revertir solo desde la base de datos.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId != null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deletingId != null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId != null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
