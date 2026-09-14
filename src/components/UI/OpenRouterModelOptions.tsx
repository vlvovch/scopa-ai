// <option>s for an OpenRouter model picker: the catalogue grouped by vendor
// (<optgroup>), each model with its per-million-token prices so a 400-entry
// list stays navigable in a native <select>. The selected id is always an
// option, so the <select> never shows a model other than the one in state:
// a retired id shows up flagged (and the pickers then normalize it).

import { formatOpenRouterPrice, isOpenRouterCatalogueLoaded, type OpenRouterModelInfo } from '../../ai/openrouterProvider';
import { useT } from '../../i18n/LanguageContext';

interface OpenRouterModelOptionsProps {
  models: OpenRouterModelInfo[];
  /** The id in state; rendered on its own when the catalogue lacks it. */
  selectedId?: string;
}

function openRouterOptionLabel(model: OpenRouterModelInfo): string {
  const price = formatOpenRouterPrice(model);
  return price ? `${model.displayName} (${price})` : model.displayName;
}

export function OpenRouterModelOptions({ models, selectedId }: OpenRouterModelOptionsProps) {
  const t = useT();
  if (models.length === 0) {
    return selectedId ? <option value={selectedId}>{selectedId}</option> : null;
  }
  const groups: { label: string; models: OpenRouterModelInfo[] }[] = [];
  for (const model of models) {
    const last = groups[groups.length - 1];
    if (last && last.label === model.group) last.models.push(model);
    else groups.push({ label: model.group, models: [model] });
  }
  const selectedMissing = !!selectedId && !models.some((m) => m.id === selectedId);
  return (
    <>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.models.map((model) => (
            <option key={model.id} value={model.id}>{openRouterOptionLabel(model)}</option>
          ))}
        </optgroup>
      ))}
      {selectedMissing && (
        <option value={selectedId}>
          {isOpenRouterCatalogueLoaded() ? `${selectedId} (${t.start.modelUnavailable})` : selectedId}
        </option>
      )}
    </>
  );
}
