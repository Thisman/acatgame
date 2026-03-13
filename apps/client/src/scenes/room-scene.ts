import Phaser from 'phaser';
import type { RoomPhase } from '@acatgame/game-core';

import { layout } from '../layout.js';
import { GamePhaseView } from '../phase-views/game-phase-view.js';
import { ReadyPhaseView } from '../phase-views/ready-phase-view.js';
import { WaitingPhaseView } from '../phase-views/waiting-phase-view.js';
import type { RoomPhaseView } from '../room-phase-view.js';
import { roomController } from '../singletons.js';

export class RoomScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private roomCode!: Phaser.GameObjects.Text;
  private unsubscribe: (() => void) | null = null;
  private activePhase: RoomPhase | null = null;
  private readonly phaseViews: Record<RoomPhase, RoomPhaseView> = {
    waiting: new WaitingPhaseView(),
    ready: new ReadyPhaseView(),
    game: new GamePhaseView(),
    gameover: new GamePhaseView(),
  };

  constructor() {
    super('RoomScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#f3f0e8');

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

    this.getUniqueViews().forEach((view) => {
      view.create({ scene: this, controller: roomController });
      view.hide();
    });

    this.scale.on('resize', this.renderView, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    this.unsubscribe = roomController.subscribe(() => this.renderView());
    void roomController.refreshSnapshot();
    this.renderView();
  }

  private renderView() {
    const roomLayout = layout.getRoomLayout(this);
    const state = roomController.getState();
    const snapshot = state.snapshot;
    const phase = snapshot?.phase ?? 'waiting';

    this.title.setPosition(roomLayout.centerX, 34);
    this.roomCode.setPosition(roomLayout.centerX, 98);
    this.roomCode.setText(snapshot ? `Room code: ${snapshot.matchID}` : 'Loading room...');

    if (this.activePhase !== phase) {
      if (this.activePhase) {
        this.phaseViews[this.activePhase].hide();
      }
      this.activePhase = phase;
    }

    this.phaseViews[phase].layout(roomLayout);
    this.phaseViews[phase].show(snapshot, state);
  }

  private onShutdown() {
    this.scale.off('resize', this.renderView, this);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.getUniqueViews().forEach((view) => view.destroy());
  }

  private getUniqueViews() {
    return Array.from(new Set(Object.values(this.phaseViews)));
  }
}
