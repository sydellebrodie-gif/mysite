"use client";
export default function PrintButton() {
  return <button type="button" className="btn small no-print" onClick={() => window.print()}>הדפסה</button>;
}
