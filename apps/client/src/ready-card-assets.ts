import Phaser from 'phaser';
import {
  CAT_SPRITE_ANIMATION_FRAMES,
  CAT_SPRITE_FRAME_SIZE,
  getCardDefinition,
  type CardAnimationVariant,
} from '@acatgame/game-core';

import { UI_THEME } from './theme.js';

export const PLAYER_CAT_SPRITESHEET_KEYS = {
  '0': 'player-cat-sheet-0',
  '1': 'player-cat-sheet-1',
} as const;

export const PLAYER_CAT_ANIMATION_KEYS = {
  '0': {
    default: 'player-cat-idle-0',
    blocker: 'player-cat-blocker-0',
  },
  '1': {
    default: 'player-cat-idle-1',
    blocker: 'player-cat-blocker-1',
  },
} as const;

const PLAYER_CAT_SOURCES = {
  '0': 'assets/cat-sheet.png',
  '1': 'assets/cat-sheet-orange.png',
} as const;

const READY_CARD_FALLBACK_PREFIX = 'ready-card-fallback-';
const CAT_SPRITESHEET_COLUMNS = 16;
const BLOCKER_ROW_INDEX = 3;
const BLOCKER_ANIMATION_FRAMES = 4;

export const READY_CARD_SPRITESHEET_KEY = PLAYER_CAT_SPRITESHEET_KEYS['0'];
export const READY_CARD_ANIMATION_KEY = PLAYER_CAT_ANIMATION_KEYS['0'].default;

export function preloadReadyCardAssets(scene: Phaser.Scene) {
  for (const playerID of Object.keys(PLAYER_CAT_SOURCES) as Array<keyof typeof PLAYER_CAT_SOURCES>) {
    scene.load.spritesheet(PLAYER_CAT_SPRITESHEET_KEYS[playerID], PLAYER_CAT_SOURCES[playerID], {
      frameWidth: CAT_SPRITE_FRAME_SIZE,
      frameHeight: CAT_SPRITE_FRAME_SIZE,
    });
  }
}

export function ensureReadyCardAnimation(scene: Phaser.Scene) {
  ensurePlayerCatAnimations(scene);
}

export function ensurePlayerCatAnimations(scene: Phaser.Scene) {
  createFallbackFrames(scene);

  for (const playerID of Object.keys(PLAYER_CAT_ANIMATION_KEYS) as Array<keyof typeof PLAYER_CAT_ANIMATION_KEYS>) {
    for (const variant of Object.keys(PLAYER_CAT_ANIMATION_KEYS[playerID]) as CardAnimationVariant[]) {
      const animationKey = PLAYER_CAT_ANIMATION_KEYS[playerID][variant];

      if (scene.anims.exists(animationKey)) {
        continue;
      }

      const spritesheetKey = PLAYER_CAT_SPRITESHEET_KEYS[playerID];
      const frames = scene.textures.exists(spritesheetKey)
        ? scene.anims.generateFrameNumbers(spritesheetKey, getFrameRangeForVariant(variant))
        : createFallbackFrames(scene).map((key) => ({ key }));

      scene.anims.create({
        key: animationKey,
        frames,
        frameRate: 8,
        repeat: -1,
      });
    }
  }
}

export function getReadyCardBaseTexture(scene: Phaser.Scene) {
  return getPlayerCatBaseTexture(scene, '0');
}

export function getPlayerCatBaseTexture(scene: Phaser.Scene, playerID: string) {
  const textureKey = PLAYER_CAT_SPRITESHEET_KEYS[playerID as keyof typeof PLAYER_CAT_SPRITESHEET_KEYS];

  if (textureKey && scene.textures.exists(textureKey)) {
    return textureKey;
  }

  return `${READY_CARD_FALLBACK_PREFIX}0`;
}

export function getPlayerCatAnimationKey(scene: Phaser.Scene, playerID: string) {
  ensurePlayerCatAnimations(scene);
  return PLAYER_CAT_ANIMATION_KEYS[playerID as keyof typeof PLAYER_CAT_ANIMATION_KEYS]?.default ?? READY_CARD_ANIMATION_KEY;
}

export function getCardAnimationKey(scene: Phaser.Scene, playerID: string, cardID: number | null | undefined) {
  ensurePlayerCatAnimations(scene);
  const variant = getCardDefinition(cardID ?? -1).visual.animation;
  return PLAYER_CAT_ANIMATION_KEYS[playerID as keyof typeof PLAYER_CAT_ANIMATION_KEYS]?.[variant] ?? READY_CARD_ANIMATION_KEY;
}

function createFallbackFrames(scene: Phaser.Scene) {
  const frameKeys = Array.from({ length: CAT_SPRITE_ANIMATION_FRAMES }, (_value, index) => `${READY_CARD_FALLBACK_PREFIX}${index}`);

  if (scene.textures.exists(frameKeys[0])) {
    return frameKeys;
  }

  for (let frameIndex = 0; frameIndex < frameKeys.length; frameIndex += 1) {
    const graphics = scene.make.graphics({ x: 0, y: 0 });
    const bodyOffsetY = frameIndex % 2 === 0 ? 34 : 32;
    const tailOffsetX = 44 + (frameIndex % 3);
    const eyeOffset = frameIndex % 2 === 0 ? 0 : 1;

    graphics.fillStyle(UI_THEME.cardNumber, 1);
    graphics.fillRoundedRect(18, bodyOffsetY, 28, 18, 8);
    graphics.fillTriangle(20, bodyOffsetY + 2, 24, bodyOffsetY - 8, 28, bodyOffsetY + 2);
    graphics.fillTriangle(36, bodyOffsetY + 2, 40, bodyOffsetY - 8, 44, bodyOffsetY + 2);
    graphics.fillRect(22, bodyOffsetY + 16, 4, 10);
    graphics.fillRect(38, bodyOffsetY + 16, 4, 10);
    graphics.lineStyle(4, UI_THEME.cardNumber, 1);
    graphics.beginPath();
    graphics.moveTo(44, bodyOffsetY + 8);
    graphics.lineTo(tailOffsetX + 4, bodyOffsetY - 2);
    graphics.lineTo(tailOffsetX, bodyOffsetY - 14);
    graphics.strokePath();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(27, bodyOffsetY + 8, 2);
    graphics.fillCircle(37, bodyOffsetY + 8, 2);
    graphics.fillStyle(0x2bb673, 1);
    graphics.fillCircle(27 + eyeOffset, bodyOffsetY + 8, 1);
    graphics.fillCircle(37 - eyeOffset, bodyOffsetY + 8, 1);
    graphics.fillStyle(0xf3b562, 1);
    graphics.fillTriangle(32, bodyOffsetY + 10, 30, bodyOffsetY + 14, 34, bodyOffsetY + 14);

    graphics.generateTexture(frameKeys[frameIndex], CAT_SPRITE_FRAME_SIZE, CAT_SPRITE_FRAME_SIZE);
    graphics.destroy();
  }

  return frameKeys;
}

function getFrameRangeForVariant(variant: CardAnimationVariant) {
  if (variant === 'blocker') {
    const start = BLOCKER_ROW_INDEX * CAT_SPRITESHEET_COLUMNS;
    return {
      start,
      end: start + BLOCKER_ANIMATION_FRAMES - 1,
    };
  }

  return {
    start: 0,
    end: CAT_SPRITE_ANIMATION_FRAMES - 1,
  };
}
