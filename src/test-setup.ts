import { mock } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { afterEach } from "bun:test";

// partyserver imports from cloudflare:workers, which isn't available in
// the Bun test runtime. Stub it out so the module loads.
mock.module("cloudflare:workers", () => ({
    DurableObject: class {},
    env: {},
}));

const window = new GlobalWindow({ url: "http://localhost/" });

// Core DOM globals
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  location: window.location,
  history: window.history,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLDivElement: window.HTMLDivElement,
  HTMLSpanElement: window.HTMLSpanElement,
  SVGElement: window.SVGElement,
  Element: window.Element,
  Node: window.Node,
  Text: window.Text,
  Comment: window.Comment,
  DocumentFragment: window.DocumentFragment,
  MutationObserver: window.MutationObserver,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  KeyboardEvent: window.KeyboardEvent,
  MouseEvent: window.MouseEvent,
  FocusEvent: window.FocusEvent,
  InputEvent: window.InputEvent,
  PointerEvent: window.PointerEvent,
  getComputedStyle: window.getComputedStyle.bind(window),
  NodeFilter: window.NodeFilter,
  NodeIterator: window.NodeIterator,
  TreeWalker: window.TreeWalker,
  Range: window.Range,
  Selection: window.Selection,
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(cb, 16),
  cancelAnimationFrame: clearTimeout,
  ResizeObserver: class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  IntersectionObserver: class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

afterEach(() => {
  document.body.innerHTML = "";
});
