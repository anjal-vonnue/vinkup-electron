export type GenerateRequest = { system: string; user: string };

export class ProviderError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Rough input budget (tokens) this provider can take in one call. */
  readonly maxInputTokens: number;
  generate(req: GenerateRequest): Promise<string>;
}
