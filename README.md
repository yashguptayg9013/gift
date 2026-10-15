# i20 AFTER DARK

**HYUNDAI i20 — A CINEMATIC EXPERIENCE.** A scroll-driven, art-directed portrait of a Hyundai i20 Sportz iMT.

> This is an independent, non-commercial owner project. It is not affiliated with, endorsed by, or sponsored by Hyundai Motor Company.

The site works and looks finished before any photographs exist. Every image slot shows a labelled line-drawing placeholder. Drop a real photo at the expected path and it replaces the placeholder automatically, with no code changes.

---

## Quick start

Requires Node.js ≥ 20.9 (developed on Node 22, npm 10).

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Development server with hot reload             |
| `npm run lint`      | ESLint (Next.js core-web-vitals + TypeScript)  |
| `npm run typecheck` | `tsc --noEmit`                                 |
| `npm run build`     | Production build (the page is fully static)    |
| `npm run start`     | Serve the production build                     |
| `npm run check`     | lint + typecheck + build in one go             |

## Stack

| Package                       | Why                                                            |
| ----------------------------- | -------------------------------------------------------------- |
| `next` 16 (App Router), `react` 19, TypeScript | Framework. Server Components by default        |
| `tailwindcss` 4               | Styling and design tokens (`src/app/globals.css`)              |
| `gsap` + `@gsap/react`        | Every scroll and timeline animation (ScrollTrigger included)   |
| `lenis`                       | Smooth wheel scrolling, driven by GSAP's ticker                |
| `motion` (formerly Framer Motion) | Only the mobile menu and the gallery lightbox              |
| `lucide-react`                | Interface icons                                                |

Three.js is **not** included. There is no licensed model of this specific car, and a generic 3D car would misrepresent it. The site is complete without it (see *Known limitations*).

## The film, in running order

| # | Section | File | Motion |
| - | ------- | ---- | ------ |
| 01 | **Opening**: "BUILT TO MOVE." | `components/hero/` | GSAP timeline: black → technical type → light beam uncovers the car → camera settles → title rises → scroll cue. Scroll pushes the camera in and fades to black |
| — | Manifesto | `sections/Manifesto.tsx` | Words brighten as you read them |
| 02 | **The Machine** (`#the-car`) | `sections/Machine.tsx` | Pinned (desktop): a small window opens to full screen while the camera tracks sideways |
| 03 | **The Silhouette** | `sections/Silhouette.tsx` | Pinned (desktop): front → side → rear → close-up, each wiping over the last. Explicitly numbered views, not a fake spin |
| — | Frame sequence (optional) | `sections/Sequence.tsx` | Appears only if you add frames |
| 04 | **The Details** (`#details`) | `sections/Details.tsx` | Asymmetric layout, mask reveals, parallax |
| 05 | **The Cockpit** (`#the-cockpit`) + Bose audio | `sections/Cockpit.tsx`, `Sound*.tsx` | Decorative waveform; optional browser-generated demo tone |
| 06 | **The Drive** | `sections/Drive.tsx` | Sticky frame with title cards passing over it; uses video if supplied |
| 07 | **The Build** (`#the-build`) | `sections/Build.tsx` | Sticky image panel that follows the active entry |
| 08 | **Specification** (`#specification`) | `sections/Specification.tsx` | Owner-supplied values only |
| 09 | **Gallery** (`#gallery`) | `components/gallery/` | Editorial grid + lightbox (keyboard, swipe, Esc) |
| 10 | **Final Frame** | `sections/FinalFrame.tsx` | Rises out of black; **Replay experience** cuts to black and reruns the opening |

---

## 1. Adding your photographs

All image paths live in **`src/data/media.ts`** (plus `gallery.ts` and `modifications.ts`). Put files in `/public` at exactly these paths:

```
public/
  images/
    hero/            hero-front.webp                        ← opening shot (front three-quarter, night)
    exterior/        exterior-rear-three-quarter.webp       ← The Machine, gallery, build log
                     exterior-front.webp                    ← Silhouette 01, gallery
                     exterior-side.webp                     ← Silhouette 02, The Drive, gallery
                     exterior-rear.webp                     ← Silhouette 03, Final Frame
    details/         detail-headlight.webp  detail-grille.webp  detail-wheel.webp
                     detail-rear-light.webp  detail-door-handle.webp  detail-side-mirror.webp
                     detail-roof-antenna.webp  detail-rear-bumper.webp
    interior/        interior-dashboard.webp (also cropped for the steering wheel)
                     interior-front-seats.webp  interior-rear-seats.webp  interior-speaker.webp
    modifications/   modification-damping.webp              ← still a placeholder
    sequence/        frame-0001.webp, frame-0002.webp …     (optional)
  videos/            drive.mp4                                (optional)
```

The 16 supplied photos are already in place. They were trimmed of contact-sheet slicing edges, and #15 was split into front and rear seats. Several photos fill more than one slot, so replacing a file updates every section that uses it. To give a section a different photo, add the file and change its `src` in `src/data/media.ts`.

The extension doesn't matter: `hero-front.jpg` or `hero-front.png` fills the `hero-front.webp` slot too, so phone photos can go in as they are. Convert iPhone `.heic` files to JPG first, because browsers can't display HEIC.

**Uploading from a phone or browser (no coding):** on GitHub, open the folder (e.g. `public/images/hero/`) on your branch → **Add file → Upload files**. Rename each photo to its slot name (e.g. `hero-front.jpg`) and commit. Vercel redeploys with your photos in place.

Then:

1. **Export** as `.webp` or `.avif`. Use about 2400 px on the long edge for full-screen shots and about 1600 px for the rest. Next.js generates every responsive size and serves AVIF/WebP automatically.
2. **Restart** `npm run dev` if a placeholder doesn't swap immediately. On Vercel, the next deploy picks the files up.
3. **Reframe** without cropping files. Each image accepts `position` (desktop) and `mobilePosition` (mobile) as CSS `object-position`, e.g. `"50% 65%"` to keep the grille in frame on a phone.
4. **Write honest `alt` text** describing what is actually in the photo.
5. **Hide the placeholder tags** once you're done: set `showPlaceholderLabels: false` in `src/data/site.ts`.

You can point any slot at any file. To use one photo in two places, give both the same `src`.

**Video (optional).** `public/videos/drive.mp4` replaces the Drive still. Keep it short (10–20 s loop), muted (no audio track needed), H.264, 1080p, ideally under 8 MB. It plays only while on screen, never autoplays with reduced motion, and always has a pause button.

**Frame sequence (optional).** Shoot 60–120 frames from a tripod or a steady walk-around, all at the same framing and size (≤ 1600 px wide). Name them `frame-0001.webp`, `frame-0002.webp`, and so on, inside `public/images/sequence/`. A pinned, scroll-scrubbed section appears automatically. Mobile uses every 2nd frame (`sequence.mobileStep` in `media.ts`). Only use frames that genuinely form one continuous shot.

## 2. Changing vehicle specifications

Edit **`src/data/vehicle.ts`**:

```ts
{ label: "Model year", value: null, placeholder: "Add model year" },  // unknown → shown as an open field
{ label: "Model year", value: "2022", placeholder: "Add model year" }, // confirmed
```

- Use `value: null` until you've confirmed a value from your papers or manual. The site shows the placeholder as an obvious open field rather than guessing.
- Add or remove rows freely; order is preserved.
- `accessories: ["…", "…"]` lists installed accessories.
- `label` is the small "HYUNDAI i20 / SPORTZ iMT" tag used around the site.

## 3. Editing the modifications list (THE BUILD)

Edit **`src/data/modifications.ts`**. Each entry:

```ts
{
  category: "Audio",
  name: "Door speaker upgrade",
  description: "What changed and why.",
  image: { src: "/images/modifications/modification-audio.webp", alt: "…", placeholder: { art: "speaker" } },
  status: "Installed",          // "Installed" | "Planned" | "Stock" — omit until confirmed
  date: "March 2025",           // optional
  details: ["Front doors only"],// optional extra lines
}
```

- Delete `placeholder: true` from an entry once it has real content (that flag shows the "Placeholder entry" note).
- Entries without a `status` show "Status to confirm".
- Reorder entries to reorder the section. The numbering updates itself.

## 4. Changing the title, copy and typography

- **Title, description, nav labels and all section copy:** `src/data/site.ts`. Use `\n` in a headline to force a line break.
- **Colors, spacing and type scale:** design tokens at the top of `src/app/globals.css` (`--color-*` and the `t-*` utilities such as `t-hero` and `t-display-xl`).
- **Fonts:** `src/app/layout.tsx` loads Geist (text), Geist Mono (labels) and Barlow Condensed (headlines) through `next/font`. To swap the display face, import a different Google font and keep `variable: "--font-condensed"`:

  ```ts
  import { Oswald } from "next/font/google";
  const condensed = Oswald({ variable: "--font-condensed", subsets: ["latin"], weight: ["500", "600"] });
  ```

- **Audio section:** `site.copy.audio` (set `enabled: false` to hide it).

## 5. Deploying to Vercel

Nothing here costs money on Vercel's free Hobby plan. Don't add a custom domain until you've decided to.

1. Push this repository to GitHub (it already lives at `yashguptayg9013/gift`).
2. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and **Import** the repository.
3. Vercel detects Next.js. Keep the defaults (build `next build`, output automatic).
4. Optional: under *Environment Variables*, set `NEXT_PUBLIC_SITE_URL` to the final URL (used for social-sharing metadata). `.env.example` shows the format.
5. **Deploy.** Each push to the production branch redeploys, and other branches get preview URLs.

Adding photos later is just: put them in `/public/images/…`, commit, push.

## 6. Motion, accessibility and performance notes

- **Reduced motion** (OS setting): no smooth scrolling, no pinning, no parallax and no intro choreography. Everything is visible immediately. The Silhouette becomes a 2×2 grid.
- **No JavaScript:** all content renders server-side and stays visible. A safety timeout reveals the opening frame even if the animation layer fails.
- **Keyboard:** skip link, visible focus rings, nav links move focus to their section, and the mobile menu and lightbox trap focus, close on Esc, and return focus.
- **Touch:** native scrolling (Lenis only smooths mouse wheels), no hover-only information, swipe in the lightbox, no custom cursor.
- **Performance:** the page is statically prerendered. Only the hero image is preloaded, everything else lazy-loads. There are no scroll-driven React re-renders, the waveform idles only while on screen, and the grain is a single static texture.

## 7. Known limitations

- **No real photography yet.** Placeholders are generic, stylised line studies, labelled as placeholders, and not a depiction of your exact car. The experience improves dramatically once real photos are in.
- **No 3D model.** Deliberately omitted: no licensed, accurate model of this car is available.
- **Pinned scenes are desktop-only** (≥ 768 px). On phones the same scenes animate without pinning, which keeps native scrolling reliable.
- **The audio demo** is a synthesised tone made in your browser, labelled as such. It is not, and does not represent, the car's audio system.
- **The dev-only Next.js indicator** (the "N" badge bottom-left) appears only in `npm run dev`.
- `npm audit` reports advisories in the lint toolchain (`eslint-config-next` → `fast-glob` → `braces`). These are development-only and not shipped to the browser. The suggested `--force` fix would downgrade Next's lint config, so it was not applied.

## 8. Shot list: the photographs that will make this site

Shoot at **blue hour or night**, in an empty car park or a quiet road. Use a tripod, ISO as low as possible, and keep the headlights or DRLs on for exterior frames. Keep the background simple and dark, and wash and dry the car first.

| Slot | Shot | Tip |
| ---- | ---- | --- |
| Hero | Head-on, low (bumper height), centered, headlights on | Landscape **and** check it crops well to portrait. Leave dark space below for the title |
| The Machine | Front three-quarter, low, about 35 mm | The "hero car" angle, with a slight wheel turn toward the camera |
| Silhouette | Pure side profile, rear, front, all from the same height and distance | A long lens (70–85 mm) from further back keeps lines straight |
| Details | Headlight, grille, a body line catching light, wheel, tail light, interior trim | Use one hard light (a torch) raking across the surface |
| Cockpit | Dashboard from the rear seat; steering wheel; infotainment screen on | Night, cabin lights on; expose for the screen |
| Audio | Speaker grille close-up | Side light to show the perforation texture |
| Drive | The car on an open road at dusk | Parked or filmed safely and legally, never while you are driving |
| Final | Rear three-quarter at night, tail lights on | Leave space above the car for the headline |
| Video | 10–20 s steady, slow tracking shot | Gimbal or a passenger, filmed safely and legally |
| Build | One photo per modification, consistent background | Before/after pairs work well in the gallery |
