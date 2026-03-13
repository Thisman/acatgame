import { applyDomElementOptions, createDomElement, type ClassNameValue } from './dom.js';

export interface TextInputOptions {
  placeholder?: string;
  value?: string;
  maxLength?: number;
  visible?: boolean;
  className?: ClassNameValue;
  styles?: Partial<CSSStyleDeclaration>;
  onEnter?: (() => void) | null;
  onInput?: ((value: string) => void) | null;
}

export interface TextInputComponent {
  element: HTMLInputElement;
  setPlaceholder(placeholder: string): void;
  setValue(value: string): void;
  setVisible(visible: boolean): void;
  setStyles(styles: Partial<CSSStyleDeclaration>): void;
}

export function createTextInput(options: TextInputOptions = {}): TextInputComponent {
  const element = createDomElement('input', ['ui-input']);
  element.type = 'text';

  if (typeof options.value === 'string') {
    element.value = options.value;
  }

  if (typeof options.placeholder === 'string') {
    element.placeholder = options.placeholder;
  }

  if (typeof options.maxLength === 'number') {
    element.maxLength = options.maxLength;
  }

  if (options.className) {
    element.className = ['ui-input']
      .concat(Array.isArray(options.className) ? options.className : [options.className])
      .join(' ');
  }

  if (options.onEnter) {
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        options.onEnter?.();
      }
    });
  }

  if (options.onInput) {
    element.addEventListener('input', () => {
      options.onInput?.(element.value);
    });
  }

  applyDomElementOptions(element, options);

  return {
    element,
    setPlaceholder(placeholder) {
      element.placeholder = placeholder;
    },
    setValue(value) {
      element.value = value;
    },
    setVisible(visible) {
      element.style.display = visible ? '' : 'none';
    },
    setStyles(styles) {
      Object.assign(element.style, styles);
    },
  };
}
