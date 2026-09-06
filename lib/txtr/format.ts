// ─── Txtr — number formatting ────────────────────────────────────────────────
// Hermes ships without full Intl in some configurations, so we never call
// Number.prototype.toLocaleString() — the web build's thousands separators are
// reproduced by hand here.

export function formatNum(n: number): string {
  const rounded = Math.round(n);
  const neg = rounded < 0;
  const digits = String(Math.abs(rounded));
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    const fromEnd = digits.length - i;
    out += digits[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) out += ',';
  }
  return neg ? `-${out}` : out;
}
