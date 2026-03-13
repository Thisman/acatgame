import { READY_CARD_POOL_SIZE } from './constants.js';

export type CardAnimationVariant = 'default' | 'blocker' | 'convert' | 'push' | 'mine';

export interface CardVisualProfile {
  animation: CardAnimationVariant;
}

export interface PlacementLockAuraMechanicDefinition {
  type: 'placementLockAura';
  trigger: 'onPlace';
  durationTurns: number;
  radius: 1;
  includeDiagonals: true;
  target: 'emptyNeighbors';
}

export interface DelayedExplosionMechanicDefinition {
  type: 'delayedExplosion';
  trigger: 'onPlace';
  delayTurns: number;
  radius: 1;
  includeDiagonals: true;
  clearSelf: true;
  target: 'allCells';
}

export interface AdjacentConvertMechanicDefinition {
  type: 'adjacentConvert';
  trigger: 'onPlace';
  radius: 1;
  includeDiagonals: true;
  target: 'enemyNeighbors';
  maxTargets: 1;
}

export interface AdjacentPushMechanicDefinition {
  type: 'adjacentPush';
  trigger: 'onPlace';
  radius: 1;
  includeDiagonals: false;
  target: 'occupiedNeighbors';
  maxTargets: 1;
}

export type CardMechanicDefinition =
  | PlacementLockAuraMechanicDefinition
  | DelayedExplosionMechanicDefinition
  | AdjacentConvertMechanicDefinition
  | AdjacentPushMechanicDefinition;

export interface PlacementLockEffect {
  type: 'placementLock';
  remainingTurns: number;
  sourcePlayerID: string;
  sourceCardID: number;
  sourceBoardIndex: number;
}

export interface ArmedMineEffect {
  type: 'armedMine';
  remainingTurns: number;
  sourcePlayerID: string;
  sourceCardID: number;
  sourceBoardIndex: number;
  radius: 1;
  includeDiagonals: true;
  clearSelf: true;
}

export type BoardCellEffect = PlacementLockEffect | ArmedMineEffect;

export interface CardDefinition {
  id: number;
  nameKey: string;
  descriptionKey: string;
  visual: CardVisualProfile;
  mechanics: CardMechanicDefinition[];
}

const BLOCKER_CARD_IDS = new Set([0, 1, 2]);
const CONVERT_CARD_IDS = new Set([3, 4, 5]);
const MINE_CARD_IDS = new Set([6, 7, 8]);
const PUSH_CARD_IDS = new Set([9, 10, 11]);

const BLOCKER_MECHANIC: PlacementLockAuraMechanicDefinition = {
  type: 'placementLockAura',
  trigger: 'onPlace',
  durationTurns: 2,
  radius: 1,
  includeDiagonals: true,
  target: 'emptyNeighbors',
};

const MINE_MECHANIC: DelayedExplosionMechanicDefinition = {
  type: 'delayedExplosion',
  trigger: 'onPlace',
  delayTurns: 2,
  radius: 1,
  includeDiagonals: true,
  clearSelf: true,
  target: 'allCells',
};

const CONVERT_MECHANIC: AdjacentConvertMechanicDefinition = {
  type: 'adjacentConvert',
  trigger: 'onPlace',
  radius: 1,
  includeDiagonals: true,
  target: 'enemyNeighbors',
  maxTargets: 1,
};

const PUSH_MECHANIC: AdjacentPushMechanicDefinition = {
  type: 'adjacentPush',
  trigger: 'onPlace',
  radius: 1,
  includeDiagonals: false,
  target: 'occupiedNeighbors',
  maxTargets: 1,
};

const createBlockerCardDefinition = (id: number): CardDefinition => ({
  id,
  nameKey: 'cards.blocker.name',
  descriptionKey: 'cards.blocker.description',
  visual: {
    animation: 'blocker',
  },
  mechanics: [BLOCKER_MECHANIC],
});

const createMineCardDefinition = (id: number): CardDefinition => ({
  id,
  nameKey: 'cards.mine.name',
  descriptionKey: 'cards.mine.description',
  visual: {
    animation: 'mine',
  },
  mechanics: [MINE_MECHANIC],
});

const createConvertCardDefinition = (id: number): CardDefinition => ({
  id,
  nameKey: 'cards.convert.name',
  descriptionKey: 'cards.convert.description',
  visual: {
    animation: 'convert',
  },
  mechanics: [CONVERT_MECHANIC],
});

const createPushCardDefinition = (id: number): CardDefinition => ({
  id,
  nameKey: 'cards.push.name',
  descriptionKey: 'cards.push.description',
  visual: {
    animation: 'push',
  },
  mechanics: [PUSH_MECHANIC],
});

const createNormalCardDefinition = (id: number): CardDefinition => ({
  id,
  nameKey: 'cards.normal.name',
  descriptionKey: 'cards.normal.description',
  visual: {
    animation: 'default',
  },
  mechanics: [],
});

const FALLBACK_CARD_DEFINITION = createNormalCardDefinition(-1);

const CARD_DEFINITIONS = Array.from({ length: READY_CARD_POOL_SIZE }, (_value, cardID) =>
  BLOCKER_CARD_IDS.has(cardID)
    ? createBlockerCardDefinition(cardID)
    : CONVERT_CARD_IDS.has(cardID)
      ? createConvertCardDefinition(cardID)
      : PUSH_CARD_IDS.has(cardID)
        ? createPushCardDefinition(cardID)
    : MINE_CARD_IDS.has(cardID)
      ? createMineCardDefinition(cardID)
      : createNormalCardDefinition(cardID),
);

export const getCardDefinition = (cardID: number): CardDefinition =>
  CARD_DEFINITIONS[cardID] ?? FALLBACK_CARD_DEFINITION;

export const getAllCardDefinitions = (): readonly CardDefinition[] => CARD_DEFINITIONS;

export const getAdjacentConvertMechanic = (cardID: number): AdjacentConvertMechanicDefinition | null =>
  getCardDefinition(cardID).mechanics.find(
    (mechanic): mechanic is AdjacentConvertMechanicDefinition => mechanic.type === 'adjacentConvert',
  ) ?? null;

export const getAdjacentPushMechanic = (cardID: number): AdjacentPushMechanicDefinition | null =>
  getCardDefinition(cardID).mechanics.find(
    (mechanic): mechanic is AdjacentPushMechanicDefinition => mechanic.type === 'adjacentPush',
  ) ?? null;
