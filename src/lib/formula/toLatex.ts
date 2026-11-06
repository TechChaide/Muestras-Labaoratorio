import type { FormulaNode } from "./types";

/** Escapa identificadores para LaTeX (\mathrm{Nombre}). */
function latexIdent(name: string): string {
  const safe = name.replace(/([_%&#{}])/g, "\\$1");
  return `\\mathrm{${safe}}`;
}

function needsParens(node: FormulaNode, parentOp?: string): boolean {
  if (node.kind !== "binary") return false;
  if (!parentOp) return false;
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
  return (prec[node.op] || 0) < (prec[parentOp] || 0);
}

function wrap(inner: string, node: FormulaNode, parentOp?: string) {
  return needsParens(node, parentOp) ? `\\left(${inner}\\right)` : inner;
}

/** Convierte AST → LaTeX (misma semántica que el intérprete). */
export function astToLatex(node: FormulaNode, parentOp?: string): string {
  switch (node.kind) {
    case "number":
      return String(node.value);
    case "ref":
      return latexIdent(node.name);
    case "unary":
      return `-${astToLatex(node.arg, "*")}`;
    case "binary": {
      if (node.op === "/") {
        return `\\frac{${astToLatex(node.left)}}{${astToLatex(node.right)}}`;
      }
      if (node.op === "^") {
        return `${astToLatex(node.left, "^")}^{${astToLatex(node.right)}}`;
      }
      const compareTex: Record<string, string> = {
        ">": ">",
        "<": "<",
        ">=": "\\geq ",
        "<=": "\\leq ",
        "=": "=",
        "<>": "\\neq ",
      };
      if (compareTex[node.op]) {
        return `${astToLatex(node.left, node.op)}${compareTex[node.op]}${astToLatex(node.right, node.op)}`;
      }
      const opTex = node.op === "*" ? "\\cdot " : ` ${node.op} `;
      const body = `${astToLatex(node.left, node.op)}${opTex}${astToLatex(node.right, node.op)}`;
      return wrap(body, node, parentOp);
    }
    case "call": {
      const args = node.args.map((a) => astToLatex(a)).join(", ");
      switch (node.name) {
        case "avg":
          return `\\operatorname{media}\\left(${args}\\right)`;
        case "sum":
          return `\\sum\\left(${args}\\right)`;
        case "min":
          return `\\min\\left(${args}\\right)`;
        case "max":
          return `\\max\\left(${args}\\right)`;
        case "abs":
          return `\\left|${astToLatex(node.args[0])}\\right|`;
        case "sqrt":
          return `\\sqrt{${astToLatex(node.args[0])}}`;
        case "pow":
          return `${astToLatex(node.args[0], "^")}^{${astToLatex(node.args[1])}}`;
        case "median":
          return `\\operatorname{mediana}\\left(${args}\\right)`;
        case "mode":
          return `\\operatorname{moda}\\left(${args}\\right)`;
        case "stdev":
          return `\\sigma\\left(${args}\\right)`;
        case "roundup":
          return node.args.length > 1
            ? `\\operatorname{redondear.m\\'{a}s}\\left(${args}\\right)`
            : `\\left\\lceil ${astToLatex(node.args[0])} \\right\\rceil`;
        case "rounddown":
          return node.args.length > 1
            ? `\\operatorname{redondear.menos}\\left(${args}\\right)`
            : `\\left\\lfloor ${astToLatex(node.args[0])} \\right\\rfloor`;
        case "round":
          return `\\operatorname{redondear}\\left(${args}\\right)`;
        case "mround":
          return `\\operatorname{redond.mult}\\left(${args}\\right)`;
        case "if":
          return `\\operatorname{si}\\left(${args}\\right)`;
        case "normpdf":
          return `\\operatorname{f_{\\mathcal{N}}}\\left(${args}\\right)`;
        default:
          return `\\operatorname{fn}\\left(${args}\\right)`;
      }
    }
    default:
      return "";
  }
}
