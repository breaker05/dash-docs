// Models the admin can pick for the "Ask AI" chat. Shared by the settings UI
// (labels/options), the server action (validation), and the /api/ask route
// (which model to call and whether to turn on adaptive thinking). No server
// imports here so the client form can pull it in too.

export type AskModel = {
  id: string;
  label: string;
  /** one-line tradeoff shown in the settings dropdown */
  blurb: string;
  /**
   * Whether the model supports adaptive thinking + effort control. The newer
   * models do; Haiku 4.5 does not (sending `thinking`/`output_config.effort`
   * to it returns a 400), so the route omits them for it.
   */
  adaptiveThinking: boolean;
  /** context window in tokens — caps how much of the corpus can be sent. */
  contextTokens: number;
  /**
   * USD per 1M tokens, for cost accounting. cacheWrite is the 1h-TTL rate
   * (2× input — whole-corpus mode caches with a 1h TTL); cacheRead is 0.1×.
   */
  pricing: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
};

export const ASK_MODELS: AskModel[] = [
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    blurb: "Balanced quality and cost — recommended",
    adaptiveThinking: true,
    contextTokens: 1_000_000,
    pricing: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 4 },
  },
  {
    id: "claude-opus-5",
    label: "Opus 5",
    blurb: "Highest quality, highest cost",
    adaptiveThinking: true,
    contextTokens: 1_000_000,
    pricing: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 10 },
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    blurb: "Fastest and cheapest",
    adaptiveThinking: false,
    contextTokens: 200_000,
    pricing: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 2 },
  },
];

export type TokenUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

/** Dollar cost of one model turn from its token usage and the model's rates. */
export function costOfUsage(model: AskModel, u: TokenUsage): number {
  const p = model.pricing;
  return (
    (u.input * p.input +
      u.output * p.output +
      u.cacheRead * p.cacheRead +
      u.cacheWrite * p.cacheWrite) /
    1_000_000
  );
}

export const DEFAULT_ASK_MODEL_ID = "claude-sonnet-5";

/** Resolve a stored setting value to a model, falling back to the default. */
export function resolveAskModel(id: string | null | undefined): AskModel {
  return (
    ASK_MODELS.find((m) => m.id === id) ??
    ASK_MODELS.find((m) => m.id === DEFAULT_ASK_MODEL_ID)!
  );
}

export function isAskModelId(id: string): boolean {
  return ASK_MODELS.some((m) => m.id === id);
}

// How much reasoning the thinking-capable models spend per answer. Higher
// effort means deeper reasoning (better on hard questions) at more latency and
// cost. Ignored for models where adaptiveThinking is false (e.g. Haiku 4.5).
// xhigh/max are omitted — overkill for docs Q&A.
export type AskEffort = "low" | "medium" | "high";

export const ASK_EFFORTS: { id: AskEffort; label: string; blurb: string }[] = [
  { id: "low", label: "Low", blurb: "Fastest and cheapest — recommended for chat" },
  { id: "medium", label: "Medium", blurb: "More thorough on harder questions" },
  { id: "high", label: "High", blurb: "Deepest reasoning, slower and costlier" },
];

export const DEFAULT_ASK_EFFORT: AskEffort = "low";

/** Resolve a stored setting value to an effort level, falling back to default. */
export function resolveAskEffort(v: string | null | undefined): AskEffort {
  return ASK_EFFORTS.find((e) => e.id === v)?.id ?? DEFAULT_ASK_EFFORT;
}

export function isAskEffort(v: string): v is AskEffort {
  return ASK_EFFORTS.some((e) => e.id === v);
}

// Whole-corpus retrieval: how much published-page content (in tokens) to send
// the model in full before falling back to keyword/section retrieval. The
// admin picks a target; the route caps it to what the selected model can hold.
// "0" = never send the whole site (always retrieve sections).
export const ASK_CORPUS_BUDGETS: { id: string; label: string; blurb: string }[] =
  [
    {
      id: "0",
      label: "Sections only",
      blurb: "Never send the whole site — always retrieve sections",
    },
    {
      id: "100000",
      label: "100K tokens",
      blurb: "Send the whole site when it fits ~100K tokens",
    },
    {
      id: "200000",
      label: "200K tokens",
      blurb: "Recommended — fits most sites, including internal docs",
    },
    {
      id: "400000",
      label: "400K tokens",
      blurb: "Larger sites — needs a 1M-context model (Sonnet/Opus)",
    },
    {
      id: "1000000",
      label: "Max for the model",
      blurb: "As much as the selected model's context can hold",
    },
  ];

export const DEFAULT_CORPUS_TOKEN_BUDGET = 200_000;

// Reserve for the prompt instructions, chat history, and the answer itself, so
// the corpus never fills the whole context window.
const CORPUS_HEADROOM_TOKENS = 32_000;
const CHARS_PER_TOKEN = 4;

/** Resolve a stored setting value to a token budget, falling back to default. */
export function resolveCorpusTokenBudget(v: string | null | undefined): number {
  if (typeof v !== "string" || v.trim() === "") {
    return DEFAULT_CORPUS_TOKEN_BUDGET;
  }
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CORPUS_TOKEN_BUDGET;
}

export function isCorpusBudget(v: string): boolean {
  return ASK_CORPUS_BUDGETS.some((b) => b.id === v);
}

/**
 * The whole-corpus budget in CHARACTERS for a given model + configured token
 * budget, capped so the corpus leaves headroom in the model's context window.
 * The route compares the corpus's character length against this.
 */
export function effectiveCorpusCharBudget(
  model: AskModel,
  configuredTokens: number,
): number {
  const safeTokens = Math.max(model.contextTokens - CORPUS_HEADROOM_TOKENS, 0);
  return Math.min(configuredTokens, safeTokens) * CHARS_PER_TOKEN;
}
