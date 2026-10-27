import { createHash, timingSafeEqual } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { MAX_BRIEF_CHARS } from "@/lib/brief";
import type { SecondOpinion } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-opus-5-5";

const OpinionSchema = z.object({
  stance: z
    .enum(["agree", "partly_agree", "disagree"])
    .describe("How your view compares with the structured engine's overall lean."),
  recommendation: z.string().describe("Your recommendation in one short sentence."),
  summary: z.string().describe("Two to four sentences explaining your reasoning."),
  blindSpots: z.array(z.string()).describe("Considerations the person's inputs and the engine missed or underweighted."),
  risks: z.array(z.string()).describe("Concrete ways this could go wrong, and how to limit them."),
  questions: z.array(z.string()).describe("Questions the person should answer for themselves before deciding."),
  alternatives: z.array(z.string()).describe("Options they haven't listed that are worth considering. Empty if none."),
  confidence: z.enum(["low", "medium", "high"]).describe("How confident you are, given the information provided."),
});

const RequestSchema = z.object({ brief: z.string().min(1).max(MAX_BRIEF_CHARS) });

const SYSTEM = `You give a candid second opinion on a personal decision someone is weighing in their private decision journal.

You'll receive the decision, the person's own inputs (costs, expected value, alternatives, priorities, pros and cons, gut feeling), the score a simple structured engine computed from those inputs, and sometimes lessons from similar past decisions they've reviewed.

The engine only knows what the person typed in, so your value is in what it can't see: assumptions that look off, costs or benefits that weren't written down, timing, second-order effects, and patterns from their own past decisions. Don't restate the engine's numbers back to them. Judge the decision against their stated priorities rather than your own values, and be specific to their situation rather than offering generic advice. Keep each list item to one or two sentences and include only items that genuinely add something — two strong points beat five weak ones.

This is decision support, not professional financial, legal or medical advice; if the decision clearly needs a professional, say so in a risk or question.`;

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

function passcodeMatches(given: string, expected: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  // The server's API key pays for every call, so a deployed app must be protected by a passcode.
  const passcode = process.env.SECOND_OPINION_PASSCODE;
  if (passcode) {
    if (!passcodeMatches(request.headers.get("x-passcode") ?? "", passcode)) {
      return json(401, { code: "bad_passcode", error: "Wrong or missing passcode. Enter it in Settings." });
    }
  } else if (process.env.NODE_ENV === "production") {
    return json(503, {
      code: "not_configured",
      error: "Set SECOND_OPINION_PASSCODE on the server to enable AI second opinions in production.",
    });
  }

  let brief: string;
  try {
    brief = RequestSchema.parse(await request.json()).brief;
  } catch {
    return json(400, { code: "bad_request", error: `The decision summary is missing or longer than ${MAX_BRIEF_CHARS} characters.` });
  }

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "high", format: betaZodOutputFormat(OpinionSchema) },
      // If a safety classifier declines, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: brief }],
    });

    if (response.stop_reason === "refusal") {
      return json(422, { code: "refusal", error: "Claude declined to give an opinion on this decision." });
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return json(502, { code: "incomplete", error: "Claude's answer was incomplete. Please try again." });
    }
    const opinion: SecondOpinion = response.parsed_output;
    return json(200, { opinion, model: response.model });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return json(503, { code: "not_configured", error: "The server's Anthropic API key was rejected." });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return json(429, { code: "rate_limited", error: "Too many requests to Claude right now. Try again in a minute." });
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return json(502, { code: "unreachable", error: "Couldn't reach the Claude API." });
    }
    if (error instanceof Anthropic.APIError) {
      return json(502, { code: "api_error", error: `Claude API error (${error.status ?? "unknown"}).` });
    }
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      return json(503, {
        code: "not_configured",
        error: "No Anthropic API key configured. Set ANTHROPIC_API_KEY on the server to enable second opinions.",
      });
    }
    console.error("second-opinion failed", error);
    return json(500, { code: "unknown", error: "Something went wrong getting a second opinion." });
  }
}
