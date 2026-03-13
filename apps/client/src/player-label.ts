import { t } from './i18n.js';

export function getPlayerLabel(playerID: string | null | undefined) {
  if (playerID === '0') {
    return t('players.1');
  }

  if (playerID === '1') {
    return t('players.2');
  }

  const numericId = Number(playerID);
  const number = Number.isFinite(numericId) ? numericId + 1 : '?';
  return t('players.generic', { number });
}
