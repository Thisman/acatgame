import Phaser from 'phaser';

import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '@acatgame/game-core';

export interface LobbyLayout {
  centerX: number;
  centerY: number;
  panelWidth: number;
}

export interface RoomLayout {
  width: number;
  height: number;
  board: Phaser.Geom.Rectangle;
  centerX: number;
  centerY: number;
  contentWidth: number;
}

export class ResponsiveLayout {
  getSize(scene: Phaser.Scene) {
    return {
      width: scene.scale.gameSize.width || VIRTUAL_WIDTH,
      height: scene.scale.gameSize.height || VIRTUAL_HEIGHT,
    };
  }

  getLobbyLayout(scene: Phaser.Scene): LobbyLayout {
    const { width, height } = this.getSize(scene);
    return {
      centerX: width / 2,
      centerY: height / 2,
      panelWidth: Math.min(560, width * 0.52),
    };
  }

  getRoomLayout(scene: Phaser.Scene): RoomLayout {
    const { width, height } = this.getSize(scene);
    const marginX = Math.max(120, width * 0.1);
    const top = 190;
    const boardHeight = Math.max(360, height - 320);

    return {
      width,
      height,
      centerX: width / 2,
      centerY: height / 2,
      contentWidth: Math.min(620, width - marginX * 2),
      board: new Phaser.Geom.Rectangle(marginX, top, width - marginX * 2, boardHeight),
    };
  }
}

export const layout = new ResponsiveLayout();
