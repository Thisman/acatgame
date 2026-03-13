import type { RoomSnapshot } from '@acatgame/game-core';
import Phaser from 'phaser';

import { PLAYER_COLORS } from '@acatgame/game-core';

import type { RoomLayout } from '../layout.js';
import type { RoomController } from '../room-controller.js';
import type { RoomControllerState } from '../room-controller.js';
import { UI_THEME } from '../theme.js';
import { drawBoardSurface } from '../ui/canvas/board-surface.js';
import { drawPlayerCircle } from '../ui/canvas/player-circle.js';

interface GamePhaseViewDeps {
  scene: Phaser.Scene;
  controller: RoomController;
}

export class GamePhaseView {
  private scene!: Phaser.Scene;
  private deps!: GamePhaseViewDeps;
  private boardGraphics!: Phaser.GameObjects.Graphics;
  private lastLayout: RoomLayout | null = null;
  private visible = false;

  create(deps: GamePhaseViewDeps): void {
    this.scene = deps.scene;
    this.deps = deps;
    this.boardGraphics = this.scene.add.graphics();
    this.scene.input.on('pointerdown', this.handleBoardClick, this);
    this.hide();
  }

  show(snapshot: RoomSnapshot | null, state: RoomControllerState): void {
    this.visible = true;
    this.boardGraphics.setVisible(true);

    if (this.lastLayout) {
      const circles = state.gameState?.G?.circles ?? snapshot?.circles ?? [];
      this.drawBoard(this.lastLayout.board, circles);
    }
  }

  hide(): void {
    this.visible = false;
    this.boardGraphics?.setVisible(false);
  }

  layout(roomLayout: RoomLayout): void {
    this.lastLayout = roomLayout;

    if (this.visible) {
      const state = this.deps.controller.getState();
      const circles = state.gameState?.G?.circles ?? state.snapshot?.circles ?? [];
      this.drawBoard(roomLayout.board, circles);
    }
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.handleBoardClick, this);
    this.boardGraphics.destroy();
  }

  private handleBoardClick(pointer: Phaser.Input.Pointer) {
    if (!this.visible || !this.lastLayout) {
      return;
    }

    const state = this.deps.controller.getState();

    if (!state.session || !state.snapshot || !state.gameState) {
      return;
    }

    const canPlay =
      state.snapshot.phase === 'game' &&
      state.gameState.isConnected &&
      state.gameState.ctx?.currentPlayer === state.session.playerID;

    if (!canPlay || !Phaser.Geom.Rectangle.Contains(this.lastLayout.board, pointer.x, pointer.y)) {
      return;
    }

    const xRatio = (pointer.x - this.lastLayout.board.x) / this.lastLayout.board.width;
    const yRatio = (pointer.y - this.lastLayout.board.y) / this.lastLayout.board.height;

    void this.deps.controller.placeCircle(xRatio, yRatio);
  }

  private drawBoard(board: Phaser.Geom.Rectangle, circles: Array<{ playerID: string; xRatio: number; yRatio: number }>) {
    this.boardGraphics.clear();
    drawBoardSurface(this.boardGraphics, {
      rect: board,
      radius: 36,
      fill: {
        topLeft: UI_THEME.cardHighlightNumber,
        topRight: UI_THEME.cardHighlightNumber,
        bottomLeft: UI_THEME.cardNumber,
        bottomRight: UI_THEME.cardNumber,
        alpha: 1,
      },
      stroke: {
        width: 4,
        color: UI_THEME.textNumber,
        alpha: 0.95,
      },
    });

    for (const circle of circles) {
      const x = board.x + circle.xRatio * board.width;
      const y = board.y + circle.yRatio * board.height;
      drawPlayerCircle(this.boardGraphics, {
        x,
        y,
        radius: 18,
        fillColor: PLAYER_COLORS[circle.playerID] ?? 0xffffff,
        fillAlpha: 0.95,
        strokeColor: UI_THEME.backgroundNumber,
        strokeWidth: 2,
        strokeAlpha: 0.8,
      });
    }
  }
}
