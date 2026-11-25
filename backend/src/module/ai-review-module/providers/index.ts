import { env } from '../../../config/env';
import { AnthropicProvider } from './anthropic';
import { OpenAiCompatProvider } from './openai-compat';
import { ProviderError, type AiProvider, type GenerateRequest } from './types';

const timeoutMs = env.AI_REQUEST_TIMEOUT_MS;

function buildProvider(name: string): AiProvider | null {
  if (name === 'groq' && env.GROQ_API_KEY) {
    return new OpenAiCompatProvider({
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_MODEL,
      maxInputTokens: 8000, // free-tier tokens-per-minute is small
      timeoutMs,
    });
  }
  if (name === 'gemini' && env.GEMINI_API_KEY) {
    return new OpenAiCompatProvider({
      name: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      maxInputTokens: 100000,
      timeoutMs,
    });
  }
  if (name === 'anthropic' && env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
      maxInputTokens: 100000,
      timeoutMs,
    });
  }
  return null;
}

let cached: AiProvider[] | null = null;

/** Providers that have a key, in AI_PROVIDER_ORDER order. */
export function getProviders(): AiProvider[] {
  cached ??= env.AI_PROVIDER_ORDER.split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
    .map(buildProvider)
    .filter((provider): provider is AiProvider => provider !== null);
  return cached;
}

/** Largest single-call input any configured provider can take (0 if none). */
export function maxInputBudget(): number {
  return Math.max(0, ...getProviders().map((p) => p.maxInputTokens));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callOnce(provider: AiProvider, req: GenerateRequest): Promise<string> {
  try {
    return await provider.generate(req);
  } catch (error) {
    if (error instanceof ProviderError && error.status === 429) {
      await sleep(1500); // rate limited: one short retry on the same provider
      return provider.generate(req);
    }
    throw error;
  }
}

/**
 * Tries providers in order and returns the first one whose output `parse` accepts.
 * A provider that is too small for the input, errors, or returns unparseable output
 * is skipped.
 */
export async function generateWithFallback<T>(
  req: GenerateRequest,
  estimatedTokens: number,
  parse: (text: string) => T
): Promise<{ value: T; provider: string; model: string }> {
  const providers = getProviders();
  if (providers.length === 0) throw new ProviderError('No AI provider is configured.');

  const failures: string[] = [];
  for (const provider of providers) {
    if (estimatedTokens > provider.maxInputTokens) {
      failures.push(`${provider.name}: input too large`);
      continue;
    }
    try {
      const text = await callOnce(provider, req);
      return { value: parse(text), provider: provider.name, model: provider.model };
    } catch (error) {
      failures.push(`${provider.name}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }
  throw new ProviderError(`All AI providers failed (${failures.join('; ')})`);
}
