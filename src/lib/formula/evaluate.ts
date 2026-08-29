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
        default:
          throw new Error("Operador no soportado");
      }
    }
    case "call": {
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
