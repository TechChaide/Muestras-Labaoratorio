"use client";

import { useState, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from '@/components/ui/card';
import { Check, FileText } from 'lucide-react';
import type { Familia, TipoEnsayo } from '@/types/interfaces';
import { familiaService } from '@/services/muestrasLaboratorio/familia.service';
import { tipoEnsayoService } from '@/services/muestrasLaboratorio/tipoEnsayo.service';
import { solicitudService } from '@/services/muestrasLaboratorio/solicitud.service';
import { ensayoCategoriaEnsayoService } from '@/services/muestrasLaboratorio/ensayoCategoriaEnsayo.service';

// ── Stepper configuration ──────────────────────────────────────────────────
const STEPS = [
    { id: 1, title: 'Familia',    subtitle: 'Selección de familia',      hint: 'Selecciona la familia de ensayos que corresponde a tu muestra.' },
    { id: 2, title: 'Ensayos',    subtitle: 'Tipos de ensayo',           hint: 'Selecciona uno o más tipos de ensayo que se realizarán en la muestra.' },
    { id: 3, title: 'Detalles',   subtitle: 'Información del ensayo',    hint: 'Completa la información descriptiva. El identificador es obligatorio.' },
    { id: 4, title: 'Aceptación', subtitle: 'Términos y confirmación',   hint: 'Revisa el resumen de tu solicitud y acepta los términos para finalizar.' },
] as const;

const STEP_TITLES = [
    'Selección de Familia',
    'Tipos de Ensayo',
    'Información del Ensayo',
    'Confirmación de Solicitud',
];

// ── Props ───────────────────────────────────────────────────────────────────
interface SolicitudFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────
export default function SolicitudForm({ onSuccess, onCancel }: SolicitudFormProps) {
    const { toast } = useToast();

    const MONTHS_ES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

    // ── Navigation state ──
    const [currentStep, setCurrentStep] = useState(1);
    const [direction, setDirection] = useState<'forward' | 'backward'>('forward');

    // ── Step 1: Familia ──
    const [familias, setFamilias] = useState<Familia[]>([]);
    const [familiaLoading, setFamiliaLoading] = useState(true);
    const [selectedFamilia, setSelectedFamilia] = useState<Familia | null>(null);

    // ── Step 2: Ensayos ──
    const [ensayos, setEnsayos] = useState<TipoEnsayo[]>([]);
    const [ensayosLoading, setEnsayosLoading] = useState(false);
    const [selectedEnsayos, setSelectedEnsayos] = useState<number[]>([]);
    const [nextSequence, setNextSequence] = useState<number>(1);

    // ── Step 3: Detalles ──
    const [detalles, setDetalles] = useState({ identificador_ensayo: '', descripcion: '', fecha_fab_adq: '', correos_objetivo: '' });
    const [detallesErrors, setDetallesErrors] = useState<Record<string, string>>({});

    // ── Step 4: Términos ──
    const [aceptaTerminos, setAceptaTerminos] = useState(false);
    const [saving, setSaving] = useState(false);

    const getTipoEnsayoMnemonic = (ensayo: TipoEnsayo): string => {
        const rawMnemonic = (ensayo as any)?.mnemonico || (ensayo as any)?.mnemonico_tipo_ensayo;
        if (typeof rawMnemonic === 'string' && rawMnemonic.trim().length > 0) {
            return rawMnemonic.trim().toUpperCase();
        }

        const rawName = ensayo.nombre_tipo_ensayo || '';
        const simplified = rawName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .trim();

        if (!simplified) return `TE${ensayo.codigo_tipo_ensayo}`;

        const parts = simplified.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0].slice(0, 2)}${parts[1].slice(0, 2)}`.toUpperCase();
        }

        return parts[0].slice(0, 4).toUpperCase();
    };

    const selectedEnsayoMnemonics = ensayos
        .filter((e) => selectedEnsayos.includes(e.codigo_tipo_ensayo))
        .map(getTipoEnsayoMnemonic);

    const today = new Date();
    const periodPart = `${today.getFullYear()}-${MONTHS_ES[today.getMonth()]}`;
    const familyMnemonic = (selectedFamilia?.mnemonico || '').trim().toUpperCase();
    const testMnemonicPart = `[${selectedEnsayoMnemonics.join('~')}]`;

    const generatedIdentifier = [
        familyMnemonic,
        testMnemonicPart,
        periodPart,
        String(nextSequence),
    ].join('-');

    // Load familias on mount
    useEffect(() => {
        familiaService.getAll()
            .then(res => {
                const data = res.data || [];
                setFamilias(Array.isArray(data) ? data : [data]);
            })
            .catch(err => toast({ title: 'Error', description: err.message, variant: 'destructive' }))
            .finally(() => setFamiliaLoading(false));
    }, [toast]);

    // Load ensayos when familia changes
    useEffect(() => {
        if (!selectedFamilia) { setEnsayos([]); return; }
        setEnsayosLoading(true);
        setSelectedEnsayos([]);
        tipoEnsayoService.getAll()
            .then(res => {
                const data = res.data || [];
                const all = Array.isArray(data) ? data : [data];
                setEnsayos(all.filter(e => e.codigo_familia === selectedFamilia.codigo_familia));
            })
            .catch(err => toast({ title: 'Error', description: err.message, variant: 'destructive' }))
            .finally(() => setEnsayosLoading(false));
    }, [selectedFamilia, toast]);

    useEffect(() => {
        if (!familyMnemonic) {
            setNextSequence(1);
            return;
        }

        solicitudService.getUltimaSolicitudFamilia(familyMnemonic)
            .then((res) => {
                const payload = res?.data;
                const record = Array.isArray(payload) ? payload[0] : payload;
                const ultimoNumero = (record as any)?.ultimo_numero_ensayo;
                const parsed = Number(ultimoNumero);
                setNextSequence(Number.isFinite(parsed) && parsed > 0 ? parsed + 1 : 1);
            })
            .catch(() => {
                setNextSequence(1);
            });
    }, [familyMnemonic]);

    useEffect(() => {
        if (!familyMnemonic || !testMnemonicPart) {
            setDetalles((prev) => ({ ...prev, identificador_ensayo: '' }));
            return;
        }

        setDetalles((prev) => ({ ...prev, identificador_ensayo: generatedIdentifier }));
    }, [familyMnemonic, testMnemonicPart, generatedIdentifier]);

    // ── Navigation handlers ──────────────────────────────────────────────────
    const goNext = () => {
        if (currentStep === 1 && !selectedFamilia) {
            toast({ title: 'Selección requerida', description: 'Debes seleccionar una familia de ensayo.', variant: 'destructive' });
            return;
        }
        if (currentStep === 2 && selectedEnsayos.length === 0) {
            toast({ title: 'Selección requerida', description: 'Debes seleccionar al menos un tipo de ensayo.', variant: 'destructive' });
            return;
        }
        if (currentStep === 3) {
            const errors: Record<string, string> = {};
            if (!detalles.identificador_ensayo.trim()) errors.identificador_ensayo = 'El identificador es requerido.';
            if (Object.keys(errors).length > 0) { setDetallesErrors(errors); return; }
            setDetallesErrors({});
        }
        setDirection('forward');
        setCurrentStep(s => s + 1);
    };

    const goBack = () => {
        if (currentStep === 1) { onCancel(); return; }
        setDirection('backward');
        setCurrentStep(s => s - 1);
    };

    const handleSubmit = async () => {
        if (!aceptaTerminos) {
            toast({ title: 'Términos requeridos', description: 'Debes aceptar los términos para continuar.', variant: 'destructive' });
            return;
        }
        setSaving(true);
        try {
            // ── Step 1: Crear la solicitud ──
            const solicitudResponse = await solicitudService.save({
                codigo_solicitud: 0,
                identificador_ensayo: detalles.identificador_ensayo,
                descripcion: detalles.descripcion,
                fecha_fab_adq: detalles.fecha_fab_adq ? new Date(detalles.fecha_fab_adq) : undefined,
                correos_objetivo: detalles.correos_objetivo,
                aceptacion_terminos: true,
                estado_solicitud: 'Pendiente',
                estado: 'A',
            });

            // Recuperar el código de la solicitud creada
            const codigoSolicitud = solicitudResponse?.data?.codigo_solicitud;
            if (!codigoSolicitud) {
                throw new Error('No se pudo recuperar el código de la solicitud creada');
            }

            // ── Step 2: Obtener el código del empleado del localStorage ──
            const userDataStr = localStorage.getItem('user');
            const userData = userDataStr ? JSON.parse(userDataStr) : null;
            const codigoEmpleado = userData?.id_usuario;

            if (!codigoEmpleado) {
                throw new Error('No se pudo obtener el código del empleado de la sesión');
            }

            // ── Step 3: Crear registros de ensayo_categoria_ensayo ──
            const nowDateTime = new Date();
            
            for (const codigoTipoEnsayo of selectedEnsayos) {
                await ensayoCategoriaEnsayoService.save({
                    codigo_ensayo_categoria_ensayo: 0,
                    codigo_solicitud: codigoSolicitud,
                    codigo_muestra: undefined,
                    codigo_tipo_ensayo: codigoTipoEnsayo,
                    responsable_ensayo: undefined,
                    fecha_inicio: undefined,
                    fecha_fin: undefined,
                    fecha_extension: undefined,
                    estado: 'A',
                    fecha_creacion: nowDateTime,
                    usuario_creacion: codigoEmpleado.toString(),
                });
            }

            toast({ title: 'Éxito', description: 'Solicitud y ensayos creados correctamente.' });
            onSuccess();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error inesperado';
            toast({ title: 'Error al guardar', description: msg, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const toggleEnsayo = (id: number) =>
        setSelectedEnsayos(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <Card className="overflow-hidden shadow-sm">
            <div className="flex min-h-[540px]">

                {/* ── Left sidebar ─────────────────────────────────────── */}
                <div className="w-72 shrink-0 bg-slate-50 border-r flex flex-col p-6">
                    <div className="flex-1">
                        {STEPS.map((step, idx) => (
                            <div key={step.id} className="relative">
                                {/* connector line */}
                                {idx < STEPS.length - 1 && (
                                    <div className={`absolute left-[17px] top-10 w-0.5 h-8 transition-colors duration-500 ${currentStep > step.id ? 'bg-primary' : 'bg-gray-200'}`} />
                                )}
                                <div className="flex items-start gap-3 py-3">
                                    {/* circle indicator */}
                                    <div className={[
                                        'w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold transition-all duration-300',
                                        currentStep === step.id ? 'bg-primary text-white shadow-md ring-4 ring-blue-100' : '',
                                        currentStep > step.id  ? 'bg-primary text-white' : '',
                                        currentStep < step.id  ? 'border-2 border-gray-300 text-gray-400 bg-white' : '',
                                    ].join(' ')}>
                                        {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id}
                                    </div>
                                    {/* labels */}
                                    <div className="pt-0.5">
                                        <p className={`text-sm font-semibold leading-tight transition-colors duration-300 ${currentStep === step.id ? 'text-primary' : currentStep > step.id ? 'text-gray-700' : 'text-gray-400'}`}>
                                            {step.title}
                                        </p>
                                        <p className={`text-xs mt-0.5 transition-colors duration-300 ${currentStep >= step.id ? 'text-gray-500' : 'text-gray-300'}`}>
                                            {step.subtitle}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* hint box */}
                    <div className="mt-4 rounded-md bg-blue-50 border border-blue-100 p-3">
                        <p className="text-xs text-blue-700 leading-relaxed">
                            <span className="font-bold">•</span> {STEPS[currentStep - 1].hint}
                        </p>
                    </div>

                    <div className="mt-3 rounded-md bg-white border border-slate-200 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                            Identificador generado
                        </p>
                        <p className="text-xs font-mono text-primary break-all">
                            {familyMnemonic && testMnemonicPart ? generatedIdentifier : 'Selecciona familia y ensayos'}
                        </p>
                    </div>
                </div>

                {/* ── Right content ─────────────────────────────────────── */}
                <div className="flex-1 flex flex-col p-8">

                    {/* animated step content */}
                    <div
                        key={currentStep}
                        className={`flex-1 ${direction === 'forward' ? 'step-enter-forward' : 'step-enter-backward'}`}
                    >
                        {/* section header */}
                        <div className="flex items-center gap-2 mb-6">
                            <FileText className="h-4 w-4 text-primary shrink-0" />
                            <h2 className="text-xl font-bold">{STEP_TITLES[currentStep - 1]}</h2>
                        </div>

                        {/* ── STEP 1: Familia ── */}
                        {currentStep === 1 && (
                            familiaLoading ? (
                                <p className="text-muted-foreground text-sm">Cargando familias...</p>
                            ) : familias.length === 0 ? (
                                <p className="text-muted-foreground text-sm">No hay familias disponibles.</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {familias.map(fam => (
                                        <button
                                            key={fam.codigo_familia}
                                            type="button"
                                            onClick={() => setSelectedFamilia(fam)}
                                            className={[
                                                'text-left rounded-lg border-2 p-4 transition-all duration-200 cursor-pointer',
                                                selectedFamilia?.codigo_familia === fam.codigo_familia
                                                    ? 'border-primary bg-blue-50 shadow-sm'
                                                    : 'border-gray-200 hover:border-primary/50 hover:bg-gray-50 bg-white',
                                            ].join(' ')}
                                        >
                                            <p className="font-semibold text-sm">{fam.nombre_familia}</p>
                                            {fam.mnemonico && (
                                                <span className="inline-block mt-1 text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                                    {fam.mnemonico}
                                                </span>
                                            )}
                                            {fam.detalle && (
                                                <p className="mt-1.5 text-xs text-gray-500 line-clamp-2">{fam.detalle}</p>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )
                        )}

                        {/* ── STEP 2: Ensayos ── */}
                        {currentStep === 2 && (
                            ensayosLoading ? (
                                <p className="text-muted-foreground text-sm">Cargando ensayos...</p>
                            ) : ensayos.length === 0 ? (
                                <p className="text-muted-foreground text-sm">No hay tipos de ensayo para esta familia.</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {ensayos.map(ensayo => {
                                        const selected = selectedEnsayos.includes(ensayo.codigo_tipo_ensayo);
                                        return (
                                            <button
                                                key={ensayo.codigo_tipo_ensayo}
                                                type="button"
                                                onClick={() => toggleEnsayo(ensayo.codigo_tipo_ensayo)}
                                                className={[
                                                    'text-left rounded-lg border-2 p-4 transition-all duration-200 cursor-pointer',
                                                    selected
                                                        ? 'border-primary bg-blue-50 shadow-sm'
                                                        : 'border-gray-200 hover:border-primary/50 hover:bg-gray-50 bg-white',
                                                ].join(' ')}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${selected ? 'bg-primary border-primary' : 'border-gray-300 bg-white'}`}>
                                                        {selected && <Check className="h-3 w-3 text-white" />}
                                                    </div>
                                                    <p className="font-semibold text-sm">{ensayo.nombre_tipo_ensayo}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )
                        )}

                        {/* ── STEP 3: Detalles ── */}
                        {currentStep === 3 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Identificador */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                                        Identificador del Ensayo <span className="text-red-500">*</span>
                                    </label>
                                    <Input
                                        placeholder="Generado automáticamente"
                                        value={detalles.identificador_ensayo}
                                        readOnly
                                        className={detallesErrors.identificador_ensayo ? 'border-red-500 focus-visible:ring-red-400' : ''}
                                    />
                                    {detallesErrors.identificador_ensayo && (
                                        <p className="text-xs text-red-500">{detallesErrors.identificador_ensayo}</p>
                                    )}
                                </div>
                                {/* Fecha */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                                        Fecha de Fabricación / Adquisición
                                    </label>
                                    <Input
                                        type="date"
                                        value={detalles.fecha_fab_adq}
                                        onChange={e => setDetalles(p => ({ ...p, fecha_fab_adq: e.target.value }))}
                                    />
                                </div>
                                {/* Descripción */}
                                <div className="space-y-1.5 md:col-span-2">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Descripción</label>
                                    <Textarea
                                        placeholder="Descripción de la solicitud de ensayo..."
                                        className="resize-none"
                                        rows={3}
                                        maxLength={500}
                                        value={detalles.descripcion}
                                        onChange={e => setDetalles(p => ({ ...p, descripcion: e.target.value }))}
                                    />
                                    <p className={`text-xs text-right ${detalles.descripcion.length >= 500 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                                        {detalles.descripcion.length} / 500
                                    </p>
                                </div>
                                {/* Correos */}
                                <div className="space-y-1.5 md:col-span-2">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Correos Objetivo</label>
                                    <Input
                                        placeholder="responsable@empresa.com, jefe@empresa.com"
                                        value={detalles.correos_objetivo}
                                        onChange={e => setDetalles(p => ({ ...p, correos_objetivo: e.target.value }))}
                                    />
                                    <p className="text-xs text-gray-400">Separe múltiples correos con coma.</p>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 4: Aceptación ── */}
                        {currentStep === 4 && (
                            <div className="space-y-4">
                                {/* Summary card */}
                                <div className="rounded-lg border bg-slate-50 p-4 space-y-2 text-sm">
                                    <p className="font-semibold text-xs uppercase tracking-wide text-gray-400 mb-2">Resumen de la solicitud</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                                        <p><span className="font-semibold text-gray-600">Familia:</span> {selectedFamilia?.nombre_familia}</p>
                                        <p><span className="font-semibold text-gray-600">Identificador:</span> {detalles.identificador_ensayo}</p>
                                        {detalles.fecha_fab_adq && (
                                            <p><span className="font-semibold text-gray-600">Fecha:</span> {new Date(detalles.fecha_fab_adq + 'T00:00:00').toLocaleDateString('es-EC')}</p>
                                        )}
                                        {detalles.descripcion && (
                                            <p className="sm:col-span-2"><span className="font-semibold text-gray-600">Descripción:</span> {detalles.descripcion}</p>
                                        )}
                                        {detalles.correos_objetivo && (
                                            <p className="sm:col-span-2"><span className="font-semibold text-gray-600">Correos:</span> {detalles.correos_objetivo}</p>
                                        )}
                                    </div>
                                    {/* Tipos de ensayo seleccionados */}
                                    <div className="pt-2 border-t border-slate-200 mt-2">
                                        <p className="font-semibold text-gray-600 mb-2">
                                            Tipos de ensayo ({selectedEnsayos.length}):
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {ensayos
                                                .filter(e => selectedEnsayos.includes(e.codigo_tipo_ensayo))
                                                .map(e => (
                                                    <span
                                                        key={e.codigo_tipo_ensayo}
                                                        className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full"
                                                    >
                                                        {e.mnemonico && (
                                                            <span className="font-mono bg-blue-100 px-1 rounded text-[10px]">{e.mnemonico}</span>
                                                        )}
                                                        {e.nombre_tipo_ensayo}
                                                    </span>
                                                ))
                                            }
                                        </div>
                                    </div>
                                </div>
                                {/* Terms checkbox */}
                                <div className="rounded-md border p-4 flex items-start gap-3 bg-white">
                                    <Checkbox
                                        id="terms"
                                        checked={aceptaTerminos}
                                        onCheckedChange={(v) => setAceptaTerminos(!!v)}
                                        className="mt-0.5"
                                    />
                                    <div>
                                        <label htmlFor="terms" className="text-sm font-semibold cursor-pointer">
                                            Aceptación de Términos
                                        </label>
                                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                            Confirmo que la información suministrada es correcta y acepto los términos y condiciones del proceso de ensayo de laboratorio.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Navigation buttons ─────────────────────────────── */}
                    <div className="flex justify-between items-center pt-6 border-t mt-6">
                        <Button type="button" variant="outline" onClick={goBack} disabled={saving}>
                            {currentStep === 1 ? 'Cancelar' : 'Anterior'}
                        </Button>
                        {currentStep < 4 ? (
                            <Button type="button" onClick={goNext}>
                                Siguiente
                            </Button>
                        ) : (
                            <Button type="button" onClick={handleSubmit} disabled={saving}>
                                {saving ? 'Guardando...' : 'Guardar Solicitud'}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
}