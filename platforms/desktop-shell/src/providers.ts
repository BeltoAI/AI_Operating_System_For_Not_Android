export type ProviderId = "gemini" | "openai" | "anthropic";

export interface ProviderOption {
  id: ProviderId;
  label: string;
  defaultModel: string;
  keyPlaceholder: string;
}

export interface ProviderRequest {
  provider: ProviderId;
  apiKey: string;
  model: string;
  prompt: string;
  memoryContext: string;
}

export const providerOptions: ProviderOption[] = [
  {
    id: "gemini",
    label: "Gemini",
    defaultModel: "gemini-1.5-flash",
    keyPlaceholder: "AIza..."
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-..."
  },
  {
    id: "anthropic",
    label: "Claude",
    defaultModel: "claude-3-5-haiku-latest",
    keyPlaceholder: "sk-ant-..."
  }
];

export function defaultModelFor(provider: ProviderId): string {
  return providerOptions.find((option) => option.id === provider)?.defaultModel ?? "gemini-1.5-flash";
}

export async function validateProviderKey(request: Omit<ProviderRequest, "prompt" | "memoryContext">): Promise<string> {
  const text = await generateWithProvider({
    ...request,
    prompt: "Reply with exactly: SlyOS online",
    memoryContext: "Provider validation check."
  });
  return text.trim();
}

export async function generateWithProvider(request: ProviderRequest): Promise<string> {
  if (!request.apiKey.trim()) {
    throw new Error("Add an API key in Setup first.");
  }

  if (request.provider === "gemini") return generateGemini(request);
  if (request.provider === "openai") return generateOpenAI(request);
  return generateAnthropic(request);
}

function systemPrompt(memoryContext: string): string {
  return [
    "You are SlyOS, a local-first agent OS shell.",
    "Every answer must route through the user's memory/context first.",
    "Be concise, direct, and action-oriented.",
    "If a real-world send, purchase, destructive change, account change, or device-control action is needed, draft the action and say it requires confirmation.",
    "",
    "Known memory/context:",
    memoryContext || "No local memories yet."
  ].join("\n");
}

async function generateGemini(request: ProviderRequest): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(request.apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt(request.memoryContext)}\n\nUser request:\n${request.prompt}` }]
          }
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 700
        }
      })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError("Gemini", response.status, payload);
  const text = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned no text.");
  return text;
}

async function generateOpenAI(request: ProviderRequest): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${request.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: request.model,
      temperature: 0.4,
      max_tokens: 700,
      messages: [
        { role: "system", content: systemPrompt(request.memoryContext) },
        { role: "user", content: request.prompt }
      ]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError("OpenAI", response.status, payload);
  const text = payload?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI returned no text.");
  return text;
}

async function generateAnthropic(request: ProviderRequest): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": request.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: 700,
      temperature: 0.4,
      system: systemPrompt(request.memoryContext),
      messages: [{ role: "user", content: request.prompt }]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError("Anthropic", response.status, payload);
  const text = payload?.content?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Anthropic returned no text.");
  return text;
}

function providerError(name: string, status: number, payload: unknown): Error {
  const body = payload as {
    error?: { message?: string; status?: string; type?: string };
    message?: string;
  };
  const message = body?.error?.message ?? body?.message ?? `${name} request failed.`;
  const detail = body?.error?.status ?? body?.error?.type;
  return new Error(`${name} ${status}: ${message}${detail ? ` (${detail})` : ""}`);
}
