/**
 * Stylised line studies of a generic hatchback, used only while real
 * photographs are missing. They are intentionally abstract — not a
 * depiction of the owner's exact car — and are always labelled as
 * placeholders on the page.
 *
 * Gradients and patterns are defined once in <SvgDefs />.
 */

import type { ReactNode } from "react";
import type { PlaceholderArt } from "@/data/types";

const stroke = {
  stroke: "url(#ph-metal)",
  strokeWidth: 1.25,
  vectorEffect: "non-scaling-stroke" as const,
};
const fine = {
  stroke: "#c9ccd0",
  strokeOpacity: 0.35,
  strokeWidth: 1,
  fill: "none",
  vectorEffect: "non-scaling-stroke" as const,
};

function Wheel({ cx, cy }: { cx: number; cy: number }) {
  const spokes = Array.from({ length: 5 }, (_, i) => i * 72);
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r={92} fill="#050607" stroke="#2a2d32" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <circle r={66} fill="url(#ph-rim)" {...stroke} />
      <circle r={44} {...fine} strokeOpacity={0.18} />
      {spokes.map((angle) => (
        <g key={angle} transform={`rotate(${angle})`}>
          <path d="M-5 -14 L-9 -63" {...fine} strokeOpacity={0.55} />
          <path d="M5 -14 L9 -63" {...fine} strokeOpacity={0.55} />
        </g>
      ))}
      <circle r={13} fill="#0b0c0e" {...stroke} />
    </g>
  );
}

const SIDE: ReactNode = (
  <>
    <ellipse cx={790} cy={502} rx={720} ry={22} fill="url(#ph-floor)" />
    <path d="M20 500 H1580" stroke="#92969d" strokeOpacity={0.22} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    {/* body */}
    <path
      d="M196 455 C180 446 170 418 172 392 C174 366 186 344 214 330 C300 300 460 282 620 268 C700 200 770 140 840 112 C950 94 1110 96 1220 112 C1262 118 1290 126 1306 136 C1330 180 1350 240 1362 290 C1384 330 1392 400 1386 432 C1382 448 1368 455 1350 455 L1290 455 L1284 438 A108 108 0 1 0 1076 438 L1070 455 L530 455 L524 438 A108 108 0 1 0 316 438 L310 455 Z"
      fill="url(#ph-body)"
      {...stroke}
    />
    {/* glasshouse */}
    <path
      d="M650 262 C716 206 776 156 842 130 C950 114 1100 116 1206 128 C1238 132 1262 140 1276 150 L1262 196 C1254 222 1244 244 1232 252 C1040 254 820 258 650 262 Z"
      fill="url(#ph-glass)"
      {...stroke}
    />
    <path d="M928 121 L954 120 L946 259 L920 260 Z" fill="#08090b" />
    <path d="M1150 122 L1166 124 L1174 254 L1158 254 Z" fill="#08090b" />
    {/* character lines */}
    <path d="M226 326 C520 292 920 272 1336 252" {...fine} strokeOpacity={0.5} />
    <path d="M560 386 C820 366 1040 336 1300 304" {...fine} />
    <path d="M560 432 C780 428 960 424 1060 420" {...fine} strokeOpacity={0.2} />
    {/* door shut lines */}
    <path d="M642 266 C636 330 634 392 640 452" {...fine} />
    <path d="M936 262 L938 400 C940 430 962 448 1004 452" {...fine} />
    <rect x={770} y={288} width={46} height={7} rx={3.5} {...fine} />
    <rect x={1036} y={282} width={46} height={7} rx={3.5} {...fine} />
    {/* mirror */}
    <path d="M652 262 L614 246 C604 241 608 229 620 229 L670 236 Z" fill="#0b0c0e" {...stroke} />
    {/* lights */}
    <path d="M190 362 C222 342 270 328 330 318 L318 342 C272 350 230 362 196 378 Z" fill="url(#ph-lamp)" {...stroke} />
    <path d="M1310 142 L1344 214 L1358 270 L1342 262 C1330 222 1316 182 1300 152 Z" fill="url(#ph-red)" />
    <Wheel cx={420} cy={408} />
    <Wheel cx={1180} cy={408} />
  </>
);

/** Lower body shared by the front and rear views. */
const LOWER_BODY =
  "M262 672 C246 640 236 560 238 500 C240 440 252 400 280 380 C340 356 460 346 600 346 C740 346 860 356 920 380 C948 400 960 440 962 500 C964 560 954 640 938 672 Z";

function Tires() {
  return (
    <>
      <rect x={266} y={630} width={84} height={52} rx={8} fill="#050607" />
      <rect x={850} y={630} width={84} height={52} rx={8} fill="#050607" />
    </>
  );
}

const FRONT: ReactNode = (
  <>
    <ellipse cx={600} cy={684} rx={520} ry={20} fill="url(#ph-floor)" />
    <path d="M-600 682 H1800" stroke="#92969d" strokeOpacity={0.22} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    <Tires />
    {/* cabin + glass */}
    <path d="M300 378 L410 158 C470 100 730 100 790 158 L900 378 Z" fill="url(#ph-body)" {...stroke} />
    <path d="M350 364 L434 174 C500 146 700 146 766 174 L850 364 Z" fill="url(#ph-glass)" {...stroke} />
    {/* mirrors */}
    <path d="M304 350 L238 334 C224 330 220 358 236 364 L304 372 Z" fill="#0b0c0e" {...stroke} />
    <path d="M896 350 L962 334 C976 330 980 358 964 364 L896 372 Z" fill="#0b0c0e" {...stroke} />
    <path d={LOWER_BODY} fill="url(#ph-body)" {...stroke} />
    {/* hood creases */}
    <path d="M440 400 C480 372 540 362 600 360" {...fine} />
    <path d="M760 400 C720 372 660 362 600 360" {...fine} />
    {/* headlights */}
    <path d="M262 420 C300 410 380 402 444 402 L430 432 C370 436 300 444 256 454 Z" fill="url(#ph-lamp)" {...stroke} />
    <path d="M938 420 C900 410 820 402 756 402 L770 432 C830 436 900 444 944 454 Z" fill="url(#ph-lamp)" {...stroke} />
    {/* grille */}
    <path d="M384 470 L816 470 C806 520 788 558 758 580 L442 580 C412 558 394 520 384 470 Z" fill="url(#ph-mesh)" {...stroke} />
    <path d="M478 612 L722 612 L708 642 L492 642 Z" fill="#050607" {...stroke} />
    <path d="M276 560 L340 578 L330 620 L272 602 Z" {...fine} />
    <path d="M924 560 L860 578 L870 620 L928 602 Z" {...fine} />
    <path d="M262 600 C400 626 800 626 938 600" {...fine} strokeOpacity={0.2} />
  </>
);

const REAR: ReactNode = (
  <>
    <ellipse cx={600} cy={684} rx={520} ry={20} fill="url(#ph-floor)" />
    <path d="M-600 682 H1800" stroke="#92969d" strokeOpacity={0.22} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    <Tires />
    <path d="M300 384 L404 166 C470 112 730 112 796 166 L900 384 Z" fill="url(#ph-body)" {...stroke} />
    <path d="M374 300 L428 188 C500 162 700 162 772 188 L826 300 Z" fill="url(#ph-glass)" {...stroke} />
    {/* roof spoiler */}
    <path d="M404 166 C470 112 730 112 796 166 L788 184 C720 140 480 140 412 184 Z" fill="#0b0c0e" {...stroke} />
    <path d={LOWER_BODY} fill="url(#ph-body)" {...stroke} />
    {/* tail lights */}
    <path d="M250 412 L424 400 L424 428 L262 448 Z" fill="url(#ph-red)" {...stroke} />
    <path d="M950 412 L776 400 L776 428 L938 448 Z" fill="url(#ph-red)" {...stroke} />
    <path d="M424 414 H776" stroke="#d72638" strokeOpacity={0.45} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    {/* plate recess + bumper */}
    <path d="M512 470 L688 470 L676 540 L524 540 Z" {...fine} />
    <path d="M262 590 C400 602 800 602 938 590" {...fine} />
    <path d="M300 620 L360 624" stroke="#d72638" strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    <path d="M900 620 L840 624" stroke="#d72638" strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />
  </>
);

const INTERIOR: ReactNode = (
  <>
    <path d="M0 0 H1600 V330 C1200 300 400 300 0 330 Z" fill="url(#ph-glass)" />
    <path d="M0 360 C400 318 1200 318 1600 360 V900 H0 Z" fill="url(#ph-body)" {...stroke} />
    <path d="M0 470 C500 440 1100 440 1600 470" {...fine} strokeOpacity={0.2} />
    {/* instrument cluster */}
    <path d="M340 356 C380 296 660 296 700 356" fill="#0b0c0e" {...stroke} />
    <rect x={384} y={350} width={272} height={96} rx={16} fill="url(#ph-glass)" {...stroke} />
    <circle cx={460} cy={398} r={30} {...fine} />
    <circle cx={580} cy={398} r={30} {...fine} />
    {/* infotainment */}
    <rect x={860} y={330} width={380} height={220} rx={14} fill="url(#ph-glass)" {...stroke} />
    <path d="M900 380 H1060 M900 410 H1020 M900 440 H1080" {...fine} />
    <circle cx={1160} cy={440} r={46} {...fine} />
    <path d="M880 510 H1220" {...fine} strokeOpacity={0.2} />
    {/* vents */}
    <rect x={1300} y={400} width={190} height={56} rx={12} fill="#08090b" {...stroke} />
    <path d="M1312 418 H1478 M1312 438 H1478" {...fine} />
    <rect x={110} y={420} width={150} height={56} rx={12} fill="#08090b" {...stroke} />
    <path d="M122 438 H248 M122 458 H248" {...fine} />
    {/* console */}
    <path d="M880 600 L1220 600 L1310 900 L790 900 Z" fill="#0b0c0e" {...stroke} />
    <rect x={960} y={640} width={180} height={40} rx={8} {...fine} />
    {/* steering wheel */}
    <path
      d="M520 390 A250 250 0 1 1 519.9 390 Z M520 425 A215 215 0 1 0 520.1 425 Z"
      fill="#0c0d10"
      fillRule="evenodd"
      {...stroke}
    />
    <path d="M300 648 L446 618 L446 668 L298 690 Z" fill="#0c0d10" {...stroke} />
    <path d="M740 648 L594 618 L594 668 L742 690 Z" fill="#0c0d10" {...stroke} />
    <path d="M488 700 L552 700 L566 866 L474 866 Z" fill="#0c0d10" {...stroke} />
    <rect x={440} y={590} width={160} height={120} rx={36} fill="url(#ph-rim)" {...stroke} />
  </>
);

const SPEAKER: ReactNode = (
  <>
    <circle cx={400} cy={400} r={340} fill="#0b0c0e" {...stroke} />
    <circle cx={400} cy={400} r={312} fill="url(#ph-perf)" />
    <circle cx={400} cy={400} r={312} {...fine} />
    <circle cx={400} cy={400} r={250} {...fine} strokeOpacity={0.14} />
    <circle cx={400} cy={400} r={180} {...fine} strokeOpacity={0.14} />
    <circle cx={400} cy={400} r={96} fill="url(#ph-rim)" {...stroke} />
    <circle cx={400} cy={400} r={30} fill="#08090b" {...stroke} />
  </>
);

const ROAD: ReactNode = (
  <>
    <rect x={0} y={0} width={1600} height={420} fill="url(#ph-sky)" />
    <path d="M0 420 H1600 V900 H0 Z" fill="#0a0b0d" />
    <path d="M760 420 L840 420 L1900 900 L-300 900 Z" fill="#101215" />
    <path d="M0 420 H1600" stroke="#92969d" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    <path d="M790 420 L230 900 M810 420 L1370 900" {...fine} strokeOpacity={0.3} />
    <path
      d="M800 432 L800 456 M800 480 L800 520 M800 556 L800 620 M800 670 L800 770 M800 830 L800 900"
      stroke="#e6e8ea"
      strokeOpacity={0.35}
      strokeWidth={1.5}
      vectorEffect="non-scaling-stroke"
    />
    <g transform="translate(560 470) scale(0.4)">{REAR}</g>
  </>
);

export const PLACEHOLDER_ART: Record<PlaceholderArt, { viewBox: string; content: ReactNode }> = {
  side: { viewBox: "0 0 1600 600", content: SIDE },
  front: { viewBox: "0 40 1200 700", content: FRONT },
  rear: { viewBox: "0 40 1200 700", content: REAR },
  interior: { viewBox: "0 0 1600 900", content: INTERIOR },
  speaker: { viewBox: "0 0 800 800", content: SPEAKER },
  road: { viewBox: "0 0 1600 900", content: ROAD },
};

/** Gradients and patterns shared by every placeholder. Render once. */
export function SvgDefs() {
  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute", width: 0, height: 0 }} focusable="false">
      <defs>
        <linearGradient id="ph-metal" x1="0" y1="0" x2="1" y2="0.2">
          <stop offset="0" stopColor="#e6e8ea" stopOpacity="0.18" />
          <stop offset="0.42" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="0.62" stopColor="#e6e8ea" stopOpacity="0.45" />
          <stop offset="1" stopColor="#92969d" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="ph-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2024" />
          <stop offset="0.5" stopColor="#111316" />
          <stop offset="1" stopColor="#0a0b0d" />
        </linearGradient>
        <linearGradient id="ph-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#23272c" />
          <stop offset="0.55" stopColor="#0d0f12" />
          <stop offset="1" stopColor="#16191d" />
        </linearGradient>
        <linearGradient id="ph-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#08090b" />
          <stop offset="1" stopColor="#1b1e22" />
        </linearGradient>
        <radialGradient id="ph-lamp" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#e6e8ea" stopOpacity="0.45" />
          <stop offset="1" stopColor="#92969d" stopOpacity="0.1" />
        </radialGradient>
        <linearGradient id="ph-red" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d72638" stopOpacity="0.95" />
          <stop offset="1" stopColor="#7d1220" stopOpacity="0.85" />
        </linearGradient>
        <radialGradient id="ph-rim" cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#3a3e44" />
          <stop offset="0.6" stopColor="#15171a" />
          <stop offset="1" stopColor="#0a0b0d" />
        </radialGradient>
        <radialGradient id="ph-floor" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000000" stopOpacity="0.9" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <pattern id="ph-mesh" width="18" height="12" patternUnits="userSpaceOnUse" patternTransform="skewX(-30)">
          <rect width="18" height="12" fill="#050607" />
          <path d="M0 6 H12" stroke="#92969d" strokeOpacity="0.35" strokeWidth="1" />
        </pattern>
        <pattern id="ph-perf" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="#08090b" />
          <circle cx="7" cy="7" r="2.6" fill="#1f2226" />
        </pattern>
      </defs>
    </svg>
  );
}
