import type { RoomSnapshot } from '@acatgame/game-core';
import Phaser from 'phaser';

import { PLAYER_COLORS } from '@acatgame/game-core';

import { TextButton } from '../button.js';
import type { RoomLayout } from '../layout.js';
import type { RoomControllerState } from '../room-controller.js';
import type { RoomPhaseView, RoomPhaseViewDeps } from '../room-phase-view.js';

export class GamePhaseView implements RoomPhaseView {
  private scene!: Phaser.Scene;
  private deps!: RoomPhaseViewDeps;
  private boardGraphics!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private leaveButton!: TextButton;
  private lastLayout: RoomLayout | null = null;
  private visible = false;

  create(deps: RoomPhaseViewDeps): void {
    this.scene = deps.scene;
    this.deps = deps;
    this.boardGraphics = this.scene.add.graphics();
    this.statusText = this.scene.add.text(0, 0, '', {
      color: '#7d8e88',
      fontFamily: 'Trebuchet MS',
      fontSize: '24px',
    });
    this.statusText.setOrigin(0.5, 0);

    this.turnText = this.scene.add.text(0, 0, '', {
      color: '#8a7e72',
      fontFamily: 'Trebuchet MS',
      fontSize: '22px',
    });
    this.turnText.setOrigin(0.5, 0);

    this.leaveButton = new TextButton(this.scene, 0, 0, 210, 64, 'Leave room', () => {
      void this.deps.controller.leaveRoom();
      this.scene.scene.start('LobbyScene');
    });

    this.scene.input.on('pointerdown', this.handleBoardClick, this);
    this.hide();
  }

  show(snapshot: RoomSnapshot | null, state: RoomControllerState): void {
    this.visible = true;
    this.boardGraphics.setVisible(true);
    this.statusText.setVisible(true);
    this.turnText.setVisible(true);
    this.leaveButton.setVisible(true);

    const circles = state.gameState?.G?.circles ?? snapshot?.circles ?? [];
    const scores = state.gameState?.G?.scoreByPlayer ?? snapshot?.scores ?? { '0': 0, '1': 0 };
    const winner = snapshot?.winner ?? state.gameState?.G?.winner ?? null;

    if (!snapshot) {
      this.statusText.setText('Syncing game...');
      this.turnText.setText('Score: 0 - 0');
    } else if (winner) {
      this.statusText.setText(`Winner: ${snapshot.seats[Number(winner)]?.label ?? `Player ${winner}`}`);
      this.turnText.setText(`Final score: ${scores['0'] ?? 0} - ${scores['1'] ?? 0}`);
    } else {
      const activeLabel = snapshot.seats[Number(snapshot.currentPlayer ?? '0')]?.label ?? 'Player';
      this.statusText.setText('Match active');
      this.turnText.setText(`Current turn: ${activeLabel} | Score: ${scores['0'] ?? 0} - ${scores['1'] ?? 0}`);
    }

    if (this.lastLayout) {
      this.drawBoard(this.lastLayout.board, circles);
      this.fitSingleLine(this.statusText, this.lastLayout.board.width, 24, 16);
      this.fitSingleLine(this.turnText, this.lastLayout.board.width, 22, 14);
    }
  }

  hide(): void {
    this.visible = false;
    this.boardGraphics?.setVisible(false);
    this.statusText?.setVisible(false);
    this.turnText?.setVisible(false);
    this.leaveButton?.setVisible(false);
  }

  layout(roomLayout: RoomLayout): void {
    this.lastLayout = roomLayout;
    this.statusText.setPosition(roomLayout.centerX, 132);
    this.turnText.setPosition(roomLayout.centerX, 164);
    this.leaveButton.setButtonPosition(roomLayout.centerX, roomLayout.board.bottom + 70);
    this.fitSingleLine(this.statusText, roomLayout.board.width, 24, 16);
    this.fitSingleLine(this.turnText, roomLayout.board.width, 22, 14);

    if (this.visible) {
      const state = this.deps.controller.getState();
      const circles = state.gameState?.G?.circles ?? state.snapshot?.circles ?? [];
      this.drawBoard(roomLayout.board, circles);
    }
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.handleBoardClick, this);
    this.boardGraphics.destroy();
    this.statusText.destroy();
    this.turnText.destroy();
    this.leaveButton.destroy();
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
    this.boardGraphics.fillGradientStyle(0xf7f4ee, 0xf7f4ee, 0xeee7dc, 0xeee7dc, 1);
    this.boardGraphics.fillRoundedRect(board.x, board.y, board.width, board.height, 36);
    this.boardGraphics.lineStyle(4, 0xbac8c3, 0.95);
    this.boardGraphics.strokeRoundedRect(board.x, board.y, board.width, board.height, 36);

    for (const circle of circles) {
      const x = board.x + circle.xRatio * board.width;
      const y = board.y + circle.yRatio * board.height;
      this.boardGraphics.fillStyle(PLAYER_COLORS[circle.playerID] ?? 0xffffff, 0.95);
      this.boardGraphics.fillCircle(x, y, 18);
      this.boardGraphics.lineStyle(2, 0xffffff, 0.35);
      this.boardGraphics.strokeCircle(x, y, 18);
    }
  }

  private fitSingleLine(
    textObject: Phaser.GameObjects.Text,
    maxWidth: number,
    preferredSize: number,
    minSize: number,
  ) {
    for (let size = preferredSize; size >= minSize; size -= 1) {
      textObject.setFontSize(size);
      if (textObject.width <= maxWidth) {
        return;
      }
    }
  }
}
