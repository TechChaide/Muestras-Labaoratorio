"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  CornerDownLeft,
  Eraser,
  FileDown,
  FilePlus,
  FileText,
  FolderOpen,
  Hash,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Minus,
  PanelBottom,
  PanelTop,
  PenLine,
  Radical,
  RotateCw,
  Save,
  Send,
  Sigma,
  Square,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  Tag,
  Underline,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseInforme, type ParagraphAlign } from "@/lib/informe/parser";
import { descargarInformePdf } from "@/lib/informe/pdf";
import { informeService, type InformeListado } from "@/services/muestrasLaboratorio/informe.service";
import { familiaService } from "@/services/muestrasLaboratorio/familia.service";
import { tipoEnsayoService } from "@/services/muestrasLaboratorio/tipoEnsayo.service";
import type { Familia, Solicitud, TipoEnsayo } from "@/types/interfaces";
import { codigoUnicoMuestraDesdeEnsayos, nombreArchivoInformePdf } from "@/lib/informe/nombre-archivo";
import type { EnsayoAgendable } from "@/components/agendamiento/types";
import InformePdfPreview from "./informe-pdf-preview";
import InsertarTablaDialog from "./insertar-tabla-dialog";
import InsertarImagenDialog, { type ImagenKind } from "./insertar-imagen-dialog";
import InsertarFormulaDialog from "./insertar-formula-dialog";
import ClasificarInformeDialog from "./clasificar-informe-dialog";
import InsertarFirmaDialog from "./insertar-firma-dialog";
import EnviarInformeDialog from "./enviar-informe-dialog";

const PLANTILLA_INICIAL = `# Título del informe

Escribe acá el texto del informe. Los párrafos se separan con una línea en blanco.

## Resultados

Usa el botón "Insertar tabla" para traer los datos ya capturados de un ensayo.
`;

const NOMBRE_NUEVO = "Nuevo informe";

const TAMANOS_FUENTE = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36];

const LETRAS_GRIEGAS = [
  ["α", "alfa"], ["β", "beta"], ["γ", "gamma"], ["δ", "delta"],
  ["ε", "épsilon"], ["ζ", "zeta"], ["η", "eta"], ["θ", "theta"],
  ["ι", "iota"], ["κ", "kappa"], ["λ", "lambda"], ["μ", "mu"],
  ["ν", "nu"], ["ξ", "xi"], ["π", "pi"], ["ρ", "rho"],
  ["σ", "sigma"], ["τ", "tau"], ["υ", "ípsilon"], ["φ", "fi"],
  ["χ", "chi"], ["ψ", "psi"], ["ω", "omega"],
  ["Δ", "Delta"], ["Σ", "Sigma"], ["Ω", "Omega"], ["Φ", "Fi"], ["Π", "Pi"], ["Θ", "Theta"],
] as const;

const asArray = <T,>(data: T | T[] | undefined): T[] => (Array.isArray(data) ? data : data ? [data] : []);

interface Clasificacion {
  familia: Familia;
  tipoEnsayo: TipoEnsayo;
}

interface InformeEditorProps {
  /** Contenido con el que arranca el editor (plantilla existente elegida en
   * el stepper inicial) — si no se pasa, arranca en blanco. */
  contenidoInicial?: string;
  nombreInicial?: string;
  /** Ensayos elegidos en el paso 2 del stepper inicial — acota qué ensayos
   * se pueden elegir después al "Insertar tabla" (ver InsertarTablaDialog).
   * Si viene vacío/undefined, "Insertar tabla" vuelve a mostrar todos. */
  ensayosPermitidos?: EnsayoAgendable[];
  /** Solicitud elegida en el stepper inicial — sirve para nombrar el PDF. */
  solicitud?: Solicitud;
}

export default function InformeEditor({
  contenidoInicial,
  nombreInicial,
  ensayosPermitidos,
  solicitud,
}: Readonly<InformeEditorProps>) {
  const { toast } = useToast();
  const [nombre, setNombre] = useState(nombreInicial || NOMBRE_NUEVO);
  const [contenido, setContenido] = useState(contenidoInicial || PLANTILLA_INICIAL);
  const [saving, setSaving] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dialogTablaOpen, setDialogTablaOpen] = useState(false);
  const [dialogImagenOpen, setDialogImagenOpen] = useState(false);
  const [dialogFormulaOpen, setDialogFormulaOpen] = useState(false);
  const [dialogFirmaOpen, setDialogFirmaOpen] = useState(false);
  const [dialogEnviarOpen, setDialogEnviarOpen] = useState(false);
  const [imagenKind, setImagenKind] = useState<ImagenKind>("cuerpo");
  const [informes, setInformes] = useState<InformeListado[]>([]);
  const [loadingInforme, setLoadingInforme] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  // Clasificación (familia + tipo de ensayo) del informe actual — se pide
  // antes de guardar por primera vez (ver handleGuardar / ClasificarInformeDialog).
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [tiposEnsayo, setTiposEnsayo] = useState<TipoEnsayo[]>([]);
  const [cargandoClasificacion, setCargandoClasificacion] = useState(false);
  const [dialogClasificarOpen, setDialogClasificarOpen] = useState(false);
  const [clasificacion, setClasificacion] = useState<Clasificacion | null>(null);

  const blocks = useMemo(() => parseInforme(contenido), [contenido]);
  const numeroLineas = useMemo(() => contenido.split("\n").length, [contenido]);

  useEffect(() => {
    setCargandoClasificacion(true);
    Promise.all([familiaService.getAll(), tipoEnsayoService.getAll()])
      .then(([familiasRes, tiposRes]) => {
        setFamilias(asArray(familiasRes.data).filter((f) => (f.estado || "A") !== "I"));
        setTiposEnsayo(asArray(tiposRes.data).filter((t) => (t.estado || "A") !== "I"));
      })
      .catch(() => {
        /* silencioso acá: si falla, se avisa recién al intentar guardar y no encontrar opciones */
      })
      .finally(() => setCargandoClasificacion(false));
  }, []);

  const cargarListado = () => {
    informeService
      .listar()
      .then(setInformes)
      .catch((error) => {
        toast({
          title: "No se pudieron cargar las plantillas",
          description: error instanceof Error ? error.message : "Revisa la carpeta de informes.",
          variant: "destructive",
        });
      });
  };

  useEffect(() => {
    cargarListado();
  }, []);

  const cambiarContenido = (valor: string) => {
    setContenido(valor);
    setDirty(true);
  };

  const cambiarNombre = (valor: string) => {
    setNombre(valor);
    setDirty(true);
  };

  const insertarEnCursor = (texto: string) => {
    const el = textareaRef.current;
    if (!el) {
      cambiarContenido(`${contenido.trim()}\n\n${texto}\n\n`);
      return;
    }
    const start = el.selectionStart ?? contenido.length;
    const end = el.selectionEnd ?? contenido.length;
    const before = contenido.slice(0, start);
    const after = contenido.slice(end);
    const separator = before.endsWith("\n\n") || before === "" ? "" : "\n\n";
    const nuevo = `${before}${separator}${texto}\n\n${after}`;
    cambiarContenido(nuevo);
    requestAnimationFrame(() => {
      const pos = (before + separator + texto).length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const insertarEncabezado = (nivel: 1 | 2 | 3) => {
    const etiqueta = nivel === 1 ? "Título" : nivel === 2 ? "Subtítulo" : "Sub-subtítulo";
    insertarEnCursor(`${"#".repeat(nivel)} ${etiqueta}`);
  };

  /** Envuelve la selección con una etiqueta con nombre ({bold}...{/bold}),
   * o inserta un texto de ejemplo ya envuelto si no hay nada seleccionado. */
  const envolverConTag = (tag: string, ejemplo: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const seleccion = contenido.slice(start, end) || ejemplo;
    const before = contenido.slice(0, start);
    const after = contenido.slice(end);
    const open = `{${tag}}`;
    const close = `{/${tag}}`;
    cambiarContenido(`${before}${open}${seleccion}${close}${after}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + open.length, start + open.length + seleccion.length);
    });
  };

  /** Aplica un tamaño de fuente puntual a la selección (o a un texto de
   * ejemplo si no hay nada seleccionado). */
  const aplicarTamanoFuente = (size: number) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const seleccion = contenido.slice(start, end) || "texto";
    const open = `{size:${size}}`;
    const close = "{/size}";
    const before = contenido.slice(0, start);
    const after = contenido.slice(end);
    cambiarContenido(`${before}${open}${seleccion}${close}${after}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + open.length, start + open.length + seleccion.length);
    });
  };

  /** Envuelve el párrafo (seleccionado o de ejemplo) con la etiqueta de
   * alineación {center}...{/center}, igual de estilo que el resto. */
  const insertarAlineacion = (tipo: ParagraphAlign) => {
    const el = textareaRef.current;
    const seleccion = el ? contenido.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0) : "";
    const texto = seleccion || "Texto alineado";
    insertarEnCursor(`{${tipo}}\n${texto}\n{/${tipo}}`);
  };

  const insertarLista = (ordered: boolean) => {
    insertarEnCursor(
      ordered ? "1. Elemento uno\n2. Elemento dos" : "- Elemento uno\n- Elemento dos"
    );
  };

  /** Cuadro con borde (como \fbox/tcolorbox de LaTeX): envuelve la selección
   * (o un texto de ejemplo) en {caja}...{/caja}. Puede contener cualquier
   * otro bloque (párrafos, listas, tablas, imágenes). */
  const insertarCaja = () => {
    const el = textareaRef.current;
    const seleccion = el ? contenido.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0) : "";
    const texto = seleccion || "Texto dentro del cuadro.";
    insertarEnCursor(`{caja}\n${texto}\n{/caja}`);
  };

  /** Línea horizontal (separador) como bloque propio. */
  const insertarLinea = () => {
    insertarEnCursor("{linea}");
  };

  /** Sección apaisada: el contenido entre las etiquetas se renderiza en
   * orientación landscape (útil para tablas anchas). */
  const insertarHojaApaisada = () => {
    const el = textareaRef.current;
    const seleccion = el ? contenido.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0) : "";
    const texto = seleccion || "Contenido en hoja horizontal (inserta aquí tu tabla ancha).";
    insertarEnCursor(`{hoja:landscape}\n${texto}\n{/hoja}`);
  };

  const handleInsertarFirma = (url: string, ancho?: number) => {
    insertarEnCursor(`{firma${ancho ? `:${ancho}` : ""}}${url}{/firma}`);
  };

  /** Sangría de párrafo — independiente de la alineación, se pueden combinar
   * los dos (envolverConTag no sirve acá porque {indent} es de PÁRRAFO
   * completo, no de un tramo de texto en línea — mismo patrón que
   * insertarAlineacion). */
  const insertarSangria = () => {
    const el = textareaRef.current;
    const seleccion = el ? contenido.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0) : "";
    const texto = seleccion || "Texto con sangría";
    insertarEnCursor(`{indent}\n${texto}\n{/indent}`);
  };

  /** Fórmula algebraica (LaTeX real) como su propio bloque {formula}...{/formula}. */
  const handleInsertarFormula = (latex: string) => {
    insertarEnCursor(`{formula}\n${latex}\n{/formula}`);
  };

  const abrirDialogoImagen = (kind: ImagenKind) => {
    setImagenKind(kind);
    setDialogImagenOpen(true);
  };

  /** Inserta la etiqueta correspondiente según de qué diálogo vino la
   * imagen ya subida: suelta en el cuerpo, o fija como cabecera/pie de
   * página del PDF (estas dos no aparecen en el flujo del cuerpo). */
  const handleInsertarImagen = (url: string, tamano?: number) => {
    if (imagenKind === "cabecera") {
      insertarEnCursor(`{header-img${tamano ? `:${tamano}` : ""}}${url}{/header-img}`);
    } else if (imagenKind === "pie") {
      insertarEnCursor(`{footer-img${tamano ? `:${tamano}` : ""}}${url}{/footer-img}`);
    } else {
      insertarEnCursor(`{imagen${tamano ? `:${tamano}` : ""}}${url}{/imagen}`);
    }
  };

  /** Texto de cabecera/pie de página — se repite en todas las páginas del
   * PDF (se puede combinar con una imagen de cabecera/pie ya insertada: la
   * imagen queda arriba y el texto debajo). Se inserta como bloque editable,
   * igual que {caja} — el usuario lo edita directo en el textarea. */
  const insertarTextoHeaderFooter = (esHeader: boolean) => {
    const tag = esHeader ? "header-texto" : "footer-texto";
    const ejemplo = esHeader ? "Texto de cabecera" : "Texto de pie de página";
    insertarEnCursor(`{${tag}}\n${ejemplo}\n{/${tag}}`);
  };

  /** Contador de páginas — {pagina}/{total_paginas} solo se resuelven dentro
   * de header/footer (ver pdf.ts), por eso este atajo ya viene envuelto en
   * {footer-texto}. */
  const insertarContadorPaginas = () => {
    insertarEnCursor("{footer-texto}\n{center}\nPágina {pagina} de {total_paginas}\n{/center}\n{/footer-texto}");
  };

  /** Layout de columnas lado a lado (como una fila de tabla sin bordes) —
   * cada columna puede tener cualquier contenido (imagen, texto, fórmula).
   * Sirve tanto en el cuerpo como dentro de {header}/{footer} para membretes. */
  const insertarColumnas = () => {
    insertarEnCursor(
      "{columnas}\n{columna:150}\nColumna 1\n{/columna}\n{columna:*}\nColumna 2\n{/columna}\n{columna:150}\nColumna 3\n{/columna}\n{/columnas}"
    );
  };

  /** Membrete listo para usar (logo | título | metadata), igual al ejemplo de
   * cabecera con 3 columnas en una sola línea. El logo queda como placeholder
   * de texto — se reemplaza posicionando el cursor ahí y usando "Imagen". */
  const insertarMembreteColumnas = () => {
    insertarEnCursor(
      [
        "{header}",
        "{columnas}",
        "{columna:90}",
        "[Logo — posiciona el cursor acá y usa \"Imagen\"]",
        "{/columna}",
        "{columna:*}",
        "{center}",
        "{bold}Título del informe{/bold}",
        "{/center}",
        "{/columna}",
        "{columna:110}",
        "{right}",
        "N° rev: 01{br}",
        "Fecha",
        "{/right}",
        "{/columna}",
        "{/columnas}",
        "{/header}",
      ].join("\n")
    );
  };

  /** Bloque {header}/{footer} vacío y libre — a diferencia del membrete con
   * columnas, acá el usuario arma lo que quiera adentro (texto, imagen,
   * columnas, fórmulas, lo que sea) desde cero. */
  const insertarHeaderFooterGenerico = (esHeader: boolean) => {
    const tag = esHeader ? "header" : "footer";
    const ejemplo = esHeader ? "Contenido de la cabecera" : "Contenido del pie de página";
    insertarEnCursor(`{${tag}}\n${ejemplo}\n{/${tag}}`);
  };

  /** Quita las etiquetas {tag}/{/tag} (estilo, tamaño, alineación) de la selección. */
  const limpiarFormato = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) return;
    const seleccion = contenido.slice(start, end);
    const limpio = seleccion.replace(/\{\/?[a-z]+(:\d+)?\}/gi, "");
    cambiarContenido(contenido.slice(0, start) + limpio + contenido.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, start + limpio.length);
    });
  };

  const insertarCaracter = (caracter: string) => {
    const el = textareaRef.current;
    if (!el) {
      cambiarContenido(contenido + caracter);
      return;
    }
    const start = el.selectionStart ?? contenido.length;
    const end = el.selectionEnd ?? contenido.length;
    const nuevo = `${contenido.slice(0, start)}${caracter}${contenido.slice(end)}`;
    cambiarContenido(nuevo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + caracter.length, start + caracter.length);
    });
  };

  /** Mantiene los números de línea alineados con el scroll DEL PROPIO
   * textarea — no tiene relación con el scroll de la vista previa, que es
   * intencionalmente independiente (cada panel scrollea por su cuenta). */
  const sincronizarScrollGutter = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleNuevo = () => {
    setNombre(NOMBRE_NUEVO);
    setContenido(PLANTILLA_INICIAL);
    setDirty(false);
    setClasificacion(null);
  };

  /** Guarda de verdad, ya con familia y tipo de ensayo confirmados — la
   * llaman tanto handleGuardar (cuando ya había una clasificación elegida)
   * como handleConfirmarClasificacion (recién elegida en el diálogo). */
  const ejecutarGuardado = async (familia: Familia, tipoEnsayo: TipoEnsayo) => {
    setSaving(true);
    try {
      const nombreGuardado = await informeService.guardar(
        nombre,
        contenido,
        familia.codigo_familia,
        tipoEnsayo.codigo_tipo_ensayo
      );
      setNombre(nombreGuardado);
      setClasificacion({ familia, tipoEnsayo });
      setDirty(false);
      cargarListado();
      toast({
        title: "Informe guardado",
        description: `Guardado como "${nombreGuardado}" (${familia.nombre_familia} · ${tipoEnsayo.nombre_tipo_ensayo}).`,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo guardar el informe.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGuardar = () => {
    if (!nombre.trim()) {
      toast({ title: "Falta el nombre", description: "Ponle un nombre al informe antes de guardar.", variant: "destructive" });
      return;
    }
    if (clasificacion) {
      ejecutarGuardado(clasificacion.familia, clasificacion.tipoEnsayo);
      return;
    }
    setDialogClasificarOpen(true);
  };

  const handleConfirmarClasificacion = (familia: Familia, tipoEnsayo: TipoEnsayo) => {
    setDialogClasificarOpen(false);
    ejecutarGuardado(familia, tipoEnsayo);
  };

  const handleAbrir = async (informe: InformeListado) => {
    setLoadingInforme(true);
    try {
      const cargado = await informeService.cargar(informe.nombre);
      setContenido(cargado.contenido);
      setNombre(cargado.nombre);
      setDirty(false);
      const familia = familias.find((f) => f.codigo_familia === cargado.codigo_familia);
      const tipoEnsayo = tiposEnsayo.find((t) => t.codigo_tipo_ensayo === cargado.codigo_tipo_ensayo);
      setClasificacion(familia && tipoEnsayo ? { familia, tipoEnsayo } : null);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo abrir el informe.",
        variant: "destructive",
      });
    } finally {
      setLoadingInforme(false);
    }
  };

  const nombrePdf = nombreArchivoInformePdf(
    codigoUnicoMuestraDesdeEnsayos(ensayosPermitidos)
      ?? solicitud?.identificador_ensayo
      ?? solicitud?.codigo_solicitud
  );

  const handleGenerarPdf = async () => {
    setGenerandoPdf(true);
    try {
      await descargarInformePdf(blocks, nombrePdf);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo generar el PDF.",
        variant: "destructive",
      });
    } finally {
      setGenerandoPdf(false);
    }
  };

  return (
    <div className="flex flex-col rounded-lg border shadow-sm">
      {/* Barra superior oscura, estilo Overleaf — sticky para que no se
          pierda de vista si la página necesita scrollear (ej. pantallas
          chicas o zoom alto). */}
      <div className="sticky top-0 z-30 flex items-center gap-3 h-12 px-4 bg-[#1b2a38] text-white shrink-0">
        <span className="flex items-center gap-1.5 font-semibold text-sm text-emerald-400">
          <FileText className="h-4 w-4" />
          Editor de Informes
        </span>
        <input
          value={nombre}
          onChange={(e) => cambiarNombre(e.target.value)}
          className="bg-transparent border-b border-white/20 focus:border-white/60 outline-none text-sm px-1 py-0.5 max-w-[220px] placeholder:text-white/40"
          placeholder="Nombre del informe"
        />
        <span className="text-[11px] text-white/50">
          {saving ? "guardando..." : dirty ? "cambios sin guardar" : "guardado"}
        </span>
        <button
          type="button"
          onClick={() => setDialogClasificarOpen(true)}
          title="Elegir/cambiar familia y tipo de ensayo de este informe"
          className="flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-1 text-[11px] text-white/70 hover:border-white/40 hover:text-white"
        >
          <Tag className="h-3 w-3" />
          {clasificacion ? `${clasificacion.familia.nombre_familia} · ${clasificacion.tipoEnsayo.nombre_tipo_ensayo}` : "Sin clasificar"}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={handleNuevo}
          >
            <FilePlus className="mr-1.5 h-3.5 w-3.5" />
            Nuevo
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/10 hover:text-white"
                disabled={loadingInforme}
              >
                {loadingInforme ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                )}
                Abrir
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Informes guardados</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {informes.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">No hay informes .txt guardados.</p>
              ) : (
                informes.map((inf) => (
                  <DropdownMenuItem key={inf.nombre} onClick={() => handleAbrir(inf)}>
                    {inf.nombre}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={handleGenerarPdf}
            disabled={generandoPdf}
          >
            {generandoPdf ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generar PDF
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => setDialogEnviarOpen(true)}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Enviar reporte
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleGuardar}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Guardar
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Editor + Preview */}
        <div className="flex-1 grid grid-cols-2 min-w-0">
          <div className="flex flex-col min-w-0 border-r">
            <div className="sticky top-12 z-20 border-b flex flex-wrap items-center gap-x-0.5 gap-y-1 px-2 py-1.5 bg-white shrink-0">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertarEncabezado(1)} title="Título">
                <Heading1 className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertarEncabezado(2)} title="Subtítulo">
                <Heading2 className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertarEncabezado(3)} title="Sub-subtítulo">
                <Heading3 className="h-3.5 w-3.5" />
              </Button>
              <div className="h-4 w-px bg-border mx-1" />
              <Select onValueChange={(v) => aplicarTamanoFuente(Number(v))}>
                <SelectTrigger className="h-7 w-[68px] text-xs" title="Tamaño de fuente para la selección">
                  <SelectValue placeholder="Tamaño" />
                </SelectTrigger>
                <SelectContent>
                  {TAMANOS_FUENTE.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="h-4 w-px bg-border mx-1" />
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => envolverConTag("bold", "negrita")} title="Negrita">
                <Bold className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => envolverConTag("italic", "cursiva")} title="Cursiva">
                <Italic className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => envolverConTag("underline", "subrayado")} title="Subrayado">
                <Underline className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => envolverConTag("strike", "tachado")} title="Tachado">
                <Strikethrough className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => envolverConTag("sup", "2")} title="Superíndice (ej. m{sup}2{/sup})">
                <Superscript className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => envolverConTag("sub", "2")} title="Subíndice (ej. H{sub}2{/sub}O)">
                <Subscript className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={limpiarFormato} title="Borrar formato de la selección">
                <Eraser className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertarCaracter("{br}")} title="Salto de línea (corta la línea sin empezar un párrafo nuevo)">
                <CornerDownLeft className="h-3.5 w-3.5" />
              </Button>
              <div className="h-4 w-px bg-border mx-1" />
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertarLista(false)} title="Lista con viñetas">
                <List className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertarLista(true)} title="Lista numerada">
                <ListOrdered className="h-3.5 w-3.5" />
              </Button>
              <div className="h-4 w-px bg-border mx-1" />
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertarAlineacion("left")} title="Alinear a la izquierda">
                <AlignLeft className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertarAlineacion("center")} title="Centrar">
                <AlignCenter className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertarAlineacion("right")} title="Alinear a la derecha">
                <AlignRight className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => insertarAlineacion("justify")} title="Justificar">
                <AlignJustify className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={insertarSangria} title="Sangría de párrafo">
                <IndentIncrease className="h-3.5 w-3.5" />
              </Button>
              <div className="h-4 w-px bg-border mx-1" />
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Letras griegas">
                    <Sigma className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2">
                  <div className="grid grid-cols-8 gap-0.5">
                    {LETRAS_GRIEGAS.map(([letra, nombre]) => (
                      <button
                        key={letra}
                        type="button"
                        title={nombre}
                        onClick={() => insertarCaracter(letra)}
                        className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-100 text-base"
                      >
                        {letra}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <div className="h-4 w-px bg-border mx-1" />
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDialogTablaOpen(true)}>
                <Table2 className="mr-1 h-3.5 w-3.5" />
                Insertar tabla
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={insertarHojaApaisada}
                title="Envolver selección en hoja horizontal (landscape)"
              >
                <RotateCw className="mr-1 h-3.5 w-3.5" />
                Hoja horizontal
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setDialogFirmaOpen(true)}
                title="Insertar firma (dibujo o imagen)"
              >
                <PenLine className="mr-1 h-3.5 w-3.5" />
                Firma
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={insertarCaja} title="Cuadro con borde (como \fbox en LaTeX)">
                <Square className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={insertarLinea} title="Línea horizontal (separador)">
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={insertarColumnas} title="Columnas lado a lado (con ancho controlado por columna)">
                <Columns3 className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDialogFormulaOpen(true)} title="Insertar fórmula algebraica (LaTeX: fracciones, raíces, paréntesis, etc.)">
                <Radical className="mr-1 h-3.5 w-3.5" />
                Fórmula
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirDialogoImagen("cuerpo")} title="Insertar imagen en el cuerpo">
                <ImageIcon className="h-3.5 w-3.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" title="Cabecera y pie de página (imagen y/o texto, se repiten en todas las páginas)">
                    <PanelTop className="mr-1 h-3.5 w-3.5" />
                    Cabecera/Pie
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={insertarMembreteColumnas}>
                    <Columns3 className="mr-2 h-3.5 w-3.5" />
                    Membrete con columnas (logo | título | datos)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Cabecera</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => insertarHeaderFooterGenerico(true)}>
                    <PanelTop className="mr-2 h-3.5 w-3.5" />
                    Insertar cabecera (bloque libre)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => abrirDialogoImagen("cabecera")}>
                    <ImageIcon className="mr-2 h-3.5 w-3.5" />
                    Imagen de cabecera
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => insertarTextoHeaderFooter(true)}>
                    <PanelTop className="mr-2 h-3.5 w-3.5" />
                    Texto de cabecera
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Pie de página</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => insertarHeaderFooterGenerico(false)}>
                    <PanelBottom className="mr-2 h-3.5 w-3.5" />
                    Insertar pie de página (bloque libre)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => abrirDialogoImagen("pie")}>
                    <ImageIcon className="mr-2 h-3.5 w-3.5" />
                    Imagen de pie de página
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => insertarTextoHeaderFooter(false)}>
                    <PanelBottom className="mr-2 h-3.5 w-3.5" />
                    Texto de pie de página
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={insertarContadorPaginas}>
                    <Hash className="mr-2 h-3.5 w-3.5" />
                    Contador de páginas
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex h-[calc(100vh-300px)] min-h-[380px] bg-[#fdfdfd]">
              <div
                ref={gutterRef}
                className="w-10 shrink-0 overflow-hidden select-none text-right pr-2 pt-3 text-[13px] leading-[1.5rem] text-slate-400 font-mono bg-slate-50 border-r"
              >
                {Array.from({ length: numeroLineas }, (_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                value={contenido}
                onChange={(e) => cambiarContenido(e.target.value)}
                onScroll={sincronizarScrollGutter}
                spellCheck={false}
                className="flex-1 resize-none outline-none px-3 pt-3 text-[13px] leading-[1.5rem] font-mono bg-transparent"
                placeholder="Escribe el informe acá..."
              />
            </div>
          </div>

          <div className="flex flex-col min-w-0">
            <div className="sticky top-12 z-20 h-9 border-b flex items-center justify-between px-3 bg-white shrink-0">
              <span className="text-[11px] font-medium text-muted-foreground">Preview (PDF real)</span>
              <span className="text-[11px] text-emerald-600">se regenera al dejar de escribir</span>
            </div>
            <div className="h-[calc(100vh-260px)] min-h-[420px]">
              <InformePdfPreview blocks={blocks} />
            </div>
          </div>
        </div>
      </div>

      <InsertarTablaDialog
        open={dialogTablaOpen}
        onOpenChange={setDialogTablaOpen}
        onInsert={insertarEnCursor}
        ensayosPermitidos={ensayosPermitidos}
      />
      <InsertarImagenDialog
        open={dialogImagenOpen}
        kind={imagenKind}
        onOpenChange={setDialogImagenOpen}
        onInsert={handleInsertarImagen}
      />
      <InsertarFormulaDialog
        open={dialogFormulaOpen}
        onOpenChange={setDialogFormulaOpen}
        onInsert={handleInsertarFormula}
      />
      <ClasificarInformeDialog
        open={dialogClasificarOpen}
        cargando={cargandoClasificacion}
        familias={familias}
        tiposEnsayo={tiposEnsayo}
        codigoFamiliaInicial={clasificacion?.familia.codigo_familia}
        codigoTipoEnsayoInicial={clasificacion?.tipoEnsayo.codigo_tipo_ensayo}
        onOpenChange={setDialogClasificarOpen}
        onConfirmar={handleConfirmarClasificacion}
      />
      <InsertarFirmaDialog
        open={dialogFirmaOpen}
        onOpenChange={setDialogFirmaOpen}
        onInsert={handleInsertarFirma}
      />
      <EnviarInformeDialog
        open={dialogEnviarOpen}
        onOpenChange={setDialogEnviarOpen}
        blocks={blocks}
        nombreArchivoPdf={nombrePdf}
      />
    </div>
  );
}
