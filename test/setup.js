// Global mocks for headless node execution of browser globals (Path2D, localStorage, window, document)
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

if (typeof globalThis.addEventListener === 'undefined') {
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({
      style: {},
      classList: { add: () => {}, remove: () => {} },
      appendChild: () => {},
      removeChild: () => {},
      addEventListener: () => {},
      setAttribute: () => {},
    }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { appendChild: () => {}, removeChild: () => {} },
  };
}

if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D {
    constructor() {
      this.ops = [];
    }
    moveTo(x, y) { this.ops.push(['moveTo', x, y]); }
    lineTo(x, y) { this.ops.push(['lineTo', x, y]); }
    closePath() { this.ops.push(['closePath']); }
    arc(x, y, r, sa, ea) { this.ops.push(['arc', x, y, r, sa, ea]); }
    rect(x, y, w, h) { this.ops.push(['rect', x, y, w, h]); }
    addPath(p) { this.ops.push(['addPath', p]); }
  };
}

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(String(key)) ?? null,
    setItem: (key, val) => store.set(String(key), String(val)),
    removeItem: (key) => store.delete(String(key)),
    clear: () => store.clear(),
  };
}
