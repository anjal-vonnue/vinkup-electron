import { ProviderError, type AiProvider, type GenerateRequest } from './types';

type Options = {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxInputTokens: number;
  timeoutMs: number;
};

/** Works for any OpenAI-compatible chat endpoint (Groq, Gemini's compat layer). */
export class OpenAiCompatProvider implements AiProvider {
  readonly name: string;
  readonly model: string;
  readonly maxInputTokens: number;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: Options) {
    this.name = options.name;
    this.model = options.model;
    this.maxInputTokens = options.maxInputTokens;
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
  }

  async generate({ system, user }: GenerateRequest): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: 6000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new ProviderError(`${this.name} request failed: ${reason}`);
    }
    if (!res.ok) throw new ProviderError(`${this.name} returned HTTP ${res.status}`, res.status);

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new ProviderError(`${this.name} returned an empty response`);
    return content;
  }
}
