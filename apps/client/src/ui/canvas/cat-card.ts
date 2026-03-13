import Phaser from 'phaser';

import { UI_THEME } from '../../theme.js';

export interface CatCardView {
  id: number;
  container: Phaser.GameObjects.Container;
  hitArea: Phaser.GameObjects.Rectangle;
  shadow: Phaser.GameObjects.Image;
  face: Phaser.GameObjects.Image;
  border: Phaser.GameObjects.Image;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
}

export interface CreateCatCardOptions {
  scene: Phaser.Scene;
  id: number;
  textureKey: string;
  animationKey: string;
  interactive?: boolean;
  onPress?: () => void;
  onHover?: () => void;
  onOut?: () => void;
}

export interface RenderCatCardOptions {
  x: number;
  y: number;
  visible: boolean;
  selected?: boolean;
  hovered?: boolean;
  disabled?: boolean;
  interactive?: boolean;
  labelText?: string;
  cardSize?: number;
  spriteScale?: number;
}

const CAT_CARD_SIZE = 98;
const CAT_CARD_RADIUS = 14;
const CAT_CARD_FILL_TEXTURE_KEY = 'cat-card-fill';
const CAT_CARD_BORDER_TEXTURE_KEYS = {
  normal: 'cat-card-border-2',
  hover: 'cat-card-border-3',
  selected: 'cat-card-border-4',
} as const;

export function ensureCatCardTextures(scene: Phaser.Scene) {
  if (scene.textures.exists(CAT_CARD_FILL_TEXTURE_KEY)) {
    return;
  }

  const fillGraphics = scene.make.graphics({ x: 0, y: 0 });
  fillGraphics.fillStyle(0xffffff, 1);
  fillGraphics.fillRoundedRect(0, 0, CAT_CARD_SIZE, CAT_CARD_SIZE, CAT_CARD_RADIUS);
  fillGraphics.generateTexture(CAT_CARD_FILL_TEXTURE_KEY, CAT_CARD_SIZE, CAT_CARD_SIZE);
  fillGraphics.destroy();

  generateBorderTexture(scene, CAT_CARD_BORDER_TEXTURE_KEYS.normal, 2);
  generateBorderTexture(scene, CAT_CARD_BORDER_TEXTURE_KEYS.hover, 3);
  generateBorderTexture(scene, CAT_CARD_BORDER_TEXTURE_KEYS.selected, 4);
}

export function createCatCardView(options: CreateCatCardOptions): CatCardView {
  ensureCatCardTextures(options.scene);

  const hitArea = options.scene.add
    .rectangle(0, 0, CAT_CARD_SIZE, CAT_CARD_SIZE, 0xffffff, 0.001)
    .setOrigin(0.5);
  const shadow = options.scene.add.image(0, 10, CAT_CARD_FILL_TEXTURE_KEY).setOrigin(0.5);
  const face = options.scene.add.image(0, 0, CAT_CARD_FILL_TEXTURE_KEY).setOrigin(0.5);
  const border = options.scene.add.image(0, 0, CAT_CARD_BORDER_TEXTURE_KEYS.normal).setOrigin(0.5);
  const sprite = options.scene.add.sprite(0, 4, options.textureKey);
  sprite.play(options.animationKey);
  const label = options.scene.add.text(0, 0, '', {
    fontFamily: 'Trebuchet MS',
    fontSize: '18px',
    fontStyle: '700',
    color: '#5C4B51',
  });
  label.setOrigin(0.5);

  const container = options.scene.add.container(0, 0, [shadow, face, border, sprite, label, hitArea]);
  container.setVisible(false);
  container.setSize(CAT_CARD_SIZE, CAT_CARD_SIZE);

  const interactive = options.interactive ?? Boolean(options.onPress || options.onHover || options.onOut);

  if (interactive) {
    hitArea.setInteractive({ useHandCursor: true });
  }

  if (options.onPress) {
    hitArea.on('pointerdown', options.onPress);
  }

  if (options.onHover) {
    hitArea.on('pointerover', options.onHover);
  }

  if (options.onOut) {
    hitArea.on('pointerout', options.onOut);
  }

  return {
    id: options.id,
    container,
    hitArea,
    shadow,
    face,
    border,
    sprite,
    label,
  };
}

export function renderCatCard(card: CatCardView, options: RenderCatCardOptions) {
  const cardSize = options.cardSize ?? CAT_CARD_SIZE;
  const spriteScale = options.spriteScale ?? 0.9;
  const selected = options.selected ?? false;
  const hovered = options.hovered ?? false;
  const disabled = options.disabled ?? false;
  const interactive = options.interactive ?? true;
  const alpha = disabled ? 0.58 : 1;
  const faceY = selected ? 3 : 0;

  card.container.setVisible(options.visible);

  if (!options.visible) {
    return;
  }

  card.container.setPosition(options.x, options.y);
  card.container.setSize(cardSize, cardSize);

  card.hitArea.setSize(cardSize, cardSize);
  card.hitArea.setPosition(0, 0);
  card.hitArea.setFillStyle(0xffffff, 0.001);

  if (!interactive) {
    card.hitArea.disableInteractive();
  } else if (disabled) {
    card.hitArea.disableInteractive();
  } else if (!card.hitArea.input) {
    card.hitArea.setInteractive({ useHandCursor: true });
  } else {
    card.hitArea.setInteractive({ useHandCursor: true });
  }

  card.shadow.setDisplaySize(cardSize, cardSize);
  card.shadow.setPosition(0, 8);
  card.shadow.setTint(UI_THEME.textNumber);
  card.shadow.setAlpha(disabled ? 0.12 : 0.18);

  card.face.setDisplaySize(cardSize, cardSize);
  card.face.setPosition(0, faceY);
  card.face.setTint(0xfff7de);
  card.face.setAlpha(alpha);

  card.border.setDisplaySize(cardSize, cardSize);
  card.border.setPosition(0, faceY);
  card.border.setTexture(
    selected ? CAT_CARD_BORDER_TEXTURE_KEYS.selected : CAT_CARD_BORDER_TEXTURE_KEYS.normal,
  );
  card.border.setTint(getBorderTint(selected, hovered));
  card.border.setAlpha(alpha);

  card.sprite.setPosition(0, faceY + 4);
  card.sprite.setScale(spriteScale);
  card.sprite.setAlpha(disabled ? 0.5 : 1);

  card.label.setText(options.labelText ?? '');
  card.label.setVisible(Boolean(options.labelText));
  card.label.setPosition(0, cardSize / 2 - 14);
  card.label.setAlpha(disabled ? 0.56 : 0.82);
}

function generateBorderTexture(scene: Phaser.Scene, key: string, lineWidth: number) {
  const graphics = scene.make.graphics({ x: 0, y: 0 });
  const inset = lineWidth / 2;
  graphics.lineStyle(lineWidth, 0xffffff, 1);
  graphics.strokeRoundedRect(inset, inset, CAT_CARD_SIZE - lineWidth, CAT_CARD_SIZE - lineWidth, CAT_CARD_RADIUS);
  graphics.generateTexture(key, CAT_CARD_SIZE, CAT_CARD_SIZE);
  graphics.destroy();
}

function getBorderTint(selected: boolean, hovered: boolean) {
  if (selected) {
    return hovered ? 0xa83838 : UI_THEME.accentBorderNumber;
  }

  return hovered ? 0x5f978c : UI_THEME.cardBorderLightNumber;
}
