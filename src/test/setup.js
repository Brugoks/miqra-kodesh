import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  if (typeof globalThis.Storage === 'undefined') {
    globalThis.Storage = class Storage {};
  }
  Object.defineProperties(globalThis.Storage.prototype, {
    getItem: { value: function getItem(key) { return store.get(String(key)) ?? null; }, configurable: true },
    setItem: { value: function setItem(key, value) { store.set(String(key), String(value)); }, configurable: true },
    removeItem: { value: function removeItem(key) { store.delete(String(key)); }, configurable: true },
    clear: { value: function clear() { store.clear(); }, configurable: true },
    key: { value: function key(index) { return Array.from(store.keys())[index] ?? null; }, configurable: true },
    length: {
      get() {
        return store.size;
      },
      configurable: true,
    },
  });
  globalThis.localStorage = Object.create(globalThis.Storage.prototype);
}

if (typeof globalThis.window !== 'undefined' && typeof window.localStorage === 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: globalThis.localStorage,
    configurable: true,
  });
}

// jsdom lacks several APIs Radix UI primitives rely on.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom lacks object URLs (used for screenshot previews).
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => `blob:mock-${Math.random().toString(36).slice(2)}`);
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = vi.fn();
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
