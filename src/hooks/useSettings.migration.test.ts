// Stored settings from older installs are brought up to date on load:
// the thinking knob from the old boolean, and former default models to
// the current default of their provider (only those, and only once: the
// settings version records that it happened, so a chosen model stays).
import { describe, it, expect } from 'vitest';
import { migrateStoredSettings } from './useSettings';

describe('migrateStoredSettings', () => {
  it('moves the former default models to the current defaults', () => {
    const s = migrateStoredSettings({ geminiModel: 'gemini-3.5-flash', openaiModel: 'gpt-5-mini', openrouterModel: 'openai/gpt-5-mini', thinkingLevel: 'medium' });
    expect(s.geminiModel).toBe('gemini-3.8-flash');
    expect(s.openaiModel).toBe('gpt-5.6-luna');
    expect(s.openrouterModel).toBe('openai/gpt-5.6-luna');
    expect(s.claudeModel).toBe('claude-sonnet-5');
    expect(s.thinkingLevel).toBe('medium');
  });

  it('leaves a model the player chose alone', () => {
    const s = migrateStoredSettings({ geminiModel: 'gemini-3.5-flash-lite', openaiModel: 'gpt-5.5', openrouterModel: 'anthropic/claude-opus-5', thinkingLevel: 'off' });
    expect(s.geminiModel).toBe('gemini-3.5-flash-lite');
    expect(s.openaiModel).toBe('gpt-5.5');
    expect(s.openrouterModel).toBe('anthropic/claude-opus-5');
  });

  it('moves a former default only once: re-selected after the migration, it stays', () => {
    const s = migrateStoredSettings({ geminiModel: 'gemini-3.5-flash', openaiModel: 'gpt-5-mini', openrouterModel: 'openai/gpt-5-mini', settingsVersion: 2 });
    expect(s.geminiModel).toBe('gemini-3.5-flash');
    expect(s.openaiModel).toBe('gpt-5-mini');
    expect(s.openrouterModel).toBe('openai/gpt-5-mini');
  });

  it('stamps the current version on what it returns, so the migration is recorded once saved', () => {
    expect(migrateStoredSettings({ openaiModel: 'gpt-5-mini' }).settingsVersion).toBe(2);
    expect(migrateStoredSettings({}).settingsVersion).toBe(2);
  });

  it('derives the thinking knob for installs that predate it', () => {
    expect(migrateStoredSettings({ useThinking: false }).thinkingLevel).toBe('off');
    expect(migrateStoredSettings({ useThinking: true }).thinkingLevel).toBe('high');
    expect(migrateStoredSettings({}).geminiModel).toBe('gemini-3.8-flash');
  });
});
