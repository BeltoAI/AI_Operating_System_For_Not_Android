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
  maxOutputTokens?: number;
  useWebSearch?: boolean;
  jsonMode?: boolean;
}

export interface ProviderVisionRequest extends ProviderRequest {
  imageDataUrl: string;
}

export const providerOptions: ProviderOption[] = [
  {
    id: "gemini",
    label: "Gemini",
    defaultModel: "gemini-2.5-flash",
    keyPlaceholder: "AIza..."
  },
  {
    id: "anthropic",
    label: "Claude",
    defaultModel: "claude-3-5-haiku-latest",
    keyPlaceholder: "sk-ant-..."
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-..."
  }
];

export function defaultModelFor(provider: ProviderId): string {
  return providerOptions.find((option) => option.id === provider)?.defaultModel ?? "gemini-2.5-flash";
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

export async function generateJsonWithProvider<T>(request: ProviderRequest): Promise<T> {
  const raw = await generateWithProvider({ ...request, jsonMode: true });
  const json = extractJsonObject(raw);
  if (!json) throw new Error("The model did not return a valid JSON object.");
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    throw new Error(`The model returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function generateVisionWithProvider(request: ProviderVisionRequest): Promise<string> {
  if (!request.apiKey.trim()) throw new Error("Add an API key in Setup first.");
  const image = parseImageDataUrl(request.imageDataUrl);
  if (request.provider === "gemini") return generateGeminiVision(request, image);
  if (request.provider === "openai") return generateOpenAIVision(request);
  return generateAnthropicVision(request, image);
}

function systemPrompt(memoryContext: string): string {
  return [
    "You are SlyOS, the user's memory-grounded agent operating system.",
    "Read the supplied brain context before deciding or answering. Never invent a memory that is not present.",
    "Treat an explicit user command as authorization to perform ordinary app navigation, typing, form filling, messages, posts, and local file work.",
    "Pause before an actual payment or purchase, credential/security change, destructive deletion, or action whose target is ambiguous.",
    "Be concise, direct, and action-oriented. Say what actually happened, not what you merely intended to do.",
    "",
    "Known memory/context:",
    memoryContext || "No local memories yet."
  ].join("\n");
}

function outputLimit(request: ProviderRequest, fallback: number): number {
  return Math.max(128, Math.min(8192, request.maxOutputTokens ?? fallback));
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
        ...(request.useWebSearch ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: outputLimit(request, 700),
          ...(request.jsonMode ? { responseMimeType: "application/json" } : {})
        }
      })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError("Gemini", response.status, payload);
  const text = geminiText(payload, request.useWebSearch);
  if (!text) throw new Error("Gemini returned no text.");
  return text;
}

function geminiText(payload: any, includeGrounding = false): string {
  const candidate = payload?.candidates?.[0];
  const text = candidate?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim() ?? "";
  if (!includeGrounding || !text) return text;
  const chunks = Array.isArray(candidate?.groundingMetadata?.groundingChunks)
    ? candidate.groundingMetadata.groundingChunks
    : [];
  const seen = new Set<string>();
  const sources = chunks
    .map((chunk: any) => chunk?.web)
    .filter((web: any) => typeof web?.uri === "string" && web.uri.startsWith("http"))
    .filter((web: any) => {
      if (seen.has(web.uri)) return false;
      seen.add(web.uri);
      return true;
    })
    .slice(0, 6)
    .map((web: any) => `- ${String(web.title || "Source")} — ${web.uri}`);
  return sources.length ? `${text}\n\nSources:\n${sources.join("\n")}` : text;
}

async function generateGeminiVision(
  request: ProviderVisionRequest,
  image: { mimeType: string; data: string }
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(request.apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: `${systemPrompt(request.memoryContext)}\n\nVision request:\n${request.prompt}` },
              { inline_data: { mime_type: image.mimeType, data: image.data } }
            ]
          }
        ],
        generationConfig: { temperature: 0.3, maxOutputTokens: 900 }
      })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError("Gemini", response.status, payload);
  const text = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned no vision result.");
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
      max_tokens: outputLimit(request, 700),
      ...(request.jsonMode ? { response_format: { type: "json_object" } } : {}),
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

async function generateOpenAIVision(request: ProviderVisionRequest): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${request.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: request.model,
      temperature: 0.3,
      max_tokens: 900,
      messages: [
        { role: "system", content: systemPrompt(request.memoryContext) },
        {
          role: "user",
          content: [
            { type: "text", text: request.prompt },
            { type: "image_url", image_url: { url: request.imageDataUrl, detail: "high" } }
          ]
        }
      ]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError("OpenAI", response.status, payload);
  const text = payload?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI returned no vision result.");
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
      max_tokens: outputLimit(request, 700),
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

async function generateAnthropicVision(
  request: ProviderVisionRequest,
  image: { mimeType: string; data: string }
): Promise<string> {
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
      max_tokens: 900,
      temperature: 0.3,
      system: systemPrompt(request.memoryContext),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.data } },
            { type: "text", text: request.prompt }
          ]
        }
      ]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError("Anthropic", response.status, payload);
  const text = payload?.content?.map((part: { text?: string }) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Anthropic returned no vision result.");
  return text;
}

function parseImageDataUrl(value: string): { mimeType: string; data: string } {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match?.[1] || !match[2]) throw new Error("The selected image could not be read.");
  return { mimeType: match[1], data: match[2] };
}

function extractJsonObject(value: string): string | null {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quoted) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return trimmed.slice(start, index + 1);
    }
  }
  return null;
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
