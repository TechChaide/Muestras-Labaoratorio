import type {
  FormulaEvalOutcome,
  FormulaNode,
  FormulaValueMap,
} from "./types";

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 0) return (s[mid - 1] + s[mid]) / 2;
  return s[mid];
}

/** Moda: valor más frecuente; si empate, el menor de los empatados. */
function mode(values: number[]): number {
  const freq = new Map<number, number>();
  for (const v of values) freq.set(v, (freq.get(v) || 0) + 1);
  let best = values[0];
  let bestN = 0;
  for (const [v, n] of freq) {
    if (n > bestN || (n === bestN && v < best)) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

/** Desviación estándar muestral (n−1). Con n=1 → 0. */
function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const varSum = values.reduce((a, b) => a + (b - mean) ** 2, 0);
  return Math.sqrt(varSum / (values.length - 1));
}

/** REDONDEAR.MAS: alejándose de cero, a N decimales (0 = entero). */
function roundUp(x: number, digits = 0): number {
  const d = Math.trunc(digits);
  const f = Math.pow(10, d);
  if (x >= 0) return Math.ceil(x * f - 1e-10) / f;
  return Math.floor(x * f + 1e-10) / f;
}

/** REDONDEAR.MENOS: hacia cero, a N decimales (0 = entero). */
function roundDown(x: number, digits = 0): number {
  const d = Math.trunc(digits);
  const f = Math.pow(10, d);
  if (x >= 0) return Math.floor(x * f + 1e-10) / f;
  return Math.ceil(x * f - 1e-10) / f;
}

/** Redondeo estándar a n decimales (REDONDEAR de Excel). */
function roundToDecimals(x: number, decimales: number): number {
  const factor = Math.pow(10, Math.trunc(decimales));
  return Math.round(x * factor) / factor;
}

/** REDOND.MULT / MROUND: al múltiplo más cercano. */
function mround(number: number, multiple: number): number {
  if (multiple === 0) throw new Error("El múltiplo no puede ser 0");
  return Math.round(number / multiple) * multiple;
}

/** Densidad de probabilidad de la normal N(media, desvEst) evaluada en x. */
function normalPdf(x: number, media: number, desvEst: number): number {
  if (desvEst <= 0) throw new Error("La desviación estándar debe ser mayor a 0");
  const exponent = -((x - media) ** 2) / (2 * desvEst ** 2);
  return Math.exp(exponent) / (desvEst * Math.sqrt(2 * Math.PI));
}

function resolve(node: FormulaNode, values: FormulaValueMap): number {
  switch (node.kind) {
    case "number":
      return node.value;
    case "ref": {
      const v = values[node.name];
      if (v === null || v === undefined || Number.isNaN(Number(v))) {
        const err = new Error(`Falta valor para '${node.name}'`) as Error & {
          missing?: string;
        };
        err.missing = node.name;
        throw err;
      }
      return Number(v);
    }
    case "unary":
      return -resolve(node.arg, values);
    case "binary": {
      const l = resolve(node.left, values);
      const r = resolve(node.right, values);
      switch (node.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          if (r === 0) throw new Error("División por cero");
          return l / r;
        case "^":
          return Math.pow(l, r);
        case ">":
          return l > r ? 1 : 0;
        case "<":
          return l < r ? 1 : 0;
        case ">=":
          return l >= r ? 1 : 0;
        case "<=":
          return l <= r ? 1 : 0;
        case "=":
          return l === r ? 1 : 0;
        case "<>":
          return l !== r ? 1 : 0;
        default:
          throw new Error("Operador no soportado");
      }
    }
    case "call": {
      // SI: no resolver las dos ramas de antemano (evita errores en la no tomada).
      if (node.name === "if") {
        const cond = resolve(node.args[0], values);
        return cond !== 0 ? resolve(node.args[1], values) : resolve(node.args[2], values);
      }
      const args = node.args.map((a) => resolve(a, values));
      switch (node.name) {
        case "abs":
          return Math.abs(args[0]);
        case "sqrt":
          if (args[0] < 0) throw new Error("Raíz de número negativo");
          return Math.sqrt(args[0]);
        case "pow":
          return Math.pow(args[0], args[1]);
        case "sum":
          return args.reduce((a, b) => a + b, 0);
        case "avg":
          return args.reduce((a, b) => a + b, 0) / args.length;
        case "min":
          return Math.min(...args);
        case "max":
          return Math.max(...args);
        case "median":
          return median(args);
        case "mode":
          return mode(args);
        case "stdev":
          return stdev(args);
        case "roundup":
          return roundUp(args[0], args[1] ?? 0);
        case "rounddown":
          return roundDown(args[0], args[1] ?? 0);
        case "round":
          return roundToDecimals(args[0], args[1]);
        case "mround":
          return mround(args[0], args[1]);
        case "normpdf":
          return normalPdf(args[0], args[1], args[2]);
        default:
          throw new Error("Función no soportada");
      }
    }
    default:
      throw new Error("Nodo AST inválido");
  }
}

/** Evalúa un AST con un mapa de valores de referencias. */
export function evaluateAst(
  ast: FormulaNode,
  values: FormulaValueMap
): FormulaEvalOutcome {
  try {
    const value = resolve(ast, values);
    if (!Number.isFinite(value)) {
      return { ok: false, error: "Resultado no numérico" };
    }
    return { ok: true, value };
  } catch (e) {
    const err = e as Error & { missing?: string };
    return {
      ok: false,
      error: err.message || "Error de evaluación",
      missingRefs: err.missing ? [err.missing] : undefined,
    };
  }
}
