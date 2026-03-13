import { i18n } from './i18n.js';

export class UiError extends Error {
  constructor(
    readonly code: string | null,
    readonly fallback: string,
  ) {
    super(fallback);
  }
}

export function getUiErrorMessage(error: UiError | null): string {
  if (!error) {
    return '';
  }

  if (error.code && i18n.has(`errors.${error.code}`)) {
    return i18n.t(`errors.${error.code}`);
  }

  return error.fallback || i18n.t('errors.request_failed');
}

export function toUiError(error: unknown, fallbackCode?: string): UiError {
  if (error instanceof UiError) {
    return error;
  }

  if (error instanceof Error) {
    return new UiError(fallbackCode ?? null, error.message);
  }

  return new UiError(fallbackCode ?? 'request_failed', i18n.t('errors.request_failed'));
}
