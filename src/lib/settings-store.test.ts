import assert from "node:assert/strict";
import { test } from "node:test";
import { createSettingsStore } from "./settings-store.ts";

test("settings store hydrates once and notifies active subscribers", () => {
  let loads = 0;
  const store = createSettingsStore(
    { theme: "light" },
    () => {
      loads += 1;
      return { theme: "dark" };
    },
    () => ({ theme: "light" }),
  );
  const observed: string[] = [];
  const unsubscribe = store.subscribe(() => observed.push(store.getSnapshot().settings.theme));
  assert.deepEqual(store.getServerSnapshot(), { settings: { theme: "light" }, ready: false });
  assert.deepEqual(store.getSnapshot(), { settings: { theme: "dark" }, ready: true });
  store.update({ theme: "grey" });
  store.reset();
  unsubscribe();
  store.update({ theme: "dark" });
  assert.deepEqual(observed, ["dark", "grey", "light"]);
  assert.equal(loads, 1);
});
