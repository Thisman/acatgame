import { applyDomElementOptions, createDomElement, type ClassNameValue } from './dom.js';

export interface ContainerOptions {
  className?: ClassNameValue;
  visible?: boolean;
  display?: string;
  styles?: Partial<CSSStyleDeclaration>;
}

export interface ContainerComponent<T extends HTMLElement = HTMLDivElement> {
  element: T;
  setVisible(visible: boolean): void;
  setStyles(styles: Partial<CSSStyleDeclaration>): void;
}

export function createContainer<T extends keyof HTMLElementTagNameMap = 'div'>(
  tagName?: T,
  options: ContainerOptions = {},
): ContainerComponent<HTMLElementTagNameMap[T]> {
  const element = createDomElement(tagName ?? ('div' as T), options.className);
  const display = options.display ?? '';

  applyDomElementOptions(element, options);

  return {
    element,
    setVisible(visible) {
      element.style.display = visible ? display : 'none';
    },
    setStyles(styles) {
      Object.assign(element.style, styles);
    },
  };
}
