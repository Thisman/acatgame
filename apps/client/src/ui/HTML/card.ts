import { createContainer, type ContainerComponent } from './container.js';
import type { ClassNameValue } from './dom.js';

export interface CardOptions {
  className?: ClassNameValue;
  width?: number;
  visible?: boolean;
  styles?: Partial<CSSStyleDeclaration>;
}

export interface CardComponent extends ContainerComponent<HTMLDivElement> {
  setWidth(width: number): void;
}

export function createCard(options: CardOptions = {}): CardComponent {
  const className = ['ui-card'];

  if (options.className) {
    className.push(...(Array.isArray(options.className) ? options.className : [options.className]));
  }

  const container = createContainer('div', {
    className,
    visible: options.visible,
    display: 'flex',
    styles: options.styles,
  });

  if (typeof options.width === 'number') {
    container.element.style.width = `${options.width}px`;
  }

  return {
    ...container,
    setWidth(width) {
      container.element.style.width = `${width}px`;
    },
  };
}
