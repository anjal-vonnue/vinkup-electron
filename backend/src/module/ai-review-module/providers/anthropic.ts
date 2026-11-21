import { ProviderError, type AiProvider, type GenerateRequest } from './types';

type Options = { apiKey: string; model: string; maxInputTokens: number; timeoutMs: number };

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly model: string;
  readonly maxInputTokens: number;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: Options) {
    this.model = options.model;
    this.maxInputTokens = options.maxInputTokens;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
  }

  async generate({ system, user }: GenerateRequest): Promise<string> {
    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 6000,
          temperature: 0.2,
          system,
          messages: [{ role: 'user', content: user }],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new ProviderError(`anthropic request failed: ${reason}`);
    }
    if (!res.ok) throw new ProviderError(`anthropic returned HTTP ${res.status}`, res.status);

    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((block) => block.type === 'text')?.text;
    if (!text) throw new ProviderError('anthropic returned an empty response');
    return text;
  }
}
