import { CAT_MATCH_BOARD_SIZE, getCardDefinition, type BoardCellEffect } from '@acatgame/game-core';

import { t } from './i18n.js';

export function getCardTooltipContent(cardID: number) {
  const definition = getCardDefinition(cardID);

  return {
    title: t(definition.nameKey),
    text: t(definition.descriptionKey),
  };
}

export function normalizeCellEffects(cellEffects?: Array<BoardCellEffect[]> | null) {
  const normalized = Array.from({ length: CAT_MATCH_BOARD_SIZE * CAT_MATCH_BOARD_SIZE }, () => [] as BoardCellEffect[]);

  if (!cellEffects) {
    return normalized;
  }

  for (let index = 0; index < normalized.length; index += 1) {
    normalized[index] = (cellEffects[index] ?? []).map((effect) => ({ ...effect }));
  }

  return normalized;
}

export function previewCellEffectsForPlacement(cellEffects?: Array<BoardCellEffect[]> | null) {
  return normalizeCellEffects(cellEffects);
}

export function getPlacementLockEffect(effects?: BoardCellEffect[] | null) {
  return (effects ?? []).find((effect) => effect.type === 'placementLock' && effect.remainingTurns > 0) ?? null;
}

export function getArmedMineEffect(effects?: BoardCellEffect[] | null) {
  return (effects ?? []).find((effect) => effect.type === 'armedMine' && effect.remainingTurns > 0) ?? null;
}
