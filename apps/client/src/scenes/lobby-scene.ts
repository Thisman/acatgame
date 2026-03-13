import Phaser from 'phaser';

import { TextButton } from '../button.js';
import { layout } from '../layout.js';
import { roomController } from '../singletons.js';

export class LobbyScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private errorText!: Phaser.GameObjects.Text;
  private createButton!: TextButton;
  private joinButton!: TextButton;
  private roomCodeInput!: Phaser.GameObjects.DOMElement;
  private roomCodeField!: HTMLInputElement;
  private roomCodeShell!: HTMLDivElement;

  constructor() {
    super('LobbyScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#f3f0e8');

    this.title = this.add.text(0, 0, 'ACatGame', {
      color: '#6d7f78',
      fontFamily: 'Trebuchet MS',
      fontSize: '68px',
      fontStyle: 'bold',
    });
    this.title.setOrigin(0.5);

    this.subtitle = this.add.text(0, 0, 'Create a room or join by match ID', {
      color: '#8d9d97',
      fontFamily: 'Trebuchet MS',
      fontSize: '24px',
    });
    this.subtitle.setOrigin(0.5);

    this.roomCodeShell = document.createElement('div');
    this.roomCodeShell.style.width = '560px';
    this.roomCodeShell.style.height = '64px';
    this.roomCodeShell.style.display = 'flex';
    this.roomCodeShell.style.alignItems = 'center';
    this.roomCodeShell.style.justifyContent = 'center';

    this.roomCodeField = document.createElement('input');
    this.roomCodeField.type = 'text';
    this.roomCodeField.placeholder = 'Room code';
    this.roomCodeField.maxLength = 64;
    this.roomCodeField.style.width = '100%';
    this.roomCodeField.style.height = '64px';
    this.roomCodeField.style.padding = '18px 20px';
    this.roomCodeField.style.borderRadius = '18px';
    this.roomCodeField.style.border = '2px solid #b7c9c3';
    this.roomCodeField.style.background = 'rgba(251, 249, 244, 0.98)';
    this.roomCodeField.style.color = '#5c6d67';
    this.roomCodeField.style.fontSize = '22px';
    this.roomCodeField.style.outline = 'none';
    this.roomCodeField.style.boxSizing = 'border-box';
    this.roomCodeField.style.boxShadow = '0 12px 30px rgba(167, 182, 175, 0.18)';

    this.roomCodeShell.appendChild(this.roomCodeField);

    this.roomCodeInput = this.add.dom(0, 0, this.roomCodeShell);
    this.roomCodeInput.setOrigin(0.5);

    this.createButton = new TextButton(this, 0, 0, 260, 72, 'Create room', () => {
      void this.handleCreate();
    });
    this.joinButton = new TextButton(this, 0, 0, 260, 72, 'Join room', () => {
      void this.handleJoin();
    });

    this.errorText = this.add.text(0, 0, '', {
      color: '#bf7f76',
      fontFamily: 'Trebuchet MS',
      fontSize: '22px',
      align: 'center',
      wordWrap: { width: 500 },
    });
    this.errorText.setOrigin(0.5);

    this.scale.on('resize', this.relayout, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    this.relayout();
  }

  private async handleCreate() {
    try {
      this.errorText.setText('');
      await roomController.createRoom();
      this.scene.start('RoomScene');
    } catch (error) {
      this.errorText.setText(error instanceof Error ? error.message : 'Unable to create room.');
    }
  }

  private async handleJoin() {
    try {
      this.errorText.setText('');
      await roomController.joinRoom(this.roomCodeField.value);
      this.scene.start('RoomScene');
    } catch (error) {
      this.errorText.setText(error instanceof Error ? error.message : 'Unable to join room.');
    }
  }

  private relayout() {
    const lobbyLayout = layout.getLobbyLayout(this);

    this.title.setPosition(lobbyLayout.centerX, lobbyLayout.centerY - 180);
    this.subtitle.setPosition(lobbyLayout.centerX, lobbyLayout.centerY - 115);
    this.roomCodeInput.setPosition(lobbyLayout.centerX, lobbyLayout.centerY - 20);
    this.roomCodeShell.style.width = `${lobbyLayout.panelWidth}px`;
    this.joinButton.setButtonPosition(lobbyLayout.centerX, lobbyLayout.centerY + 90);
    this.createButton.setButtonPosition(lobbyLayout.centerX, lobbyLayout.centerY + 185);
    this.errorText.setPosition(lobbyLayout.centerX, lobbyLayout.centerY + 285);
  }

  private onShutdown() {
    this.scale.off('resize', this.relayout, this);
  }
}
