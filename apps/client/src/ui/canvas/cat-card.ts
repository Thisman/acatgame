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
  tooltip: Phaser.GameObjects.Container;
  tooltipBackground: Phaser.GameObjects.Graphics;
  tooltipTitle: Phaser.GameObjects.Text;
  tooltipBody: Phaser.GameObjects.Text;
  pointerInside: boolean;
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
  tooltipTitle?: string;
  tooltipText?: string;
  faceTint?: number;
}

const CAT_CARD_SIZE = 98;
const CAT_CARD_RADIUS = 14;
const CAT_CARD_FILL_TEXTURE_KEY = 'cat-card-fill';
const CAT_CARD_BASE_DEPTH = 10;
const CAT_CARD_TOOLTIP_DEPTH = 3000;
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
  const tooltipBackground = options.scene.add.graphics();
  const tooltipTitle = options.scene.add.text(0, 0, '', {
    fontFamily: 'Trebuchet MS',
    fontSize: '15px',
    fontStyle: '700',
    color: '#FFF7DE',
    align: 'center',
    wordWrap: { width: 184, useAdvancedWrap: true },
  });
  tooltipTitle.setOrigin(0.5, 0);
  const tooltipBody = options.scene.add.text(0, 0, '', {
    fontFamily: 'Trebuchet MS',
    fontSize: '13px',
    color: '#F2EBBF',
    align: 'center',
    wordWrap: { width: 184, useAdvancedWrap: true },
    lineSpacing: 4,
  });
  tooltipBody.setOrigin(0.5, 0);
  const tooltip = options.scene.add.container(0, 0, [tooltipBackground, tooltipTitle, tooltipBody]);
  tooltip.setVisible(false);
  tooltip.setDepth(2000);

  const container = options.scene.add.container(0, 0, [shadow, face, border, sprite, label, tooltip, hitArea]);
  container.setVisible(false);
  container.setSize(CAT_CARD_SIZE, CAT_CARD_SIZE);
  container.setDepth(CAT_CARD_BASE_DEPTH);

  const interactive = options.interactive ?? Boolean(options.onPress || options.onHover || options.onOut);
  const card: CatCardView = {
    id: options.id,
    container,
    hitArea,
    shadow,
    face,
    border,
    sprite,
    label,
    tooltip,
    tooltipBackground,
    tooltipTitle,
    tooltipBody,
    pointerInside: false,
  };

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

  hitArea.on('pointerover', () => {
    card.pointerInside = true;
    updateTooltipVisibility(card, true);
  });
  hitArea.on('pointerout', () => {
    card.pointerInside = false;
    updateTooltipVisibility(card, false);
  });

  return card;
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
  card.face.setTint(options.faceTint ?? 0xfff7de);
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

  updateTooltip(card, {
    cardSize,
    title: options.tooltipTitle ?? '',
    text: options.tooltipText ?? '',
    visible: options.visible && interactive && card.pointerInside,
  });
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

function updateTooltip(
  card: CatCardView,
  options: {
    cardSize: number;
    title: string;
    text: string;
    visible: boolean;
  },
) {
  const hasContent = Boolean(options.title || options.text);

  card.tooltipTitle.setText(options.title);
  card.tooltipBody.setText(options.text);
  card.tooltipBody.setPosition(0, options.title ? card.tooltipTitle.height + 8 : 0);

  if (!hasContent) {
    card.tooltip.setVisible(false);
    return;
  }

  const paddingX = 12;
  const paddingY = 10;
  const contentWidth = Math.max(
    options.title ? card.tooltipTitle.width : 0,
    options.text ? card.tooltipBody.width : 0,
  );
  const contentHeight =
    (options.title ? card.tooltipTitle.height : 0) +
    (options.title && options.text ? 8 : 0) +
    (options.text ? card.tooltipBody.height : 0);
  const width = Math.max(120, Math.ceil(contentWidth + paddingX * 2));
  const height = Math.ceil(contentHeight + paddingY * 2);
  const halfWidth = width / 2;

  card.tooltipBackground.clear();
  card.tooltipBackground.fillStyle(0x5c4b51, 0.96);
  card.tooltipBackground.lineStyle(2, UI_THEME.accentSoftNumber, 0.95);
  card.tooltipBackground.fillRoundedRect(-halfWidth, 0, width, height, 12);
  card.tooltipBackground.strokeRoundedRect(-halfWidth, 0, width, height, 12);

  card.tooltipTitle.setPosition(0, paddingY);
  card.tooltipBody.setPosition(0, paddingY + (options.title ? card.tooltipTitle.height + 8 : 0));
  card.tooltip.setPosition(0, -options.cardSize / 2 - height - 10);
  updateTooltipVisibility(card, options.visible);
}

function updateTooltipVisibility(card: CatCardView, visible: boolean) {
  card.tooltip.setVisible(visible);
  card.container.setDepth(visible ? CAT_CARD_TOOLTIP_DEPTH : CAT_CARD_BASE_DEPTH);
}
