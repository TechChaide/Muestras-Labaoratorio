/**
 * Convierte una fórmula en LaTeX a un SVG autocontenido (sin fuentes/CSS
 * externos) para poder incrustarla en el PDF vía el content type `svg` de
 * pdfmake. Usa mathjax-full con el adaptador "lite" (sin DOM real) — funciona
 * igual en el navegador y evita cualquier choque con la instancia de MathJax
 * (tex-chtml, vía <script> global) que ya usa mathjax-preview.tsx para la
 * vista en pantalla del editor de fórmulas de tablas: son dos mundos
 * completamente aislados entre sí.
 *
 * `fontCache: 'none'` es clave: por defecto MathJax-SVG define cada glifo una
 * sola vez en un <defs> y lo referencia con <use> entre fórmulas — eso rompe
 * en cuanto cada fórmula se convierte en un SVG independiente y aislado (como
 * acá, uno por bloque {formula}). Con 'none' cada SVG queda completo por sí
 * solo, a costa de un poco más de peso.
 */

// mathjax-full (parser TeX completo + AllPackages) pesa varios cientos de KB
// — se importa dinámicamente y solo la primera vez que un informe realmente
// tiene un bloque {formula}, para no inflar el bundle de TODA la página del
// editor de informes (que se usa constantemente aunque no haya fórmulas).
let documentSingleton: any = null;
let adaptorSingleton: any = null;
let cargaPromise: Promise<void> | null = null;

async function asegurarMathJax(): Promise<void> {
  if (documentSingleton) return;
  if (!cargaPromise) {
    cargaPromise = (async () => {
      const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, { AllPackages }] = await Promise.all([
        import("mathjax-full/js/mathjax.js"),
        import("mathjax-full/js/input/tex.js"),
        import("mathjax-full/js/output/svg.js"),
        import("mathjax-full/js/adaptors/liteAdaptor.js"),
        import("mathjax-full/js/handlers/html.js"),
        import("mathjax-full/js/input/tex/AllPackages.js"),
      ]);
      adaptorSingleton = liteAdaptor();
      RegisterHTMLHandler(adaptorSingleton);
      const texInput = new TeX({ packages: AllPackages });
      const svgOutput = new SVG({ fontCache: "none" });
      documentSingleton = mathjax.document("", { InputJax: texInput, OutputJax: svgOutput });
    })();
    cargaPromise.catch(() => {
      cargaPromise = null; // permitir reintentar si falló la carga
    });
  }
  return cargaPromise;
}

export interface FormulaSvgResult {
  svg: string;
  /** Ancho/alto "ex" reportados por MathJax, convertidos a puntos (1ex ≈ el
   * tamaño de fuente base que usamos, 11pt) — sirven para no pasarle a
   * pdfmake un tamaño arbitrario que deforme la fórmula. */
  widthPt: number;
  heightPt: number;
}

const PT_POR_EX = 5.5; // ~ fontSize 11pt * 0.5 (1ex suele rondar la mitad de la altura de fuente)

/** Convierte una fórmula LaTeX a SVG (carga mathjax-full de forma perezosa
 * la primera vez). Lanza si el LaTeX es inválido o si falló la carga — el
 * llamador (pdf.ts) decide qué mostrar en su lugar. */
export async function latexASvg(latex: string): Promise<FormulaSvgResult> {
  await asegurarMathJax();
  const node = documentSingleton.convert(latex, { display: true });
  const svg = adaptorSingleton.outerHTML(node) as string;

  const widthMatch = svg.match(/width="([\d.]+)ex"/);
  const heightMatch = svg.match(/height="([\d.]+)ex"/);
  const widthPt = widthMatch ? Number(widthMatch[1]) * PT_POR_EX : 100;
  const heightPt = heightMatch ? Number(heightMatch[1]) * PT_POR_EX : 20;

  return { svg, widthPt, heightPt };
}
