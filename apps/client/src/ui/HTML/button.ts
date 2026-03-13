import { applyDomElementOptions, createDomElement, type ClassNameValue } from './dom.js';

export type ButtonVariant = 'primary' | 'secondary';

const BUTTON_CLASS_BY_VARIANT: Record<ButtonVariant, string[]> = {
  primary: ['ui-button'],
  secondary: ['ui-button', 'ui-button--secondary'],
};

export interface ButtonOptions {
  variant?: ButtonVariant;
  text?: string;
  visible?: boolean;
  disabled?: boolean;
  onClick?: (() => void) | null;
  type?: 'button' | 'submit' | 'reset';
  minWidth?: number;
  className?: ClassNameValue;
  styles?: Partial<CSSStyleDeclaration>;
}

export interface ButtonComponent {
  element: HTMLButtonElement;
  setText(text: string): void;
  setVisible(visible: boolean): void;
  setDisabled(disabled: boolean): void;
  setOnClick(handler: (() => void) | null): void;
  setMinWidth(minWidth: number): void;
  setStyles(styles: Partial<CSSStyleDeclaration>): void;
}

export function createButton(options: ButtonOptions = {}): ButtonComponent {
  const variant = options.variant ?? 'primary';
  const className = [...BUTTON_CLASS_BY_VARIANT[variant]];

  if (options.className) {
    className.push(...(Array.isArray(options.className) ? options.className : [options.className]));
  }

  const element = createDomElement('button', className);
  element.type = options.type ?? 'button';
  element.disabled = options.disabled ?? false;

  if (typeof options.text === 'string') {
    element.textContent = options.text;
  }

  if (typeof options.minWidth === 'number') {
    element.style.minWidth = `${options.minWidth}px`;
  }

  applyDomElementOptions(element, options);
  element.onclick = options.onClick ?? null;

  return {
    element,
    setText(text) {
      element.textContent = text;
    },
    setVisible(visible) {
      element.style.display = visible ? '' : 'none';
    },
    setDisabled(disabled) {
      element.disabled = disabled;
    },
    setOnClick(handler) {
      element.onclick = handler;
    },
    setMinWidth(minWidth) {
      element.style.minWidth = `${minWidth}px`;
    },
    setStyles(styles) {
      Object.assign(element.style, styles);
    },
  };
}
