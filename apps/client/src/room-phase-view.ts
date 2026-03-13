import type { RoomSnapshot } from '@acatgame/game-core';
import type Phaser from 'phaser';

import type { RoomController, RoomControllerState } from './room-controller.js';
import type { RoomLayout } from './layout.js';

export interface RoomPhaseViewDeps {
  scene: Phaser.Scene;
  controller: RoomController;
}

export interface RoomPhaseView {
  create(deps: RoomPhaseViewDeps): void;
  show(snapshot: RoomSnapshot | null, state: RoomControllerState): void;
  hide(): void;
  layout(roomLayout: RoomLayout): void;
  destroy(): void;
}
