import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegacyScripts from "@/components/LegacyScripts";
import { allSlugs, getPage } from "@/lib/pages";

type Props = { params: Promise<{ slug?: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return allSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = getPage((await params).slug);
  if (!page) return {};
  return {
    title: page.meta.title,
    description: page.meta.description,
    alternates: page.meta.canonical ? { canonical: page.meta.canonical } : undefined,
    openGraph: { title: page.meta.title, description: page.meta.description, siteName: "Sky Garden Access" },
  };
}

export default async function LegacyPageRoute({ params }: Props) {
  const page = getPage((await params).slug);
  if (!page) notFound();

  return (
    <>
      {page.stylesheets.map((s) => (
        <link key={s.href} rel="stylesheet" href={s.href} media={s.media} precedence="theme" />
      ))}
      <link rel="stylesheet" href="/css/overrides.css" precedence="overrides" />
      {page.styles.map((s, i) => (
        <style key={i} id={s.id ?? undefined} dangerouslySetInnerHTML={{ __html: s.css }} />
      ))}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.body.className=${JSON.stringify(page.bodyClass)};document.documentElement.lang=${JSON.stringify(page.meta.lang)};`,
        }}
      />
      {page.jsonLd.map((json, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
      ))}
      <div id="legacy-root" style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: page.html }} />
      <LegacyScripts scripts={page.scripts} />
    </>
  );
}
