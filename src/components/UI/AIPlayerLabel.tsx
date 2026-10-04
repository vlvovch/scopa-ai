// AI Player Label component with proper icons for each AI type

import type { ReactNode } from 'react';
import type { ExtendedAIType } from '../../games/scopa/ai';
import { OpenAIIcon } from './OpenAIIcon';
import { ClaudeIcon } from './ClaudeIcon';
import { GeminiIcon } from './GeminiIcon';
import { AppleIntelligenceIcon } from './AppleIntelligenceIcon';
import { OpenRouterIcon } from './OpenRouterIcon';
import { openRouterModelDisplayName } from '../../ai/openrouterProvider';
import styles from './AIPlayerLabel.module.css';

interface AIPlayerLabelProps {
  /** The AI type */
  aiType: ExtendedAIType;
  /** The model ID (for LLM AIs) */
  model?: string;
  /** Additional class name */
  className?: string;
  /** Whether to show the mode indicator (💬/1️⃣) */
  showModeIndicator?: boolean;
  /** Narrow column (the scoreboard): phones show the short form of a long
   *  name ("Apple AI") instead of wrapping it. */
  compact?: boolean;
}

/**
 * Get the icon for an AI type
 */
function AIIcon({ aiType, className }: { aiType: ExtendedAIType; className?: string }): ReactNode {
  switch (aiType) {
    case 'openai':
    case 'openai-singleturn':
      return <OpenAIIcon size="1em" className={className} />;
    case 'gemini':
    case 'gemini-singleturn':
    case 'gemini-free':
      return <GeminiIcon size="1em" className={className} />;
    case 'claude':
    case 'claude-singleturn':
      return <ClaudeIcon size="1em" className={className} />;
    case 'openrouter':
    case 'openrouter-singleturn':
      return <OpenRouterIcon size="1em" className={className} />;
    case 'random':
      return <span className={className} style={{ fontSize: '1em' }}>🐒</span>;
    case 'heuristic':
      return <span className={className} style={{ fontSize: '1em' }}>🦊</span>;
    case 'expert':
      return <span className={className} style={{ fontSize: '1em' }}>🐍</span>;
    case 'apple':
      return <AppleIntelligenceIcon size="1em" className={className} />;
    case 'multiplayer':
      return <span className={className} style={{ fontSize: '1em' }}>👤</span>;
    default:
      return null;
  }
}

/**
 * Format model name for display
 */
function formatModelName(aiType: ExtendedAIType, model?: string): string {
  if (aiType === 'gemini' || aiType === 'gemini-singleturn') {
    const modelId = model || 'gemini-3.8-flash';
    return modelId
      .replace('gemini-', 'Gemini ')
      .split('-')
      .map((part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  if (aiType === 'openai' || aiType === 'openai-singleturn') {
    const modelId = model || 'gpt-5.6-luna';
    return modelId
      .replace(/^gpt-/i, 'GPT-')
      .replace(/^o(\d)/, 'O$1')
      .split('-')
      .map((part, i) => {
        if (i === 0) return part;
        if (part === 'mini') return 'Mini';
        if (part === 'nano') return 'Nano';
        if (part === 'pro') return 'Pro';
        if (part === 'turbo') return 'Turbo';
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join('-')
      .replace(/-(?=[A-Z])/g, ' ');
  }

  if (aiType === 'claude' || aiType === 'claude-singleturn') {
    const modelId = model || 'claude-sonnet-5';
    // Remove date suffix and format
    const withoutDate = modelId.replace(/-\d{8}$/, '');
    return withoutDate
      .split('-')
      .map((part, i) => {
        if (i === 0) return 'Claude';
        if (part === 'claude') return '';
        if (/^\d+$/.test(part)) return part;
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .filter(Boolean)
      .join(' ')
      .replace(/(\d) (\d)/g, '$1.$2'); // "4 5" -> "4.5"
  }

  if (aiType === 'openrouter' || aiType === 'openrouter-singleturn') {
    return openRouterModelDisplayName(model || 'openai/gpt-5.6-luna');
  }

  if (aiType === 'gemini-free') return 'Gemini 3 Flash Preview';
  if (aiType === 'random') return 'Scimmietta';
  if (aiType === 'heuristic') return 'Furbo';
  if (aiType === 'expert') return 'Esperto';
  if (aiType === 'apple') return 'Apple Intelligence';
  if (aiType === 'multiplayer') return model || 'Player';

  return aiType;
}

/**
 * Get mode indicator for LLM AIs
 */
function getModeIndicator(aiType: ExtendedAIType): string | null {
  if (aiType === 'gemini') return '💬';
  if (aiType === 'gemini-singleturn') return '1️⃣';
  if (aiType === 'openai') return '💬';
  if (aiType === 'openai-singleturn') return '1️⃣';
  if (aiType === 'claude') return '💬';
  if (aiType === 'claude-singleturn') return '1️⃣';
  if (aiType === 'openrouter') return '💬';
  if (aiType === 'openrouter-singleturn') return '1️⃣';
  return null;
}

/**
 * The short form of a model name for a narrow column on a phone: the
 * provider or family word alone ("Gemini 3 Flash Preview" → "Gemini",
 * "GPT-5 Mini" → "GPT-5", "Claude Sonnet 4.5" → "Claude"), "Apple AI" for
 * the on-device model. Null when the full name is already one word (the
 * CPU bots) so nothing is duplicated. The full name stays in the pile
 * label, the token badge and the start screen.
 */
export function shortModelName(aiType: ExtendedAIType, model?: string): string | null {
  if (aiType === 'apple') return 'Apple AI';
  if (aiType === 'multiplayer') return null;
  const full = formatModelName(aiType, model);
  const first = full.split(' ')[0];
  return first && first.length < full.length ? first : null;
}

/**
 * Component that renders an AI player label with proper icon
 */
export function AIPlayerLabel({ aiType, model, className, showModeIndicator = true, compact = false }: AIPlayerLabelProps) {
  // In a compact column the icon is dropped on phones too (CSS hides the
  // wrapper; the icons carry an inline display of their own), so the short
  // name gets the whole width: with the icon, "Gemini" still broke into
  // "Gemin-i" at some widths. The pile label keeps the icon.
  const icon = compact
    ? <span className={styles.icon}><AIIcon aiType={aiType} /></span>
    : <AIIcon aiType={aiType} />;
  // A compact column (the scoreboard) shows the short form of a long name
  // on phones, where the column is a few characters wide and the full
  // name used to wrap into hyphenated fragments ("Gem-ini 3 Flash
  // Pre-view"); CSS picks one of the two spans, so only one is read.
  const full = formatModelName(aiType, model);
  const short = compact ? shortModelName(aiType, model) : null;
  const name = short
    ? <><span className={styles.full}>{full}</span><span className={styles.short}>{short}</span></>
    : full;
  const modeIndicator = showModeIndicator ? getModeIndicator(aiType) : null;

  return (
    <span className={`${className ?? ''} ${compact ? styles.compact : ''}`.trim() || undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3em' }}>
      {icon}
      <span>{name}</span>
      {modeIndicator && <span className={styles.mode}>{modeIndicator}</span>}
    </span>
  );
}

/**
 * Get a plain text version for contexts where ReactNode can't be used
 * Falls back to text approximations of icons
 */
export function getAIDisplayNameText(aiType: ExtendedAIType, model?: string, showModeIndicator = true): string {
  const textIcons: Record<ExtendedAIType, string> = {
    random: '🐒',
    heuristic: '🦊',
    expert: '🐍',
    gemini: '✦',
    'gemini-singleturn': '✦',
    openai: '⬡',
    'openai-singleturn': '⬡',
    claude: '◐',
    'claude-singleturn': '◐',
    openrouter: '⇄',
    'openrouter-singleturn': '⇄',
    'gemini-free': '✦',
    apple: '✦',
    multiplayer: '👤',
  };

  const icon = textIcons[aiType] || '';
  const name = formatModelName(aiType, model);
  const modeIndicator = showModeIndicator ? getModeIndicator(aiType) : null;

  return modeIndicator ? `${icon} ${name} ${modeIndicator}` : `${icon} ${name}`;
}

// Re-export for use in App.tsx
export { AIIcon, formatModelName, getModeIndicator };
