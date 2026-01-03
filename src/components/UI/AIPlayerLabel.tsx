// AI Player Label component with proper icons for each AI type

import type { ReactNode } from 'react';
import type { ExtendedAIType } from '../../ai';
import { OpenAIIcon } from './OpenAIIcon';
import { ClaudeIcon } from './ClaudeIcon';
import { GeminiIcon } from './GeminiIcon';

interface AIPlayerLabelProps {
  /** The AI type */
  aiType: ExtendedAIType;
  /** The model ID (for LLM AIs) */
  model?: string;
  /** Additional class name */
  className?: string;
  /** Whether to show the mode indicator (💬/1️⃣) */
  showModeIndicator?: boolean;
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
      return <GeminiIcon size="1em" className={className} />;
    case 'claude':
    case 'claude-singleturn':
      return <ClaudeIcon size="1em" className={className} />;
    case 'random':
      return <span style={{ fontSize: '1em' }}>🐒</span>;
    case 'heuristic':
      return <span style={{ fontSize: '1em' }}>🦊</span>;
    case 'expert':
      return <span style={{ fontSize: '1em' }}>🧠</span>;
    default:
      return null;
  }
}

/**
 * Format model name for display
 */
function formatModelName(aiType: ExtendedAIType, model?: string): string {
  if (aiType === 'gemini' || aiType === 'gemini-singleturn') {
    const modelId = model || 'gemini-2.0-flash';
    return modelId
      .replace('gemini-', 'Gemini ')
      .split('-')
      .map((part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  if (aiType === 'openai' || aiType === 'openai-singleturn') {
    const modelId = model || 'gpt-4o-mini';
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
    const modelId = model || 'claude-sonnet-4-5-20250929';
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

  if (aiType === 'random') return 'Scimmietta';
  if (aiType === 'heuristic') return 'Furbo';
  if (aiType === 'expert') return 'Esperto';

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
  return null;
}

/**
 * Component that renders an AI player label with proper icon
 */
export function AIPlayerLabel({ aiType, model, className, showModeIndicator = true }: AIPlayerLabelProps) {
  const icon = <AIIcon aiType={aiType} />;
  const name = formatModelName(aiType, model);
  const modeIndicator = showModeIndicator ? getModeIndicator(aiType) : null;

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3em' }}>
      {icon}
      <span>{name}</span>
      {modeIndicator && <span>{modeIndicator}</span>}
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
    expert: '🧠',
    gemini: '✦',
    'gemini-singleturn': '✦',
    openai: '⬡',
    'openai-singleturn': '⬡',
    claude: '◐',
    'claude-singleturn': '◐',
  };

  const icon = textIcons[aiType] || '';
  const name = formatModelName(aiType, model);
  const modeIndicator = showModeIndicator ? getModeIndicator(aiType) : null;

  return modeIndicator ? `${icon} ${name} ${modeIndicator}` : `${icon} ${name}`;
}

// Re-export for use in App.tsx
export { AIIcon, formatModelName, getModeIndicator };
