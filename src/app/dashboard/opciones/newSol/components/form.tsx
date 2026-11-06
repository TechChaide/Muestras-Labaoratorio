"use client";

import { useState, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from '@/components/ui/card';
import { Check, FileText, ExternalLink } from 'lucide-react';
import type { Familia, Muestra, TipoEnsayo } from '@/types/interfaces';
import { ORIGENES_SOLICITUD } from '@/types/interfaces';
import { familiaService } from '@/services/muestrasLaboratorio/familia.service';
import { tipoEnsayoService } from '@/services/muestrasLaboratorio/tipoEnsayo.service';
import { solicitudService } from '@/services/muestrasLaboratorio/solicitud.service';
import { ensayoCategoriaEnsayoService } from '@/services/muestrasLaboratorio/ensayoCategoriaEnsayo.service';
import MuestraStepSelector from '@/components/muestras/muestra-step-selector';
import { TerminosCondicionesDialog } from '@/components/solicitud/terminos-condiciones-dialog';

// ── Stepper configuration ──────────────────────────────────────────────────
const STEPS = [
    { id: 1, title: 'Origen',     subtitle: 'Tipo de solicitud',           hint: 'Indica si la solicitud es interna o externa. Esto define términos y cómo se registra el material.' },
    { id: 2, title: 'Familia',    subtitle: 'Selección de familia',        hint: 'Selecciona la familia de ensayos que corresponde a tu muestra.' },
    { id: 3, title: 'Ensayos',    subtitle: 'Tipos de ensayo',             hint: 'Selecciona uno o más tipos de ensayo que se realizarán en la muestra.' },
    { id: 4, title: 'Material',   subtitle: 'Identificación de la muestra', hint: 'Identifica el material físico recibido. El nombre es obligatorio.' },
    { id: 5, title: 'Detalles',   subtitle: 'Información del ensayo',      hint: 'Completa la información descriptiva. El identificador es obligatorio.' },
    { id: 6, title: 'Confirmación', subtitle: 'Revisión y envío',          hint: 'Revisa el resumen de tu solicitud y finaliza el registro.' },
] as const;

const STEP_TITLES = [
    'Origen de la Solicitud',
    'Selección de Familia',
    'Tipos de Ensayo',
    'Identificación del Material',
    'Información del Ensayo',
    'Confirmación de Solicitud',
];

const TOTAL_STEPS = STEPS.length;

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

    // ── Step 1: Origen ──
    const [origenSolicitud, setOrigenSolicitud] = useState<string>('');

    // ── Step 2: Familia ──
    const [familias, setFamilias] = useState<Familia[]>([]);
    const [familiaLoading, setFamiliaLoading] = useState(true);
    const [selectedFamilia, setSelectedFamilia] = useState<Familia | null>(null);

    // ── Step 3: Ensayos ──
    const [ensayos, setEnsayos] = useState<TipoEnsayo[]>([]);
    const [ensayosLoading, setEnsayosLoading] = useState(false);
    const [selectedEnsayos, setSelectedEnsayos] = useState<number[]>([]);
    const [nextSequence, setNextSequence] = useState<number>(1);

    // ── Step 4: Material ──
    const [selectedMuestra, setSelectedMuestra] = useState<Muestra | null>(null);
    const [muestraError, setMuestraError] = useState<string>('');

    // ── Step 5: Detalles ──
    const [detalles, setDetalles] = useState({
        identificador_ensayo: '',
        descripcion: '',
        fecha_fab_adq: '',
        lote_serial: '',
        fecha_fabricacion: '',
        correos_objetivo: '',
    });
    const [detallesErrors, setDetallesErrors] = useState<Record<string, string>>({});

    // ── Step 6: Confirmación / Términos ──
    const [aceptaTerminos, setAceptaTerminos] = useState(false);
    const [terminosOpen, setTerminosOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    const esExterna = origenSolicitud === 'Solicitud externa';
    const esInterna = origenSolicitud === 'Solicitud Interna';
    const requiereTerminos = esExterna;

    const today = new Date();
    const monthPart = MONTHS_ES[today.getMonth()];
    const yearPart = String(today.getFullYear()).slice(-2);
    const periodPart = `${monthPart}-${yearPart}`;
    const familyMnemonic = (selectedFamilia?.mnemonico || '').trim().toUpperCase();

    // Mnem\u00f3nico: FAMILIA-MES-AA-### \u2014 el n\u00famero de muestra se reinicia cada
    // mes (ver getUltimaSolicitud en el backend, que busca el \u00faltimo usado
    // dentro del mismo prefijo familia+mes+a\u00f1o).
    const generatedIdentifier = familyMnemonic
        ? [familyMnemonic, periodPart, String(nextSequence).padStart(3, '0')].join('-')
        : '';

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
                setEnsayos(all.filter(e =>
                    e.codigo_familia === selectedFamilia.codigo_familia &&
                    (e.estado || 'A') === 'A'
                ));
            })
            .catch(err => toast({ title: 'Error', description: err.message, variant: 'destructive' }))
            .finally(() => setEnsayosLoading(false));
    }, [selectedFamilia, toast]);

    useEffect(() => {
        if (!familyMnemonic) {
            setNextSequence(1);
            return;
        }

        solicitudService.getUltimaSolicitudFamilia(familyMnemonic, monthPart, yearPart)
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [familyMnemonic, monthPart, yearPart]);

    useEffect(() => {
        setDetalles((prev) => ({ ...prev, identificador_ensayo: generatedIdentifier }));
    }, [generatedIdentifier]);

    // ── Navigation handlers ──────────────────────────────────────────────────
    const goNext = () => {
        if (currentStep === 1 && !origenSolicitud) {
            toast({ title: 'Selección requerida', description: 'Debes indicar el origen de la solicitud.', variant: 'destructive' });
            return;
        }
        if (currentStep === 2 && !selectedFamilia) {
            toast({ title: 'Selección requerida', description: 'Debes seleccionar una familia de ensayo.', variant: 'destructive' });
            return;
        }
        if (currentStep === 2 && !(selectedFamilia?.mnemonico || '').trim()) {
            toast({
                title: 'Familia incompleta',
                description: 'Esta familia no tiene mnemónico configurado; no se puede generar el identificador.',
                variant: 'destructive',
            });
            return;
        }
        if (currentStep === 3 && selectedEnsayos.length === 0) {
            toast({ title: 'Selección requerida', description: 'Debes seleccionar al menos un tipo de ensayo.', variant: 'destructive' });
            return;
        }
        if (currentStep === 4 && !selectedMuestra) {
            setMuestraError(
                esExterna
                    ? 'Debes crear y guardar la muestra de esta solicitud externa.'
                    : 'Selecciona o crea la muestra correspondiente a esta solicitud.'
            );
            toast({
                title: 'Selección requerida',
                description: esExterna
                    ? 'En solicitudes externas debes registrar una muestra nueva antes de continuar.'
                    : 'Debes identificar la muestra antes de continuar.',
                variant: 'destructive',
            });
            return;
        }
        if (currentStep === 5) {
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

    const handleSelectOrigen = (origen: string) => {
        setOrigenSolicitud(origen);
        setAceptaTerminos(false);
        setSelectedMuestra(null);
        setMuestraError('');
    };

    const handleSubmit = async () => {
        if (!selectedMuestra) {
            toast({ title: 'Falta la muestra', description: 'Debes identificar la muestra antes de guardar.', variant: 'destructive' });
            return;
        }
        if (!origenSolicitud) {
            toast({ title: 'Falta el origen', description: 'Debes indicar el origen de la solicitud.', variant: 'destructive' });
            return;
        }
        if (requiereTerminos && !aceptaTerminos) {
            toast({ title: 'Términos requeridos', description: 'Debes aceptar los términos para continuar.', variant: 'destructive' });
            return;
        }
        if (!familyMnemonic) {
            toast({
                title: 'Familia sin mnemónico',
                description: 'La familia seleccionada no tiene mnemónico; no se puede generar el identificador.',
                variant: 'destructive',
            });
            return;
        }
        setSaving(true);
        try {
            // Releer secuencia al guardar para evitar colisión si otra solicitud
            // se creó mientras el wizard estaba abierto.
            let sequence = nextSequence;
            try {
                const res = await solicitudService.getUltimaSolicitudFamilia(familyMnemonic, monthPart, yearPart);
                const payload = res?.data;
                const record = Array.isArray(payload) ? payload[0] : payload;
                const ultimoNumero = (record as { ultimo_numero_ensayo?: number })?.ultimo_numero_ensayo;
                const parsed = Number(ultimoNumero);
                sequence = Number.isFinite(parsed) && parsed > 0 ? parsed + 1 : 1;
            } catch {
                /* se usa nextSequence en memoria */
            }
            const identificador =
                [familyMnemonic, periodPart, String(sequence).padStart(3, '0')].join('-');
            setNextSequence(sequence);
            setDetalles((prev) => ({ ...prev, identificador_ensayo: identificador }));

            // Fecha local (YYYY-MM-DD → Date a medianoche local, sin desfase UTC).
            const fechaFabAdq = detalles.fecha_fab_adq
                ? (() => {
                    const [y, m, d] = detalles.fecha_fab_adq.split('-').map(Number);
                    return new Date(y, m - 1, d);
                })()
                : undefined;

            // ── Step 1: Crear la solicitud ──
            const solicitudResponse = await solicitudService.save({
                codigo_solicitud: 0,
                identificador_ensayo: identificador,
                descripcion: detalles.descripcion,
                fecha_fab_adq: fechaFabAdq,
                lote_serial: detalles.lote_serial || undefined,
                fecha_fabricacion: detalles.fecha_fabricacion || undefined,
                origen_solicitud: origenSolicitud,
                correos_objetivo: detalles.correos_objetivo,
                aceptacion_terminos: requiereTerminos ? true : false,
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
            const codigosEnsayoCategoria: number[] = [];

            for (const codigoTipoEnsayo of selectedEnsayos) {
                const ecResponse = await ensayoCategoriaEnsayoService.save({
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
                const codigoEnsayoCategoria = ecResponse?.data?.codigo_ensayo_categoria_ensayo;
                if (codigoEnsayoCategoria) codigosEnsayoCategoria.push(codigoEnsayoCategoria);
            }

            if (codigosEnsayoCategoria.length !== selectedEnsayos.length) {
                throw new Error(
                    `La solicitud se creó (#${codigoSolicitud}) pero solo se registraron ${codigosEnsayoCategoria.length} de ${selectedEnsayos.length} ensayos. Revisa la solicitud en edición.`
                );
            }

            // ── Step 4: Asignar la muestra ya identificada (seleccionada o recién creada) a los ensayos ──
            await ensayoCategoriaEnsayoService.asignarMuestra(selectedMuestra.codigo_muestra, codigosEnsayoCategoria);

            toast({ title: 'Éxito', description: 'Solicitud, ensayos y muestra registrados correctamente.' });
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
                            <span className="font-bold">•</span>{' '}
                            {currentStep === 4 && esExterna
                                ? 'Solicitud externa: debes crear una muestra nueva. No se listan muestras previas ni se consulta el maestro SAP.'
                                : currentStep === 6 && requiereTerminos
                                    ? 'Revisa el resumen y acepta los términos para finalizar.'
                                    : currentStep === 6 && esInterna
                                        ? 'Revisa el resumen y guarda la solicitud. Las solicitudes internas no requieren aceptación de términos.'
                                        : STEPS[currentStep - 1].hint}
                        </p>
                    </div>

                    <div className="mt-3 rounded-md bg-white border border-slate-200 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                            Identificador generado
                        </p>
                        <p className="text-xs font-mono text-primary break-all">
                            {familyMnemonic ? generatedIdentifier : 'Selecciona una familia'}
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

                        {/* ── STEP 1: Origen ── */}
                        {currentStep === 1 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {ORIGENES_SOLICITUD.map((origen) => (
                                    <button
                                        key={origen}
                                        type="button"
                                        onClick={() => handleSelectOrigen(origen)}
                                        className={[
                                            'text-left rounded-lg border-2 p-4 transition-all duration-200 cursor-pointer',
                                            origenSolicitud === origen
                                                ? 'border-primary bg-blue-50 shadow-sm'
                                                : 'border-gray-200 hover:border-primary/50 hover:bg-gray-50 bg-white',
                                        ].join(' ')}
                                    >
                                        <p className="font-semibold text-sm">{origen}</p>
                                        <p className="mt-1.5 text-xs text-gray-500">
                                            {origen === 'Solicitud Interna'
                                                ? 'Sin aceptación de términos. Puedes elegir un material existente o crear una nueva'
                                                : 'Requiere aceptación de términos. Debes crear un material nuevo'}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* ── STEP 2: Familia ── */}
                        {currentStep === 2 && (
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

                        {/* ── STEP 3: Ensayos ── */}
                        {currentStep === 3 && (
                            ensayosLoading ? (
                                <p className="text-muted-foreground text-sm">Cargando ensayos...</p>
                            ) : ensayos.length === 0 ? (
                                <p className="text-muted-foreground text-sm">No hay tipos de ensayo para esta familia.</p>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setSelectedEnsayos(ensayos.map(e => e.codigo_tipo_ensayo))}
                                            disabled={selectedEnsayos.length === ensayos.length}
                                        >
                                            Seleccionar todos
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setSelectedEnsayos([])}
                                            disabled={selectedEnsayos.length === 0}
                                        >
                                            Limpiar selección
                                        </Button>
                                        <span className="text-xs text-muted-foreground ml-1">
                                            {selectedEnsayos.length} de {ensayos.length} seleccionados
                                        </span>
                                    </div>
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
                                </div>
                            )
                        )}

                        {/* ── STEP 4: Material ── */}
                        {currentStep === 4 && (
                            <MuestraStepSelector
                                value={selectedMuestra}
                                onChange={(m) => { setSelectedMuestra(m); if (m) setMuestraError(''); }}
                                error={muestraError}
                                createOnly={esExterna}
                                allowMaterialSearch={!esExterna}
                            />
                        )}

                        {/* ── STEP 5: Detalles ── */}
                        {currentStep === 5 && (
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
                                        Fecha Ingreso
                                    </label>
                                    <Input
                                        type="date"
                                        value={detalles.fecha_fab_adq}
                                        onChange={e => setDetalles(p => ({ ...p, fecha_fab_adq: e.target.value }))}
                                    />
                                </div>
                                {/* Lote / Serial */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                                        Lote / Serial
                                    </label>
                                    <Input
                                        placeholder="Ej: L-2026-0912"
                                        value={detalles.lote_serial}
                                        onChange={e => setDetalles(p => ({ ...p, lote_serial: e.target.value }))}
                                    />
                                </div>
                                {/* Fecha fabricación */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                                        Fecha de fabricación
                                    </label>
                                    <Input
                                        type="date"
                                        value={detalles.fecha_fabricacion}
                                        onChange={e => setDetalles(p => ({ ...p, fecha_fabricacion: e.target.value }))}
                                    />
                                </div>
                                {/* Especificaciones extras (campo BD: descripcion) */}
                                <div className="space-y-1.5 md:col-span-2">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Especificaciones extras</label>
                                    <Textarea
                                        placeholder="En caso de necesitar comparar su muestra con un resultado histórico de otra muestra, indique con que muestra se desea realizarla comparación."
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

                        {/* ── STEP 6: Confirmación ── */}
                        {currentStep === 6 && (
                            <div className="space-y-4">
                                {/* Summary card */}
                                <div className="rounded-lg border bg-slate-50 p-4 space-y-2 text-sm">
                                    <p className="font-semibold text-xs uppercase tracking-wide text-gray-400 mb-2">Resumen de la solicitud</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                                        <p><span className="font-semibold text-gray-600">Origen:</span> {origenSolicitud}</p>
                                        <p><span className="font-semibold text-gray-600">Familia:</span> {selectedFamilia?.nombre_familia}</p>
                                        <p><span className="font-semibold text-gray-600">Material:</span> {selectedMuestra?.nombre_material_muestra}</p>
                                        <p><span className="font-semibold text-gray-600">Identificador:</span> {detalles.identificador_ensayo}</p>
                                        {detalles.fecha_fab_adq && (
                                            <p><span className="font-semibold text-gray-600">Fecha ingreso:</span> {new Date(detalles.fecha_fab_adq + 'T00:00:00').toLocaleDateString('es-EC')}</p>
                                        )}
                                        {detalles.lote_serial && (
                                            <p><span className="font-semibold text-gray-600">Lote/Serial:</span> {detalles.lote_serial}</p>
                                        )}
                                        {detalles.fecha_fabricacion && (
                                            <p><span className="font-semibold text-gray-600">Fecha fabricación:</span> {new Date(detalles.fecha_fabricacion + 'T00:00:00').toLocaleDateString('es-EC')}</p>
                                        )}
                                        {detalles.descripcion && (
                                            <p className="sm:col-span-2"><span className="font-semibold text-gray-600">Especificaciones extras:</span> {detalles.descripcion}</p>
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
                                {/* Terms checkbox — solo solicitud externa */}
                                {requiereTerminos ? (
                                    <div className="rounded-md border p-4 flex items-start gap-3 bg-white">
                                        <Checkbox
                                            id="terms"
                                            checked={aceptaTerminos}
                                            onCheckedChange={(v) => setAceptaTerminos(!!v)}
                                            className="mt-0.5"
                                        />
                                        <div className="min-w-0 space-y-2">
                                            <label htmlFor="terms" className="text-sm font-semibold cursor-pointer">
                                                Aceptación de Términos
                                            </label>
                                            <p className="text-xs text-gray-500 leading-relaxed">
                                                Confirmo que la información suministrada es correcta y acepto los términos y condiciones del proceso de ensayo de laboratorio.
                                            </p>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8 border-[#0055b8]/30 text-[#0055b8] hover:bg-sky-50"
                                                onClick={() => setTerminosOpen(true)}
                                            >
                                                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                                Leer y descargar términos
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
                                        Solicitud interna: no se requiere aceptación de términos.
                                    </div>
                                )}
                                <TerminosCondicionesDialog open={terminosOpen} onOpenChange={setTerminosOpen} />
                            </div>
                        )}
                    </div>

                    {/* ── Navigation buttons ─────────────────────────────── */}
                    <div className="flex justify-between items-center pt-6 border-t mt-6">
                        <Button type="button" variant="outline" onClick={goBack} disabled={saving}>
                            {currentStep === 1 ? 'Cancelar' : 'Anterior'}
                        </Button>
                        {currentStep < TOTAL_STEPS ? (
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