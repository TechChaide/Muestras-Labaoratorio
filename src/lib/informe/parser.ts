/**
 * Formato de texto plano para informes, parseable en ambas direcciones:
 * texto -> bloques (para renderizar la vista previa / generar el PDF) y
 * bloques -> texto (para insertar una tabla en el cursor del editor).
 *
 * Sintaxis (deliberadamente simple, un solo estilo consistente de etiquetas
 * {tag}...{/tag} para todo). Los estilos de texto se "prenden/apagan" de
 * forma independiente, así que SÍ se pueden combinar en cualquier orden
 * (ej. {bold}{italic}negrita y cursiva{/italic}{/bold}):
 *   &&& comentario          -> comentario de línea (desde &&& hasta el final
 *                              de esa línea). No aparece en preview ni PDF.
 *   &* comentario           -> comentario de bloque, puede abarcar varias
 *   varias líneas...            líneas (incluso tags completos a medio
 *   *&                          escribir). Tampoco aparece en preview ni PDF.
 *   # Título            -> encabezado nivel 1 (sin numerar)
 *   ## Subtítulo         -> encabezado nivel 2 (sin numerar)
 *   ### Sub-subtítulo    -> encabezado nivel 3 (sin numerar)
 *   {bold}texto{/bold}            -> negrita
 *   {italic}texto{/italic}        -> cursiva
 *   {underline}texto{/underline}  -> subrayado
 *   {strike}texto{/strike}        -> tachado
 *   {sup}texto{/sup}              -> superíndice (ej. m{sup}2{/sup})
 *   {sub}texto{/sub}              -> subíndice (ej. H{sub}2{/sub}O)
 *   {size:18}texto{/size}         -> tamaño de fuente puntual para ese tramo
 *   {br}                          -> salto de línea DENTRO del párrafo (no
 *                                    empieza un párrafo nuevo, solo corta la
 *                                    línea visualmente — como Shift+Enter)
 *   {center}...{/center}          -> centra el párrafo completo
 *   {left}...{/left}              -> alinea a la izquierda
 *   {right}...{/right}            -> alinea a la derecha
 *   {justify}...{/justify}        -> justificado (= el default sin etiqueta)
 *   - ítem                -> lista con viñetas (líneas consecutivas)
 *   1. ítem                -> lista numerada (líneas consecutivas; el número
 *                              real no importa, se renumera solo)
 *   texto normal           -> párrafo (líneas en blanco separan párrafos)
 *   [[tabla]]
 *   Título de la tabla
 *   | Col A | Col B |
 *   | 12    | 18.25 |
 *   [[/tabla]]
 *                       -> tabla insertada como snapshot (valores ya
 *                          capturados de un ensayo, no una referencia viva).
 *                          Una celda puede traer una imagen (ensayo con
 *                          celda tipo_dato = 'imagen'): su valor viene
 *                          prefijado como "img:<url>" y se renderiza como
 *                          imagen en vez de texto.
 *                          Merges: {{m:2x3}}texto = rowspan 2, colspan 3;
 *                          {{:}} = celda cubierta por un merge (no se pinta).
 *   {hoja:landscape}...{/hoja} -> sección en orientación horizontal (apaisada).
 *                                 Al cerrar, el resto vuelve a vertical.
 *   {firma:150}url{/firma}     -> bloque de firma (imagen + línea).
 *   {imagen:200}url{/imagen}      -> imagen suelta en el cuerpo (200 = ancho
 *                                    en puntos, opcional; si se omite se
 *                                    ajusta al ancho disponible)
 *   {header-img:50}url{/header-img} -> imagen de cabecera, se repite en
 *                                       TODAS las páginas del PDF (50 = alto
 *                                       en puntos, opcional). No aparece en
 *                                       el cuerpo del documento.
 *   {footer-img:50}url{/footer-img} -> igual que header-img pero para el pie
 *                                       de página.
 *   {header-texto}...{/header-texto} -> texto (con sus estilos en línea) que
 *                                        se repite como cabecera en TODAS las
 *                                        páginas del PDF. Se puede combinar
 *                                        con {header-img} (imagen arriba,
 *                                        texto debajo). No aparece en el
 *                                        cuerpo del documento.
 *   {footer-texto}...{/footer-texto} -> igual que header-texto pero para el
 *                                        pie de página.
 *   {pagina}                -> dentro de header/footer (header-texto,
 *   {total_paginas}              footer-texto, {header}/{footer}, o una
 *                                columna adentro de esos), se reemplaza por
 *                                el número de página actual / el total de
 *                                páginas del PDF (ej. "Página {pagina} de
 *                                {total_paginas}"). Fuera de header/footer no
 *                                tiene efecto (queda como texto literal, ahí
 *                                no se conoce la página).
 *   {columnas}              -> layout de columnas lado a lado (como una fila
 *   {columna:80}                 de tabla sin bordes) — cada {columna} puede
 *   ...                          contener CUALQUIER bloque (imagen, texto
 *   {/columna}                   alineado, fórmula, etc.). El número es el
 *   {columna:*}                  ancho en puntos; si se omite o es "*", esa
 *   ...                          columna reparte el espacio restante. Sirve
 *   {/columna}                   para membretes (logo | título | metadata en
 *   {/columnas}                  una sola línea con anchos controlados).
 *   {header}...{/header}    -> cabecera del PDF (todas las páginas) con
 *                                CUALQUIER contenido (a diferencia de
 *                                header-img/header-texto, que son atajos
 *                                simples de un solo elemento). Pensado para
 *                                combinarse con {columnas} para membretes.
 *   {footer}...{/footer}     -> igual que {header} pero para el pie de página.
 *   {caja}                 -> cuadro con borde (como \fbox/tcolorbox de
 *   contenido...                LaTeX). Puede contener cualquier otro bloque
 *   {/caja}                     (párrafos, listas, tablas, imágenes).
 *   {indent}...{/indent}   -> sangría de párrafo (independiente de la
 *                              alineación, se pueden combinar los dos).
 *   {linea}                -> línea horizontal (separador), bloque propio.
 *   {formula}               -> fórmula algebraica (LaTeX real: \frac{a}{b},
 *   \frac{a}{b}                 \sqrt{x}, (), [], \{\}, etc.), se renderiza
 *   {/formula}                  tipografiada (no como texto plano) tanto en
 *                                la vista previa como en el PDF.
 */

export type ParagraphAlign = "left" | "center" | "right" | "justify";

export interface ParagraphRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  fontSize?: number;
}

/** Celda de tabla en el informe — soporta merges (rowSpan/colSpan) y celdas
 * cubiertas por un merge ajeno (`covered`), que pdfmake debe omitir/vaciar. */
export interface TablaCeldaInforme {
  text: string;
  rowSpan?: number;
  colSpan?: number;
  covered?: boolean;
}

export type HojaOrientacion = "portrait" | "landscape";

export type InformeBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; runs: ParagraphRun[]; align?: ParagraphAlign; indent?: boolean }
  | { type: "list"; ordered: boolean; items: ParagraphRun[][] }
  | { type: "tabla"; titulo: string; columnas: TablaCeldaInforme[]; filas: TablaCeldaInforme[][] }
  | { type: "imagen"; src: string; width?: number; align?: ParagraphAlign }
  | { type: "header-imagen"; src: string; height?: number }
  | { type: "pie-imagen"; src: string; height?: number }
  | { type: "caja"; contenido: InformeBlock[] }
  | { type: "linea" }
  | { type: "formula"; latex: string; align?: ParagraphAlign }
  | { type: "header-texto"; runs: ParagraphRun[]; align?: ParagraphAlign }
  | { type: "pie-texto"; runs: ParagraphRun[]; align?: ParagraphAlign }
  | { type: "columnas"; columnas: { ancho?: number; contenido: InformeBlock[] }[] }
  | { type: "header"; contenido: InformeBlock[] }
  | { type: "footer"; contenido: InformeBlock[] }
  | { type: "hoja"; orientacion: HojaOrientacion; contenido: InformeBlock[] }
  | { type: "firma"; src: string; width?: number; etiqueta?: string };

/** Prefijo que marca una celda de tabla cuyo valor es una URL de imagen (ver
 * tabla-snapshot.ts) en vez de texto plano. */
export const CELDA_IMAGEN_PREFIJO = "img:";

const TABLA_OPEN = "[[tabla]]";
const TABLA_CLOSE = "[[/tabla]]";
const CAJA_OPEN = "{caja}";
const CAJA_CLOSE = "{/caja}";
const HOJA_OPEN_RE = /^\{hoja(?::(landscape|portrait))?\}$/i;
const HOJA_CLOSE = "{/hoja}";
const FIRMA_LINE_RE = /^\{firma(?::(\d+))?\}(.+)\{\/firma\}$/i;
/** Prefijo de celda mergeada: {{m:2x3}}texto → rowspan 2, colspan 3. */
const CELDA_MERGE_RE = /^\{\{m:(\d+)x(\d+)\}\}(.*)$/s;
/** Marcador de celda cubierta por un merge (no se pinta). */
const CELDA_COVERED = "{{:}}";
const ALIGN_OPEN_RE = /^\{(left|center|right|justify)\}$/i;
const ALIGN_CLOSE_RE = /^\{\/(left|center|right|justify)\}$/i;
const INDENT_OPEN = "{indent}";
const INDENT_CLOSE = "{/indent}";
const LINEA_TAG = "{linea}";
const FORMULA_OPEN = "{formula}";
const FORMULA_CLOSE = "{/formula}";
const HEADER_TXT_OPEN = "{header-texto}";
const HEADER_TXT_CLOSE = "{/header-texto}";
const FOOTER_TXT_OPEN = "{footer-texto}";
const FOOTER_TXT_CLOSE = "{/footer-texto}";
const COLUMNAS_OPEN = "{columnas}";
const COLUMNAS_CLOSE = "{/columnas}";
const COLUMNA_OPEN_RE = /^\{columna(?::(\*|\d+))?\}$/;
const COLUMNA_CLOSE = "{/columna}";
const HEADER_OPEN = "{header}";
const HEADER_CLOSE = "{/header}";
const FOOTER_OPEN = "{footer}";
const FOOTER_CLOSE = "{/footer}";
const BULLET_RE = /^-\s+(.*)$/;
const NUMBERED_RE = /^\d+\.\s+(.*)$/;
const SIZE_OPEN_RE = /^\{size:(\d+)\}/;
const SIZE_CLOSE = "{/size}";
const BR_TAG = "{br}";
const IMG_LINE_RE = /^\{imagen(?::(\d+))?\}(.+)\{\/imagen\}$/i;
const HEADER_IMG_RE = /^\{header-img(?::(\d+))?\}(.+)\{\/header-img\}$/i;
const FOOTER_IMG_RE = /^\{footer-img(?::(\d+))?\}(.+)\{\/footer-img\}$/i;

/** Etiquetas de estilo en línea — cada una se "prende/apaga" de forma
 * independiente con su propio par {tag}/{/tag}, por eso se combinan libre
 * (sin ambigüedad entre marcadores, cada etiqueta es un nombre distinto). */
const RUN_TAGS: { key: keyof ParagraphRun; open: string; close: string }[] = [
  { key: "bold", open: "{bold}", close: "{/bold}" },
  { key: "italic", open: "{italic}", close: "{/italic}" },
  { key: "underline", open: "{underline}", close: "{/underline}" },
  { key: "strike", open: "{strike}", close: "{/strike}" },
  { key: "superscript", open: "{sup}", close: "{/sup}" },
  { key: "subscript", open: "{sub}", close: "{/sub}" },
];

export function parseTablaCelda(raw: string): TablaCeldaInforme {
  const trimmed = raw.trim();
  if (trimmed === CELDA_COVERED) return { text: "", covered: true };
  const m = CELDA_MERGE_RE.exec(trimmed);
  if (m) {
    const rowSpan = Math.max(1, Number(m[1]) || 1);
    const colSpan = Math.max(1, Number(m[2]) || 1);
    return {
      text: m[3] ?? "",
      rowSpan: rowSpan > 1 ? rowSpan : undefined,
      colSpan: colSpan > 1 ? colSpan : undefined,
    };
  }
  return { text: trimmed };
}

export function serializeTablaCelda(cell: TablaCeldaInforme | string): string {
  if (typeof cell === "string") return cell;
  if (cell.covered) return CELDA_COVERED;
  const rs = cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : 0;
  const cs = cell.colSpan && cell.colSpan > 1 ? cell.colSpan : 0;
  if (rs || cs) return `{{m:${rs || 1}x${cs || 1}}}${cell.text}`;
  return cell.text;
}

function parseTablaRow(line: string): TablaCeldaInforme[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => parseTablaCelda(cell));
}

/** Convierte texto con etiquetas {bold}/{italic}/{underline}/{strike}/{sup}/
 * {sub}/{size:N} en una lista de runs. Cada etiqueta prende/apaga su propio
 * estilo de forma independiente (no son pares que deban "calzar" con
 * contenido, son interruptores), así que combinarlas en el mismo tramo de
 * texto funciona sin importar el orden de apertura/cierre. */
export function parseInlineRuns(text: string): ParagraphRun[] {
  const runs: ParagraphRun[] = [];
  const active: Partial<Record<keyof ParagraphRun, boolean>> = {};
  let activeSize: number | undefined;
  let buf = "";

  const flush = () => {
    if (buf) {
      const run: ParagraphRun = { text: buf };
      for (const { key } of RUN_TAGS) {
        if (active[key]) (run as any)[key] = true;
      }
      if (activeSize) run.fontSize = activeSize;
      runs.push(run);
    }
    buf = "";
  };

  let i = 0;
  while (i < text.length) {
    const sizeOpenMatch = text.slice(i).match(SIZE_OPEN_RE);
    if (sizeOpenMatch) {
      flush();
      activeSize = Number(sizeOpenMatch[1]);
      i += sizeOpenMatch[0].length;
      continue;
    }
    if (text.startsWith(SIZE_CLOSE, i)) {
      flush();
      activeSize = undefined;
      i += SIZE_CLOSE.length;
      continue;
    }
    if (text.startsWith(BR_TAG, i)) {
      // No hace falta flush(): un salto de línea no cambia el estilo activo,
      // solo agrega un carácter de línea nueva al texto en curso.
      buf += "\n";
      i += BR_TAG.length;
      continue;
    }

    let matched = false;
    for (const { key, open, close } of RUN_TAGS) {
      if (text.startsWith(open, i)) {
        flush();
        active[key] = true;
        i += open.length;
        matched = true;
        break;
      }
      if (text.startsWith(close, i)) {
        flush();
        active[key] = false;
        i += close.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    buf += text[i];
    i += 1;
  }
  flush();

  return runs.length > 0 ? runs : [{ text: "" }];
}

/** Reconstruye el texto plano (con etiquetas {tag}) a partir de los runs,
 * abriendo/cerrando solo los que cambian entre un run y el siguiente. */
function serializeRuns(runs: ParagraphRun[]): string {
  let out = "";
  const active: Partial<Record<keyof ParagraphRun, boolean>> = {};
  let activeSize: number | undefined;

  const runsConCentinela: (ParagraphRun | null)[] = [...runs, null];

  for (const run of runsConCentinela) {
    const want = run ?? ({} as ParagraphRun);

    // Cerrar los que estaban activos y ya no se necesitan (orden inverso).
    for (const { key, close } of [...RUN_TAGS].reverse()) {
      if (active[key] && !want[key]) {
        out += close;
        active[key] = false;
      }
    }
    if (activeSize !== undefined && activeSize !== want.fontSize) {
      out += SIZE_CLOSE;
      activeSize = undefined;
    }

    // Abrir los nuevos que hagan falta.
    if (want.fontSize !== undefined && want.fontSize !== activeSize) {
      out += `{size:${want.fontSize}}`;
      activeSize = want.fontSize;
    }
    for (const { key, open } of RUN_TAGS) {
      if (!active[key] && want[key]) {
        out += open;
        active[key] = true;
      }
    }

    // Un \n real dentro del texto (de un {br}) se serializa como {br} y no
    // como salto de línea físico — si no, al guardar y volver a parsear el
    // archivo, la línea siguiente se uniría con espacio (el comportamiento
    // normal de continuar un párrafo) y el salto de línea se perdería.
    if (run) out += run.text.replace(/\n/g, BR_TAG);
  }

  return out;
}

/** Quita comentarios del autor ANTES de parsear — no aparecen en la vista
 * previa ni en el PDF (a diferencia de {caja}, no son un bloque visible).
 * Los bloques {caja}/{header}/{footer}/{columna} llaman a parseInforme() de
 * forma recursiva sobre texto ya sin comentarios (se quitan una sola vez acá,
 * antes de dividir en líneas) — llamarlo de nuevo en la recursión es
 * inofensivo, ya no queda nada que quitar.
 * - Bloque: &* ... *& (puede abarcar varias líneas, incluso tags completos).
 * - Línea: &&& hasta el final de esa línea. */
function quitarComentarios(source: string): string {
  const sinBloques = source.replace(/&\*[\s\S]*?\*&/g, "");
  return sinBloques.replace(/&&&.*$/gm, "");
}

export function parseInforme(source: string): InformeBlock[] {
  const lines = quitarComentarios(source).replace(/\r\n/g, "\n").split("\n");
  const blocks: InformeBlock[] = [];
  let paragraphBuf: string[] = [];
  // A diferencia de paragraphBuf, currentAlign NO se limpia en cada párrafo:
  // {center}...{/center} debe aplicar a TODOS los párrafos que contiene,
  // incluso si hay líneas en blanco entre ellos — solo el cierre explícito
  // {/center} (u otro bloque como un encabezado) termina la región.
  let currentAlign: ParagraphAlign | undefined;
  // Misma lógica que currentAlign (persiste entre párrafos, se combina libre
  // con la alineación — son dos toggles independientes).
  let currentIndent = false;

  const flushParagraph = () => {
    const text = paragraphBuf.join(" ").trim();
    if (text) {
      blocks.push({
        type: "paragraph",
        runs: parseInlineRuns(text),
        align: currentAlign,
        indent: currentIndent || undefined,
      });
    }
    paragraphBuf = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === TABLA_OPEN) {
      flushParagraph();
      currentAlign = undefined;
      currentIndent = false;
      i++;
      const titulo = (lines[i] || "").trim();
      i++;
      const filas: TablaCeldaInforme[][] = [];
      while (i < lines.length && lines[i].trim() !== TABLA_CLOSE) {
        const rowLine = lines[i].trim();
        if (rowLine) filas.push(parseTablaRow(rowLine));
        i++;
      }
      i++; // saltar [[/tabla]]
      const columnas = filas[0] || [];
      const dataRows = filas.slice(1);
      blocks.push({ type: "tabla", titulo, columnas, filas: dataRows });
      continue;
    }

    const hojaMatch = HOJA_OPEN_RE.exec(trimmed);
    if (hojaMatch) {
      flushParagraph();
      currentAlign = undefined;
      currentIndent = false;
      i++;
      const inner: string[] = [];
      let depth = 1;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (HOJA_OPEN_RE.test(t)) depth++;
        else if (t === HOJA_CLOSE) {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        inner.push(lines[i]);
        i++;
      }
      const orientacion = (hojaMatch[1]?.toLowerCase() === "portrait" ? "portrait" : "landscape") as
        | "portrait"
        | "landscape";
      blocks.push({ type: "hoja", orientacion, contenido: parseInforme(inner.join("\n")) });
      continue;
    }

    const firmaMatch = FIRMA_LINE_RE.exec(trimmed);
    if (firmaMatch) {
      flushParagraph();
      currentAlign = undefined;
      currentIndent = false;
      const width = firmaMatch[1] ? Number(firmaMatch[1]) : undefined;
      blocks.push({
        type: "firma",
        src: firmaMatch[2].trim(),
        width: width && Number.isFinite(width) ? width : undefined,
      });
      i++;
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      flushParagraph();
      currentAlign = undefined;
      currentIndent = false;
      const level = (trimmed.match(/^#+/)?.[0].length ?? 1) as 1 | 2 | 3;
      const text = trimmed.replace(/^#{1,3}\s+/, "");
      blocks.push({ type: "heading", level, text });
      i++;
      continue;
    }

    if (trimmed === CAJA_OPEN) {
      flushParagraph();
      currentAlign = undefined;
      currentIndent = false;
      i++;
      const inner: string[] = [];
      let depth = 1;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === CAJA_OPEN) depth++;
        else if (t === CAJA_CLOSE) {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        inner.push(lines[i]);
        i++;
      }
      blocks.push({ type: "caja", contenido: parseInforme(inner.join("\n")) });
      continue;
    }

    if (trimmed === LINEA_TAG) {
      flushParagraph();
      blocks.push({ type: "linea" });
      i++;
      continue;
    }

    if (trimmed === FORMULA_OPEN) {
      flushParagraph();
      const alignFormula = currentAlign;
      currentAlign = undefined;
      currentIndent = false;
      i++;
      const inner: string[] = [];
      while (i < lines.length && lines[i].trim() !== FORMULA_CLOSE) {
        inner.push(lines[i]);
        i++;
      }
      i++; // saltar {/formula}
      blocks.push({ type: "formula", latex: inner.join("\n").trim(), align: alignFormula });
      continue;
    }

    if (trimmed === HEADER_TXT_OPEN || trimmed === FOOTER_TXT_OPEN) {
      flushParagraph();
      const esHeader = trimmed === HEADER_TXT_OPEN;
      const closeTag = esHeader ? HEADER_TXT_CLOSE : FOOTER_TXT_CLOSE;
      const align = currentAlign;
      currentAlign = undefined;
      currentIndent = false;
      i++;
      const inner: string[] = [];
      while (i < lines.length && lines[i].trim() !== closeTag) {
        inner.push(lines[i].trim());
        i++;
      }
      i++; // saltar el cierre
      const texto = inner.join(" ").trim();
      blocks.push({
        type: esHeader ? "header-texto" : "pie-texto",
        runs: parseInlineRuns(texto),
        align,
      });
      continue;
    }

    if (trimmed === COLUMNAS_OPEN) {
      flushParagraph();
      currentAlign = undefined;
      currentIndent = false;
      i++;
      const columnasResult: { ancho?: number; contenido: InformeBlock[] }[] = [];
      while (i < lines.length && lines[i].trim() !== COLUMNAS_CLOSE) {
        const colMatch = lines[i].trim().match(COLUMNA_OPEN_RE);
        if (!colMatch) {
          i++; // línea suelta (ej. en blanco) entre columnas — se ignora
          continue;
        }
        const anchoRaw = colMatch[1];
        const ancho = anchoRaw && anchoRaw !== "*" ? Number(anchoRaw) : undefined;
        i++;
        const inner: string[] = [];
        let depth = 1;
        while (i < lines.length) {
          const t = lines[i].trim();
          if (COLUMNA_OPEN_RE.test(t)) depth++;
          else if (t === COLUMNA_CLOSE) {
            depth--;
            if (depth === 0) {
              i++;
              break;
            }
          }
          inner.push(lines[i]);
          i++;
        }
        columnasResult.push({ ancho, contenido: parseInforme(inner.join("\n")) });
      }
      i++; // saltar {/columnas}
      blocks.push({ type: "columnas", columnas: columnasResult });
      continue;
    }

    if (trimmed === HEADER_OPEN || trimmed === FOOTER_OPEN) {
      flushParagraph();
      currentAlign = undefined;
      currentIndent = false;
      const esHeaderGenerico = trimmed === HEADER_OPEN;
      const openTag = esHeaderGenerico ? HEADER_OPEN : FOOTER_OPEN;
      const closeTag = esHeaderGenerico ? HEADER_CLOSE : FOOTER_CLOSE;
      i++;
      const inner: string[] = [];
      let depth = 1;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === openTag) depth++;
        else if (t === closeTag) {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        inner.push(lines[i]);
        i++;
      }
      blocks.push({
        type: esHeaderGenerico ? "header" : "footer",
        contenido: parseInforme(inner.join("\n")),
      });
      continue;
    }

    const imgMatch = trimmed.match(IMG_LINE_RE);
    if (imgMatch) {
      flushParagraph();
      blocks.push({
        type: "imagen",
        src: imgMatch[2].trim(),
        width: imgMatch[1] ? Number(imgMatch[1]) : undefined,
        align: currentAlign ?? "center",
      });
      i++;
      continue;
    }

    const headerImgMatch = trimmed.match(HEADER_IMG_RE);
    if (headerImgMatch) {
      flushParagraph();
      blocks.push({
        type: "header-imagen",
        src: headerImgMatch[2].trim(),
        height: headerImgMatch[1] ? Number(headerImgMatch[1]) : undefined,
      });
      i++;
      continue;
    }

    const footerImgMatch = trimmed.match(FOOTER_IMG_RE);
    if (footerImgMatch) {
      flushParagraph();
      blocks.push({
        type: "pie-imagen",
        src: footerImgMatch[2].trim(),
        height: footerImgMatch[1] ? Number(footerImgMatch[1]) : undefined,
      });
      i++;
      continue;
    }

    const bulletMatch = trimmed.match(BULLET_RE);
    const numberedMatch = trimmed.match(NUMBERED_RE);
    if (bulletMatch || numberedMatch) {
      flushParagraph();
      currentAlign = undefined;
      currentIndent = false;
      const ordered = !!numberedMatch;
      const itemRe = ordered ? NUMBERED_RE : BULLET_RE;
      const items: ParagraphRun[][] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(itemRe);
        if (!m) break;
        items.push(parseInlineRuns(m[1]));
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const alignOpenMatch = trimmed.match(ALIGN_OPEN_RE);
    if (alignOpenMatch && paragraphBuf.length === 0) {
      currentAlign = alignOpenMatch[1].toLowerCase() as ParagraphAlign;
      i++;
      continue;
    }

    if (ALIGN_CLOSE_RE.test(trimmed)) {
      flushParagraph();
      currentAlign = undefined;
      currentIndent = false;
      i++;
      continue;
    }

    if (trimmed === INDENT_OPEN && paragraphBuf.length === 0) {
      currentIndent = true;
      i++;
      continue;
    }

    if (trimmed === INDENT_CLOSE) {
      flushParagraph();
      currentIndent = false;
      i++;
      continue;
    }

    if (trimmed === "") {
      flushParagraph();
      i++;
      continue;
    }

    paragraphBuf.push(trimmed);
    i++;
  }
  flushParagraph();

  return blocks;
}

/** Serializa una tabla-snapshot al formato de texto, lista para insertar en
 * el cursor del editor. La primera fila de `filas` se trata como cabecera.
 * Las celdas pueden llevar merges (`{{m:RxC}}`) o marcadores de cobertura
 * (`{{:}}`). */
export function serializeTablaBlock(
  titulo: string,
  columnas: Array<TablaCeldaInforme | string>,
  filas: Array<Array<TablaCeldaInforme | string>>
): string {
  const lines = [
    TABLA_OPEN,
    titulo,
    `| ${columnas.map(serializeTablaCelda).join(" | ")} |`,
  ];
  for (const fila of filas) {
    lines.push(`| ${fila.map(serializeTablaCelda).join(" | ")} |`);
  }
  lines.push(TABLA_CLOSE);
  return lines.join("\n");
}

export function serializeInforme(blocks: InformeBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "heading") return `${"#".repeat(b.level)} ${b.text}`;
      if (b.type === "paragraph") {
        const alignOpen = b.align ? `{${b.align}}\n` : "";
        const alignClose = b.align ? `\n{/${b.align}}` : "";
        const indentOpen = b.indent ? `${INDENT_OPEN}\n` : "";
        const indentClose = b.indent ? `\n${INDENT_CLOSE}` : "";
        return `${indentOpen}${alignOpen}${serializeRuns(b.runs)}${alignClose}${indentClose}`;
      }
      if (b.type === "list") {
        return b.items
          .map((item, idx) => `${b.ordered ? `${idx + 1}.` : "-"} ${serializeRuns(item)}`)
          .join("\n");
      }
      if (b.type === "imagen") {
        const inner = `{imagen${b.width ? `:${b.width}` : ""}}${b.src}{/imagen}`;
        if (b.align && b.align !== "center") return `{${b.align}}\n${inner}\n{/${b.align}}`;
        return inner;
      }
      if (b.type === "header-imagen") {
        return `{header-img${b.height ? `:${b.height}` : ""}}${b.src}{/header-img}`;
      }
      if (b.type === "pie-imagen") {
        return `{footer-img${b.height ? `:${b.height}` : ""}}${b.src}{/footer-img}`;
      }
      if (b.type === "caja") {
        return `${CAJA_OPEN}\n${serializeInforme(b.contenido)}\n${CAJA_CLOSE}`;
      }
      if (b.type === "linea") {
        return LINEA_TAG;
      }
      if (b.type === "formula") {
        const inner = `${FORMULA_OPEN}\n${b.latex}\n${FORMULA_CLOSE}`;
        if (b.align && b.align !== "center") return `{${b.align}}\n${inner}\n{/${b.align}}`;
        return inner;
      }
      if (b.type === "header-texto" || b.type === "pie-texto") {
        const open = b.type === "header-texto" ? HEADER_TXT_OPEN : FOOTER_TXT_OPEN;
        const close = b.type === "header-texto" ? HEADER_TXT_CLOSE : FOOTER_TXT_CLOSE;
        const inner = `${open}\n${serializeRuns(b.runs)}\n${close}`;
        if (b.align) return `{${b.align}}\n${inner}\n{/${b.align}}`;
        return inner;
      }
      if (b.type === "columnas") {
        const cols = b.columnas
          .map((c) => {
            const anchoTag = c.ancho !== undefined ? `:${c.ancho}` : "";
            return `{columna${anchoTag}}\n${serializeInforme(c.contenido)}\n${COLUMNA_CLOSE}`;
          })
          .join("\n");
        return `${COLUMNAS_OPEN}\n${cols}\n${COLUMNAS_CLOSE}`;
      }
      if (b.type === "header" || b.type === "footer") {
        const open = b.type === "header" ? HEADER_OPEN : FOOTER_OPEN;
        const close = b.type === "header" ? HEADER_CLOSE : FOOTER_CLOSE;
        return `${open}\n${serializeInforme(b.contenido)}\n${close}`;
      }
      if (b.type === "hoja") {
        return `{hoja:${b.orientacion}}\n${serializeInforme(b.contenido)}\n${HOJA_CLOSE}`;
      }
      if (b.type === "firma") {
        return `{firma${b.width ? `:${b.width}` : ""}}${b.src}{/firma}`;
      }
      return serializeTablaBlock(b.titulo, b.columnas, b.filas);
    })
    .join("\n\n");
}
