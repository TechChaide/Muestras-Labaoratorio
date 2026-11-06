import {
  CELDA_IMAGEN_PREFIJO,
  type InformeBlock,
  type ParagraphRun,
  type TablaCeldaInforme,
} from "./parser";
import { uploadService } from "@/services/muestrasLaboratorio/upload.service";
import { environment } from "@/environments/environments.prod";
import { latexASvg, type FormulaSvgResult } from "./formula-svg";
import type { TDocumentDefinitions, Content, Decorations } from "pdfmake/interfaces";

/** Ancho util del contenido en vertical (LETTER 612pt - 72pt x 2). */
const ANCHO_CONTENIDO_PORTRAIT = 468;
/** Ancho util en apaisado (LETTER landscape 792pt - 72pt x 2). */
const ANCHO_CONTENIDO_LANDSCAPE = 648;
/** Ancho util del contenido (LETTER 612pt - 72pt de margen a cada lado). */
const ANCHO_CONTENIDO = ANCHO_CONTENIDO_PORTRAIT;
void ANCHO_CONTENIDO_LANDSCAPE;

/** Marcadores de página — solo tienen sentido dentro de {header}/{footer}
 * (o header-texto/footer-texto), donde SÍ se conoce la página actual y el
 * total al momento de renderizar cada página del PDF. Se escriben literal
 * como texto (ej. "Página {pagina} de {total_paginas}") y se sustituyen acá,
 * no en el parser — ahí no existe todavía el concepto de "página". */
const MARCADOR_PAGINA = /\{pagina\}/g;
const MARCADOR_TOTAL_PAGINAS = /\{total_paginas\}/g;

/** Reemplaza los marcadores de página en cualquier texto dentro de un Content
 * de pdfmake ya armado (recursivo en stack/columns, y en runs de texto tanto
 * si vienen como string plano como si vienen como array de runs con estilo). */
export function sustituirMarcadoresPagina(content: unknown, currentPage: number, pageCount: number): unknown {
  const sustituirTexto = (t: string) =>
    t.replace(MARCADOR_PAGINA, String(currentPage)).replace(MARCADOR_TOTAL_PAGINAS, String(pageCount));

  if (Array.isArray(content)) {
    return content.map((c) => sustituirMarcadoresPagina(c, currentPage, pageCount));
  }
  if (typeof content !== "object" || content === null) return content;

  const obj = content as Record<string, unknown>;
  const copia: Record<string, unknown> = { ...obj };

  if (typeof copia.text === "string") {
    copia.text = sustituirTexto(copia.text);
  } else if (Array.isArray(copia.text)) {
    copia.text = copia.text.map((run) => {
      if (typeof run === "string") return sustituirTexto(run);
      if (run && typeof run === "object" && typeof (run as { text?: unknown }).text === "string") {
        return { ...run, text: sustituirTexto((run as { text: string }).text) };
      }
      return run;
    });
  }
  if (Array.isArray(copia.stack)) copia.stack = sustituirMarcadoresPagina(copia.stack, currentPage, pageCount);
  if (Array.isArray(copia.columns)) copia.columns = sustituirMarcadoresPagina(copia.columns, currentPage, pageCount);

  return copia;
}

/** "Estilo LaTeX": Computer Modern (la tipografía de LaTeX/TeX real, acá vía
 * CM-Unicode — conversión libre a TrueType de las fuentes METAFONT originales
 * de Knuth, SIL OFL — ver public/fonts/cmu/OFL.txt) como tipografía por
 * defecto, en vez de la Roboto (sans-serif) que trae pdfmake de fábrica. */
const FUENTE_LATEX = "ComputerModern";
const RUTA_FUENTES_LATEX = `${environment.basePath}/fonts/cmu`;

function runsToPdf(runs: ParagraphRun[]) {
  return runs.map((r) => {
    const decoration: Decoration[] = [];
    if (r.underline) decoration.push("underline");
    if (r.strike) decoration.push("lineThrough");
    return {
      text: r.text,
      bold: r.bold,
      italics: r.italic,
      sup: r.superscript,
      sub: r.subscript,
      fontSize: r.fontSize,
      decoration: decoration.length ? decoration : undefined,
    };
  });
}

/** Timeout para fetches del generador — sin esto un recurso colgado deja
 * la vista previa eternamente en "Generando...". */
const FETCH_TIMEOUT_MS = 12_000;
const PDF_BLOB_TIMEOUT_MS = 45_000;

async function fetchConTimeout(url: string, ms = FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Descarga (fetch) una imagen y la convierte a dataURL base64 — pdfmake
 * exige que las imágenes vengan así, no como URL. Se cachea por URL resuelta
 * porque la vista previa regenera el PDF completo en cada cambio (con
 * debounce): sin caché, cada tecla volvería a bajar y a decodificar las
 * mismas imágenes. Los fallos NO se cachean, para poder reintentar. */
const cacheImagenes = new Map<string, Promise<string>>();

async function imagenADataUrl(srcRelativoOAbsoluto: string): Promise<string> {
  if (srcRelativoOAbsoluto.startsWith("data:")) return srcRelativoOAbsoluto;
  const url = uploadService.resolveUrl(srcRelativoOAbsoluto);
  const existente = cacheImagenes.get(url);
  if (existente) return existente;

  const promesa = (async () => {
    const res = await fetchConTimeout(url);
    if (!res.ok) throw new Error(`No se pudo cargar la imagen: ${url}`);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error("Error leyendo la imagen"));
      reader.readAsDataURL(blob);
    });
  })();

  cacheImagenes.set(url, promesa);
  promesa.catch(() => cacheImagenes.delete(url));
  return promesa;
}

/** Recorre todos los bloques (incluyendo dentro de {caja}, recursivo) y
 * junta cada URL de imagen referenciada: imágenes sueltas, cabecera/pie de
 * página, y celdas de tabla con evidencia fotográfica. */
function recolectarImagenes(blocks: InformeBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "imagen" || b.type === "header-imagen" || b.type === "pie-imagen" || b.type === "firma") {
      out.push(b.src);
    } else if (b.type === "caja" || b.type === "header" || b.type === "footer" || b.type === "hoja") {
      out.push(...recolectarImagenes(b.contenido));
    } else if (b.type === "columnas") {
      for (const c of b.columnas) out.push(...recolectarImagenes(c.contenido));
    } else if (b.type === "tabla") {
      const todas = [...b.columnas, ...b.filas.flat()];
      for (const cell of todas) {
        const v = typeof cell === "string" ? cell : cell.text;
        if (v.startsWith(CELDA_IMAGEN_PREFIJO)) out.push(v.slice(CELDA_IMAGEN_PREFIJO.length));
      }
    }
  }
  return out;
}

/** Igual que recolectarImagenes pero para el LaTeX de cada bloque {formula}
 * (recursivo dentro de {caja}) — se convierten todas a SVG ANTES de armar el
 * docDefinition (mathjax-full se carga perezosamente y de forma asíncrona,
 * bloqueAPdf en cambio es síncrono, así que no puede llamarlo directo). */
function recolectarFormulas(blocks: InformeBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "formula") out.push(b.latex);
    else if (b.type === "caja" || b.type === "header" || b.type === "footer" || b.type === "hoja") {
      out.push(...recolectarFormulas(b.contenido));
    } else if (b.type === "columnas") {
      for (const c of b.columnas) out.push(...recolectarFormulas(c.contenido));
    }
  }
  return out;
}

/** Convierte un bloque a contenido de pdfmake. Recursivo (una {caja} puede
 * contener cualquier otro bloque, incluida otra caja). `imagenes` mapea cada
 * `src` de imagen a su dataURL ya descargada — si una imagen no se pudo
 * cargar, se muestra un aviso de texto en su lugar en vez de romper todo el
 * PDF. */
function bloqueAPdf(
  b: InformeBlock,
  imagenes: Map<string, string>,
  numeros?: Map<InformeBlock, string>,
  formulas?: Map<string, FormulaSvgResult>
): Content | null {
  if (b.type === "heading") {
    const numero = numeros?.get(b);
    return {
      text: numero ? `${numero}  ${b.text}` : b.text,
      style: b.level === 1 ? "h1" : b.level === 2 ? "h2" : "h3",
      margin: [0, b.level === 1 ? 14 : 10, 0, 4] as [number, number, number, number],
    };
  }
  if (b.type === "paragraph") {
    return {
      text: runsToPdf(b.runs),
      alignment: b.align || "justify",
      margin: [b.indent ? 28 : 0, 0, 0, 6] as [number, number, number, number],
    };
  }
  if (b.type === "list") {
    const items = b.items.map((item) => ({ text: runsToPdf(item) }));
    return b.ordered
      ? { ol: items, margin: [0, 0, 0, 6] as [number, number, number, number] }
      : { ul: items, margin: [0, 0, 0, 6] as [number, number, number, number] };
  }
  if (b.type === "imagen") {
    const dataUrl = imagenes.get(b.src);
    if (!dataUrl) {
      return {
        text: `[Imagen no disponible: ${b.src}]`,
        italics: true,
        color: "#b91c1c",
        margin: [0, 4, 0, 10] as [number, number, number, number],
      };
    }
    return {
      image: dataUrl,
      alignment: b.align || "center",
      margin: [0, 6, 0, 10] as [number, number, number, number],
      ...(b.width ? { width: b.width } : { fit: [451, 650] as [number, number] }),
    };
  }
  if (b.type === "caja") {
    // Los encabezados dentro de una caja no se numeran (no forman parte de
    // la secuencia de secciones del cuerpo principal).
    const inner = b.contenido.map((ib) => bloqueAPdf(ib, imagenes, undefined, formulas)).filter((c): c is Content => c !== null);
    return {
      table: { widths: ["*"], body: [[{ stack: inner.length ? inner : [{ text: "" }], margin: [6, 6, 6, 6] }]] },
      layout: {
        hLineWidth: () => 1.2,
        vLineWidth: () => 1.2,
        hLineColor: () => "#334155",
        vLineColor: () => "#334155",
      },
      margin: [0, 6, 0, 12] as [number, number, number, number],
    };
  }
  if (
    b.type === "header-imagen" ||
    b.type === "pie-imagen" ||
    b.type === "header-texto" ||
    b.type === "pie-texto" ||
    b.type === "header" ||
    b.type === "footer"
  ) {
    // No van en el cuerpo: se resuelven aparte como header/footer del docDefinition.
    return null;
  }
  if (b.type === "columnas") {
    return {
      columns: b.columnas.map((c) => {
        const inner = c.contenido
          .map((ib) => bloqueAPdf(ib, imagenes, undefined, formulas))
          .filter((x): x is Content => x !== null);
        return {
          width: c.ancho ?? "*",
          stack: inner.length ? inner : [{ text: "" }],
        };
      }),
      columnGap: 8,
      margin: [0, 4, 0, 8] as [number, number, number, number],
    };
  }
  if (b.type === "linea") {
    return {
      canvas: [{ type: "line", x1: 0, y1: 0, x2: ANCHO_CONTENIDO, y2: 0, lineWidth: 0.75, lineColor: "#333333" }],
      margin: [0, 10, 0, 10] as [number, number, number, number],
    };
  }
  if (b.type === "formula") {
    const resuelta = formulas?.get(b.latex);
    if (!resuelta) {
      return {
        text: `[Fórmula inválida: ${b.latex}]`,
        italics: true,
        color: "#b91c1c",
        margin: [0, 4, 0, 10] as [number, number, number, number],
      };
    }
    const { svg, widthPt, heightPt } = resuelta;
    const escala = widthPt > ANCHO_CONTENIDO ? ANCHO_CONTENIDO / widthPt : 1;
    return {
      svg,
      width: widthPt * escala,
      height: heightPt * escala,
      alignment: b.align || "center",
      margin: [0, 8, 0, 8] as [number, number, number, number],
    };
  }

  if (b.type === "hoja") {
    const inner = b.contenido
      .map((ib) => bloqueAPdf(ib, imagenes, numeros, formulas))
      .filter((c): c is Content => c !== null);
    const stack = inner.length ? inner : [{ text: "" }];
    // pdfmake: pageOrientation en el primer item afecta esta pagina y las
    // siguientes hasta el proximo cambio. Tras la hoja, un marcador vacio
    // restaura portrait en la pagina siguiente.
    const primero: Content = {
      stack,
      pageBreak: "before",
      pageOrientation: b.orientacion,
    };
    return {
      stack: [
        primero,
        {
          text: "",
          pageBreak: "after",
          pageOrientation: "portrait",
        },
      ],
    };
  }

  if (b.type === "firma") {
    const dataUrl = imagenes.get(b.src);
    const ancho = b.width || 160;
    const piezas: Content[] = [
      {
        canvas: [
          {
            type: "line",
            x1: 0,
            y1: 0,
            x2: Math.max(ancho, 120),
            y2: 0,
            lineWidth: 0.75,
            lineColor: "#334155",
          },
        ],
        margin: [0, 16, 0, 4] as [number, number, number, number],
      },
    ];
    if (dataUrl) {
      piezas.push({
        image: dataUrl,
        width: ancho,
        alignment: "left",
        margin: [0, 0, 0, 2] as [number, number, number, number],
      });
    } else {
      piezas.push({
        text: "[Firma no disponible]",
        italics: true,
        color: "#b91c1c",
        margin: [0, 0, 0, 2] as [number, number, number, number],
      });
    }
    piezas.push({
      text: b.etiqueta || "Firma / Responsable",
      fontSize: 9,
      color: "#475569",
      margin: [0, 0, 0, 10] as [number, number, number, number],
    });
    return { stack: piezas };
  }

  // tabla
  if (b.type !== "tabla") return null;

  if (b.columnas.length === 0) {
    return {
      text: `[Tabla vacía${b.titulo ? `: ${b.titulo}` : ""}]`,
      italics: true,
      color: "#b91c1c",
      margin: [0, 4, 0, 10] as [number, number, number, number],
    };
  }

  const normalizarCelda = (raw: TablaCeldaInforme | string): TablaCeldaInforme =>
    typeof raw === "string" ? { text: raw } : raw;

  const numColumnas = b.columnas.length;
  const filasParejas = b.filas.map((fila) => {
    const pareja = fila.map(normalizarCelda).slice(0, numColumnas);
    while (pareja.length < numColumnas) pareja.push({ text: "" });
    return pareja;
  });

  const celdaAPdf = (raw: TablaCeldaInforme | string, esHeader: boolean) => {
    const cell = normalizarCelda(raw);
    if (cell.covered) return {};
    const estilo = esHeader ? "tablaHeader" : "tablaCelda";
    const base: Record<string, unknown> = {};
    if (cell.rowSpan && cell.rowSpan > 1) base.rowSpan = cell.rowSpan;
    if (cell.colSpan && cell.colSpan > 1) base.colSpan = cell.colSpan;
    if (cell.text.startsWith(CELDA_IMAGEN_PREFIJO)) {
      const dataUrl = imagenes.get(cell.text.slice(CELDA_IMAGEN_PREFIJO.length));
      if (dataUrl) {
        return { ...base, image: dataUrl, width: 48, alignment: "center" as const };
      }
      return {
        ...base,
        text: "(imagen no disponible)",
        style: estilo,
        alignment: "center" as const,
      };
    }
    return { ...base, text: cell.text, style: estilo };
  };

  return {
    style: "tablaWrap",
    margin: [0, 4, 0, 12] as [number, number, number, number],
    stack: [
      b.titulo ? { text: b.titulo, style: "tablaTitulo" } : null,
      {
        table: {
          headerRows: 1,
          widths: b.columnas.map(() => "*"),
          body: [
            b.columnas.map((c) => celdaAPdf(c, true)),
            ...filasParejas.map((fila) => fila.map((v) => celdaAPdf(v, false))),
          ],
        },
        layout: {
          hLineColor: () => "#333333",
          vLineColor: () => "#333333",
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
        },
      },
    ].filter(Boolean) as Content[],
  };

}

/** Convierte el binario de una fuente a base64 puro (sin el prefijo
 * "data:...;base64,") — es lo que espera pdfMake.vfs. btoa() no admite un
 * ArrayBuffer grande de una — se arma la "binary string" en bloques para no
 * desbordar el límite de argumentos de String.fromCharCode. */
async function fuenteABase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar la fuente: ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binario = "";
  const TAMANO_BLOQUE = 0x8000;
  for (let i = 0; i < bytes.length; i += TAMANO_BLOQUE) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TAMANO_BLOQUE));
  }
  return btoa(binario);
}

/** Registra Computer Modern en pdfMake.vfs/fonts la primera vez que se
 * necesita — se cachea a nivel de módulo porque son ~2MB de fuentes y la
 * vista previa recompila el PDF seguido (con debounce) mientras se escribe. */
let fuentesLatexPromise: Promise<void> | null = null;

async function asegurarFuenteLatex(pdfMake: any): Promise<void> {
  if (pdfMake.fonts?.[FUENTE_LATEX]) return;
  if (!fuentesLatexPromise) {
    fuentesLatexPromise = (async () => {
      const [normal, bold, italics, bolditalics] = await Promise.all([
        fuenteABase64(`${RUTA_FUENTES_LATEX}/CMU-Serif-Roman.ttf`),
        fuenteABase64(`${RUTA_FUENTES_LATEX}/CMU-Serif-Bold.ttf`),
        fuenteABase64(`${RUTA_FUENTES_LATEX}/CMU-Serif-Italic.ttf`),
        fuenteABase64(`${RUTA_FUENTES_LATEX}/CMU-Serif-BoldItalic.ttf`),
      ]);
      pdfMake.vfs["CMU-Serif-Roman.ttf"] = normal;
      pdfMake.vfs["CMU-Serif-Bold.ttf"] = bold;
      pdfMake.vfs["CMU-Serif-Italic.ttf"] = italics;
      pdfMake.vfs["CMU-Serif-BoldItalic.ttf"] = bolditalics;
      pdfMake.fonts = {
        ...pdfMake.fonts,
        [FUENTE_LATEX]: {
          normal: "CMU-Serif-Roman.ttf",
          bold: "CMU-Serif-Bold.ttf",
          italics: "CMU-Serif-Italic.ttf",
          bolditalics: "CMU-Serif-BoldItalic.ttf",
        },
      };
    })();
    fuentesLatexPromise.catch(() => {
      fuentesLatexPromise = null; // permitir reintentar en la próxima generación
    });
  }
  return fuentesLatexPromise;
}

async function cargarPdfMake() {
  const pdfMakeModule = await import("pdfmake/build/pdfmake");
  const pdfFontsModule = await import("pdfmake/build/vfs_fonts");
  const pdfMake = (pdfMakeModule as any).default ?? pdfMakeModule;
  const pdfFonts = (pdfFontsModule as any).default ?? pdfFontsModule;
  if (!pdfMake.vfs) pdfMake.vfs = pdfFonts.vfs ?? pdfFonts;
  await asegurarFuenteLatex(pdfMake);
  return pdfMake;
}

/** Numera los encabezados de nivel superior al estilo \section/\subsection/
 * \subsubsection de LaTeX (1, 1.1, 1.1.1 — el sub-contador se reinicia al
 * avanzar el nivel superior). Solo se aplica a los encabezados del cuerpo
 * principal, no a los que puedan aparecer dentro de una {caja}. */
function numerarEncabezados(blocks: InformeBlock[]): Map<InformeBlock, string> {
  const contadores = [0, 0, 0];
  const numeros = new Map<InformeBlock, string>();
  const walk = (lista: InformeBlock[]) => {
    for (const b of lista) {
      if (b.type === "heading") {
        const idx = b.level - 1;
        contadores[idx]++;
        for (let i = idx + 1; i < contadores.length; i++) contadores[i] = 0;
        numeros.set(b, contadores.slice(0, idx + 1).join("."));
      } else if (b.type === "hoja") {
        walk(b.contenido);
      }
    }
  };
  walk(blocks);
  return numeros;
}

/** Arma el docDefinition completo de pdfmake a partir de los bloques — lo
 * comparten la descarga real y la vista previa embebida (ver
 * informe-pdf-preview.tsx), así ambas producen exactamente el mismo PDF. */
async function construirDocDefinition(blocks: InformeBlock[]): Promise<TDocumentDefinitions> {
  // Todas las imágenes referenciadas (cuerpo, tablas, cabecera, pie) se
  // descargan y convierten a base64 ANTES de armar el docDefinition, porque
  // pdfmake no soporta URLs — y si alguna falla, se avisa en su lugar en vez
  // de cortar la generación completa del PDF.
  const srcsUnicos = Array.from(new Set(recolectarImagenes(blocks)));
  const imagenes = new Map<string, string>();
  await Promise.all(
    srcsUnicos.map(async (src) => {
      try {
        imagenes.set(src, await imagenADataUrl(src));
      } catch {
        // se ignora — bloqueAPdf() muestra un aviso de texto en su lugar
      }
    })
  );

  // Igual que las imágenes: todas las fórmulas se convierten a SVG ANTES de
  // armar el docDefinition (la conversión es asíncrona — carga perezosa de
  // mathjax-full — mientras que bloqueAPdf es síncrono).
  const latexUnicos = Array.from(new Set(recolectarFormulas(blocks)));
  const formulas = new Map<string, FormulaSvgResult>();
  await Promise.all(
    latexUnicos.map(async (latex) => {
      try {
        formulas.set(latex, await latexASvg(latex));
      } catch {
        // se ignora — bloqueAPdf() muestra un aviso de texto en su lugar
      }
    })
  );

  const headerBlock = blocks.find((b): b is Extract<InformeBlock, { type: "header-imagen" }> => b.type === "header-imagen");
  const footerBlock = blocks.find((b): b is Extract<InformeBlock, { type: "pie-imagen" }> => b.type === "pie-imagen");
  const headerTextoBlock = blocks.find((b): b is Extract<InformeBlock, { type: "header-texto" }> => b.type === "header-texto");
  const footerTextoBlock = blocks.find((b): b is Extract<InformeBlock, { type: "pie-texto" }> => b.type === "pie-texto");
  // {header}/{footer} genérico — a diferencia de header-img/header-texto (un
  // solo elemento simple), puede traer CUALQUIER contenido, típicamente
  // {columnas} para membretes (logo | título | metadata en una sola línea con
  // anchos controlados) — se convierte con el mismo bloqueAPdf que usa el cuerpo.
  const headerGenerico = blocks.find((b): b is Extract<InformeBlock, { type: "header" }> => b.type === "header");
  const footerGenerico = blocks.find((b): b is Extract<InformeBlock, { type: "footer" }> => b.type === "footer");
  const headerDataUrl = headerBlock ? imagenes.get(headerBlock.src) : undefined;
  const footerDataUrl = footerBlock ? imagenes.get(footerBlock.src) : undefined;

  // Cabecera/pie pueden combinar imagen + texto + un {header}/{footer} genérico
  // (ej. logo arriba, razón social debajo, membrete de columnas encima) — se
  // arman como un stack con lo que exista de cada uno.
  const construirHeaderFooter = (
    dataUrl: string | undefined,
    alto: number | undefined,
    textoBlock: Extract<InformeBlock, { type: "header-texto" | "pie-texto" }> | undefined,
    generico: Extract<InformeBlock, { type: "header" | "footer" }> | undefined,
    esHeader: boolean
  ): Content | undefined => {
    const piezas: Content[] = [];
    if (dataUrl) {
      piezas.push({ image: dataUrl, fit: [ANCHO_CONTENIDO, alto ?? 50] as [number, number] });
    }
    if (textoBlock) {
      piezas.push({
        text: runsToPdf(textoBlock.runs),
        alignment: textoBlock.align || "left",
        fontSize: 9,
        margin: [0, dataUrl ? 4 : 0, 0, 0] as [number, number, number, number],
      });
    }
    if (generico) {
      const inner = generico.contenido
        .map((ib) => bloqueAPdf(ib, imagenes, undefined, formulas))
        .filter((c): c is Content => c !== null);
      piezas.push(...inner);
    }
    if (piezas.length === 0) return undefined;
    return {
      stack: piezas,
      margin: [72, esHeader ? 18 : 0, 72, esHeader ? 0 : 18] as [number, number, number, number],
    };
  };

  const headerContenido = construirHeaderFooter(headerDataUrl, headerBlock?.height, headerTextoBlock, headerGenerico, true);
  const footerContenido = construirHeaderFooter(footerDataUrl, footerBlock?.height, footerTextoBlock, footerGenerico, false);

  const cuerpo = blocks.filter(
    (b) =>
      b.type !== "header-imagen" &&
      b.type !== "pie-imagen" &&
      b.type !== "header-texto" &&
      b.type !== "pie-texto" &&
      b.type !== "header" &&
      b.type !== "footer"
  );
  const numeros = numerarEncabezados(cuerpo);
  const content = cuerpo.map((b) => bloqueAPdf(b, imagenes, numeros, formulas)).filter((c): c is Content => c !== null);

  return {
    pageSize: "LETTER",
    pageMargins: [72, headerContenido ? 96 : 72, 72, footerContenido ? 96 : 72],
    // Fondo blanco puro explícito — sin esto pdfmake no dibuja nada y queda
    // a criterio del visor de PDF rellenar la página "en blanco" (que casi
    // siempre es blanco puro, pero al no declararlo queda ambiguo).
    background: (_currentPage, pageSize) => ({
      canvas: [{ type: "rect", x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: "#FFFFFF" }],
    }),
    header: headerContenido
      ? (currentPage, pageCount) => sustituirMarcadoresPagina(headerContenido, currentPage, pageCount) as Content
      : undefined,
    footer: footerContenido
      ? (currentPage, pageCount) => sustituirMarcadoresPagina(footerContenido, currentPage, pageCount) as Content
      : undefined,
    content,
    // Tipografía "estilo LaTeX" (artículo académico): Computer Modern (ver
    // asegurarFuenteLatex), interlineado ajustado (~1.15, LaTeX no usa el
    // 1.5 típico de Word) y encabezados numerados como \section/\subsection.
    defaultStyle: {
      font: FUENTE_LATEX,
      fontSize: 11,
      lineHeight: 1.15,
    },
    styles: {
      h1: { fontSize: 15, bold: true },
      h2: { fontSize: 13, bold: true },
      h3: { fontSize: 11.5, bold: true },
      tablaTitulo: { fontSize: 9.5, italics: true, margin: [0, 0, 0, 4] },
      tablaHeader: { bold: true, fillColor: "#f1f5f9", fontSize: 9 },
      tablaCelda: { fontSize: 9 },
      tablaWrap: {},
    },
  };
}

/** Genera y descarga el PDF real del informe a partir de los bloques
 * parseados. */
export async function descargarInformePdf(
  blocks: InformeBlock[],
  nombreArchivo: string
): Promise<void> {
  const [pdfMake, docDefinition] = await Promise.all([cargarPdfMake(), construirDocDefinition(blocks)]);
  pdfMake.createPdf(docDefinition).download(nombreArchivo);
}

/** Genera el mismo PDF que descargarInformePdf pero como Blob, para mostrar
 * en un visor embebido (vista previa real, con paginación nativa) en vez de
 * descargarlo. */
export async function generarInformePdfBlob(blocks: InformeBlock[]): Promise<Blob> {
  const [pdfMake, docDefinition] = await Promise.all([cargarPdfMake(), construirDocDefinition(blocks)]);
  return await new Promise<Blob>((resolve) => {
    pdfMake.createPdf(docDefinition).getBlob((blob: Blob) => resolve(blob));
  });
}
