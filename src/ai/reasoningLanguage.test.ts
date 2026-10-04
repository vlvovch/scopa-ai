// The reasoning-language line of the cloud models' system instruction.
import { describe, it, expect, afterEach } from 'vitest';
import { reasoningLanguageNote } from './reasoningLanguage';
import { getCurrentLanguage, setCurrentLanguage } from '../i18n/currentLanguage';
import { systemInstruction as scopaInstruction, SYSTEM_INSTRUCTION_MULTITURN as SCOPA_MULTI, SYSTEM_INSTRUCTION_SINGLETURN as SCOPA_SINGLE, SYSTEM_INSTRUCTION_ON_DEVICE as SCOPA_DEVICE } from '../games/scopa/ai/prompts';
import { systemInstruction as briscolaInstruction, SYSTEM_INSTRUCTION_MULTITURN as BRISCOLA_MULTI, SYSTEM_INSTRUCTION_ON_DEVICE as BRISCOLA_DEVICE } from '../games/briscola/ai/prompts';

afterEach(() => setCurrentLanguage('en'));

describe('reasoningLanguageNote', () => {
  it('adds nothing for English and asks for Italian reasoning in an Italian interface', () => {
    expect(reasoningLanguageNote('en')).toBe('');
    const note = reasoningLanguageNote('it');
    expect(note).toContain('in Italian');
    expect(note).toContain('denari, coppe, spade, bastoni');
    expect(note.startsWith('\n\n')).toBe(true);
  });

  it('follows the interface language when none is given', () => {
    expect(getCurrentLanguage()).toBe('en');
    expect(reasoningLanguageNote()).toBe('');
    setCurrentLanguage('it');
    expect(reasoningLanguageNote()).toBe(reasoningLanguageNote('it'));
  });
});

describe('systemInstruction', () => {
  it('is the plain instruction in English', () => {
    expect(scopaInstruction('multiturn')).toBe(SCOPA_MULTI);
    expect(scopaInstruction('singleturn')).toBe(SCOPA_SINGLE);
    expect(briscolaInstruction('multiturn')).toBe(BRISCOLA_MULTI);
  });

  it('ends with the Italian line in an Italian interface, for both games and both modes', () => {
    setCurrentLanguage('it');
    for (const text of [scopaInstruction('multiturn'), scopaInstruction('singleturn'), briscolaInstruction('multiturn'), briscolaInstruction('singleturn')]) {
      expect(text.endsWith(reasoningLanguageNote('it'))).toBe(true);
    }
    expect(scopaInstruction('multiturn').startsWith(SCOPA_MULTI)).toBe(true);
  });

  it('leaves the on-device instructions alone', () => {
    expect(SCOPA_DEVICE).not.toContain('LANGUAGE:');
    expect(BRISCOLA_DEVICE).not.toContain('LANGUAGE:');
  });
});
