import type { RoomSnapshot } from '@acatgame/game-core';
import Phaser from 'phaser';

import { TextButton } from '../button.js';
import type { RoomLayout } from '../layout.js';
import type { RoomControllerState } from '../room-controller.js';
import type { RoomPhaseView, RoomPhaseViewDeps } from '../room-phase-view.js';
import { SpinnerLoader } from '../spinner-loader.js';

export class ReadyPhaseView implements RoomPhaseView {
  private scene!: Phaser.Scene;
  private deps!: RoomPhaseViewDeps;
  private readyButton!: TextButton;
  private exitButton!: TextButton;
  private statusText!: Phaser.GameObjects.Text;
  private loader!: SpinnerLoader;

  create(deps: RoomPhaseViewDeps): void {
    this.scene = deps.scene;
    this.deps = deps;

    this.statusText = this.scene.add.text(0, 0, '', {
      color: '#7d8e88',
      fontFamily: 'Trebuchet MS',
      fontSize: '26px',
      fontStyle: 'bold',
    });
    this.statusText.setOrigin(0.5);

    this.readyButton = new TextButton(this.scene, 0, 0, 220, 68, 'Готово', () => {
      void this.handleReadyToggle();
    });
    this.exitButton = new TextButton(this.scene, 0, 0, 220, 68, 'Выход', () => {
      void this.deps.controller.leaveRoom();
      this.scene.scene.start('LobbyScene');
    });

    this.loader = new SpinnerLoader(this.scene);
    this.hide();
  }

  show(snapshot: RoomSnapshot | null, state: RoomControllerState): void {
    this.readyButton.setVisible(true);
    this.exitButton.setVisible(true);
    this.statusText.setVisible(true);

    const isReady = !!(snapshot && state.session && snapshot.readyByPlayer[state.session.playerID]);
    this.readyButton.setLabel(isReady ? 'Отмена' : 'Готово');

    if (isReady) {
      this.statusText.setText('Waiting for the second player...');
      this.loader.setVisible(true);
    } else {
      this.statusText.setText('Press ready when you are set');
      this.loader.setVisible(false);
    }
  }

  hide(): void {
    this.readyButton?.setVisible(false);
    this.exitButton?.setVisible(false);
    this.statusText?.setVisible(false);
    this.loader?.setVisible(false);
  }

  layout(roomLayout: RoomLayout): void {
    this.statusText.setPosition(roomLayout.centerX, roomLayout.centerY - 46);
    this.readyButton.setButtonPosition(roomLayout.centerX, roomLayout.centerY + 48);
    this.exitButton.setButtonPosition(roomLayout.centerX, roomLayout.centerY + 146);
    this.loader.setPosition(roomLayout.centerX, roomLayout.centerY + 252);
    this.fitSingleLine(this.statusText, roomLayout.contentWidth, 26, 16);
  }

  destroy(): void {
    this.readyButton.destroy();
    this.exitButton.destroy();
    this.statusText.destroy();
    this.loader.destroy();
  }

  private async handleReadyToggle() {
    const state = this.deps.controller.getState();
    const snapshot = state.snapshot;
    const session = state.session;
    const ready = !!(snapshot && session && snapshot.readyByPlayer[session.playerID]);
    await this.deps.controller.setReady(!ready);
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

