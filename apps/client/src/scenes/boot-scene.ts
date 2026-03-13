import Phaser from 'phaser';

import { ensureReadyCardAnimation, preloadReadyCardAssets } from '../ready-card-assets.js';
import { UI_THEME } from '../theme.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    preloadReadyCardAssets(this);
  }

  create() {
    this.cameras.main.setBackgroundColor(UI_THEME.background);
    ensureReadyCardAnimation(this);
    this.scene.start('LobbyScene');
  }
}
