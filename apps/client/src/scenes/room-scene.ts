import Phaser from 'phaser';
import type { RoomPhase, RoomSnapshot } from '@acatgame/game-core';

import { createElement, HtmlOverlay } from '../html-ui.js';
import { i18n, t } from '../i18n.js';
import { layout } from '../layout.js';
import { GamePhaseView } from '../phase-views/game-phase-view.js';
import { getPlayerLabel } from '../player-label.js';
import { roomController } from '../singletons.js';
import { UI_THEME } from '../theme.js';
import { getUiErrorMessage, toUiError, type UiError } from '../ui-error.js';

type CopyFeedbackState = 'default' | 'copied' | 'failed';

export class RoomScene extends Phaser.Scene {
  private overlay!: HtmlOverlay;
  private centerCard!: HTMLDivElement;
  private spinner!: HTMLDivElement;
  private statusText!: HTMLParagraphElement;
  private hintText!: HTMLParagraphElement;
  private codeText!: HTMLParagraphElement;
  private primaryButton!: HTMLButtonElement;
  private secondaryButton!: HTMLButtonElement;
  private centerErrorText!: HTMLParagraphElement;
  private gameInfo!: HTMLDivElement;
  private gameStatusText!: HTMLParagraphElement;
  private gameMetaText!: HTMLParagraphElement;
  private gameActions!: HTMLDivElement;
  private gameLeaveButton!: HTMLButtonElement;
  private gameErrorText!: HTMLParagraphElement;
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
    this.overlay = new HtmlOverlay();

    this.centerCard = createElement('div', 'ui-card ui-card--room');
    this.spinner = createElement('div', 'ui-spinner');
    this.statusText = createElement('p', 'ui-status');
    this.hintText = createElement('p', 'ui-hint');
    this.codeText = createElement('p', 'ui-code');
    this.primaryButton = createElement('button', 'ui-button');
    this.primaryButton.type = 'button';
    this.secondaryButton = createElement('button', 'ui-button ui-button--secondary');
    this.secondaryButton.type = 'button';
    this.centerErrorText = createElement('p', 'ui-error');
    this.centerCard.append(
      this.spinner,
      this.statusText,
      this.hintText,
      this.codeText,
      this.primaryButton,
      this.secondaryButton,
      this.centerErrorText,
    );

    this.gameInfo = createElement('div', 'ui-game-info');
    this.gameStatusText = createElement('p', 'ui-game-status');
    this.gameMetaText = createElement('p', 'ui-game-meta');
    this.gameInfo.append(this.gameStatusText, this.gameMetaText);

    this.gameActions = createElement('div', 'ui-game-actions');
    this.gameLeaveButton = createElement('button', 'ui-button ui-button--secondary');
    this.gameLeaveButton.type = 'button';
    this.gameLeaveButton.addEventListener('click', () => {
      void this.handleLeave();
    });
    this.gameErrorText = createElement('p', 'ui-error');
    this.gameActions.append(this.gameLeaveButton, this.gameErrorText);

    this.overlay.element.append(this.centerCard, this.gameInfo, this.gameActions);
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

    this.centerCard.style.display = 'none';
    this.gameInfo.style.display = 'none';
    this.gameActions.style.display = 'none';
    this.centerCard.style.width = `${centerWidth}px`;
    this.primaryButton.onclick = null;
    this.secondaryButton.onclick = null;

    if (phase === 'waiting') {
      this.centerCard.style.display = 'flex';
      this.spinner.style.display = 'block';
      this.hintText.style.display = 'block';
      this.codeText.style.display = snapshot?.matchID ? 'block' : 'none';
      this.secondaryButton.style.display = 'none';
      this.statusText.textContent = snapshot ? t('waiting.waitingForPlayers') : t('waiting.loadingRoom');
      this.hintText.textContent = t('waiting.hint');
      this.codeText.textContent = snapshot?.matchID ?? '';
      this.primaryButton.textContent = this.getCopyButtonLabel();
      this.primaryButton.onclick = () => {
        void this.handleCopy();
      };
      this.centerErrorText.textContent = errorMessage;
      return;
    }

    if (phase === 'ready') {
      this.centerCard.style.display = 'flex';
      const isReady = !!(snapshot && state.session && snapshot.readyByPlayer[state.session.playerID]);
      this.spinner.style.display = 'block';
      this.hintText.style.display = 'none';
      this.codeText.style.display = 'none';
      this.secondaryButton.style.display = 'block';
      this.statusText.textContent = isReady ? t('ready.waitingForSecondPlayer') : t('ready.pressReady');
      this.primaryButton.textContent = isReady ? t('actions.cancel') : t('actions.ready');
      this.secondaryButton.textContent = t('actions.leaveRoom');
      this.primaryButton.onclick = () => {
        void this.handleReadyToggle();
      };
      this.secondaryButton.onclick = () => {
        void this.handleLeave();
      };
      this.centerErrorText.textContent = errorMessage;
      return;
    }

    this.gameInfo.style.display = 'flex';
    this.gameActions.style.display = 'flex';
    this.gameInfo.style.left = `${roomLayout.centerX}px`;
    this.gameInfo.style.top = `${roomLayout.board.y - 74}px`;
    this.gameInfo.style.width = `${roomLayout.board.width}px`;
    this.gameActions.style.left = `${roomLayout.centerX}px`;
    this.gameActions.style.top = `${roomLayout.board.bottom + 28}px`;
    this.gameActions.style.width = `${Math.min(320, roomLayout.board.width)}px`;
    this.gameLeaveButton.textContent = t('actions.leaveRoom');
    this.gameErrorText.textContent = errorMessage;

    const scores = state.gameState?.G?.scoreByPlayer ?? snapshot?.scores ?? { '0': 0, '1': 0 };
    const winner = snapshot?.winner ?? state.gameState?.G?.winner ?? null;

    if (!snapshot) {
      this.gameStatusText.textContent = t('game.syncing');
      this.gameMetaText.textContent = t('game.score', { left: 0, right: 0 });
      return;
    }

    if (winner) {
      this.gameStatusText.textContent = t('game.winner', { player: getPlayerLabel(winner) });
      this.gameMetaText.textContent = t('game.finalScore', { left: scores['0'] ?? 0, right: scores['1'] ?? 0 });
      return;
    }

    this.gameStatusText.textContent = t('game.matchActive');
    this.gameMetaText.textContent = t('game.currentTurnScore', {
      player: getPlayerLabel(snapshot.currentPlayer ?? '0'),
      left: scores['0'] ?? 0,
      right: scores['1'] ?? 0,
    });
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
