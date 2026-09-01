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
};

export const ASK_MODELS: AskModel[] = [
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    blurb: "Balanced quality and cost — recommended",
    adaptiveThinking: true,
  },
  {
    id: "claude-opus-5",
    label: "Opus 5",
    blurb: "Highest quality, highest cost",
    adaptiveThinking: true,
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    blurb: "Fastest and cheapest",
    adaptiveThinking: false,
  },
];

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
