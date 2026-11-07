// The free-AI proxy's Gemini request: the thinking level (not the
// deprecated budget), no sampling parameters, the rest passed through.
import { describe, it, expect } from 'vitest';
import { geminiRequestBody } from './gemini.js';

const request = {
  systemInstruction: 'You play Scopa.',
  contents: [{ role: 'user' as const, parts: [{ text: 'Your move.' }] }],
  responseJsonSchema: { type: 'object' },
  gameId: 'g1',
};

describe('geminiRequestBody', () => {
  it('asks for a thinking level: HIGH with thinking, LOW without', () => {
    expect(geminiRequestBody({ ...request, useThinking: true }).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'HIGH' });
    expect(geminiRequestBody({ ...request, useThinking: false }).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    expect(geminiRequestBody(request).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
  });

  it('sends neither the thinking budget nor sampling parameters', () => {
    const config = geminiRequestBody({ ...request, useThinking: true }).generationConfig as Record<string, unknown>;
    expect(config.thinkingConfig).not.toHaveProperty('thinkingBudget');
    for (const key of ['temperature', 'topP', 'topK', 'top_p', 'top_k']) {
      expect(config).not.toHaveProperty(key);
    }
  });

  it('keeps the instruction, the conversation and the JSON schema', () => {
    const body = geminiRequestBody({ ...request, useThinking: true });
    expect(body.system_instruction).toEqual({ parts: [{ text: 'You play Scopa.' }] });
    expect(body.contents).toBe(request.contents);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toBe(request.responseJsonSchema);
  });
});
