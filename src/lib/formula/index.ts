export type {
  FormulaToken,
  FormulaNode,
  FormulaValueMap,
  FormulaParseResult,
  FormulaParseError,
  FormulaParseOutcome,
  FormulaEvalResult,
  FormulaEvalError,
  FormulaEvalOutcome,
  LiveFormulaDef,
  SupportedFunction,
} from "./types";
export {
  SUPPORTED_FUNCTIONS,
  FUNCTION_ALIASES,
  FUNCTION_SHORTCUTS,
  MATH_TEMPLATES,
} from "./types";
export { tokenize } from "./tokenize";
export { parseExpression, looksLikeLatex } from "./parse";
export { evaluateAst } from "./evaluate";
export { astToLatex } from "./toLatex";
export { formulaApi } from "./calc-api";
export type { FormulaCompileOutcome, FormulaCompileResult } from "./calc-api";
export {
  tableRefPrefix,
  qualifyAlias,
  parseQualifiedRef,
  isCrossTableRef,
  rewriteTableRefsInExpression,
} from "./cross-table";
export { colLetter, cellPositionRef, letterToCol, shiftRefsInExpression, computeAutofillShift, parseGroupAlias, tomaDeCelda, parseValorNumerico } from "./grid-utils";
export type {
  FormCellSnapshot,
  FormulaDraft,
  FormFormulaContext,
  FormulaValidationIssue,
} from "./formula-persistence";
export {
  buildRefMap,
  resolveRefToCell,
  resolveRefDetailed,
  cellRefToken,
  bindLiveFormulas,
  validateFormulaDrafts,
  loadFormFormulaContext,
  saveFormFormulaDrafts,
  purgeOrphanFormulasForTable,
  migrateFormulasOnTableReplace,
  rewriteTableRefsInDrafts,
  healStaleTableRefsInDrafts,
  tableDisplayName,
  isFormulaEligible,
} from "./formula-persistence";
export type { ResolveRefOutcome } from "./formula-persistence";
