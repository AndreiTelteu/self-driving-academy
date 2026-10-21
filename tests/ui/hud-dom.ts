/** Minimal deterministic DOM used by the 073 HUD tests and evidence report (no jsdom). */
export interface TextNode {
  readonly textContent: string;
}

export class HudElement {
  ownerDocument!: HudDocument;
  readonly tagName: string;
  childNodes: (HudElement | TextNode)[] = [];
  children: HudElement[] = [];
  parent: HudElement | null = null;
  readonly attrs = new Map<string, string>();
  text = '';
  open = false;
  /** Mirrors the DOM `value` property used by `select`/`option` elements. */
  value = '';
  private textNode: TextNode | null = null;
  private readonly eventListeners = new Map<string, HudListener[]>();
  constructor(tagName: string) {
    this.tagName = tagName;
  }
  get className(): string {
    return this.attrs.get('class') ?? '';
  }
  set className(value: string) {
    this.attrs.set('class', value);
  }
  get textContent(): string {
    if (this.textNode) return this.text;
    return this.childNodes.map((node) => node.textContent).join('');
  }
  set textContent(value: string) {
    this.text = value;
    this.children = [];
    this.textNode = value ? { textContent: value } : null;
    this.childNodes = this.textNode ? [this.textNode] : [];
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
  append(...nodes: HudElement[]): void {
    if (this.textNode) {
      this.textNode = null;
      this.text = '';
      this.childNodes = [];
    }
    for (const node of nodes) {
      this.children.push(node);
      this.childNodes.push(node);
      node.parent = this;
    }
  }
  /** Same ordering contract as the DOM `insertBefore`; a null reference appends. */
  insertBefore(node: HudElement, reference: HudElement | null): void {
    if (reference !== null && reference.parent !== this)
      throw new Error('insertBefore reference is not a child of this element');
    node.remove();
    if (this.textNode) {
      this.textNode = null;
      this.text = '';
      this.childNodes = [];
    }
    const index = reference === null ? this.children.length : this.children.indexOf(reference);
    if (index === -1) throw new Error('insertBefore reference is not a child of this element');
    this.children.splice(index, 0, node);
    this.childNodes = [...this.children];
    node.parent = this;
  }
  addEventListener(type: string, listener: HudListener): void {
    const listeners = this.eventListeners.get(type);
    if (listeners === undefined) this.eventListeners.set(type, [listener]);
    else if (!listeners.includes(listener)) listeners.push(listener);
  }
  removeEventListener(type: string, listener: HudListener): void {
    const listeners = this.eventListeners.get(type);
    if (listeners === undefined) return;
    const index = listeners.indexOf(listener);
    if (index !== -1) listeners.splice(index, 1);
  }
  /** Deterministic event delivery for the tests; returns how many listeners ran. */
  dispatch(type: string, init: HudEventInit = {}): number {
    this.dispatchEvent(type, init);
    return (this.eventListeners.get(type) ?? []).length;
  }
  /** Full deterministic event object, used by the keyboard-capture tests. */
  dispatchEvent(type: string, init: HudEventInit = {}): HudEvent {
    const listeners = [...(this.eventListeners.get(type) ?? [])];
    let defaultPrevented = false,
      propagationStopped = false;
    const event: HudEvent = {
      type,
      target: this,
      ...init,
      preventDefault: () => {
        defaultPrevented = true;
      },
      stopPropagation: () => {
        propagationStopped = true;
      },
      get defaultPrevented() {
        return defaultPrevented;
      },
      get propagationStopped() {
        return propagationStopped;
      },
    };
    for (const listener of listeners) listener(event);
    return event;
  }
  get listenerCount(): number {
    let total = 0;
    for (const listeners of this.eventListeners.values()) total += listeners.length;
    return total;
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((node) => node !== this);
    this.parent.childNodes = this.parent.childNodes.filter((node) => node !== this);
    this.parent = null;
  }
}

export interface HudDocument {
  createElement(tagName: string): HudElement;
}

export interface HudEventInit {
  readonly code?: string;
  readonly key?: string;
  readonly repeat?: boolean;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
}

export interface HudEvent extends HudEventInit {
  readonly type: string;
  readonly target: HudElement;
  preventDefault(): void;
  stopPropagation(): void;
  readonly defaultPrevented: boolean;
  readonly propagationStopped: boolean;
}

export type HudListener = (event: HudEvent) => void;

export function createHudDocument(): HudDocument {
  const doc: HudDocument = {
    createElement(tagName: string) {
      const element = new HudElement(tagName);
      element.ownerDocument = doc;
      return element;
    },
  };
  return doc;
}

export function createHudHost(doc: HudDocument): HudElement {
  return doc.createElement('div');
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
}

function serializeNode(node: HudElement | TextNode, depth: number): string {
  if (!('tagName' in node)) return `${'  '.repeat(depth)}${escapeText(node.textContent)}`;
  const attributes = [...node.attrs.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
      .join(''),
    openTag = `<${node.tagName}${attributes}>`,
    indent = '  '.repeat(depth);
  if (node.children.length === 0) {
    if (node.textContent)
      return `${indent}${openTag}${escapeText(node.textContent)}</${node.tagName}>`;
    return `${indent}${openTag}</${node.tagName}>`;
  }
  return [
    `${indent}${openTag}`,
    ...node.children.map((child) => serializeNode(child, depth + 1)),
    `${indent}</${node.tagName}>`,
  ].join('\n');
}

/** Stable pretty-printed HTML for assertions, reports and the visual capture. */
export function serializeHud(element: HudElement): string {
  return serializeNode(element, 0);
}

export function findHudElement(root: HudElement, tagName: string): HudElement | null {
  for (const child of root.children) {
    if (child.tagName === tagName) return child;
    const nested = findHudElement(child, tagName);
    if (nested) return nested;
  }
  return null;
}
