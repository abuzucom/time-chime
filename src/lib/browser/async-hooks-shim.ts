/**
 * Minimal browser shim for libraries that accidentally import
 * `node:async_hooks` through an isomorphic entrypoint.
 *
 * TanStack Start's transformed server-function client stubs import a module
 * graph that includes `getStartContextServerOnly`; that branch is never
 * executed in the browser, but Vite still evaluates the module and Node's
 * externalized placeholder throws when `new AsyncLocalStorage()` is created.
 * This tiny shim keeps evaluation safe while preserving the API shape needed
 * by the unused server-only branch.
 */
export class AsyncLocalStorage<T = unknown> {
  private value: T | undefined;

  run<R>(store: T, callback: (...args: Array<unknown>) => R, ...args: Array<unknown>): R {
    const previousValue = this.value;
    this.value = store;
    try {
      return callback(...args);
    } finally {
      this.value = previousValue;
    }
  }

  getStore(): T | undefined {
    return this.value;
  }

  enterWith(store: T): void {
    this.value = store;
  }

  disable(): void {
    this.value = undefined;
  }
}
