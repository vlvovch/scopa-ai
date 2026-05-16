/**
 * JSON schema used to constrain LLM move-selection responses.
 * Shared between Scopa and Briscola so every bot returns the same shape.
 */
export const MOVE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    moveIndex: { type: 'integer', description: '0-based index of the selected move' },
    reasoning: { type: 'string', description: 'Brief explanation of why this move was chosen' },
  },
  required: ['moveIndex', 'reasoning'],
} as const;
