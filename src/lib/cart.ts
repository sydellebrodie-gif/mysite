"use client";
// הסל נשמר בדפדפן (localStorage), כדי שרענון או סגירה לא ימחקו אותו. המחיר תמיד מחושב מחדש.
import { useSyncExternalStore } from "react";
import type { CartLine, DeliveryMethod } from "./types";

const KEY = "gifts-cart-v1";
interface State { lines: CartLine[]; delivery: DeliveryMethod | null }
const EMPTY: State = { lines: [], delivery: null };

let state: State = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (Array.isArray(s.lines)) state = { lines: s.lines, delivery: s.delivery ?? null };
    }
  } catch { /* אחסון חסום: הסל יעבוד עד רענון */ }
}

function save(next: State) {
  state = next;
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); }
  catch { /* מלא או חסום */ }
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) { loaded = false; load(); listeners.forEach((l) => l()); }
  });
}

export function newLineId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const cart = {
  get: (): State => { load(); return state; },
  upsert(line: CartLine) {
    load();
    const i = state.lines.findIndex((l) => l.lineId === line.lineId);
    const lines = [...state.lines];
    if (i >= 0) lines[i] = line; else lines.push(line);
    save({ ...state, lines });
  },
  remove(lineId: string) { load(); save({ ...state, lines: state.lines.filter((l) => l.lineId !== lineId) }); },
  setQty(lineId: string, qty: number) {
    load();
    save({ ...state, lines: state.lines.map((l) => (l.lineId === lineId && l.kind === "product" ? { ...l, qty: Math.max(1, Math.min(99, qty)) } : l)) });
  },
  setDelivery(delivery: DeliveryMethod) { load(); save({ ...state, delivery }); },
  clear() { save(EMPTY); },
  find(lineId: string) { load(); return state.lines.find((l) => l.lineId === lineId); },
};

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

/** מחזיר null עד שהסל נטען בדפדפן (כדי לא להציג "הסל ריק" בטעות בטעינה) */
export function useCart(): State | null {
  return useSyncExternalStore(subscribe, () => cart.get(), () => null);
}
