# Forever & Always 💌

A small website made as a gift for X. It's built with [Next.js](https://nextjs.org) and Tailwind CSS.

**Figma design:** https://www.figma.com/design/85fYxB14A94vobfaPiJbnU

## Sections

- **Hero** with your names and a live "we have been together for" counter
- **Our Story**, a timeline of milestones
- **Moments**, a photo gallery
- **Reasons I love you**
- **A love letter**
- **One little question**: the "No" button runs away, and "Yes" sets off a burst of hearts
- **Countdown** to your next anniversary, worked out from your start date

## Make it yours

Everything personal is in **`app/love.config.ts`**: names, initials, your start date, story, captions, reasons, the letter and the question.

To add photos, put them in `public/photos/` and set `image: "/photos/your-file.jpg"` on a moment in the config.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Put it online

Push to GitHub and import the repo on [Vercel](https://vercel.com/new). It deploys as a static site with no settings to change.
