import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCatalog } from "@/lib/catalog";
import BundleClient from "./BundleClient";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const b = (await getCatalog()).bundles.find((x) => x.slug === slug);
  return { title: b ? `${b.name} | מתנות בעיצוב אישי` : "מארז לא נמצא" };
}

export default async function BundlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const cat = await getCatalog();
  const bundle = cat.bundles.find((b) => b.slug === slug);
  if (!bundle) notFound();
  return <BundleClient bundle={bundle} catalog={cat} />;
}
