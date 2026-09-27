import data from "@/content/pages.json";

export type LegacyScript = { id: string; src?: string; code?: string };

export type LegacyPage = {
  meta: { title: string; description: string; lang: string; canonical: string };
  bodyClass: string;
  stylesheets: { href: string; media: string }[];
  styles: { id: string | null; css: string }[];
  jsonLd: string[];
  scripts: LegacyScript[];
  html: string;
};

const pages = data as Record<string, LegacyPage>;

export function getPage(slug: string[] = []): LegacyPage | undefined {
  return pages[slug.join("/")];
}

export function allSlugs(): string[][] {
  return Object.keys(pages).map((route) => (route ? route.split("/") : []));
}
