import { applyDomElementOptions, createDomElement, type ClassNameValue } from './dom.js';

export type TextBlockVariant = 'title' | 'subtitle' | 'status' | 'hint' | 'code' | 'meta' | 'error';

const TEXT_BLOCK_CLASS_BY_VARIANT: Record<TextBlockVariant, string> = {
  title: 'ui-title',
  subtitle: 'ui-subtitle',
  status: 'ui-status',
  hint: 'ui-hint',
  code: 'ui-code',
  meta: 'ui-game-meta',
  error: 'ui-error',
};

type TextBlockTagName = 'h1' | 'p' | 'span';

export interface TextBlockOptions<T extends TextBlockTagName = TextBlockTagName> {
  variant: TextBlockVariant;
  tagName?: T;
  text?: string;
  className?: ClassNameValue;
  visible?: boolean;
  display?: string;
  styles?: Partial<CSSStyleDeclaration>;
}

export interface TextBlockComponent<T extends HTMLElement = HTMLElement> {
  element: T;
  setText(text: string): void;
  setVisible(visible: boolean): void;
  setStyles(styles: Partial<CSSStyleDeclaration>): void;
}

export function createTextBlock<T extends TextBlockTagName = 'p'>(
  options: TextBlockOptions<T>,
): TextBlockComponent<HTMLElementTagNameMap[T]> {
  const tagName = options.tagName ?? (options.variant === 'title' ? 'h1' : 'p');
  const className = [TEXT_BLOCK_CLASS_BY_VARIANT[options.variant]];

  if (options.className) {
    className.push(...(Array.isArray(options.className) ? options.className : [options.className]));
  }

  const element = createDomElement(tagName, className);
  const display = options.display ?? '';

  if (typeof options.text === 'string') {
    element.textContent = options.text;
  }

  applyDomElementOptions(element, {
    visible: options.visible,
    display,
    styles: options.styles,
  });

  return {
    element,
    setText(text) {
      element.textContent = text;
    },
    setVisible(visible) {
      element.style.display = visible ? display : 'none';
    },
    setStyles(styles) {
      Object.assign(element.style, styles);
    },
  };
}
