import Phaser from 'phaser';
import {
  READY_CARD_COLUMNS,
  READY_CARD_POOL_SIZE,
  READY_CARD_SELECTION_LIMIT,
  type RoomSnapshot,
} from '@acatgame/game-core';

import type { RoomLayout } from '../layout.js';
import {
  getPlayerCatAnimationKey,
  getPlayerCatBaseTexture,
} from '../ready-card-assets.js';
import type { RoomController, RoomControllerState } from '../room-controller.js';
import { createCatCardView, renderCatCard, type CatCardView } from '../ui/canvas/cat-card.js';

interface ReadyPhaseViewDeps {
  scene: Phaser.Scene;
  controller: RoomController;
}

export class ReadyPhaseView {
  private scene!: Phaser.Scene;
  private controller!: RoomController;
  private cards: CatCardView[] = [];
  private lastLayout: RoomLayout | null = null;
  private visible = false;
  private hoveredCardID: number | null = null;
  private selectionInFlight = false;
  private queuedSelection: number[] | null = null;

  create(deps: ReadyPhaseViewDeps): void {
    this.scene = deps.scene;
    this.controller = deps.controller;

    const textureKey = getPlayerCatBaseTexture(this.scene, '0');
    const animationKey = getPlayerCatAnimationKey(this.scene, '0');

    for (let cardID = 0; cardID < READY_CARD_POOL_SIZE; cardID += 1) {
      this.cards.push(
        createCatCardView({
          scene: this.scene,
          id: cardID,
          textureKey,
          animationKey,
          onPress: () => {
            this.handleCardPressed(cardID);
          },
          onHover: () => {
            this.hoveredCardID = cardID;
            this.rerender();
          },
          onOut: () => {
            if (this.hoveredCardID === cardID) {
              this.hoveredCardID = null;
              this.rerender();
            }
          },
        }),
      );
    }

    this.hide();
  }

  show(snapshot: RoomSnapshot | null, state: RoomControllerState): void {
    this.visible = true;

    if (this.lastLayout) {
      this.render(this.lastLayout, snapshot, state);
    }
  }

  hide(): void {
    this.visible = false;

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
    for (const card of this.cards) {
      card.container.destroy(true);
    }
  }

  private render(roomLayout: RoomLayout, snapshot: RoomSnapshot | null, state: RoomControllerState) {
    const session = state.session;
    const selectedCardIDs = session ? snapshot?.selectedCardIDsByPlayer[session.playerID] ?? [] : [];
    const selectedCardIDSet = new Set(selectedCardIDs);
    const readyLocked = !!(session && snapshot?.readyByPlayer[session.playerID]);
    const selectionLimitReached = selectedCardIDs.length >= READY_CARD_SELECTION_LIMIT;
    const textureKey = getPlayerCatBaseTexture(this.scene, session?.playerID ?? '0');
    const animationKey = getPlayerCatAnimationKey(this.scene, session?.playerID ?? '0');

    const rows = Math.ceil(READY_CARD_POOL_SIZE / READY_CARD_COLUMNS);
    const cardSize = 98;
    const cellGapX = 18;
    const cellGapY = 18;
    const totalGridWidth = READY_CARD_COLUMNS * cardSize + (READY_CARD_COLUMNS - 1) * cellGapX;
    const totalGridHeight = rows * cardSize + (rows - 1) * cellGapY;
    const startX = roomLayout.board.centerX - totalGridWidth / 2 + cardSize / 2;
    const startY = roomLayout.board.centerY - totalGridHeight / 2 + cardSize / 2;

    for (const card of this.cards) {
      if (card.sprite.texture.key !== textureKey) {
        card.sprite.setTexture(textureKey);
      }
      if (card.sprite.anims.currentAnim?.key !== animationKey) {
        card.sprite.play(animationKey);
      }

      const column = card.id % READY_CARD_COLUMNS;
      const row = Math.floor(card.id / READY_CARD_COLUMNS);
      const x = startX + column * (cardSize + cellGapX);
      const y = startY + row * (cardSize + cellGapY);
      const isSelected = selectedCardIDSet.has(card.id);
      const canSelect = !readyLocked && (isSelected || !selectionLimitReached);

      renderCatCard(card, {
        x,
        y,
        visible: this.visible,
        selected: isSelected,
        hovered: this.hoveredCardID === card.id && canSelect,
        disabled: !canSelect,
      });
    }
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
