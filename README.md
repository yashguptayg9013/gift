# Yash Gupta — Portfolio

Personal portfolio for Yash Gupta, Business Analyst & Data Analyst. Built with Next.js (App Router), React 19 and Tailwind CSS v4.

## Editing content

Everything on the page — bio, stats, projects, skills, education and links — lives in [`app/data.ts`](app/data.ts). Edit that file and the page updates; no component changes needed.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint
```

## Structure

```
app/
  data.ts                 # all portfolio content
  page.tsx                # single-page layout (hero, about, work, toolkit, education, contact)
  layout.tsx              # fonts, metadata, no-flash theme script
  globals.css             # colour tokens (light/dark), reveal + link animations
  icon.svg                # favicon
  components/
    ThemeToggle.tsx       # light/dark switch, remembered in localStorage
    Reveal.tsx            # fade-in on scroll
```

## Deploy

Push to GitHub and import the repo in [Vercel](https://vercel.com/new) — no configuration required.
