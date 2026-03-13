import Phaser from 'phaser';
import type { RoomPhase, RoomSnapshot } from '@acatgame/game-core';

import { i18n, t } from '../i18n.js';
import { layout } from '../layout.js';
import { GamePhaseView } from '../phase-views/game-phase-view.js';
import { getPlayerLabel } from '../player-label.js';
import { roomController } from '../singletons.js';
import { UI_THEME } from '../theme.js';
import { createButton, type ButtonComponent } from '../ui/HTML/button.js';
import { createCard, type CardComponent } from '../ui/HTML/card.js';
import { createContainer, type ContainerComponent } from '../ui/HTML/container.js';
import { OverlayRoot } from '../ui/HTML/overlay.js';
import { createSpinner, type SpinnerComponent } from '../ui/HTML/spinner.js';
import { createTextBlock, type TextBlockComponent } from '../ui/HTML/text-block.js';
import { getUiErrorMessage, toUiError, type UiError } from '../ui-error.js';

type CopyFeedbackState = 'default' | 'copied' | 'failed';

export class RoomScene extends Phaser.Scene {
  private overlay!: OverlayRoot;
  private centerCard!: CardComponent;
  private spinner!: SpinnerComponent;
  private statusText!: TextBlockComponent<HTMLParagraphElement>;
  private hintText!: TextBlockComponent<HTMLParagraphElement>;
  private codeText!: TextBlockComponent<HTMLParagraphElement>;
  private primaryButton!: ButtonComponent;
  private secondaryButton!: ButtonComponent;
  private centerErrorText!: TextBlockComponent<HTMLParagraphElement>;
  private gameInfo!: ContainerComponent<HTMLDivElement>;
  private gameStatusText!: TextBlockComponent<HTMLParagraphElement>;
  private gameMetaText!: TextBlockComponent<HTMLParagraphElement>;
  private gameActions!: ContainerComponent<HTMLDivElement>;
  private gameLeaveButton!: ButtonComponent;
  private gameErrorText!: TextBlockComponent<HTMLParagraphElement>;
  private unsubscribe: (() => void) | null = null;
  private unsubscribeI18n: (() => void) | null = null;
  private boardView = new GamePhaseView();
  private localError: UiError | null = null;
  private copyFeedbackState: CopyFeedbackState = 'default';
  private resetCopyLabelEvent: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super('RoomScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(UI_THEME.background);

    this.boardView.create({ scene: this, controller: roomController });
    this.boardView.hide();
    this.createHtml();

    this.scale.on('resize', this.renderView, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    this.unsubscribe = roomController.subscribe(() => this.renderView());
    this.unsubscribeI18n = i18n.subscribe(() => this.renderView());

    void roomController.refreshSnapshot();
    this.renderView();
  }

  private createHtml() {
    this.overlay = new OverlayRoot();

    this.centerCard = createCard({ className: 'ui-card--room', visible: false });
    this.spinner = createSpinner();
    this.statusText = createTextBlock({ variant: 'status' });
    this.hintText = createTextBlock({ variant: 'hint' });
    this.codeText = createTextBlock({ variant: 'code' });
    this.primaryButton = createButton();
    this.secondaryButton = createButton({ variant: 'secondary', visible: false });
    this.centerErrorText = createTextBlock({ variant: 'error' });
    this.centerCard.element.append(
      this.spinner.element,
      this.statusText.element,
      this.hintText.element,
      this.codeText.element,
      this.primaryButton.element,
      this.secondaryButton.element,
      this.centerErrorText.element,
    );

    this.gameInfo = createContainer('div', {
      className: 'ui-game-info',
      display: 'flex',
      visible: false,
    });
    this.gameStatusText = createTextBlock({
      variant: 'status',
      className: 'ui-game-status',
    });
    this.gameMetaText = createTextBlock({ variant: 'meta' });
    this.gameInfo.element.append(this.gameStatusText.element, this.gameMetaText.element);

    this.gameActions = createContainer('div', {
      className: 'ui-game-actions',
      display: 'flex',
      visible: false,
    });
    this.gameLeaveButton = createButton({
      variant: 'secondary',
      onClick: () => {
        void this.handleLeave();
      },
    });
    this.gameErrorText = createTextBlock({ variant: 'error' });
    this.gameActions.element.append(this.gameLeaveButton.element, this.gameErrorText.element);

    this.overlay.element.append(this.centerCard.element, this.gameInfo.element, this.gameActions.element);
  }

  private renderView() {
    const roomLayout = layout.getRoomLayout(this);
    const state = roomController.getState();
    const snapshot = state.snapshot;
    const phase = snapshot?.phase ?? 'waiting';
    const isBoardPhase = phase === 'game' || phase === 'gameover';

    if (isBoardPhase) {
      this.boardView.layout(roomLayout);
      this.boardView.show(snapshot, state);
    } else {
      this.boardView.hide();
    }

    this.renderHtml(phase, snapshot, state, roomLayout);
  }

  private renderHtml(phase: RoomPhase, snapshot: RoomSnapshot | null, state: ReturnType<typeof roomController.getState>, roomLayout: ReturnType<typeof layout.getRoomLayout>) {
    const errorMessage = getUiErrorMessage(this.localError ?? state.error);
    const centerWidth = Math.min(560, roomLayout.contentWidth);

    this.centerCard.setVisible(false);
    this.gameInfo.setVisible(false);
    this.gameActions.setVisible(false);
    this.centerCard.setWidth(centerWidth);
    this.primaryButton.setOnClick(null);
    this.secondaryButton.setOnClick(null);

    if (phase === 'waiting') {
      this.centerCard.setVisible(true);
      this.spinner.setVisible(true);
      this.hintText.setVisible(true);
      this.codeText.setVisible(Boolean(snapshot?.matchID));
      this.primaryButton.setVisible(true);
      this.secondaryButton.setVisible(false);
      this.statusText.setText(snapshot ? t('waiting.waitingForPlayers') : t('waiting.loadingRoom'));
      this.hintText.setText(t('waiting.hint'));
      this.codeText.setText(snapshot?.matchID ?? '');
      this.primaryButton.setText(this.getCopyButtonLabel());
      this.primaryButton.setOnClick(() => {
        void this.handleCopy();
      });
      this.centerErrorText.setText(errorMessage);
      return;
    }

    if (phase === 'ready') {
      this.centerCard.setVisible(true);
      const isReady = !!(snapshot && state.session && snapshot.readyByPlayer[state.session.playerID]);
      this.spinner.setVisible(true);
      this.hintText.setVisible(false);
      this.codeText.setVisible(false);
      this.primaryButton.setVisible(true);
      this.secondaryButton.setVisible(true);
      this.statusText.setText(isReady ? t('ready.waitingForSecondPlayer') : t('ready.pressReady'));
      this.primaryButton.setText(isReady ? t('actions.cancel') : t('actions.ready'));
      this.secondaryButton.setText(t('actions.leaveRoom'));
      this.primaryButton.setOnClick(() => {
        void this.handleReadyToggle();
      });
      this.secondaryButton.setOnClick(() => {
        void this.handleLeave();
      });
      this.centerErrorText.setText(errorMessage);
      return;
    }

    this.spinner.setVisible(false);
    this.hintText.setVisible(false);
    this.codeText.setVisible(false);
    this.primaryButton.setVisible(false);
    this.secondaryButton.setVisible(false);
    this.gameInfo.setVisible(true);
    this.gameActions.setVisible(true);
    this.gameInfo.setStyles({
      left: `${roomLayout.centerX}px`,
      top: `${roomLayout.board.y - 74}px`,
      width: `${roomLayout.board.width}px`,
    });
    this.gameActions.setStyles({
      left: `${roomLayout.centerX}px`,
      top: `${roomLayout.board.bottom + 28}px`,
      width: `${Math.min(320, roomLayout.board.width)}px`,
    });
    this.gameLeaveButton.setText(t('actions.leaveRoom'));
    this.gameErrorText.setText(errorMessage);

    const scores = state.gameState?.G?.scoreByPlayer ?? snapshot?.scores ?? { '0': 0, '1': 0 };
    const winner = snapshot?.winner ?? state.gameState?.G?.winner ?? null;

    if (!snapshot) {
      this.gameStatusText.setText(t('game.syncing'));
      this.gameMetaText.setText(t('game.score', { left: 0, right: 0 }));
      return;
    }

    if (winner) {
      this.gameStatusText.setText(t('game.winner', { player: getPlayerLabel(winner) }));
      this.gameMetaText.setText(t('game.finalScore', { left: scores['0'] ?? 0, right: scores['1'] ?? 0 }));
      return;
    }

    this.gameStatusText.setText(t('game.matchActive'));
    this.gameMetaText.setText(t('game.currentTurnScore', {
      player: getPlayerLabel(snapshot.currentPlayer ?? '0'),
      left: scores['0'] ?? 0,
      right: scores['1'] ?? 0,
    }));
  }

  private async handleCopy() {
    const copied = await roomController.copyRoomCode().catch(() => false);
    this.copyFeedbackState = copied ? 'copied' : 'failed';
    this.renderView();
    this.resetCopyLabelEvent?.destroy();
    this.resetCopyLabelEvent = this.time.delayedCall(1200, () => {
      this.copyFeedbackState = 'default';
      this.renderView();
    });
  }

  private async handleReadyToggle() {
    try {
      this.localError = null;
      const state = roomController.getState();
      const snapshot = state.snapshot;
      const session = state.session;
      const ready = !!(snapshot && session && snapshot.readyByPlayer[session.playerID]);
      await roomController.setReady(!ready);
    } catch (error) {
      this.localError = toUiError(error);
    }

    this.renderView();
  }

  private async handleLeave() {
    try {
      this.localError = null;
      await roomController.leaveRoom();
      this.scene.start('LobbyScene');
    } catch (error) {
      this.localError = toUiError(error);
      this.renderView();
    }
  }

  private getCopyButtonLabel() {
    if (this.copyFeedbackState === 'copied') {
      return t('actions.copied');
    }

    if (this.copyFeedbackState === 'failed') {
      return t('actions.copyFailed');
    }

    return t('actions.copyCode');
  }

  private onShutdown() {
    this.scale.off('resize', this.renderView, this);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.unsubscribeI18n?.();
    this.unsubscribeI18n = null;
    this.resetCopyLabelEvent?.destroy();
    this.boardView.destroy();
    this.overlay.destroy();
  }
}
