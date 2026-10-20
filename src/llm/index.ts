/** Optional LLM access via plain fetch. All callers must handle `null` (no LLM / failure). */
const openaiAuth = () => ["Bearer", process.env.OPENAI_API_KEY ?? ""].join(" ");

export function llmProvider(): "openai" | "anthropic" | null {
  const forced = process.env.LLM_PROVIDER;
  if (forced === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (forced === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export async function complete(system: string, prompt: string): Promise<string | null> {
  const provider = llmProvider();
  if (!provider) return null;
  try {
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: openaiAuth(),
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL ?? "gpt-4o-mini",
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content?.trim() ?? null;
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? "claude-3-5-haiku-latest",
        max_tokens: 500,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { text?: string }[] };
    return data.content?.[0]?.text?.trim() ?? null;
  } catch {
    return null;
  }
}

/** Embeddings are only used when OPENAI_API_KEY and EMBEDDING_MODEL are both set. */
export async function embed(texts: string[]): Promise<number[][] | null> {
  const model = process.env.EMBEDDING_MODEL;
  if (!model || !process.env.OPENAI_API_KEY || texts.length === 0) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: openaiAuth(),
      },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { embedding: number[] }[] };
    return data.data?.map((d) => d.embedding) ?? null;
  } catch {
    return null;
  }
}
