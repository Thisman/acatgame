import Phaser from 'phaser';
import {
  READY_CARD_COLUMNS,
  READY_CARD_POOL_SIZE,
  READY_CARD_SELECTION_LIMIT,
  type RoomSnapshot,
} from '@acatgame/game-core';

import type { RoomLayout } from '../layout.js';
import { getReadyCardBaseTexture, READY_CARD_ANIMATION_KEY } from '../ready-card-assets.js';
import type { RoomController, RoomControllerState } from '../room-controller.js';
import { UI_THEME } from '../theme.js';

interface ReadyPhaseViewDeps {
  scene: Phaser.Scene;
  controller: RoomController;
}

interface ReadyCardView {
  id: number;
  container: Phaser.GameObjects.Container;
  hitArea: Phaser.GameObjects.Rectangle;
  glow: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  face: Phaser.GameObjects.Image;
  border: Phaser.GameObjects.Image;
  sprite: Phaser.GameObjects.Sprite;
}

export class ReadyPhaseView {
  private static readonly CARD_RADIUS = 14;
  private static readonly CARD_SIZE = 98;
  private static readonly CARD_FILL_TEXTURE_KEY = 'ready-card-fill';
  private static readonly CARD_BORDER_TEXTURE_KEYS = {
    normal: 'ready-card-border-2',
    hover: 'ready-card-border-3',
    selected: 'ready-card-border-4',
  } as const;
  private scene!: Phaser.Scene;
  private controller!: RoomController;
  private boardGraphics!: Phaser.GameObjects.Graphics;
  private cards: ReadyCardView[] = [];
  private lastLayout: RoomLayout | null = null;
  private visible = false;
  private hoveredCardID: number | null = null;
  private selectionInFlight = false;
  private queuedSelection: number[] | null = null;

  create(deps: ReadyPhaseViewDeps): void {
    this.scene = deps.scene;
    this.controller = deps.controller;
    this.boardGraphics = this.scene.add.graphics();
    this.ensureCardTextures();

    for (let cardID = 0; cardID < READY_CARD_POOL_SIZE; cardID += 1) {
      this.cards.push(this.createCard(cardID));
    }

    this.hide();
  }

  show(snapshot: RoomSnapshot | null, state: RoomControllerState): void {
    this.visible = true;
    this.boardGraphics.setVisible(true);

    for (const card of this.cards) {
      card.container.setVisible(true);
    }

    if (this.lastLayout) {
      this.render(this.lastLayout, snapshot, state);
    }
  }

  hide(): void {
    this.visible = false;
    this.boardGraphics?.setVisible(false);

    for (const card of this.cards) {
      card.container.setVisible(false);
    }
  }

  layout(roomLayout: RoomLayout): void {
    this.lastLayout = roomLayout;

    if (this.visible) {
      const state = this.controller.getState();
      this.render(roomLayout, state.snapshot, state);
    }
  }

  destroy(): void {
    this.boardGraphics.destroy();

    for (const card of this.cards) {
      card.container.destroy(true);
    }
  }

  private render(roomLayout: RoomLayout, snapshot: RoomSnapshot | null, state: RoomControllerState) {
    this.boardGraphics.clear();

    const session = state.session;
    const selectedCardIDs = session ? snapshot?.selectedCardIDsByPlayer[session.playerID] ?? [] : [];
    const selectedCardIDSet = new Set(selectedCardIDs);
    const readyLocked = !!(session && snapshot?.readyByPlayer[session.playerID]);
    const selectionLimitReached = selectedCardIDs.length >= READY_CARD_SELECTION_LIMIT;

    const rows = Math.ceil(READY_CARD_POOL_SIZE / READY_CARD_COLUMNS);
    const cardSize = ReadyPhaseView.CARD_SIZE;
    const cellGapX = 18;
    const cellGapY = 18;
    const totalGridWidth = READY_CARD_COLUMNS * cardSize + (READY_CARD_COLUMNS - 1) * cellGapX;
    const totalGridHeight = rows * cardSize + (rows - 1) * cellGapY;
    const startX = roomLayout.board.centerX - totalGridWidth / 2 + cardSize / 2;
    const startY = roomLayout.board.centerY - totalGridHeight / 2 + cardSize / 2;
    const spriteScale = 0.9;

    for (const card of this.cards) {
      const column = card.id % READY_CARD_COLUMNS;
      const row = Math.floor(card.id / READY_CARD_COLUMNS);
      const x = startX + column * (cardSize + cellGapX);
      const y = startY + row * (cardSize + cellGapY);
      const isSelected = selectedCardIDSet.has(card.id);
      const canSelect = !readyLocked && (isSelected || !selectionLimitReached);
      const isHovered = this.hoveredCardID === card.id && canSelect;
      const faceY = isSelected ? 3 : 0;
      const shadowY = 8;
      const shadowSize = cardSize;

      card.container.setPosition(x, y);
      card.container.setSize(cardSize, cardSize);
      card.hitArea.setSize(cardSize, cardSize);
      card.hitArea.setPosition(0, 0);
      card.hitArea.setFillStyle(0xffffff, 0.001);

      card.shadow.setDisplaySize(shadowSize, shadowSize);
      card.shadow.setPosition(0, shadowY);
      card.shadow.setTint(UI_THEME.textNumber);
      card.shadow.setAlpha(0.18);

      card.face.setDisplaySize(cardSize, cardSize);
      card.face.setPosition(0, faceY);
      card.face.setTint(0xfff7de);
      card.face.setAlpha(readyLocked || canSelect ? 1 : 0.72);

      card.border.setDisplaySize(cardSize, cardSize);
      card.border.setPosition(0, faceY);
      card.border.setTexture(
        isSelected ? ReadyPhaseView.CARD_BORDER_TEXTURE_KEYS.selected : ReadyPhaseView.CARD_BORDER_TEXTURE_KEYS.normal,
      );
      card.border.setTint(this.getBorderTint(isSelected, isHovered));
      card.border.setAlpha(readyLocked || canSelect ? 1 : 0.5);

      card.sprite.setPosition(0, faceY + 4);
      card.sprite.setScale(spriteScale);
      card.sprite.setAlpha(readyLocked || canSelect ? 1 : 0.55);
    }
  }

  private createCard(cardID: number): ReadyCardView {
    const hitArea = this.scene.add
      .rectangle(0, 0, ReadyPhaseView.CARD_SIZE, ReadyPhaseView.CARD_SIZE, 0xffffff, 0.001)
      .setOrigin(0.5);
    const glow = this.scene.add.image(0, 0, ReadyPhaseView.CARD_FILL_TEXTURE_KEY).setOrigin(0.5);
    const shadow = this.scene.add.image(0, 10, ReadyPhaseView.CARD_FILL_TEXTURE_KEY).setOrigin(0.5);
    const face = this.scene.add.image(0, 0, ReadyPhaseView.CARD_FILL_TEXTURE_KEY).setOrigin(0.5);
    const border = this.scene.add.image(0, 0, ReadyPhaseView.CARD_BORDER_TEXTURE_KEYS.normal).setOrigin(0.5);

    const sprite = this.scene.add.sprite(0, 4, getReadyCardBaseTexture(this.scene));
    sprite.play(READY_CARD_ANIMATION_KEY);

    const container = this.scene.add.container(0, 0, [glow, shadow, face, border, sprite, hitArea]);
    container.setVisible(false);
    container.setSize(90, 90);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', () => {
      this.handleCardPressed(cardID);
    });
    hitArea.on('pointerover', () => {
      this.hoveredCardID = cardID;
      this.rerender();
    });
    hitArea.on('pointerout', () => {
      if (this.hoveredCardID === cardID) {
        this.hoveredCardID = null;
        this.rerender();
      }
    });

    return {
      id: cardID,
      container,
      hitArea,
      glow,
      shadow,
      face,
      border,
      sprite,
    };
  }

  private ensureCardTextures() {
    if (this.scene.textures.exists(ReadyPhaseView.CARD_FILL_TEXTURE_KEY)) {
      return;
    }

    const fillGraphics = this.scene.make.graphics({ x: 0, y: 0 });
    fillGraphics.fillStyle(0xffffff, 1);
    fillGraphics.fillRoundedRect(
      0,
      0,
      ReadyPhaseView.CARD_SIZE,
      ReadyPhaseView.CARD_SIZE,
      ReadyPhaseView.CARD_RADIUS,
    );
    fillGraphics.generateTexture(
      ReadyPhaseView.CARD_FILL_TEXTURE_KEY,
      ReadyPhaseView.CARD_SIZE,
      ReadyPhaseView.CARD_SIZE,
    );
    fillGraphics.destroy();

    this.generateBorderTexture(ReadyPhaseView.CARD_BORDER_TEXTURE_KEYS.normal, 2);
    this.generateBorderTexture(ReadyPhaseView.CARD_BORDER_TEXTURE_KEYS.hover, 3);
    this.generateBorderTexture(ReadyPhaseView.CARD_BORDER_TEXTURE_KEYS.selected, 4);
  }

  private generateBorderTexture(key: string, lineWidth: number) {
    const graphics = this.scene.make.graphics({ x: 0, y: 0 });
    const inset = lineWidth / 2;
    graphics.lineStyle(lineWidth, 0xffffff, 1);
    graphics.strokeRoundedRect(
      inset,
      inset,
      ReadyPhaseView.CARD_SIZE - lineWidth,
      ReadyPhaseView.CARD_SIZE - lineWidth,
      ReadyPhaseView.CARD_RADIUS,
    );
    graphics.generateTexture(key, ReadyPhaseView.CARD_SIZE, ReadyPhaseView.CARD_SIZE);
    graphics.destroy();
  }

  private getBorderTint(isSelected: boolean, isHovered: boolean) {
    if (isSelected) {
      return isHovered ? 0xa83838 : UI_THEME.accentBorderNumber;
    }

    return isHovered ? 0x5f978c : UI_THEME.cardBorderLightNumber;
  }

  private handleCardPressed(cardID: number) {
    if (!this.visible) {
      return;
    }

    const state = this.controller.getState();
    const session = state.session;
    const snapshot = state.snapshot;

    if (!session || !snapshot || snapshot.phase !== 'ready' || snapshot.readyByPlayer[session.playerID]) {
      return;
    }

    const selectedCardIDs = snapshot.selectedCardIDsByPlayer[session.playerID] ?? [];
    const selectedSet = new Set(selectedCardIDs);

    if (selectedSet.has(cardID)) {
      selectedSet.delete(cardID);
    } else {
      if (selectedSet.size >= READY_CARD_SELECTION_LIMIT) {
        return;
      }

      selectedSet.add(cardID);
    }

    void this.submitSelection([...selectedSet].sort((left, right) => left - right));
  }

  private async submitSelection(selectedCardIDs: number[]) {
    if (this.selectionInFlight) {
      this.queuedSelection = selectedCardIDs;
      return;
    }

    this.selectionInFlight = true;

    try {
      await this.controller.updateSelection(selectedCardIDs);
    } catch {
      // RoomController already stores UI-facing errors.
    } finally {
      this.selectionInFlight = false;
      const queuedSelection = this.queuedSelection;
      this.queuedSelection = null;

      if (queuedSelection && !isSameSelection(queuedSelection, selectedCardIDs)) {
        void this.submitSelection(queuedSelection);
      }
    }
  }

  private rerender() {
    if (!this.visible || !this.lastLayout) {
      return;
    }

    const state = this.controller.getState();
    this.render(this.lastLayout, state.snapshot, state);
  }
}

function isSameSelection(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}
