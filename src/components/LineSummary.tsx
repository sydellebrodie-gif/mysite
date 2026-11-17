"use client";
import type { Customization, Product } from "@/lib/types";
import { summarize } from "@/lib/customization";

export default function LineSummary({ product, custom }: { product: Product; custom: Customization }) {
  const thumbs = Object.values(custom.images).flat().filter((i) => i.thumb);
  return (
    <div className="line-summary">
      {thumbs.length > 0 && (
        <div className="mini-thumbs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {thumbs.slice(0, 6).map((t, k) => <img key={k} src={t.thumb} alt="" />)}
        </div>
      )}
      <ul>{summarize(product, custom).map((s, k) => <li key={k}>{s}</li>)}</ul>
    </div>
  );
}
