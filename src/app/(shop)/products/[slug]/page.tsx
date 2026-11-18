import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCatalog } from "@/lib/catalog";
import ProductClient from "./ProductClient";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = (await getCatalog()).products.find((x) => x.slug === slug);
  return { title: p ? `${p.name} | מתנות בעיצוב אישי` : "מוצר לא נמצא" };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const cat = await getCatalog();
  const product = cat.products.find((p) => p.slug === slug);
  if (!product) notFound();
  return <ProductClient product={product} catalog={cat} />;
}
