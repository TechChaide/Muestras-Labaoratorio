"use client";

import { useState, useEffect, useMemo } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from "@/components/ui/sheet";
import { Check, ClipboardList, FlaskConical, Loader2 } from 'lucide-react';
import type { EnsayoCategoriaEnsayo, Muestra, Solicitud, TipoEnsayo } from '@/types/interfaces';
import { ensayoCategoriaEnsayoService } from '@/services/muestrasLaboratorio/ensayoCategoriaEnsayo.service';
import MuestraStepSelector from '@/components/muestras/muestra-step-selector';

// Registro pendiente devuelto por /pendientes-muestra, con sus relaciones incluidas por el backend.
interface PendienteConRelaciones extends EnsayoCategoriaEnsayo {
    solicitud?: Solicitud;
    tipo_ensayo?: TipoEnsayo;
}

interface MuestraFormProps {
    onCancel: () => void;
}

export default function MuestraForm({ onCancel }: MuestraFormProps) {
    const { toast } = useToast();

    // ── Solicitud / ensayos pendientes ──
    const [pendientes, setPendientes] = useState<PendienteConRelaciones[]>([]);
    const [pendientesLoading, setPendientesLoading] = useState(true);
    const [selectedSolicitudId, setSelectedSolicitudId] = useState<number | null>(null);
    const [selectedPendienteIds, setSelectedPendienteIds] = useState<number[]>([]);

    const [selectedMuestra, setSelectedMuestra] = useState<Muestra | null>(null);
    const [muestraError, setMuestraError] = useState<string>('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        ensayoCategoriaEnsayoService.getPendientesMuestra()
            .then(res => {
                const data = res.data || [];
                setPendientes((Array.isArray(data) ? data : [data]) as PendienteConRelaciones[]);
            })
            .catch(err => toast({ title: 'Error', description: err.message, variant: 'destructive' }))
            .finally(() => setPendientesLoading(false));
    }, [toast]);

    // Agrupar pendientes por solicitud
    const solicitudesPendientes = useMemo(() => {
        const map = new Map<number, { solicitud: Solicitud; items: PendienteConRelaciones[] }>();
        for (const p of pendientes) {
            const sol = p.solicitud;
            if (!sol) continue;
            const key = sol.codigo_solicitud;
            if (!map.has(key)) map.set(key, { solicitud: sol, items: [] });
            map.get(key)!.items.push(p);
        }
        return Array.from(map.values()).sort((a, b) =>
            (a.solicitud.identificador_ensayo || '').localeCompare(b.solicitud.identificador_ensayo || '')
        );
    }, [pendientes]);

    const selectedGrupo = solicitudesPendientes.find(g => g.solicitud.codigo_solicitud === selectedSolicitudId);

    const selectSolicitud = (codigoSolicitud: number | null) => {
        setSelectedSolicitudId(codigoSolicitud);
        setSelectedPendienteIds([]);
        setErrors(e => ({ ...e, solicitud: '' }));
    };

    const togglePendiente = (id: number) => {
        setSelectedPendienteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
        setErrors(e => ({ ...e, ensayos: '' }));
    };

    return (
        <div className="flex flex-col h-full">
            <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-primary" />
                    Nueva Carga de Muestra
                </SheetTitle>
                <SheetDescription>
                    Identifica la muestra y asígnala a los ensayos pendientes de una solicitud.
                    Úsalo cuando la muestra llega después de haber creado la solicitud.
                </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto -mx-6 px-6 py-4 space-y-6">
                {/* ── Solicitud y ensayos pendientes ── */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold">Solicitud y ensayos pendientes</h3>
                    </div>

                    {pendientesLoading ? (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando solicitudes pendientes...
                        </p>
                    ) : solicitudesPendientes.length === 0 ? (
                        <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
                            No hay solicitudes con ensayos pendientes de muestra. Crea una solicitud primero en{" "}
                            <span className="font-medium">Registro de Solicitudes de Ensayo</span>.
                        </p>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Solicitud</Label>
                                <select
                                    className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ${errors.solicitud ? 'border-red-500' : 'border-input'}`}
                                    value={selectedSolicitudId ?? ''}
                                    onChange={e => selectSolicitud(e.target.value === '' ? null : Number(e.target.value))}
                                >
                                    <option value="">Selecciona una solicitud...</option>
                                    {solicitudesPendientes.map(({ solicitud, items }) => (
                                        <option key={solicitud.codigo_solicitud} value={solicitud.codigo_solicitud}>
                                            {solicitud.identificador_ensayo} — {items.length} ensayo{items.length === 1 ? '' : 's'} pendiente{items.length === 1 ? '' : 's'}
                                        </option>
                                    ))}
                                </select>
                                {errors.solicitud && <p className="text-xs text-red-500">{errors.solicitud}</p>}
                            </div>

                            {selectedGrupo && (
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">
                                        Ensayos que aplican a esta muestra
                                    </Label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {selectedGrupo.items.map(item => {
                                            const selected = selectedPendienteIds.includes(item.codigo_ensayo_categoria_ensayo);
                                            return (
                                                <button
                                                    key={item.codigo_ensayo_categoria_ensayo}
                                                    type="button"
                                                    onClick={() => togglePendiente(item.codigo_ensayo_categoria_ensayo)}
                                                    className={[
                                                        'flex items-center gap-2 text-left rounded-md border p-2.5 text-sm transition-colors',
                                                        selected
                                                            ? 'border-primary bg-blue-50'
                                                            : 'border-gray-200 hover:border-primary/50 hover:bg-gray-50 bg-white',
                                                    ].join(' ')}
                                                >
                                                    <span className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${selected ? 'bg-primary border-primary' : 'border-gray-300 bg-white'}`}>
                                                        {selected && <Check className="h-3 w-3 text-white" />}
                                                    </span>
                                                    {item.tipo_ensayo?.nombre_tipo_ensayo || `Ensayo #${item.codigo_tipo_ensayo}`}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {errors.ensayos && <p className="text-xs text-red-500">{errors.ensayos}</p>}
                                </div>
                            )}
                        </>
                    )}
                </section>

                <div className="h-px bg-border" />

                {/* ── Identificación de la muestra ── */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <FlaskConical className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold">Muestra</h3>
                    </div>

                    <MuestraStepSelector
                        value={selectedMuestra}
                        onChange={(m) => { setSelectedMuestra(m); if (m) setMuestraError(''); }}
                        error={muestraError}
                    />
                </section>
            </div>

            <SheetFooter className="pt-4 border-t">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Cancelar
                </Button>
            </SheetFooter>
        </div>
    );
}
