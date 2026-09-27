# Sky Garden Access — Next.js

Site Sky Garden Access migré de WordPress vers Next.js (App Router, pages statiques).

- `legacy-html/` : pages HTML d'origine du site WordPress (export + pages récupérées en ligne)
- `scripts/crawl.mjs` : récupère sur le site WordPress les pages liées mais absentes de `legacy-html/`
- `scripts/import.mjs` : ajoute ces pages à `legacy-html/` et télécharge leurs images/CSS/JS dans `public/wp-content/`
- `scripts/convert.mjs` : convertit `legacy-html/` en données de page (`content/pages.json`)
- `app/[[...slug]]/page.tsx` : rend chaque page (CSS, contenu, scripts du thème)

```bash
npm install
npm run crawl && npm run import   # tant que le site WordPress est en ligne
npm run convert                   # après modification de legacy-html/
npm run dev
```
