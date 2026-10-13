const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export const styleWithGroq = async (payload, { apiKey, fetchImpl }) => {
  const response = await fetchImpl(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature: 0.35,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content:
            "Rewrite one generic UI phrase in the requested tone. Do not add names, numbers, financial facts, questions, or advice. Return only the phrase.",
        },
        { role: "user", content: `Tone: ${payload.tone}\nPhrase: ${payload.sourceText}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Groq styling request failed (${response.status}).`);
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq styling response was empty.");
  return text;
};
