import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatILS } from "@/lib/format";
import { isPurchasable } from "@/lib/pricing";

export function Thumb({ src, title }: { src?: string; title: string }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="card-img" src={src} alt="" loading="lazy" />
    : <div className="card-img placeholder" aria-hidden="true">{title.slice(0, 1)}</div>;
}

export default function ProductCard({ p }: { p: Product }) {
  const can = isPurchasable(p);
  return (
    <Link href={`/products/${p.slug}`} className="card">
      <Thumb src={p.images[0]} title={p.name} />
      <div className="card-body">
        <h3>{p.name}</h3>
        <p className="price">{formatILS(p.priceAgorot)}</p>
        {p.deal && <span className="tag">{p.deal.qty} ב־{formatILS(p.deal.priceAgorot)}</span>}
        {!can && <span className="tag muted">{p.isAvailable ? "אזל מהמלאי" : "בקרוב"}</span>}
      </div>
    </Link>
  );
}
