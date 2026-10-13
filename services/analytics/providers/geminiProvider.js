const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export const styleWithGemini = async (payload, { apiKey, fetchImpl }) => {
  const response = await fetchImpl(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: "Rewrite one generic UI phrase in the requested tone. Do not add names, numbers, financial facts, questions, or advice. Return only the phrase.",
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: `Tone: ${payload.tone}\nPhrase: ${payload.sourceText}` }],
        },
      ],
      generationConfig: { temperature: 0.35, maxOutputTokens: 80 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini styling request failed (${response.status}).`);
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini styling response was empty.");
  return text;
};
