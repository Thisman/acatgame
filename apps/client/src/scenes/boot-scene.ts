import Phaser from 'phaser';

import { UI_THEME } from '../theme.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(UI_THEME.background);
    this.scene.start('LobbyScene');
  }
}
