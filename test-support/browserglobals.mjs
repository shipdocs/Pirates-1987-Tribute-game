// Minimale browserglobals voor headless uitvoering in Node (Path2D, opslag en DOM).
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

if (typeof globalThis.addEventListener === 'undefined') {
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
}

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (actie) => {
    actie(0);
    return 1;
  };
}

if (typeof globalThis.document === 'undefined') {
  function maakElement(naam = 'div') {
    const luisteraars = new Map();
    const klassen = new Set();
    const element = {
      tagName: naam.toUpperCase(),
      children: [],
      parentNode: null,
      style: {},
      disabled: false,
      textContent: '',
      classList: {
        add: (...namen) => namen.forEach((n) => klassen.add(n)),
        remove: (...namen) => namen.forEach((n) => klassen.delete(n)),
        contains: (n) => klassen.has(n),
        toggle: (n, aan = !klassen.has(n)) => (aan ? klassen.add(n) : klassen.delete(n), aan),
      },
      appendChild(kind) {
        kind.parentNode = element;
        element.children.push(kind);
        return kind;
      },
      prepend(kind) {
        kind.parentNode = element;
        element.children.unshift(kind);
      },
      removeChild(kind) {
        element.children = element.children.filter((k) => k !== kind);
        kind.parentNode = null;
      },
      remove() {
        if (element.parentNode) element.parentNode.removeChild(element);
      },
      addEventListener(soort, actie) {
        luisteraars.set(soort, actie);
      },
      click() {
        const actie = luisteraars.get('click');
        if (actie) actie({ target: element });
      },
      setAttribute() {},
      querySelector() { return null; },
    };
    let html = '';
    Object.defineProperty(element, 'innerHTML', {
      get: () => html,
      set: (waarde) => {
        html = String(waarde);
        if (!html) element.children = [];
      },
    });
    return element;
  }

  const uiLaag = maakElement('div');
  globalThis.document = {
    createElement: (naam) => maakElement(naam),
    getElementById: (id) => id === 'ui' ? uiLaag : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: maakElement('body'),
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
