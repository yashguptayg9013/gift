# 🧠 Personal Decision Engine

A private app for thinking through decisions like *“Should I buy this MacBook?”*, *“Should I take this job?”* or *“Should I travel to Japan in December?”* — and a decision journal that shows, months later, whether your reasoning was actually right.

Everything is stored in your browser's `localStorage`. Nothing is sent to a server; use **Settings → Export backup** to save or move your data.

## What it evaluates

Each decision gets a 0–100 score and a recommendation (Strong yes → Strong no, or “Consider *alternative*” when a cheaper option gives about the same value). The score is a weighted blend of:

| Dimension | How it's judged |
| --- | --- |
| **Cost** | Upfront + monthly cost over the time horizon, against your monthly savings. Negative monthly cost = money gained (e.g. a raise). |
| **Long-term value** | How much it will matter to you, 0–10. |
| **Alternatives** | Each option's “worth-it” score (value blended with affordability) compared with the best alternative. |
| **Opportunity cost** | Hours of work to pay for it plus time it takes, and what the money would grow to if invested. |
| **Your priorities** | Your weighted priorities (Settings) × how much the decision helps or hurts each one. |
| **Pros & cons** | Weighted pros against weighted cons. |
| **Your track record** | How your past, reviewed decisions in the same category turned out. |

Dimensions you leave empty don't count. Easy-to-undo decisions get a small nudge up, hard-to-undo ones a nudge down. The report also lists insights: trade-offs, major cons, a gap between your gut feeling and the analysis, a tendency to overestimate value in a category, and lessons from similar past decisions.

## The journal

1. **Decide** — record yes / no / an alternative / not now, your reasoning, a concrete expected outcome, and a review date. The score at that moment is saved.
2. **Review** — when the date comes up (the dashboard reminds you), rate the outcome, whether you'd decide the same way, and whether the reasoning was *right*, *unlucky*, *lucky* or *wrong* — judged separately from the result.
3. **Learn** — the journal page shows how well the engine's score and your gut each predicted outcomes, results by category, and your lessons, which resurface on similar decisions.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # engine unit tests (Vitest)
npm run lint
npm run build
```

Built with Next.js (App Router), React 19, Tailwind CSS v4 and TypeScript.

- `lib/engine.ts` — the scoring engine
- `lib/journal.ts` — journal statistics and calibration
- `lib/store.ts` — localStorage persistence, import/export
- `app/` — pages: dashboard, new/edit decision, decision report, journal, settings
