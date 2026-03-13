import { applyClassName, createDomElement, type ClassNameValue } from './dom.js';

const UI_ROOT_ID = 'ui-root';

function getUiRoot() {
  const root = document.getElementById(UI_ROOT_ID);

  if (!root) {
    throw new Error(`UI root "${UI_ROOT_ID}" not found.`);
  }

  return root;
}

export class OverlayRoot {
  readonly element: HTMLDivElement;

  constructor(className: ClassNameValue = 'ui-screen') {
    this.element = createDomElement('div');
    applyClassName(this.element, className);
    getUiRoot().appendChild(this.element);
  }

  destroy() {
    this.element.remove();
  }
}
