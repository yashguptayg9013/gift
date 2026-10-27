# 🧠 Personal Decision Engine

A private app for thinking through decisions like *“Should I buy this MacBook?”*, *“Should I take this job?”* or *“Should I travel to Japan in December?”* — and a decision journal that shows, months later, whether your reasoning was actually right.

Everything is stored in your browser's `localStorage`. Nothing is sent to a server unless you ask Claude for a second opinion (see below); use **Settings → Export backup** to save or move your data.

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

## Languages and currencies

The whole app — screens, the engine's insights and recommendations, the example decisions and the built-in priorities — is available in **English, हिन्दी (Hindi), Español, Français, Deutsch and Português**. It starts in your browser's language and can be switched from the top bar or in **Settings → Language & currency**. Claude's second opinion is written in the same language.

You can pick any of the ~160 ISO currencies. Amounts, dates and digit grouping follow the chosen language (e.g. `₹12,34,567` in Hindi, `1.999 €` in German). Changing the currency relabels your amounts; it doesn't convert them.

To add a language, copy `lib/i18n/en.ts`, translate it, and register it in `lib/i18n/index.ts`. TypeScript rejects a translation with missing keys, and a test checks that list lengths match.

## AI second opinion (optional)

On any decision you can press **Ask Claude** to get a second opinion from Claude (`claude-opus-5-5`). It says whether it agrees with the engine, then points out blind spots, risks, questions to ask yourself and alternatives you didn't list. The opinion is saved with the decision in your journal.

This is the only feature that sends data anywhere. When you press the button, the app sends **that one decision**, your financial settings and priorities, and up to three similar past decisions to Anthropic's API through the app's server. Nothing else in your journal leaves the browser.

Setup — the server needs these environment variables (e.g. in `.env.local`, or in your Vercel project settings):

```bash
ANTHROPIC_API_KEY=sk-ant-...        # your Anthropic API key — calls are billed to it
SECOND_OPINION_PASSCODE=some-secret # required in production; enter the same value in Settings
```

The passcode stops other people from running up your API bill through a deployed copy of the app. In production the feature stays off until it's set. In `npm run dev` it's optional.

## The journal

1. **Decide** — record yes / no / an alternative / not now, your reasoning, a concrete expected outcome, and a review date. The score at that moment is saved.
2. **Review** — when the date comes up (the dashboard reminds you), rate the outcome, whether you'd decide the same way, and whether the reasoning was *right*, *unlucky*, *lucky* or *wrong* — judged separately from the result.
3. **Learn** — the journal page shows how well the engine's score and your gut each predicted outcomes, results by category, and your lessons, which resurface on similar decisions.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # engine and i18n unit tests (Vitest)
npm run lint
npm run build
```

Built with Next.js (App Router), React 19, Tailwind CSS v4 and TypeScript.

- `lib/engine.ts` — the scoring engine
- `lib/journal.ts` — journal statistics and calibration
- `lib/store.ts` — localStorage persistence, import/export
- `lib/i18n/` — translations (`en.ts` is the source of truth) and locale/currency helpers
- `lib/brief.ts` — the decision summary sent to Claude
- `app/api/second-opinion/route.ts` — server route that calls the Claude API
- `app/` — pages: dashboard, new/edit decision, decision report, journal, settings
