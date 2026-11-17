export function formatILS(agorot: number): string {
  const v = agorot / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(2)} ₪`;
}
