/** Convierte índice de columna 1-based a letra Excel (1→A, 27→AA). */
export function colLetter(n: number): string {
  let x = n;
  let s = "";
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s || "A";
}

/** Token de referencia por posición cuando no hay alias. */
export function cellPositionRef(col: number, fila: number): string {
  return `${colLetter(col)}${fila}`;
}
