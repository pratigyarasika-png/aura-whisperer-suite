import { createOpenAI } from "@ai-sdk/openai";
import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { z } from "zod";

import { createLovableAiGatewayRunIdFetch } from "@/lib/ai-gateway.server";

const InsightsInput = z.object({
  datasetName: z.string().min(1).max(200),
  question: z.string().max(1000),
  summary: z.string().min(2).max(40000),
});

export const interpretDataset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InsightsInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI interpretation is not configured.");
    const runIdFetch = createLovableAiGatewayRunIdFetch();
    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: key,
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });
    try {
      const result = streamText({
        model: lovable.responses("openai/gpt-6-astra"),
        system: "You are a careful statistical analyst. Interpret only the supplied aggregate data. Distinguish association from causation, flag small samples and missingness, and never invent values. Return concise markdown with Findings, Caveats, and Next steps.",
        prompt: `Dataset: ${data.datasetName}\nQuestion: ${data.question || "Explain the strongest patterns and caveats."}\nAggregate analysis JSON:\n${data.summary}`,
        providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
      });
      const text = await result.text;
      if (!text.trim()) throw new Error("The AI returned no interpretation.");
      return { text };
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI interpretation failed.";
      throw new Error(message);
    }
  });