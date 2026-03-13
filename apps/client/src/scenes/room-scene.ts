import Phaser from 'phaser';

import { PLAYER_COLORS } from '@acatgame/game-core';

import { TextButton } from '../button.js';
import { layout } from '../layout.js';
import { roomController } from '../singletons.js';

export class RoomScene extends Phaser.Scene {
  private boardGraphics!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.Text;
  private roomCode!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private leaveButton!: TextButton;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super('RoomScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#f3f0e8');
    this.boardGraphics = this.add.graphics();

    this.title = this.add.text(0, 0, 'Room', {
      color: '#6d7f78',
      fontFamily: 'Trebuchet MS',
      fontSize: '54px',
      fontStyle: 'bold',
    });
    this.title.setOrigin(0.5, 0);

    this.roomCode = this.add.text(0, 0, '', {
      color: '#8ba39b',
      fontFamily: 'Trebuchet MS',
      fontSize: '24px',
    });
    this.roomCode.setOrigin(0.5, 0);

    this.statusText = this.add.text(0, 0, '', {
      color: '#7d8e88',
      fontFamily: 'Trebuchet MS',
      fontSize: '24px',
    });
    this.statusText.setOrigin(0.5, 0);

    this.turnText = this.add.text(0, 0, '', {
      color: '#8a7e72',
      fontFamily: 'Trebuchet MS',
      fontSize: '22px',
    });
    this.turnText.setOrigin(0.5, 0);

    this.leaveButton = new TextButton(this, 0, 0, 210, 64, 'Leave room', () => {
      void this.handleLeave();
    });

    this.input.on('pointerdown', this.handleBoardClick, this);
    this.scale.on('resize', this.renderView, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    this.unsubscribe = roomController.subscribe(() => this.renderView());
    void roomController.refreshSnapshot();
    this.renderView();
  }

  private async handleLeave() {
    await roomController.leaveRoom();
    this.scene.start('LobbyScene');
  }

  private handleBoardClick(pointer: Phaser.Input.Pointer) {
    const state = roomController.getState();
    const roomLayout = layout.getRoomLayout(this);

    if (!state.session || !state.snapshot || !state.gameState) {
      return;
    }

    const canPlay =
      state.snapshot.status === 'active' &&
      state.gameState.isConnected &&
      state.gameState.ctx?.currentPlayer === state.session.playerID;

    if (!canPlay || !Phaser.Geom.Rectangle.Contains(roomLayout.board, pointer.x, pointer.y)) {
      return;
    }

    const xRatio = (pointer.x - roomLayout.board.x) / roomLayout.board.width;
    const yRatio = (pointer.y - roomLayout.board.y) / roomLayout.board.height;

    void roomController.placeCircle(xRatio, yRatio);
  }

  private renderView() {
    const roomLayout = layout.getRoomLayout(this);
    const state = roomController.getState();
    const snapshot = state.snapshot;
    const boardState = state.gameState;
    const circles = boardState?.G?.circles ?? snapshot?.circles ?? [];
    const scores = boardState?.G?.scoreByPlayer ?? snapshot?.scores ?? { '0': 0, '1': 0 };
    const winner = snapshot?.winner ?? boardState?.G?.winner ?? null;

    this.title.setPosition(roomLayout.centerX, 34);
    this.roomCode.setPosition(roomLayout.centerX, 98);
    this.statusText.setPosition(roomLayout.centerX, 132);
    this.turnText.setPosition(roomLayout.centerX, 164);
    this.leaveButton.setButtonPosition(roomLayout.centerX, roomLayout.board.bottom + 70);

    this.roomCode.setText(snapshot ? `Room code: ${snapshot.matchID}` : 'Loading room...');

    if (!snapshot) {
      this.statusText.setText('Syncing room...');
      this.turnText.setText('Score: 0 - 0');
    } else if (winner) {
      this.statusText.setText(`Winner: ${snapshot.seats[Number(winner)]?.label ?? `Player ${winner}`}`);
      this.turnText.setText(`Final score: ${scores['0'] ?? 0} - ${scores['1'] ?? 0}`);
    } else if (snapshot.status === 'waiting') {
      const offlineSeat = snapshot.seats.find((seat) => seat.occupied && !seat.connected);
      this.statusText.setText(offlineSeat ? 'Waiting for player connection...' : 'Waiting for second player...');
      this.turnText.setText(`Score: ${scores['0'] ?? 0} - ${scores['1'] ?? 0}`);
    } else {
      const activeLabel = snapshot.seats[Number(snapshot.currentPlayer ?? '0')]?.label ?? 'Player';
      this.statusText.setText('Match active');
      this.turnText.setText(`Current turn: ${activeLabel} • Score: ${scores['0'] ?? 0} - ${scores['1'] ?? 0}`);
    }

    this.fitSingleLine(this.statusText, roomLayout.board.width, 24, 16);
    this.fitSingleLine(this.turnText, roomLayout.board.width, 22, 14);

    this.drawBoard(roomLayout.board, circles);
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

  private onShutdown() {
    this.input.off('pointerdown', this.handleBoardClick, this);
    this.scale.off('resize', this.renderView, this);
    this.unsubscribe?.();
    this.unsubscribe = null;
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
