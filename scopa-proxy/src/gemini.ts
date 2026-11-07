// The request the free-AI proxy sends to Gemini for one move.

export const MODEL = 'gemini-3-flash-preview';
export const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface ContentPart {
  text: string;
}

export interface Content {
  role: 'user' | 'model';
  parts: ContentPart[];
}

export interface MoveRequest {
  systemInstruction: string;
  contents: Content[];
  responseJsonSchema: Record<string, unknown>;
  gameId: string;
  useThinking?: boolean;
}

/**
 * The generateContent body for a move. Gemini 3 takes a thinking level:
 * HIGH when the client asked for thinking (the model's own default), LOW
 * otherwise, as the 3.x family cannot switch thinking off and MINIMAL is
 * not accepted by every model. The 2.5-era thinkingBudget was remapped
 * on the 3.x models and is rejected by the ones after them. No sampling
 * parameters (temperature, topP, topK): deprecated as well, the model
 * uses its defaults.
 */
export function geminiRequestBody({ systemInstruction, contents, responseJsonSchema, useThinking }: MoveRequest) {
  return {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: responseJsonSchema,
      thinkingConfig: { thinkingLevel: useThinking ? 'HIGH' : 'LOW' },
    },
  };
}
