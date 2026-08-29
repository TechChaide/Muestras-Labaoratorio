"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Formulario,
  FormularioTabla,
  Tabla,
} from "@/types/interfaces";
import { formularioService } from "@/services/muestrasLaboratorio/formulario.service";
import { formularioTablaService } from "@/services/muestrasLaboratorio/formularioTabla.service";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown,
  ArrowUp,
  Info,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import FormularioPreview from "./formulario-preview";

interface SectionLocal {
  _localId: string;
  codigo_formulario_tabla?: number;
  codigo_tabla?: number;
  cabecera: string;
  posicion: number;
  estado: string;
}

interface Props {
  formulario: Formulario | null;
  tablas: Tabla[];
  existingLinks: FormularioTabla[];
  onSuccess: () => void;
  onCancel: () => void;
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function FormularioEditor({
  formulario,
  tablas,
  existingLinks,
  onSuccess,
  onCancel,
}: Props) {
  const isEdit = !!formulario?.codigo_formulario;
  const { toast } = useToast();

  const [nombre, setNombre] = useState(formulario?.nombre_formulario || "");
  const [version, setVersion] = useState(
    formulario?.version_formulario != null
      ? String(formulario.version_formulario)
      : "1"
  );
  const [estado, setEstado] = useState(formulario?.estado || "A");
  const [sections, setSections] = useState<SectionLocal[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const baselineLinkIds = useRef<number[]>([]);

  useEffect(() => {
    if (!formulario?.codigo_formulario) {
      setSections([]);
      baselineLinkIds.current = [];
      return;
    }
    const mine = existingLinks
      .filter((l) => l.codigo_formulario === formulario.codigo_formulario)
      .sort((a, b) => {
        const pa = Number(a.posicion) || 0;
        const pb = Number(b.posicion) || 0;
        return pa - pb;
      });
    baselineLinkIds.current = mine
      .map((l) => l.codigo_formulario_tabla)
      .filter((id): id is number => id != null);
    setSections(
      mine.map((l, i) => ({
        _localId: uid(),
        codigo_formulario_tabla: l.codigo_formulario_tabla,
        codigo_tabla: l.codigo_tabla,
        cabecera: l.cabecera_formulario || "",
        posicion: Number(l.posicion) || i + 1,
        estado: l.estado || "A",
      }))
    );
  }, [formulario, existingLinks]);

  const tablasActivas = useMemo(
    () => tablas.filter((t) => (t.estado || "A") !== "I"),
    [tablas]
  );

  const tablasUsadas = useMemo(
    () => new Set(sections.map((s) => s.codigo_tabla).filter(Boolean) as number[]),
    [sections]
  );

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        _localId: uid(),
        cabecera: "",
        posicion: prev.length + 1,
        estado: "A",
      },
    ]);
  };

  const updateSection = (localId: string, patch: Partial<SectionLocal>) => {
    setSections((prev) =>
      prev.map((s) => (s._localId === localId ? { ...s, ...patch } : s))
    );
  };

  const removeSection = (localId: string) => {
    setSections((prev) => {
      const next = prev.filter((s) => s._localId !== localId);
      return next.map((s, i) => ({ ...s, posicion: i + 1 }));
    });
  };

  const moveSection = (localId: string, dir: -1 | 1) => {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s._localId === localId);
      if (idx < 0) return prev;
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      const tmp = copy[idx];
      copy[idx] = copy[j];
      copy[j] = tmp;
      return copy.map((s, i) => ({ ...s, posicion: i + 1 }));
    });
  };

  const handleSave = useCallback(async () => {
    if (!nombre.trim()) {
      toast({
        title: "Nombre requerido",
        description: "Indica un nombre para el formulario.",
        variant: "destructive",
      });
      return;
    }
    const sinTabla = sections.some((s) => !s.codigo_tabla);
    if (sinTabla) {
      toast({
        title: "Tablas incompletas",
        description: "Cada sección debe tener una tabla seleccionada.",
        variant: "destructive",
      });
      return;
    }
    const dupes = sections
      .map((s) => s.codigo_tabla)
      .filter((c, i, arr) => c != null && arr.indexOf(c) !== i);
    if (dupes.length) {
      toast({
        title: "Tabla duplicada",
        description:
          "La misma tabla no puede aparecer dos veces en un formulario.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const versionNum = Number(version) || 1;
      const fSaved = await formularioService.save({
        codigo_formulario: formulario?.codigo_formulario || 0,
        nombre_formulario: nombre.trim(),
        version_formulario: versionNum,
        estado,
      });
      const codigoFormulario =
        (fSaved.data as Formulario)?.codigo_formulario ||
        formulario?.codigo_formulario;
      if (!codigoFormulario) {
        throw new Error("No se obtuvo codigo_formulario del backend.");
      }

      const keepIds = new Set(
        sections
          .map((s) => s.codigo_formulario_tabla)
          .filter((id): id is number => !!id)
      );
      for (const oldId of baselineLinkIds.current) {
        if (!keepIds.has(oldId)) {
          await formularioTablaService.delete(oldId);
        }
      }

      for (const sec of sections) {
        await formularioTablaService.save({
          codigo_formulario_tabla: sec.codigo_formulario_tabla || 0,
          codigo_formulario: codigoFormulario,
          codigo_tabla: sec.codigo_tabla,
          cabecera_formulario: sec.cabecera.trim() || undefined,
          posicion: String(sec.posicion),
          estado: sec.estado || "A",
        });
      }

      toast({
        title: "Guardado",
        description: isEdit
          ? `Formulario "${nombre.trim()}" actualizado.`
          : `Formulario "${nombre.trim()}" creado con ${sections.length} tabla(s).`,
      });
      onSuccess();
    } catch (error) {
      toast({
        title: "Error al guardar",
        description:
          error instanceof Error ? error.message : "No se pudo guardar.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    nombre,
    version,
    estado,
    sections,
    formulario,
    isEdit,
    onSuccess,
    toast,
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>
              {isEdit ? "Editar formulario" : "Nuevo formulario"}
            </CardTitle>
            <CardDescription>
              Une tablas en secciones ordenadas. En fórmulas cross-table usa
              refs cualificadas{" "}
              <code className="text-xs bg-muted px-1 rounded">T12.A1</code>{" "}
              (prefijo = código de tabla).
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={onCancel} disabled={isSaving}>
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="nombre-form">Nombre</Label>
            <Input
              id="nombre-form"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Espumas — deformación remanente"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="version-form">Versión</Label>
            <Input
              id="version-form"
              type="number"
              min={1}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">Activo</SelectItem>
                <SelectItem value="I">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Secciones (tablas)</CardTitle>
              <CardDescription>
                Orden = posición en el formulario. Cada tabla aporta su grilla y
                fórmulas.
              </CardDescription>
            </div>
            <Button size="sm" variant="secondary" onClick={addSection}>
              <Plus className="mr-1 h-4 w-4" />
              Agregar tabla
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {sections.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">
                Sin secciones. Agrega al menos una tabla.
              </p>
            )}
            {sections.map((sec, idx) => {
              const disponibles = tablasActivas.filter(
                (t) =>
                  t.codigo_tabla === sec.codigo_tabla ||
                  !tablasUsadas.has(t.codigo_tabla)
              );
              return (
                <div
                  key={sec._localId}
                  className="border rounded-md p-3 space-y-3 bg-card"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      Posición {idx + 1}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => moveSection(sec._localId, -1)}
                        disabled={idx === 0}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => moveSection(sec._localId, 1)}
                        disabled={idx === sections.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeSection(sec._localId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Tabla</Label>
                    <Select
                      value={
                        sec.codigo_tabla != null
                          ? String(sec.codigo_tabla)
                          : undefined
                      }
                      onValueChange={(v) =>
                        updateSection(sec._localId, {
                          codigo_tabla: Number(v),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tabla…" />
                      </SelectTrigger>
                      <SelectContent>
                        {disponibles.map((t) => (
                          <SelectItem
                            key={t.codigo_tabla}
                            value={String(t.codigo_tabla)}
                          >
                            #{t.codigo_tabla} — {t.nombre_tabla || "Sin nombre"}
                            {t.codigo_tabla
                              ? ` (T${t.codigo_tabla}.*)`
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Cabecera de sección</Label>
                    <Input
                      value={sec.cabecera}
                      onChange={(e) =>
                        updateSection(sec._localId, {
                          cabecera: e.target.value,
                        })
                      }
                      placeholder="Opcional — título visible encima de la tabla"
                    />
                  </div>
                </div>
              );
            })}

            <div className="flex gap-2 rounded-md border border-violet-200 bg-violet-50/60 p-3 text-xs text-violet-950">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">Referencias entre tablas</p>
                <p>
                  El modelo V2 permite que una fórmula dependa de{" "}
                  <code className="bg-white/70 px-1 rounded">codigo_celda</code>{" "}
                  de otra tabla (vía{" "}
                  <code className="bg-white/70 px-1 rounded">dependencias</code>
                  ). En la expresión usa el alias cualificado, p. ej.{" "}
                  <code className="bg-white/70 px-1 rounded">
                    (T3.ei - T3.ef) / (T3.ei * T5.k) * 100
                  </code>
                  .
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vista previa</CardTitle>
            <CardDescription>
              Orden de secciones como se verá al capturar el ensayo. Hover en
              celdas muestra el alias cualificado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioPreview sections={sections} tablas={tablas} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
