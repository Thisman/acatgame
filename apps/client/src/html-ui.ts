const UI_ROOT_ID = 'ui-root';

function getUiRoot() {
  const root = document.getElementById(UI_ROOT_ID);

  if (!root) {
    throw new Error(`UI root "${UI_ROOT_ID}" not found.`);
  }

  return root;
}

export class HtmlOverlay {
  readonly element: HTMLDivElement;

  constructor(className: string = 'ui-screen') {
    this.element = document.createElement('div');
    this.element.className = className;
    getUiRoot().appendChild(this.element);
  }

  destroy() {
    this.element.remove();
  }
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  textContent?: string,
) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (typeof textContent === 'string') {
    element.textContent = textContent;
  }

  return element;
}
