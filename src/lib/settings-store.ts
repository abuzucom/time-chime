/** Maintain a stable settings snapshot across subscriptions. */
export function createSettingsStore<T extends object>(
  initialSettings: T,
  load: () => T,
  makeDefault: () => T,
) {
  const initial = { settings: initialSettings, ready: false };
  let snapshot = initial;
  const listeners = new Set<() => void>();

  function publish(settings: T): void {
    snapshot = { settings, ready: true };
    for (const listener of Array.from(listeners)) listener();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    if (!snapshot.ready) publish(load());
    return () => {
      listeners.delete(listener);
    };
  }

  function update(patch: Partial<T>): void {
    if (!snapshot.ready) publish(load());
    publish({ ...snapshot.settings, ...patch });
  }

  return {
    subscribe,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    update,
    reset: () => publish(makeDefault()),
  };
}
