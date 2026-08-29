// App-wide AI thinking level — the difficulty/cost knob.
//
// A module-level registry rather than a parameter threaded through every
// bot constructor and instance-cache key: bots read the current level at
// request time, so changing it mid-game applies from the next move
// without rebuilding conversations. On/off still flows through the
// existing useThinking boolean (instances are cached by it); this
// registry only refines HOW MUCH thinking when it is on.
//
// Per-provider mapping (applied in each bot):
// - Claude adaptive: output_config.effort 'medium' | 'high'
//   (legacy budget_tokens models: 4000 | 10000)
// - Gemini 3.x: thinkingLevel MEDIUM | HIGH (2.5: budget 8192 | -1)
// - OpenAI reasoning models (gpt-5*/o*): reasoning.effort
//
// Note: changing the level mid-round alters request parameters, which
// invalidates the Claude prompt cache for that conversation — a one-off
// cost, acceptable for an explicit user action.
export type AiThinkingLevel = 'off' | 'medium' | 'high';

let current: AiThinkingLevel = 'high';

export function setAiThinkingLevel(level: AiThinkingLevel): void {
  current = level;
}

export function getAiThinkingLevel(): AiThinkingLevel {
  return current;
}
