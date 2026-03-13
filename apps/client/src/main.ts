import Phaser from 'phaser';

import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '@acatgame/game-core';

import './styles.css';
import { setupLanguageSwitcher } from './language-switcher.js';
import { BootScene } from './scenes/boot-scene.js';
import { LobbyScene } from './scenes/lobby-scene.js';
import { RoomScene } from './scenes/room-scene.js';
import { UI_THEME } from './theme.js';

const parent = 'app';
const inputTarget = document.getElementById(parent) ?? document.body;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: UI_THEME.background,
  autoRound: false,
  scene: [BootScene, LobbyScene, RoomScene],
  scale: {
    parent,
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  dom: {
    createContainer: true,
  },
  input: {
    keyboard: {
      target: window,
    },
    mouse: {
      target: inputTarget,
    },
    touch: {
      target: inputTarget,
    },
  },
};

setupLanguageSwitcher();
void new Phaser.Game(config);
