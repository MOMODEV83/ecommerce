# Sky Garden Access — Next.js

Site Sky Garden Access migré de WordPress vers Next.js (App Router, pages statiques).

- `legacy-html/` : export HTML d'origine du site WordPress
- `scripts/convert.mjs` : convertit l'export en données de page (`content/pages.json`)
- `app/[[...slug]]/page.tsx` : rend chaque page (CSS, contenu, scripts du thème)
- `public/` : CSS, JS, polices et images du thème

```bash
npm install
npm run convert   # après modification de legacy-html/
npm run dev
```
