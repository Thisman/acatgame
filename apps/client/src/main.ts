import Phaser from 'phaser';

import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '@acatgame/game-core';

import './styles.css';
import { BootScene } from './scenes/boot-scene.js';
import { LobbyScene } from './scenes/lobby-scene.js';
import { RoomScene } from './scenes/room-scene.js';

const parent = 'app';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#f3f0e8',
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
    mouse: {
      target: parent,
    },
    touch: {
      target: parent,
    },
  },
};

void new Phaser.Game(config);
