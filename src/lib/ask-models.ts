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
