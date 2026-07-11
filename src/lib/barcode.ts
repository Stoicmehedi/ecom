/**
 * EAN-13 barcodes, generated in-house.
 *
 * We mint codes in the **in-store range** (prefix `20`), which GS1 reserves for
 * exactly this: codes a shop assigns itself. They will never collide with a
 * manufacturer's barcode, and no registration is needed. A product that arrives
 * with a real EAN keeps it — generation only fills the blank.
 *
 * Layout: `20` + 10 digits of payload + 1 check digit = 13.
 */

const PREFIX = "20";

/**
 * The EAN-13 check digit: weight the first 12 digits 1,3,1,3…, sum, and take
 * whatever gets you to the next multiple of ten. A scanner recomputes this and
 * rejects the code if it disagrees — which is the whole point of having it.
 */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error("EAN-13 needs exactly 12 digits before the check digit.");
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return Number(code[12]) === ean13CheckDigit(code.slice(0, 12));
}

/** Complete a 12-digit body into a valid EAN-13. */
export function toEan13(first12: string): string {
  return first12 + String(ean13CheckDigit(first12));
}

/**
 * A candidate barcode for a variant. `seq` should be unique and rising — the
 * variant id is ideal, and the salt lets us try again if a code is somehow taken.
 */
export function makeEan13(seq: number, salt = 0): string {
  const payload = String((seq + salt * 1_000_000_000) % 10_000_000_000).padStart(10, "0");
  return toEan13(PREFIX + payload);
}

// --------------------------------------------------------------- rendering

// The three EAN-13 digit alphabets. Which of L/G a left-hand digit uses is
// chosen by the leading digit's parity pattern — that is how 13 digits fit into
// a symbol that only encodes 12.
const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

/** The bar pattern as a 95-char string of 0/1 — guards included. */
export function ean13Bits(code: string): string {
  if (!isValidEan13(code)) throw new Error(`Not a valid EAN-13: ${code}`);
  const d = code.split("").map(Number);
  const parity = PARITY[d[0]];

  let bits = "101"; // start guard
  for (let i = 1; i <= 6; i++) {
    bits += parity[i - 1] === "L" ? L[d[i]] : G[d[i]];
  }
  bits += "01010"; // centre guard
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  bits += "101"; // end guard
  return bits;
}

/**
 * Render the barcode as inline SVG — no dependency, no image hosting, and it
 * stays crisp at any label size because it is vector.
 */
export function ean13Svg(
  code: string,
  { width = 1.6, height = 50, fontSize = 10 } = {},
): string {
  const bits = ean13Bits(code);
  const quiet = 11 * width; // the mandatory quiet zone; a scanner needs it
  const w = bits.length * width + quiet * 2;
  const h = height + fontSize + 4;

  let bars = "";
  bits.split("").forEach((bit, i) => {
    if (bit !== "1") return;
    // Guard bars run longer, into the digit row — that is spec, not decoration.
    const isGuard = i < 3 || (i >= 45 && i < 50) || i >= 92;
    const barH = isGuard ? height + fontSize / 2 : height;
    bars += `<rect x="${(quiet + i * width).toFixed(2)}" y="0" width="${width}" height="${barH.toFixed(2)}" />`;
  });

  const textY = h - 1;
  const t = (x: number, s: string, anchor = "middle") =>
    `<text x="${x.toFixed(2)}" y="${textY}" font-family="monospace" font-size="${fontSize}" text-anchor="${anchor}">${s}</text>`;

  // Human-readable line: leading digit outside, then the two halves.
  const left = quiet + 3 * width;
  const centre = quiet + 50 * width;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="#000">
<rect x="0" y="0" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="#fff"/>
${bars}
${t(quiet - 2 * width, code[0], "end")}
${t(left + 21 * width, code.slice(1, 7))}
${t(centre + 21 * width, code.slice(7))}
</svg>`;
}
