import { applyDomElementOptions, createDomElement, type ClassNameValue } from './dom.js';

export interface SpinnerOptions {
  visible?: boolean;
  size?: number;
  className?: ClassNameValue;
  styles?: Partial<CSSStyleDeclaration>;
}

export interface SpinnerComponent {
  element: HTMLDivElement;
  setVisible(visible: boolean): void;
  setSize(size: number): void;
  setStyles(styles: Partial<CSSStyleDeclaration>): void;
}

export function createSpinner(options: SpinnerOptions = {}): SpinnerComponent {
  const className = ['ui-spinner'];

  if (options.className) {
    className.push(...(Array.isArray(options.className) ? options.className : [options.className]));
  }

  const element = createDomElement('div', className);

  if (typeof options.size === 'number') {
    element.style.width = `${options.size}px`;
    element.style.height = `${options.size}px`;
  }

  applyDomElementOptions(element, options);

  return {
    element,
    setVisible(visible) {
      element.style.display = visible ? '' : 'none';
    },
    setSize(size) {
      element.style.width = `${size}px`;
      element.style.height = `${size}px`;
    },
    setStyles(styles) {
      Object.assign(element.style, styles);
    },
  };
}
