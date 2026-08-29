import { tokenize } from "./tokenize";
import type {
  FormulaNode,
  FormulaParseOutcome,
  SupportedFunction,
} from "./types";
import { FUNCTION_ALIASES } from "./types";

const resolveFn = (name: string): SupportedFunction | null =>
  FUNCTION_ALIASES[name.toLowerCase()] ?? null;

/**
 * Parser recursivo descendente.
 * Precedencia: ^ > * / > + - ; unario - ; llamadas fn(a,b)
 */
export function parseExpression(input: string): FormulaParseOutcome {
  const { tokens, error } = tokenize(input);
  if (error) return { ok: false, error };
  if (tokens.length === 0) return { ok: false, error: "Expresión vacía" };

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const expectOp = (value: string) => {
    const t = peek();
    if (!t || t.type !== "op" || t.value !== value) {
      throw new Error(`Se esperaba '${value}'`);
    }
    consume();
  };

  const collectRefs = (node: FormulaNode, set: Set<string>) => {
    switch (node.kind) {
      case "ref":
        set.add(node.name);
        break;
      case "unary":
        collectRefs(node.arg, set);
        break;
      case "binary":
        collectRefs(node.left, set);
        collectRefs(node.right, set);
        break;
      case "call":
        node.args.forEach((a) => collectRefs(a, set));
        break;
      default:
        break;
    }
  };

  const parsePrimary = (): FormulaNode => {
    const t = peek();
    if (!t) throw new Error("Expresión incompleta");

    if (t.type === "number") {
      consume();
      return { kind: "number", value: t.value };
    }

    if (t.type === "ident") {
      consume();
      const name = t.value;
      if (peek()?.type === "op" && peek()?.value === "(") {
        const fn = resolveFn(name);
        if (!fn) {
          throw new Error(`Función no soportada: ${name}`);
        }
        consume(); // (
        const args: FormulaNode[] = [];
        if (!(peek()?.type === "op" && peek()?.value === ")")) {
          args.push(parseExpr());
          while (peek()?.type === "op" && peek()?.value === ",") {
            consume();
            args.push(parseExpr());
          }
        }
        expectOp(")");
        if (fn === "pow" && args.length !== 2) {
          throw new Error("pow(base, exponente) requiere 2 argumentos");
        }
        if ((fn === "abs" || fn === "sqrt") && args.length !== 1) {
          throw new Error(`${fn}(x) requiere 1 argumento`);
        }
        if (
          (fn === "avg" ||
            fn === "sum" ||
            fn === "min" ||
            fn === "max" ||
            fn === "median" ||
            fn === "mode" ||
            fn === "stdev") &&
          args.length < 1
        ) {
          throw new Error(`${fn}(...) requiere al menos 1 argumento`);
        }
        return { kind: "call", name: fn, args };
      }
      return { kind: "ref", name };
    }

    if (t.type === "op" && t.value === "(") {
      consume();
      const inner = parseExpr();
      expectOp(")");
      return inner;
    }

    if (t.type === "op" && t.value === "-") {
      consume();
      return { kind: "unary", op: "-", arg: parsePrimary() };
    }

    throw new Error(`Token inesperado: ${t.raw}`);
  };

  const parsePower = (): FormulaNode => {
    let left = parsePrimary();
    while (peek()?.type === "op" && peek()?.value === "^") {
      consume();
      const right = parsePrimary();
      left = { kind: "binary", op: "^", left, right };
    }
    return left;
  };

  const parseTerm = (): FormulaNode => {
    let left = parsePower();
    while (peek()?.type === "op" && (peek()?.value === "*" || peek()?.value === "/")) {
      const op = consume().value as "*" | "/";
      const right = parsePower();
      left = { kind: "binary", op, left, right };
    }
    return left;
  };

  const parseExpr = (): FormulaNode => {
    let left = parseTerm();
    while (peek()?.type === "op" && (peek()?.value === "+" || peek()?.value === "-")) {
      const op = consume().value as "+" | "-";
      const right = parseTerm();
      left = { kind: "binary", op, left, right };
    }
    return left;
  };

  try {
    const ast = parseExpr();
    if (pos < tokens.length) {
      return { ok: false, error: `Sobra texto desde '${tokens[pos].raw}'` };
    }
    const refs = new Set<string>();
    collectRefs(ast, refs);
    return { ok: true, ast, refs: [...refs] };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al parsear la expresión",
    };
  }
}
