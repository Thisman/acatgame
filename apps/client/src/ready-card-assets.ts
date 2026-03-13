import Phaser from 'phaser';
import { CAT_SPRITE_ANIMATION_FRAMES, CAT_SPRITE_FRAME_SIZE } from '@acatgame/game-core';

import { UI_THEME } from './theme.js';

export const READY_CARD_SPRITESHEET_KEY = 'ready-card-cat-sheet';
export const READY_CARD_ANIMATION_KEY = 'ready-card-cat-idle';
const READY_CARD_FALLBACK_PREFIX = 'ready-card-fallback-';

export function preloadReadyCardAssets(scene: Phaser.Scene) {
  scene.load.spritesheet(READY_CARD_SPRITESHEET_KEY, 'assets/cat-sheet.png', {
    frameWidth: CAT_SPRITE_FRAME_SIZE,
    frameHeight: CAT_SPRITE_FRAME_SIZE,
  });
}

export function ensureReadyCardAnimation(scene: Phaser.Scene) {
  if (scene.anims.exists(READY_CARD_ANIMATION_KEY)) {
    return;
  }

  const frames = scene.textures.exists(READY_CARD_SPRITESHEET_KEY)
    ? scene.anims.generateFrameNumbers(READY_CARD_SPRITESHEET_KEY, {
        start: 0,
        end: CAT_SPRITE_ANIMATION_FRAMES - 1,
      })
    : createFallbackFrames(scene).map((key) => ({ key }));

  scene.anims.create({
    key: READY_CARD_ANIMATION_KEY,
    frames,
    frameRate: 8,
    repeat: -1,
  });
}

export function getReadyCardBaseTexture(scene: Phaser.Scene) {
  return scene.textures.exists(READY_CARD_SPRITESHEET_KEY) ? READY_CARD_SPRITESHEET_KEY : `${READY_CARD_FALLBACK_PREFIX}0`;
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
