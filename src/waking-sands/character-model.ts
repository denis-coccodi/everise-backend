import {TooManyRequestsError, UpstreamError} from '../errors';

// A message for the model, in the usual chat form.
interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Writes a character's next line; tests pass a fake.
interface CharacterModel {
  reply(messages: ModelMessage[]): Promise<string>;
}

// The Worker's Workers AI binding (the part of it the app uses).
interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

// Small, quick and cheap: a few Neurons a reply (2 for a short one), so the
// free plan's 10,000 a day cover well over a thousand.
const MODEL = '@cf/google/gemma-4-26b-a4b-it';
const MAX_REPLY_TOKENS = 300;

// Workers AI answers these codes once the account's free Neurons for the day
// are used up; on the free plan it never bills, it refuses.
const OUT_OF_NEURONS = /\b(3036|4006)\b/;

class WorkersAiModel implements CharacterModel {
  constructor(private readonly ai: AiBinding) {}

  async reply(messages: ModelMessage[]) {
    let output: unknown;
    try {
      output = await this.ai.run(MODEL, {
        messages,
        max_completion_tokens: MAX_REPLY_TOKENS,
        temperature: 0.8,
        // A line of chat needs no reasoning first, which would spend the
        // tokens (and Neurons) before a word of the answer.
        chat_template_kwargs: {enable_thinking: false},
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (OUT_OF_NEURONS.test(message)) {
        throw new TooManyRequestsError(
          'The Waking Sands is closed for the rest of the day. Come back after midnight UTC!',
          secondsToMidnightUtc(new Date())
        );
      }
      throw new UpstreamError(
        `The characters can't answer right now (${message}).`
      );
    }
    const text = textOf(output);
    if (!text) {
      throw new UpstreamError("The characters can't answer right now.");
    }
    return text;
  }
}

// Workers AI answers `{response}` for some models and the OpenAI-style
// `{choices: [{message: {content}}]}` for others.
function textOf(output: unknown): string | undefined {
  const value = output as {
    response?: unknown;
    choices?: {message?: {content?: unknown}}[];
  };
  const text =
    typeof value?.response === 'string'
      ? value.response
      : value?.choices?.[0]?.message?.content;
  return typeof text === 'string' ? text.trim() : undefined;
}

function secondsToMidnightUtc(now: Date) {
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000));
}

export {
  AiBinding,
  CharacterModel,
  ModelMessage,
  WorkersAiModel,
  secondsToMidnightUtc,
};
