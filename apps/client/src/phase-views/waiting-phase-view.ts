import type { RoomSnapshot } from '@acatgame/game-core';
import Phaser from 'phaser';

import { TextButton } from '../button.js';
import type { RoomLayout } from '../layout.js';
import type { RoomControllerState } from '../room-controller.js';
import type { RoomPhaseView, RoomPhaseViewDeps } from '../room-phase-view.js';
import { SpinnerLoader } from '../spinner-loader.js';

export class WaitingPhaseView implements RoomPhaseView {
  private scene!: Phaser.Scene;
  private copyButton!: TextButton;
  private statusText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private loader!: SpinnerLoader;
  private resetCopyLabelEvent: Phaser.Time.TimerEvent | null = null;

  create(deps: RoomPhaseViewDeps): void {
    this.scene = deps.scene;
    this.copyButton = new TextButton(this.scene, 0, 0, 220, 68, 'Copy code', () => {
      void this.handleCopy(deps);
    });
    this.statusText = this.scene.add.text(0, 0, '', {
      color: '#7d8e88',
      fontFamily: 'Trebuchet MS',
      fontSize: '28px',
      fontStyle: 'bold',
    });
    this.statusText.setOrigin(0.5);

    this.hintText = this.scene.add.text(0, 0, 'Share this code and wait for the second player', {
      color: '#8a7e72',
      fontFamily: 'Trebuchet MS',
      fontSize: '22px',
    });
    this.hintText.setOrigin(0.5);

    this.loader = new SpinnerLoader(this.scene);
    this.hide();
  }

  show(snapshot: RoomSnapshot | null, state: RoomControllerState): void {
    this.copyButton.setVisible(true);
    this.statusText.setVisible(true);
    this.hintText.setVisible(true);
    this.loader.setVisible(true);

    if (!snapshot) {
      this.statusText.setText('Loading room...');
      return;
    }

    const connectedPlayers = snapshot.seats.filter((seat) => seat.occupied).length;
    this.statusText.setText(connectedPlayers >= snapshot.requiredPlayers ? 'Waiting for players...' : 'Waiting for players...');
    this.fitSingleLine(this.statusText, 620, 28, 18);
  }

  hide(): void {
    this.copyButton?.setVisible(false);
    this.statusText?.setVisible(false);
    this.hintText?.setVisible(false);
    this.loader?.setVisible(false);
  }

  layout(roomLayout: RoomLayout): void {
    this.statusText.setPosition(roomLayout.centerX, roomLayout.centerY - 20);
    this.hintText.setPosition(roomLayout.centerX, roomLayout.centerY + 18);
    this.loader.setPosition(roomLayout.centerX, roomLayout.centerY + 118);
    this.copyButton.setButtonPosition(roomLayout.centerX, roomLayout.centerY + 220);
    this.fitSingleLine(this.statusText, roomLayout.contentWidth, 28, 18);
    this.fitSingleLine(this.hintText, roomLayout.contentWidth, 22, 14);
  }

  destroy(): void {
    this.resetCopyLabelEvent?.destroy();
    this.copyButton.destroy();
    this.statusText.destroy();
    this.hintText.destroy();
    this.loader.destroy();
  }

  private async handleCopy(deps: RoomPhaseViewDeps) {
    const copied = await deps.controller.copyRoomCode().catch(() => false);
    this.copyButton.setLabel(copied ? 'Copied' : 'Copy failed');
    this.resetCopyLabelEvent?.destroy();
    this.resetCopyLabelEvent = this.scene.time.delayedCall(1200, () => {
      this.copyButton.setLabel('Copy code');
    });
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

