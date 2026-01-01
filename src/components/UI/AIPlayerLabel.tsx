// AI Player Label component with proper icons for each AI type

import type { ReactNode } from 'react';
import type { ExtendedAIType } from '../../ai';
import { OpenAIIcon } from './OpenAIIcon';

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

/** Gemini sparkle icon */
function GeminiIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      width="1em"
      height="1em"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {/* Four-pointed star/sparkle for Gemini */}
      <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
    </svg>
  );
}

/**
 * Get the icon for an AI type
 */
function AIIcon({ aiType, className }: { aiType: ExtendedAIType; className?: string }): ReactNode {
  switch (aiType) {
    case 'openai':
      return <OpenAIIcon size="1em" className={className} />;
    case 'gemini':
    case 'gemini-singleturn':
      return <GeminiIcon className={className} />;
    case 'random':
      return <span style={{ fontSize: '1em' }}>🐒</span>;
    case 'heuristic':
      return <span style={{ fontSize: '1em' }}>🦊</span>;
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

  if (aiType === 'openai') {
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

  if (aiType === 'random') return 'Scimmietta';
  if (aiType === 'heuristic') return 'Furbo';

  return aiType;
}

/**
 * Get mode indicator for LLM AIs
 */
function getModeIndicator(aiType: ExtendedAIType): string | null {
  if (aiType === 'gemini') return '💬';
  if (aiType === 'gemini-singleturn') return '1️⃣';
  if (aiType === 'openai') return '💬';
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
    gemini: '✦',
    'gemini-singleturn': '✦',
    openai: '⬡',
  };

  const icon = textIcons[aiType] || '';
  const name = formatModelName(aiType, model);
  const modeIndicator = showModeIndicator ? getModeIndicator(aiType) : null;

  return modeIndicator ? `${icon} ${name} ${modeIndicator}` : `${icon} ${name}`;
}

// Re-export for use in App.tsx
export { AIIcon, formatModelName, getModeIndicator };
