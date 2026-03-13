export type ClassNameValue = string | string[] | undefined;

export interface DomElementOptions {
  className?: ClassNameValue;
  visible?: boolean;
  display?: string;
  styles?: Partial<CSSStyleDeclaration>;
}

export function createDomElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: ClassNameValue,
) {
  const element = document.createElement(tagName);
  applyClassName(element, className);
  return element;
}

export function applyClassName(element: HTMLElement, className?: ClassNameValue) {
  const classes = toClassName(className);

  if (classes) {
    element.className = classes;
  }
}

export function applyDomElementOptions(
  element: HTMLElement,
  { visible = true, display = '', styles }: DomElementOptions = {},
) {
  setElementVisible(element, visible, display);

  if (styles) {
    Object.assign(element.style, styles);
  }
}

export function setElementVisible(element: HTMLElement, visible: boolean, display: string = '') {
  element.style.display = visible ? display : 'none';
}

function toClassName(className?: ClassNameValue) {
  if (!className) {
    return '';
  }

  return Array.isArray(className) ? className.filter(Boolean).join(' ') : className;
}
