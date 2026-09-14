// API Key Validation Functions

/**
 * Validate a Gemini API key by listing models
 */
export async function validateGeminiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, error: 'API key is empty' };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 400 || response.status === 403) {
      return { valid: false, error: 'Invalid API key' };
    }

    return { valid: false, error: `API error: ${response.status}` };
  } catch {
    return { valid: false, error: 'Network error' };
  }
}

/**
 * Validate an OpenAI API key by listing models
 */
export async function validateOpenAIKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, error: 'API key is empty' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    }

    return { valid: false, error: `API error: ${response.status}` };
  } catch {
    return { valid: false, error: 'Network error' };
  }
}

/**
 * Validate a Claude API key by listing models
 * Note: Claude API requires CORS proxy or will fail in browser
 */
export async function validateClaudeKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, error: 'API key is empty' };
  }

  // Claude API doesn't support CORS, so we can only do basic format validation
  // The key format is: sk-ant-api03-...
  if (!apiKey.startsWith('sk-ant-')) {
    return { valid: false, error: 'Invalid key format' };
  }

  // We'll consider it valid if format is correct
  // Actual validation happens on first API call
  return { valid: true };
}

/**
 * Validate an OpenRouter API key by reading the key's own record
 * (GET /api/v1/key answers 401 for an unknown key; CORS is open).
 */
export async function validateOpenRouterKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, error: 'API key is empty' };
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: 'Invalid API key' };
    }

    return { valid: false, error: `API error: ${response.status}` };
  } catch {
    return { valid: false, error: 'Network error' };
  }
}

export type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';
