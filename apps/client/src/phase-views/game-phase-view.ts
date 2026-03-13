import Phaser from 'phaser';
import {
  CAT_MATCH_BOARD_SIZE,
  CAT_MATCH_HAND_SIZE,
  type BoardCell,
  type RoomSnapshot,
} from '@acatgame/game-core';

import type { RoomLayout } from '../layout.js';
import {
  getPlayerCatAnimationKey,
  getPlayerCatBaseTexture,
} from '../ready-card-assets.js';
import type { RoomController } from '../room-controller.js';
import type { RoomControllerState } from '../room-controller.js';
import { UI_THEME } from '../theme.js';
import { drawBoardSurface } from '../ui/canvas/board-surface.js';
import { createCatCardView, renderCatCard, type CatCardView } from '../ui/canvas/cat-card.js';

interface GamePhaseViewDeps {
  scene: Phaser.Scene;
  controller: RoomController;
}

interface GridCellView {
  x: number;
  y: number;
  tile: Phaser.GameObjects.Rectangle;
  card: CatCardView;
}

interface ComputedGameLayout {
  boardRect: Phaser.Geom.Rectangle;
  cellSize: number;
  handY: number;
  handStartX: number;
}

export class GamePhaseView {
  private scene!: Phaser.Scene;
  private deps!: GamePhaseViewDeps;
  private boardGraphics!: Phaser.GameObjects.Graphics;
  private gridCells: GridCellView[] = [];
  private handCards: CatCardView[] = [];
  private lastLayout: RoomLayout | null = null;
  private visible = false;
  private selectedHandIndex: number | null = null;
  private hoveredCellKey: string | null = null;
  private hoveredHandIndex: number | null = null;

  create(deps: GamePhaseViewDeps): void {
    this.scene = deps.scene;
    this.deps = deps;
    this.boardGraphics = this.scene.add.graphics();

    for (let y = 0; y < CAT_MATCH_BOARD_SIZE; y += 1) {
      for (let x = 0; x < CAT_MATCH_BOARD_SIZE; x += 1) {
        const tile = this.scene.add.rectangle(0, 0, 10, 10, 0xfff7de, 1).setOrigin(0.5);
        tile.setStrokeStyle(2, UI_THEME.cardBorderLightNumber, 0.85);
        tile.setInteractive({ useHandCursor: true });
        tile.on('pointerdown', () => {
          this.handleCellPressed(x, y);
        });
        tile.on('pointerover', () => {
          this.hoveredCellKey = `${x}:${y}`;
          this.rerender();
        });
        tile.on('pointerout', () => {
          if (this.hoveredCellKey === `${x}:${y}`) {
            this.hoveredCellKey = null;
            this.rerender();
          }
        });
        const card = createCatCardView({
          scene: this.scene,
          id: y * CAT_MATCH_BOARD_SIZE + x,
          textureKey: getPlayerCatBaseTexture(this.scene, '0'),
          animationKey: getPlayerCatAnimationKey(this.scene, '0'),
          interactive: false,
        });
        card.container.setVisible(false);

        this.gridCells.push({ x, y, tile, card });
      }
    }

    for (let handIndex = 0; handIndex < CAT_MATCH_HAND_SIZE; handIndex += 1) {
      this.handCards.push(
        createCatCardView({
          scene: this.scene,
          id: handIndex,
          textureKey: getPlayerCatBaseTexture(this.scene, '0'),
          animationKey: getPlayerCatAnimationKey(this.scene, '0'),
          onPress: () => {
            this.handleHandPressed(handIndex);
          },
          onHover: () => {
            this.hoveredHandIndex = handIndex;
            this.rerender();
          },
          onOut: () => {
            if (this.hoveredHandIndex === handIndex) {
              this.hoveredHandIndex = null;
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
    this.boardGraphics.setVisible(true);

    if (this.lastLayout) {
      this.render(this.lastLayout, snapshot, state);
    }
  }

  hide(): void {
    this.visible = false;
    this.boardGraphics?.setVisible(false);

    for (const cell of this.gridCells) {
      cell.tile.setVisible(false);
      cell.card.container.setVisible(false);
    }

    for (const card of this.handCards) {
      card.container.setVisible(false);
    }
  }

  layout(roomLayout: RoomLayout): void {
    this.lastLayout = roomLayout;

    if (this.visible) {
      const state = this.deps.controller.getState();
      this.render(roomLayout, state.snapshot, state);
    }
  }

  destroy(): void {
    this.boardGraphics.destroy();

    for (const cell of this.gridCells) {
      cell.tile.destroy();
      cell.card.container.destroy(true);
    }

    for (const card of this.handCards) {
      card.container.destroy(true);
    }
  }

  private handleHandPressed(handIndex: number) {
    if (!this.visible) {
      return;
    }

    const state = this.deps.controller.getState();
    const hand = state.gameState?.G?.localPlayer?.hand ?? [];
    const cardID = hand[handIndex] ?? null;

    if (cardID === null) {
      return;
    }

    this.selectedHandIndex = this.selectedHandIndex === handIndex ? null : handIndex;
    this.rerender();
  }

  private handleCellPressed(cellX: number, cellY: number) {
    if (!this.visible || this.selectedHandIndex === null) {
      return;
    }

    const state = this.deps.controller.getState();

    if (!this.canLocalPlayerMove(state)) {
      return;
    }

    const board = state.gameState?.G?.board ?? state.snapshot?.board ?? [];

    if (board[cellY * CAT_MATCH_BOARD_SIZE + cellX]) {
      return;
    }

    const handIndex = this.selectedHandIndex;
    this.selectedHandIndex = null;
    this.rerender();
    void this.deps.controller.placeCat(cellX, cellY, handIndex);
  }

  private render(roomLayout: RoomLayout, snapshot: RoomSnapshot | null, state: RoomControllerState) {
    const board = state.gameState?.G?.board ?? snapshot?.board ?? [];
    const hand = state.gameState?.G?.localPlayer?.hand ?? [];
    const sessionPlayerID = state.session?.playerID ?? '0';
    const gameLayout = this.getGameLayout(roomLayout);
    const canPlay = this.canLocalPlayerMove(state);

    if (this.selectedHandIndex !== null && hand[this.selectedHandIndex] === null) {
      this.selectedHandIndex = null;
    }

    this.drawBoard(gameLayout, board, canPlay);
    this.drawHand(gameLayout, hand, sessionPlayerID, canPlay);
  }

  private drawBoard(gameLayout: ComputedGameLayout, board: Array<BoardCell | null>, canPlay: boolean) {
    this.boardGraphics.clear();
    drawBoardSurface(this.boardGraphics, {
      rect: gameLayout.boardRect,
      radius: 0,
      fill: {
        topLeft: UI_THEME.backgroundNumber,
        topRight: UI_THEME.backgroundNumber,
        bottomLeft: UI_THEME.backgroundNumber,
        bottomRight: UI_THEME.backgroundNumber,
        alpha: 1,
      },
      stroke: {
        width: 2,
        color: UI_THEME.surfaceStrongNumber,
        alpha: 1,
      },
      shadow: {
        offsetX: 0,
        offsetY: 10,
        color: UI_THEME.textNumber,
        alpha: 0.16,
      },
    });

    const inset = 8;

    for (const cell of this.gridCells) {
      const centerX = gameLayout.boardRect.x + gameLayout.cellSize * (cell.x + 0.5);
      const centerY = gameLayout.boardRect.y + gameLayout.cellSize * (cell.y + 0.5);
      const boardCell = board[cell.y * CAT_MATCH_BOARD_SIZE + cell.x];
      const hovered = this.hoveredCellKey === `${cell.x}:${cell.y}`;
      const selectable = canPlay && !boardCell && this.selectedHandIndex !== null;
      const fillColor = hovered && selectable ? 0xfff7de : UI_THEME.backgroundNumber;

      cell.tile.setVisible(this.visible);
      cell.tile.setPosition(centerX, centerY);
      cell.tile.setSize(gameLayout.cellSize - inset, gameLayout.cellSize - inset);
      cell.tile.setFillStyle(fillColor, 1);
      if (boardCell) {
        cell.tile.setStrokeStyle();
      } else {
        cell.tile.setStrokeStyle(
          hovered && selectable ? 3 : 2,
          UI_THEME.surfaceStrongNumber,
          1,
        );
      }

      if (boardCell) {
        const textureKey = getPlayerCatBaseTexture(this.scene, boardCell.playerID);
        const animationKey = getPlayerCatAnimationKey(this.scene, boardCell.playerID);
        if (cell.card.sprite.texture.key !== textureKey) {
          cell.card.sprite.setTexture(textureKey);
        }
        if (cell.card.sprite.anims.currentAnim?.key !== animationKey) {
          cell.card.sprite.play(animationKey);
        }
        renderCatCard(cell.card, {
          x: centerX,
          y: centerY,
          visible: this.visible,
          interactive: false,
          cardSize: gameLayout.cellSize - 14,
          spriteScale: Math.min((gameLayout.cellSize - 36) / 64, 1),
        });
      } else {
        cell.card.container.setVisible(false);
      }
    }
  }

  private drawHand(
    gameLayout: ComputedGameLayout,
    hand: Array<number | null>,
    playerID: string,
    canPlay: boolean,
  ) {
    const textureKey = getPlayerCatBaseTexture(this.scene, playerID);
    const animationKey = getPlayerCatAnimationKey(this.scene, playerID);
    const gap = 18;
    const cardSize = 98;

    for (let handIndex = 0; handIndex < this.handCards.length; handIndex += 1) {
      const card = this.handCards[handIndex];
      const cardID = hand[handIndex] ?? null;
      const x = gameLayout.handStartX + handIndex * (cardSize + gap);

      if (card.sprite.texture.key !== textureKey) {
        card.sprite.setTexture(textureKey);
      }
      if (card.sprite.anims.currentAnim?.key !== animationKey) {
        card.sprite.play(animationKey);
      }

      renderCatCard(card, {
        x,
        y: gameLayout.handY,
        visible: this.visible,
        selected: this.selectedHandIndex === handIndex,
        hovered: this.hoveredHandIndex === handIndex && cardID !== null,
        disabled: !canPlay || cardID === null,
      });
    }
  }

  private canLocalPlayerMove(state: RoomControllerState) {
    return Boolean(
      state.session &&
        state.snapshot?.phase === 'game' &&
        state.gameState?.isConnected &&
        state.gameState?.ctx?.currentPlayer === state.session.playerID &&
        !state.gameState?.G?.matchResult,
    );
  }

  private getGameLayout(roomLayout: RoomLayout): ComputedGameLayout {
    const handHeight = 150;
    const boardSize = Math.max(300, Math.min(roomLayout.board.width, roomLayout.board.height - handHeight));
    const boardRect = new Phaser.Geom.Rectangle(
      roomLayout.centerX - boardSize / 2,
      roomLayout.board.y + 6,
      boardSize,
      boardSize,
    );
    const totalHandWidth = CAT_MATCH_HAND_SIZE * 98 + (CAT_MATCH_HAND_SIZE - 1) * 18;

    return {
      boardRect,
      cellSize: boardSize / CAT_MATCH_BOARD_SIZE,
      handY: boardRect.bottom + 82,
      handStartX: roomLayout.centerX - totalHandWidth / 2 + 49,
    };
  }

  private rerender() {
    if (!this.visible || !this.lastLayout) {
      return;
    }

    const state = this.deps.controller.getState();
    this.render(this.lastLayout, state.snapshot, state);
  }
}
