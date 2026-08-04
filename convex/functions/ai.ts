"use node";

import { GoogleGenAI } from "@google/genai";
import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";

const MODEL = "gemini-2.5-flash-lite";

async function generateJson(prompt: string): Promise<Record<string, any>> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: { responseMimeType: "application/json" },
  });

  const text = response.text;

  if (!text) {
    throw new Error("Empty response from Gemini");
  }

  const match = text.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error("Gemini response did not contain JSON");
  }

  return JSON.parse(match[0]);
}

async function requireSession(ctx: any, token: string) {
  const sessionResult = await ctx.runQuery(internal.functions.auth.verifySessionReadOnly, {
    token,
  });

  if (!sessionResult.valid || !sessionResult.user) {
    throw new Error("Authentication required");
  }

  return sessionResult.user;
}

export const validateFeedback = action({
  args: {
    token: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);

    const prompt = `
You are a professional content moderator for academic debate tournaments. Analyze judge feedback to ensure it is professional and constructive, appropriate for students, non-discriminatory, focused on debate performance rather than personal attacks, and encouraging even when critical.

**ANALYZE THE FOLLOWING FEEDBACK:**
"""
${args.content}
"""

**EVALUATION CRITERIA:**
- INAPPROPRIATE: personal attacks, discriminatory language, inappropriate humour, excessive negativity, unprofessional tone, bias based on personal characteristics
- APPROPRIATE: constructive criticism, specific improvement suggestions, professional language, balanced and performance-focused comments

**RESPONSE FORMAT (JSON only):**
{
  "isAppropriate": boolean,
  "confidence": number between 0 and 1,
  "issues": ["specific issues found"],
  "suggestions": ["specific improvements for problematic parts"]
}

Be strict but fair, consider cultural sensitivity for international tournaments, and only flag content that would genuinely be inappropriate in an educational setting.`;

    return await generateJson(prompt);
  },
});

export const factCheckClaim = action({
  args: {
    token: v.string(),
    claim: v.string(),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);

    const prompt = `
You are a fact-checking assistant for academic debate tournaments. Analyze the following claim for accuracy.

**CLAIM TO CHECK:**
"""
${args.claim}
"""
${args.context ? `\n**CONTEXT:**\n"""${args.context}"""` : ""}

Evaluate factual accuracy, allow that some claims are opinions or interpretations, provide sources where possible, and be honest that not everything can be verified definitively.

**RESPONSE FORMAT (JSON only):**
{
  "result": "true" | "false" | "partially_true" | "inconclusive",
  "confidence": number between 0 and 1,
  "explanation": "detailed explanation of the assessment",
  "sources": ["source descriptions or URLs if available"]
}

"true" means factually accurate, "false" means factually incorrect, "partially_true" means some accurate elements alongside inaccuracies, and "inconclusive" means it cannot be definitively verified.`;

    return await generateJson(prompt);
  },
});

export const checkBias = action({
  args: {
    token: v.string(),
    content: v.string(),
    content_type: v.union(
      v.literal("feedback"),
      v.literal("comment"),
      v.literal("argument")
    ),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx, args.token);

    const prompt = `
You are a bias detection assistant for academic debate tournaments. Analyze the following ${args.content_type} for potential bias.

**CONTENT TO ANALYZE:**
"""
${args.content}
"""

**TYPES OF BIAS TO DETECT:**
1. Identity bias — race, gender, religion, nationality, age, appearance
2. Confirmation bias — favouring information that confirms pre-existing beliefs
3. Anchoring bias — over-relying on first impressions
4. Linguistic bias — accent, language proficiency, speaking style
5. Cultural bias — assumptions based on cultural background

**RESPONSE FORMAT (JSON only):**
{
  "hasBias": boolean,
  "confidence": number between 0 and 1,
  "biasTypes": ["detected bias types"],
  "suggestions": ["specific suggestions for more neutral language"]
}

Focus on subtle bias the author may be unaware of, keep the academic debate context in mind, and be careful not to over-flag normal evaluation language.`;

    return await generateJson(prompt);
  },
});
