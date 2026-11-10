import assert from "node:assert/strict";
import { test } from "node:test";
import { createSettingsStore } from "./settings-store.ts";

test("an early update preserves settings loaded before subscription", () => {
  const store = createSettingsStore(
    { theme: "light", notifications: false },
    () => ({ theme: "dark", notifications: false }),
    () => ({ theme: "light", notifications: false }),
  );

  store.update({ notifications: true });

  assert.deepEqual(store.getSnapshot(), {
    settings: { theme: "dark", notifications: true },
    ready: true,
  });
});
