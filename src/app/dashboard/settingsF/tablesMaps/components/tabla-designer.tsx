"use client";

import { useState, useMemo, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
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
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, ArrowUp, ArrowDown, Save, X, Layers, Columns, AlertCircle } from 'lucide-react';
import type { EnsayoMediciones, TipoEnsayo, TipoMedicion } from '@/types/interfaces';
import { ensayoMedicionService } from '@/services/muestrasLaboratorio/ensayoMedicion.service';
import type { TablaGroup } from '../page';
import TablaPreview from './tabla-preview';

interface Props {
    tiposEnsayo: TipoEnsayo[];
    tiposMedicion: TipoMedicion[];
    mediciones: EnsayoMediciones[];
    initialGroup: TablaGroup | null;
    onSuccess: () => void;
    onCancel: () => void;
}

// Estructura local de trabajo
interface ColumnaLocal {
    _localId: string; // identificador local para react keys
    codigo_ensayo_modificaciones?: number; // si existe en BD
    nombre_campo: string;
    mediciones_minimas: string;
    estado: string;
}

interface SeccionLocal {
    _localId: string;
    codigo_tipo_medicion: number | null;
    columnas: ColumnaLocal[];
}

const genId = () => Math.random().toString(36).slice(2, 10);

export default function TablaDesigner({
    tiposEnsayo,
    tiposMedicion,
    mediciones,
    initialGroup,
    onSuccess,
    onCancel,
}: Props) {
    const { toast } = useToast();
    const isEdit = !!initialGroup;

    // Calcular siguiente numero_tabla disponible
    const computeNextNumeroTabla = (codigoTipoEnsayo: number | null): number => {
        if (!codigoTipoEnsayo) return 1;
        const used = mediciones
            .filter(m => m.codigo_tipo_ensayo === codigoTipoEnsayo)
            .map(m => m.numero_tabla ?? 0);
        return used.length === 0 ? 1 : Math.max(...used) + 1;
    };

    const [codigoTipoEnsayo, setCodigoTipoEnsayo] = useState<number | null>(
        initialGroup?.codigo_tipo_ensayo ?? null
    );
    const [numeroTabla, setNumeroTabla] = useState<number>(initialGroup?.numero_tabla ?? 1);
    const [nombreTabla, setNombreTabla] = useState<string>(initialGroup?.nombre_tabla ?? '');
    const [estado, setEstado] = useState<string>(initialGroup?.estado ?? 'A');
    const [secciones, setSecciones] = useState<SeccionLocal[]>(() => {
        if (!initialGroup) return [];
        // Agrupar columnas existentes por codigo_tipo_medicion preservando orden de identificacion_campo
        const map = new Map<number, SeccionLocal>();
        const ordered = [...initialGroup.columnas].sort(
            (a, b) => (a.identificacion_campo ?? 0) - (b.identificacion_campo ?? 0)
        );
        for (const c of ordered) {
            const key = c.codigo_tipo_medicion ?? 0;
            if (!map.has(key)) {
                map.set(key, {
                    _localId: genId(),
                    codigo_tipo_medicion: key || null,
                    columnas: [],
                });
            }
            map.get(key)!.columnas.push({
                _localId: genId(),
                codigo_ensayo_modificaciones: c.codigo_ensayo_modificaciones,
                nombre_campo: c.nombre_campo ?? '',
                mediciones_minimas: c.mediciones_minimas ?? '',
                estado: c.estado ?? 'A',
            });
        }
        return Array.from(map.values());
    });
    const [isSaving, setIsSaving] = useState(false);

    // Cuando cambia el tipo de ensayo (creando nuevo), sugerir un numero_tabla
    useEffect(() => {
        if (!isEdit && codigoTipoEnsayo) {
            setNumeroTabla(computeNextNumeroTabla(codigoTipoEnsayo));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [codigoTipoEnsayo]);

    // ---- Mutaciones de estado local ----
    const addSeccion = () => {
        setSecciones(prev => [
            ...prev,
            { _localId: genId(), codigo_tipo_medicion: null, columnas: [] },
        ]);
    };

    const removeSeccion = (localId: string) => {
        setSecciones(prev => prev.filter(s => s._localId !== localId));
    };

    const moveSeccion = (localId: string, dir: -1 | 1) => {
        setSecciones(prev => {
            const idx = prev.findIndex(s => s._localId === localId);
            if (idx < 0) return prev;
            const newIdx = idx + dir;
            if (newIdx < 0 || newIdx >= prev.length) return prev;
            const copy = [...prev];
            [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
            return copy;
        });
    };

    const updateSeccionTipoMedicion = (localId: string, value: number | null) => {
        setSecciones(prev => prev.map(s => (s._localId === localId ? { ...s, codigo_tipo_medicion: value } : s)));
    };

    const addColumna = (seccionId: string) => {
        setSecciones(prev =>
            prev.map(s =>
                s._localId === seccionId
                    ? {
                        ...s,
                        columnas: [
                            ...s.columnas,
                            {
                                _localId: genId(),
                                nombre_campo: '',
                                mediciones_minimas: '',
                                estado: 'A',
                            },
                        ],
                    }
                    : s
            )
        );
    };

    const removeColumna = (seccionId: string, colId: string) => {
        setSecciones(prev =>
            prev.map(s =>
                s._localId === seccionId
                    ? { ...s, columnas: s.columnas.filter(c => c._localId !== colId) }
                    : s
            )
        );
    };

    const moveColumna = (seccionId: string, colId: string, dir: -1 | 1) => {
        setSecciones(prev =>
            prev.map(s => {
                if (s._localId !== seccionId) return s;
                const idx = s.columnas.findIndex(c => c._localId === colId);
                if (idx < 0) return s;
                const newIdx = idx + dir;
                if (newIdx < 0 || newIdx >= s.columnas.length) return s;
                const copy = [...s.columnas];
                [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
                return { ...s, columnas: copy };
            })
        );
    };

    const updateColumna = (seccionId: string, colId: string, patch: Partial<ColumnaLocal>) => {
        setSecciones(prev =>
            prev.map(s =>
                s._localId === seccionId
                    ? {
                        ...s,
                        columnas: s.columnas.map(c => (c._localId === colId ? { ...c, ...patch } : c)),
                    }
                    : s
            )
        );
    };

    // ---- Vista previa ----
    const previewColumnas = useMemo<EnsayoMediciones[]>(() => {
        const out: EnsayoMediciones[] = [];
        let ident = 1;
        for (const s of secciones) {
            for (const c of s.columnas) {
                out.push({
                    codigo_ensayo_modificaciones: c.codigo_ensayo_modificaciones ?? 0,
                    codigo_tipo_ensayo: codigoTipoEnsayo ?? undefined,
                    codigo_tipo_medicion: s.codigo_tipo_medicion ?? undefined,
                    numero_tabla: numeroTabla,
                    nombre_tabla: nombreTabla,
                    identificacion_campo: ident++,
                    nombre_campo: c.nombre_campo,
                    mediciones_minimas: c.mediciones_minimas,
                    estado: c.estado,
                });
            }
        }
        return out;
    }, [secciones, codigoTipoEnsayo, numeroTabla, nombreTabla]);

    // ---- Validación ----
    const validate = (): string | null => {
        if (!codigoTipoEnsayo) return 'Debes seleccionar un Tipo de Ensayo.';
        if (!nombreTabla.trim()) return 'El nombre de la tabla es requerido.';
        if (!numeroTabla || numeroTabla < 1) return 'El número de tabla debe ser mayor a cero.';
        if (secciones.length === 0) return 'Debes agregar al menos una sección.';
        for (const s of secciones) {
            if (s.columnas.length === 0) return 'Cada sección debe tener al menos una columna.';
            for (const c of s.columnas) {
                if (!c.nombre_campo.trim()) return 'Todas las columnas deben tener un nombre.';
            }
        }
        // Validar duplicado de numero_tabla en mismo codigo_tipo_ensayo
        if (!isEdit) {
            const existe = mediciones.some(
                m => m.codigo_tipo_ensayo === codigoTipoEnsayo && m.numero_tabla === numeroTabla
            );
            if (existe) {
                return `Ya existe una tabla con número ${numeroTabla} para este tipo de ensayo. Usa otro número.`;
            }
        }
        return null;
    };

    const validationMsg = validate();

    // ---- Guardado ----
    const handleSave = async () => {
        const err = validate();
        if (err) {
            toast({ title: 'Validación', description: err, variant: 'destructive' });
            return;
        }

        setIsSaving(true);
        try {
            // 1. Determinar registros existentes en BD para esta tabla (solo en edición)
            const existing = isEdit
                ? mediciones.filter(
                    m => m.codigo_tipo_ensayo === initialGroup!.codigo_tipo_ensayo &&
                        m.numero_tabla === initialGroup!.numero_tabla
                )
                : [];

            // 2. Conjunto de IDs que permanecen tras edición
            const keepIds = new Set<number>();
            previewColumnas.forEach(c => {
                if (c.codigo_ensayo_modificaciones && c.codigo_ensayo_modificaciones > 0) {
                    keepIds.add(c.codigo_ensayo_modificaciones);
                }
            });

            // 3. Eliminar los registros que ya no están
            const toDelete = existing.filter(
                m => m.codigo_ensayo_modificaciones && !keepIds.has(m.codigo_ensayo_modificaciones)
            );
            for (const d of toDelete) {
                try {
                    await ensayoMedicionService.delete(d.codigo_ensayo_modificaciones);
                } catch (e) {
                    console.error('Error eliminando columna', d, e);
                }
            }

            // 4. Guardar (insert/update) cada columna actual
            for (const col of previewColumnas) {
                await ensayoMedicionService.save({
                    codigo_ensayo_modificaciones: col.codigo_ensayo_modificaciones || 0,
                    codigo_tipo_ensayo: col.codigo_tipo_ensayo,
                    codigo_tipo_medicion: col.codigo_tipo_medicion,
                    numero_tabla: col.numero_tabla,
                    nombre_tabla: col.nombre_tabla,
                    identificacion_campo: col.identificacion_campo,
                    nombre_campo: col.nombre_campo,
                    mediciones_minimas: col.mediciones_minimas,
                    estado: estado,
                });
            }

            toast({
                title: 'Éxito',
                description: `Tabla ${isEdit ? 'actualizada' : 'creada'} correctamente.`,
            });
            onSuccess();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Error inesperado al guardar.';
            toast({ title: 'Error al guardar', description: msg, variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    // ---- UI ----
    const totalColumnas = secciones.reduce((acc, s) => acc + s.columnas.length, 0);

    return (
        <div className="flex flex-col gap-4">
            {/* Encabezado / metadatos */}
            <Card>
                <CardHeader>
                    <CardTitle>{isEdit ? 'Editar Tabla' : 'Nueva Tabla de Mediciones'}</CardTitle>
                    <CardDescription>
                        Define los datos generales de la tabla y luego construye sus secciones y columnas.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                        <Label>Tipo de Ensayo *</Label>
                        <Select
                            value={codigoTipoEnsayo ? String(codigoTipoEnsayo) : undefined}
                            onValueChange={(v) => setCodigoTipoEnsayo(v ? Number(v) : null)}
                            disabled={isEdit}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar tipo de ensayo" />
                            </SelectTrigger>
                            <SelectContent>
                                {tiposEnsayo
                                    .filter(t => t.estado === 'A')
                                    .map(t => (
                                        <SelectItem key={t.codigo_tipo_ensayo} value={String(t.codigo_tipo_ensayo)}>
                                            {t.nombre_tipo_ensayo}
                                            {t.mnemonico ? ` (${t.mnemonico})` : ''}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>N° Tabla *</Label>
                        <Input
                            type="number"
                            min={1}
                            value={numeroTabla}
                            onChange={(e) => setNumeroTabla(Number(e.target.value) || 1)}
                            disabled={isEdit}
                        />
                    </div>
                    <div>
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
                    <div className="md:col-span-4">
                        <Label>Nombre de la Tabla *</Label>
                        <Input
                            placeholder="Ej: Densidad de Espuma, Deslizamiento de Hilos..."
                            value={nombreTabla}
                            onChange={(e) => setNombreTabla(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Editor de secciones */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Layers className="h-5 w-5" /> Secciones y Columnas
                        </CardTitle>
                        <CardDescription>
                            Las secciones agrupan columnas afines (ej: <em>Largo</em>, <em>Ancho</em>, <em>Espesor</em>).
                            Asocia cada sección a un Tipo de Medición.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline">{secciones.length} sección(es)</Badge>
                        <Badge variant="outline">{totalColumnas} columna(s)</Badge>
                        <Button onClick={addSeccion} size="sm">
                            <Plus className="h-4 w-4 mr-1" /> Sección
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    {secciones.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-md">
                            No hay secciones. Haz clic en <strong>Sección</strong> para empezar.
                        </div>
                    )}
                    {secciones.map((s, sIdx) => (
                        <div key={s._localId} className="border rounded-md bg-muted/20">
                            <div className="flex items-center justify-between p-3 border-b bg-muted/40">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <Badge variant="secondary" className="font-mono">#{sIdx + 1}</Badge>
                                    <div className="flex-1 max-w-md">
                                        <Select
                                            value={s.codigo_tipo_medicion ? String(s.codigo_tipo_medicion) : undefined}
                                            onValueChange={(v) =>
                                                updateSeccionTipoMedicion(s._localId, v ? Number(v) : null)
                                            }
                                        >
                                            <SelectTrigger className="bg-white">
                                                <SelectValue placeholder="Seleccionar Tipo de Medición..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {tiposMedicion
                                                    .filter(tm => tm.estado === 'A')
                                                    .map(tm => (
                                                        <SelectItem
                                                            key={tm.codigo_tipo_medicion}
                                                            value={String(tm.codigo_tipo_medicion)}
                                                        >
                                                            {tm.nombre_tipo_medicion}
                                                            {tm.seccion ? ` — ${tm.seccion}` : ''}
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => moveSeccion(s._localId, -1)}
                                        disabled={sIdx === 0}
                                        title="Mover arriba"
                                    >
                                        <ArrowUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => moveSeccion(s._localId, 1)}
                                        disabled={sIdx === secciones.length - 1}
                                        title="Mover abajo"
                                    >
                                        <ArrowDown className="h-4 w-4" />
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>¿Eliminar sección?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Se eliminarán las {s.columnas.length} columna(s) de esta sección.
                                                    Los cambios se aplicarán al guardar.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => removeSeccion(s._localId)}>
                                                    Eliminar
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>

                            {/* Columnas */}
                            <div className="p-3 space-y-2">
                                {s.columnas.length === 0 ? (
                                    <div className="text-sm text-muted-foreground italic text-center py-3">
                                        Sin columnas. Agrega al menos una.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-2">
                                        <div className="col-span-1">#</div>
                                        <div className="col-span-5">Nombre del campo</div>
                                        <div className="col-span-3">Mediciones mín.</div>
                                        <div className="col-span-3 text-right">Acciones</div>
                                    </div>
                                )}
                                {s.columnas.map((c, cIdx) => (
                                    <div key={c._localId} className="grid grid-cols-12 gap-2 items-center bg-white border rounded p-2">
                                        <div className="col-span-1 text-xs font-mono text-muted-foreground">
                                            {cIdx + 1}
                                        </div>
                                        <div className="col-span-5">
                                            <Input
                                                placeholder="Ej: Pos1, Med1, Promedio..."
                                                value={c.nombre_campo}
                                                onChange={(e) =>
                                                    updateColumna(s._localId, c._localId, { nombre_campo: e.target.value })
                                                }
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <Input
                                                placeholder="Ej: 3"
                                                value={c.mediciones_minimas}
                                                onChange={(e) =>
                                                    updateColumna(s._localId, c._localId, { mediciones_minimas: e.target.value })
                                                }
                                            />
                                        </div>
                                        <div className="col-span-3 flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => moveColumna(s._localId, c._localId, -1)}
                                                disabled={cIdx === 0}
                                                title="Mover izquierda"
                                            >
                                                <ArrowUp className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => moveColumna(s._localId, c._localId, 1)}
                                                disabled={cIdx === s.columnas.length - 1}
                                                title="Mover derecha"
                                            >
                                                <ArrowDown className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-600 hover:text-red-700"
                                                onClick={() => removeColumna(s._localId, c._localId)}
                                                title="Eliminar columna"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => addColumna(s._localId)}
                                    className="w-full"
                                >
                                    <Plus className="h-4 w-4 mr-1" /> Agregar columna
                                </Button>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* Vista previa */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Columns className="h-5 w-5" /> Vista Previa
                    </CardTitle>
                    <CardDescription>
                        Así se verá el encabezado de la tabla durante la captura del ensayo.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <TablaPreview columnas={previewColumnas} tiposMedicion={tiposMedicion} />
                </CardContent>
            </Card>

            {/* Footer acciones */}
            <Card>
                <CardFooter className="flex flex-col gap-3 pt-6">
                    {validationMsg && (
                        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 w-full">
                            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>{validationMsg}</span>
                        </div>
                    )}
                    <div className="flex gap-2 justify-end w-full">
                        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
                            <X className="h-4 w-4 mr-1" /> Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving || !!validationMsg}>
                            <Save className="h-4 w-4 mr-1" />
                            {isSaving ? 'Guardando...' : isEdit ? 'Actualizar Tabla' : 'Crear Tabla'}
                        </Button>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
