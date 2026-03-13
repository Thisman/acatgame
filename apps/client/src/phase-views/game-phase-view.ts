import Phaser from 'phaser';
import {
  CAT_MATCH_BOARD_SIZE,
  CAT_MATCH_HAND_SIZE,
  type BoardCell,
  type BoardCellEffect,
  type RoomSnapshot,
} from '@acatgame/game-core';

import {
  getArmedMineEffect,
  getCardTooltipContent,
  getPlacementLockEffect,
  normalizeCellEffects,
  previewCellEffectsForPlacement,
} from '../card-ui.js';
import type { RoomLayout } from '../layout.js';
import {
  getCardAnimationKey,
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
  lockLabel: Phaser.GameObjects.Text;
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
          onHover: () => {
            this.hoveredCellKey = `${x}:${y}`;
            this.rerender();
          },
          onOut: () => {
            if (this.hoveredCellKey === `${x}:${y}`) {
              this.hoveredCellKey = null;
              this.rerender();
            }
          },
        });
        card.container.setVisible(false);
        const lockLabel = this.scene.add.text(0, 0, '', {
          fontFamily: 'Trebuchet MS',
          fontSize: '24px',
          fontStyle: '700',
          color: '#F06060',
          stroke: '#FFF7DE',
          strokeThickness: 4,
        });
        lockLabel.setOrigin(0.5);
        lockLabel.setVisible(false);
        lockLabel.setDepth(15);

        this.gridCells.push({ x, y, tile, card, lockLabel });
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
      cell.lockLabel.setVisible(false);
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
      cell.lockLabel.destroy();
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

    if (!this.canLocalPlayerMove(state)) {
      return;
    }

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
    const cellEffects = previewCellEffectsForPlacement(state.gameState?.G?.cellEffects ?? state.snapshot?.cellEffects);

    if (board[cellY * CAT_MATCH_BOARD_SIZE + cellX]) {
      return;
    }

    if (getPlacementLockEffect(cellEffects[cellY * CAT_MATCH_BOARD_SIZE + cellX])) {
      return;
    }

    const handIndex = this.selectedHandIndex;
    this.selectedHandIndex = null;
    this.rerender();
    void this.deps.controller.placeCat(cellX, cellY, handIndex);
  }

  private render(roomLayout: RoomLayout, snapshot: RoomSnapshot | null, state: RoomControllerState) {
    const board = state.gameState?.G?.board ?? snapshot?.board ?? [];
    const rawCellEffects = state.gameState?.G?.cellEffects ?? snapshot?.cellEffects ?? [];
    const hand = state.gameState?.G?.localPlayer?.hand ?? [];
    const sessionPlayerID = state.session?.playerID ?? '0';
    const gameLayout = this.getGameLayout(roomLayout);
    const canPlay = this.canLocalPlayerMove(state);
    const cellEffects = canPlay
      ? previewCellEffectsForPlacement(rawCellEffects)
      : normalizeCellEffects(rawCellEffects);

    if (this.selectedHandIndex !== null && hand[this.selectedHandIndex] === null) {
      this.selectedHandIndex = null;
    }

    this.drawBoard(gameLayout, board, cellEffects, canPlay);
    this.drawHand(gameLayout, hand, sessionPlayerID, canPlay);
  }

  private drawBoard(
    gameLayout: ComputedGameLayout,
    board: Array<BoardCell | null>,
    cellEffects: Array<BoardCellEffect[]>,
    canPlay: boolean,
  ) {
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
      const boardIndex = cell.y * CAT_MATCH_BOARD_SIZE + cell.x;
      const boardCell = board[boardIndex];
      const placementLock = getPlacementLockEffect(cellEffects[boardIndex]);
      const armedMine = getArmedMineEffect(cellEffects[boardIndex]);
      const blocked = !boardCell && Boolean(placementLock);
      const hovered = this.hoveredCellKey === `${cell.x}:${cell.y}`;
      const selectable = canPlay && !boardCell && !blocked && this.selectedHandIndex !== null;
      const fillColor = blocked
        ? 0xf8d8ac
        : hovered && selectable
          ? 0xfff7de
          : UI_THEME.backgroundNumber;

      cell.tile.setVisible(this.visible);
      cell.tile.setPosition(centerX, centerY);
      cell.tile.setSize(gameLayout.cellSize - inset, gameLayout.cellSize - inset);
      cell.tile.setFillStyle(fillColor, 1);
      if (boardCell) {
        cell.tile.setStrokeStyle();
      } else {
        cell.tile.setStrokeStyle(
          blocked ? 3 : hovered && selectable ? 3 : 2,
          blocked ? UI_THEME.accentBorderNumber : UI_THEME.surfaceStrongNumber,
          1,
        );
      }

      if (boardCell) {
        const textureKey = getPlayerCatBaseTexture(this.scene, boardCell.playerID);
        const animationKey = getCardAnimationKey(this.scene, boardCell.playerID, boardCell.cardID);
        const tooltipContent = getCardTooltipContent(boardCell.cardID);
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
          interactive: true,
          cardSize: gameLayout.cellSize - 14,
          spriteScale: Math.min((gameLayout.cellSize - 36) / 64, 1),
          hovered,
          tooltipTitle: tooltipContent.title,
          tooltipText: tooltipContent.text,
        });
      } else {
        cell.card.container.setVisible(false);
      }

      const showCellCounter = blocked || Boolean(boardCell && armedMine);
      cell.lockLabel.setVisible(this.visible && showCellCounter);
      if (showCellCounter) {
        cell.lockLabel.setText(String(placementLock?.remainingTurns ?? armedMine?.remainingTurns ?? ''));
        if (blocked) {
          cell.lockLabel.setPosition(centerX, centerY);
          cell.lockLabel.setFontSize('24px');
          cell.lockLabel.setColor('#F06060');
        } else {
          cell.lockLabel.setPosition(centerX + gameLayout.cellSize * 0.22, centerY - gameLayout.cellSize * 0.22);
          cell.lockLabel.setFontSize('22px');
          cell.lockLabel.setColor('#FF8A3D');
        }
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
    const gap = 18;
    const cardSize = 98;

    for (let handIndex = 0; handIndex < this.handCards.length; handIndex += 1) {
      const card = this.handCards[handIndex];
      const cardID = hand[handIndex] ?? null;
      const x = gameLayout.handStartX + handIndex * (cardSize + gap);
      const animationKey = getCardAnimationKey(this.scene, playerID, cardID);

      if (card.sprite.texture.key !== textureKey) {
        card.sprite.setTexture(textureKey);
      }
      if (card.sprite.anims.currentAnim?.key !== animationKey) {
        card.sprite.play(animationKey);
      }

      const tooltipContent = cardID === null ? null : getCardTooltipContent(cardID);

      renderCatCard(card, {
        x,
        y: gameLayout.handY,
        visible: this.visible,
        selected: this.selectedHandIndex === handIndex,
        hovered: this.hoveredHandIndex === handIndex && cardID !== null,
        disabled: !canPlay || cardID === null,
        interactive: cardID !== null,
        tooltipTitle: tooltipContent?.title,
        tooltipText: tooltipContent?.text,
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
