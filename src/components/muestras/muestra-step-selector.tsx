"use client";

import { useEffect, useMemo, useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from "@/components/ui/sheet";
import { FlaskConical, Loader2, Pencil, PlusCircle, Search } from 'lucide-react';
import type { Familia, Muestra } from '@/types/interfaces';
import { familiaService } from '@/services/muestrasLaboratorio/familia.service';
import { muestraService } from '@/services/muestrasLaboratorio/muestra.service';
import MaterialFields, { emptyMaterialFields, type MaterialFieldsValue } from '@/components/muestras/material-fields';

interface Props {
    value: Muestra | null;
    onChange: (muestra: Muestra | null) => void;
    error?: string;
    /**
     * Solicitud externa: obliga a crear una muestra nueva (sin listar existentes).
     * Solicitud interna / carga de muestras: permite elegir del catálogo.
     */
    createOnly?: boolean;
    /** Si false, oculta la búsqueda en vivo del maestro SAP. */
    allowMaterialSearch?: boolean;
    /** Muestra el botón para desasignar la muestra (sin borrar el catálogo). */
    allowClear?: boolean;
    onClear?: () => void;
}

/**
 * Identificación de la muestra: si ya hay muestras registradas, ofrece elegir una
 * en un modal; si no hay ninguna (o el usuario lo pide), abre el panel lateral
 * para crear una nueva ("poblador" del catálogo de materiales ensayables).
 *
 * En modo `createOnly` (solicitud externa) el formulario de alta se muestra
 * en línea y no se consultan muestras previas ni el maestro SAP.
 */
export default function MuestraStepSelector({
    value,
    onChange,
    error,
    createOnly = false,
    allowMaterialSearch = true,
    allowClear = false,
    onClear,
}: Props) {
    const { toast } = useToast();

    const [muestras, setMuestras] = useState<Muestra[]>([]);
    const [muestrasLoading, setMuestrasLoading] = useState(!createOnly);
    const [familias, setFamilias] = useState<Familia[]>([]);
    const [familiasLoading, setFamiliasLoading] = useState(true);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const [sheetOpen, setSheetOpen] = useState(false);
    const [draft, setDraft] = useState<MaterialFieldsValue>(emptyMaterialFields);
    const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const loadMuestras = () => {
        if (createOnly) {
            setMuestras([]);
            setMuestrasLoading(false);
            return;
        }
        setMuestrasLoading(true);
        muestraService.getAll()
            .then(res => {
                const data = res.data || [];
                setMuestras(Array.isArray(data) ? data : [data]);
            })
            .catch(err => toast({ title: 'Error', description: err.message, variant: 'destructive' }))
            .finally(() => setMuestrasLoading(false));
    };

    useEffect(() => {
        loadMuestras();
        familiaService.getAll()
            .then(res => {
                const data = res.data || [];
                setFamilias(Array.isArray(data) ? data : [data]);
            })
            .catch(err => toast({ title: 'Error', description: err.message, variant: 'destructive' }))
            .finally(() => setFamiliasLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createOnly]);

    useEffect(() => {
        if (createOnly && !value) {
            setDraft(emptyMaterialFields);
            setDraftErrors({});
        }
    }, [createOnly, value]);

    const muestrasFiltradas = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return muestras;
        return muestras.filter((m) => {
            const nombre = (m.nombre_material_muestra || '').toLowerCase();
            const material = (m.material || '').toLowerCase();
            const detalle = (m.detalle_material || '').toLowerCase();
            return nombre.includes(q) || material.includes(q) || detalle.includes(q);
        });
    }, [muestras, busqueda]);

    const abrirDialogo = (open: boolean) => {
        setDialogOpen(open);
        if (!open) setBusqueda('');
    };

    const openSelectorOrCreate = () => {
        if (muestras.length > 0) {
            setBusqueda('');
            setDialogOpen(true);
        } else {
            openCreatePanel();
        }
    };

    const openCreatePanel = () => {
        setDialogOpen(false);
        setDraft(emptyMaterialFields);
        setDraftErrors({});
        setSheetOpen(true);
    };

    const setDraftField = <K extends keyof MaterialFieldsValue>(key: K, val: MaterialFieldsValue[K]) => {
        setDraft(p => ({ ...p, [key]: val }));
        if (key === 'nombre_material_muestra') setDraftErrors(e => ({ ...e, nombre_material_muestra: '' }));
    };

    const handleCreate = async () => {
        if (!draft.nombre_material_muestra.trim()) {
            setDraftErrors({ nombre_material_muestra: 'El nombre del material es requerido.' });
            return;
        }
        setSaving(true);
        try {
            const userDataStr = localStorage.getItem('user');
            const userData = userDataStr ? JSON.parse(userDataStr) : null;
            const codigoEmpleado = userData?.id_usuario;
            if (!codigoEmpleado) {
                throw new Error('No se pudo obtener el código del empleado de la sesión');
            }

            const response = await muestraService.save({
                codigo_muestra: 0,
                codigo_familia_material: draft.codigo_familia_material === '' ? undefined : Number(draft.codigo_familia_material),
                nombre_material_muestra: draft.nombre_material_muestra,
                area_material: draft.area_material || undefined,
                detalle_material: draft.detalle_material || undefined,
                material: draft.material || undefined,
                fecha_carga: draft.fecha_carga ? new Date(draft.fecha_carga) : new Date(),
                estado: 'A',
                fecha_creacion: new Date(),
                usuario_creacion: codigoEmpleado.toString(),
            });

            const nueva = response?.data;
            if (!nueva?.codigo_muestra) {
                throw new Error('No se pudo recuperar el código de la muestra creada');
            }

            toast({ title: 'Éxito', description: 'Muestra registrada correctamente.' });
            if (!createOnly) setMuestras(prev => [nueva, ...prev]);
            onChange(nueva);
            setSheetOpen(false);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error inesperado';
            toast({ title: 'Error al guardar', description: msg, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const catalogPickers = !createOnly ? (
        <>
            <Dialog open={dialogOpen} onOpenChange={abrirDialogo}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Selecciona una muestra</DialogTitle>
                        <DialogDescription>
                            Elige una muestra ya registrada, o crea una nueva si ninguna corresponde.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            autoFocus
                            placeholder="Buscar por nombre de la muestra..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {busqueda.trim()
                            ? `${muestrasFiltradas.length} de ${muestras.length} muestras`
                            : `${muestras.length} muestras`}
                    </p>
                    <div className="max-h-80 overflow-y-auto space-y-2">
                        {muestrasFiltradas.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
                                <p className="text-sm font-medium">Sin resultados</p>
                                <p className="text-xs text-muted-foreground">
                                    No hay muestras que coincidan con “{busqueda.trim()}”.
                                </p>
                            </div>
                        ) : muestrasFiltradas.map(m => (
                            <button
                                key={m.codigo_muestra}
                                type="button"
                                onClick={() => { onChange(m); abrirDialogo(false); }}
                                className="w-full text-left rounded-md border p-3 text-sm hover:border-primary/50 hover:bg-gray-50 transition-colors"
                            >
                                <p className="font-medium">{m.nombre_material_muestra}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {m.material && <span className="font-mono">{m.material}</span>}
                                    {m.fecha_carga ? ` · ${new Date(m.fecha_carga).toLocaleString('es-EC')}` : ''}
                                </p>
                            </button>
                        ))}
                    </div>
                    <Button type="button" variant="outline" onClick={openCreatePanel} className="w-full">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Crear nueva muestra
                    </Button>
                </DialogContent>
            </Dialog>

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-6">
                    <div className="flex flex-col h-full">
                        <SheetHeader>
                            <SheetTitle className="flex items-center gap-2">
                                <FlaskConical className="h-5 w-5 text-primary" />
                                Nueva Muestra
                            </SheetTitle>
                            <SheetDescription>
                                Registra el material físico recibido en el catálogo de muestras.
                            </SheetDescription>
                        </SheetHeader>
                        <div className="flex-1 overflow-y-auto -mx-6 px-6 py-4">
                            <MaterialFields
                                value={draft}
                                onChange={setDraftField}
                                errors={draftErrors}
                                familias={familias}
                                familiasLoading={familiasLoading}
                                allowMaterialSearch={allowMaterialSearch}
                            />
                        </div>
                        <SheetFooter className="pt-4 border-t">
                            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>
                                Cancelar
                            </Button>
                            <Button type="button" onClick={handleCreate} disabled={saving}>
                                {saving ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...
                                    </>
                                ) : (
                                    'Guardar Muestra'
                                )}
                            </Button>
                        </SheetFooter>
                    </div>
                </SheetContent>
            </Sheet>
        </>
    ) : null;

    if (value) {
        return (
            <>
                <div className={`rounded-lg border p-4 space-y-2 ${error ? 'border-red-500' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="font-semibold text-sm">{value.nombre_material_muestra}</p>
                            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                {value.material && <p>Material: <span className="font-mono">{value.material}</span></p>}
                                {value.detalle_material && <p>{value.detalle_material}</p>}
                                {value.fecha_carga && (
                                    <p>Fecha ingreso de la muestra: {new Date(value.fecha_carga).toLocaleString('es-EC')}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    if (createOnly) {
                                        onChange(null);
                                        return;
                                    }
                                    setBusqueda('');
                                    setDialogOpen(true);
                                }}
                            >
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                {createOnly ? 'Crear otra' : 'Cambiar'}
                            </Button>
                            {allowClear && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={onClear}
                                >
                                    Quitar
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
                {catalogPickers}
            </>
        );
    }

    // Solicitud externa: formulario de alta obligatorio en línea.
    if (createOnly) {
        return (
            <div className={`rounded-lg border p-4 space-y-4 ${error ? 'border-red-500' : ''}`}>
                <div className="flex items-start gap-2">
                    <FlaskConical className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold">Registrar material de la solicitud</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            En solicitudes externas debes crear una muestra nueva. No se listan muestras previas ni se consulta el maestro SAP.
                        </p>
                    </div>
                </div>
                <MaterialFields
                    value={draft}
                    onChange={setDraftField}
                    errors={draftErrors}
                    familias={familias}
                    familiasLoading={familiasLoading}
                    allowMaterialSearch={allowMaterialSearch}
                />
                <div className="flex justify-end">
                    <Button type="button" onClick={handleCreate} disabled={saving}>
                        {saving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...
                            </>
                        ) : (
                            'Guardar muestra'
                        )}
                    </Button>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
        );
    }

    return (
        <>
            <div className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center ${error ? 'border-red-500' : ''}`}>
                <FlaskConical className="h-8 w-8 text-muted-foreground" />
                {muestrasLoading ? (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Revisando muestras registradas...
                    </p>
                ) : (
                    <>
                        <p className="text-sm text-muted-foreground max-w-sm">
                            {muestras.length > 0
                                ? 'Elige la muestra que corresponde a esta solicitud, o registra una nueva.'
                                : 'Todavía no hay muestras registradas. Registra la que corresponde a esta solicitud.'}
                        </p>
                        <Button type="button" onClick={openSelectorOrCreate}>
                            {muestras.length > 0 ? 'Seleccionar muestra' : (
                                <>
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Crear muestra
                                </>
                            )}
                        </Button>
                    </>
                )}
            </div>
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            {catalogPickers}
        </>
    );
}
