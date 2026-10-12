/**
 * jsdom gaps that Mantine and Recharts rely on.
 *
 * jsdom implements the DOM but not these browser APIs. Mantine's colour-scheme
 * provider calls `matchMedia` on mount, and Recharts measures its container
 * with `ResizeObserver`, so without the stubs every component test throws
 * before it can assert anything.
 *
 * Guarded on `window` so the node-environment tests are unaffected.
 */

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }

  if (!('ResizeObserver' in window)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver =
      ResizeObserverStub
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      ResizeObserverStub
  }
}
