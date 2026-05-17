// Ask the browser/OS to keep our localStorage durable.
//
// Settings, stats and the multiplayer session live in localStorage. In a
// TWA / Android WebView / installed-PWA context that's best-effort: the
// OS can evict it under storage pressure. `navigator.storage.persist()`
// upgrades it to "persistent" — exempt from automatic eviction — when
// granted. Grant is heuristic (installed PWA, engagement, bookmarked);
// calling it is harmless if denied (data still works as normal
// best-effort storage) and a no-op if the API is absent (older
// Safari/WebView).
//
// Strategy: try once on load; if not yet persisted, retry once on the
// first user gesture (some engines weigh interaction/engagement). Never
// throws; never prompts beyond the engine's own (rare) behaviour.

let attempted = false;

async function tryPersist(): Promise<boolean> {
  try {
    if (!('storage' in navigator) || !navigator.storage?.persist) {
      return false;
    }
    if (await navigator.storage.persisted()) {
      return true; // already durable — nothing to do
    }
    const granted = await navigator.storage.persist();
    console.debug(
      `[persistentStorage] navigator.storage.persist() → ${granted}`
    );
    return granted;
  } catch (err) {
    console.debug('[persistentStorage] request failed:', err);
    return false;
  }
}

export function requestPersistentStorage(): void {
  if (attempted) return;
  attempted = true;

  void tryPersist().then((granted) => {
    if (granted) return;

    // Not granted yet — retry once after the first user interaction.
    const retry = () => {
      document.removeEventListener('pointerdown', retry);
      document.removeEventListener('keydown', retry);
      void tryPersist();
    };
    document.addEventListener('pointerdown', retry, { once: true });
    document.addEventListener('keydown', retry, { once: true });
  });
}
