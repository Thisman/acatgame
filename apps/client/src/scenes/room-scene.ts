import Phaser from 'phaser';
import {
  READY_CARD_SELECTION_LIMIT,
  type RoomPhase,
  type RoomSnapshot,
} from '@acatgame/game-core';

import { i18n, t } from '../i18n.js';
import { layout } from '../layout.js';
import { GamePhaseView } from '../phase-views/game-phase-view.js';
import { ReadyPhaseView } from '../phase-views/ready-phase-view.js';
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
  private centerErrorText!: TextBlockComponent<HTMLParagraphElement>;
  private phaseInfo!: ContainerComponent<HTMLDivElement>;
  private phaseStatusText!: TextBlockComponent<HTMLParagraphElement>;
  private phaseMetaText!: TextBlockComponent<HTMLParagraphElement>;
  private phaseActions!: ContainerComponent<HTMLDivElement>;
  private phaseButtonsRow!: ContainerComponent<HTMLDivElement>;
  private phasePrimaryButton!: ButtonComponent;
  private phaseLeaveButton!: ButtonComponent;
  private phaseErrorText!: TextBlockComponent<HTMLParagraphElement>;
  private unsubscribe: (() => void) | null = null;
  private unsubscribeI18n: (() => void) | null = null;
  private boardView = new GamePhaseView();
  private readyView = new ReadyPhaseView();
  private localError: UiError | null = null;
  private copyFeedbackState: CopyFeedbackState = 'default';
  private resetCopyLabelEvent: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super('RoomScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(UI_THEME.background);

    this.boardView.create({ scene: this, controller: roomController });
    this.readyView.create({ scene: this, controller: roomController });
    this.boardView.hide();
    this.readyView.hide();
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
    this.centerErrorText = createTextBlock({ variant: 'error' });
    this.centerCard.element.append(
      this.spinner.element,
      this.statusText.element,
      this.hintText.element,
      this.codeText.element,
      this.primaryButton.element,
      this.centerErrorText.element,
    );

    this.phaseInfo = createContainer('div', {
      className: 'ui-game-info',
      display: 'flex',
      visible: false,
    });
    this.phaseStatusText = createTextBlock({
      variant: 'status',
      className: 'ui-game-status',
    });
    this.phaseMetaText = createTextBlock({ variant: 'meta' });
    this.phaseInfo.element.append(this.phaseStatusText.element, this.phaseMetaText.element);

    this.phaseActions = createContainer('div', {
      className: 'ui-game-actions',
      display: 'flex',
      visible: false,
    });
    this.phaseButtonsRow = createContainer('div', {
      className: 'ui-game-actions-row',
      display: 'flex',
      visible: true,
    });
    this.phasePrimaryButton = createButton({ visible: false });
    this.phaseLeaveButton = createButton({
      variant: 'secondary',
      onClick: () => {
        void this.handleLeave();
      },
    });
    this.phaseErrorText = createTextBlock({ variant: 'error' });
    this.phaseButtonsRow.element.append(this.phasePrimaryButton.element, this.phaseLeaveButton.element);
    this.phaseActions.element.append(this.phaseButtonsRow.element, this.phaseErrorText.element);

    this.overlay.element.append(
      this.centerCard.element,
      this.phaseInfo.element,
      this.phaseActions.element,
    );
  }

  private renderView() {
    const roomLayout = layout.getRoomLayout(this);
    const state = roomController.getState();
    const snapshot = state.snapshot;
    const phase = snapshot?.phase ?? 'waiting';

    this.readyView.layout(roomLayout);
    this.boardView.layout(roomLayout);

    if (phase === 'ready') {
      this.boardView.hide();
      this.readyView.show(snapshot, state);
    } else if (phase === 'game' || phase === 'gameover') {
      this.readyView.hide();
      this.boardView.show(snapshot, state);
    } else {
      this.readyView.hide();
      this.boardView.hide();
    }

    this.renderHtml(phase, snapshot, state, roomLayout);
  }

  private renderHtml(
    phase: RoomPhase,
    snapshot: RoomSnapshot | null,
    state: ReturnType<typeof roomController.getState>,
    roomLayout: ReturnType<typeof layout.getRoomLayout>,
  ) {
    const errorMessage = getUiErrorMessage(this.localError ?? state.error);
    const centerWidth = Math.min(560, roomLayout.contentWidth);

    this.centerCard.setVisible(false);
    this.phaseInfo.setVisible(false);
    this.phaseActions.setVisible(false);
    this.centerCard.setWidth(centerWidth);
    this.primaryButton.setOnClick(null);
    this.phasePrimaryButton.setOnClick(null);
    this.phasePrimaryButton.setDisabled(false);

    if (phase === 'waiting') {
      this.renderWaiting(snapshot, errorMessage);
      return;
    }

    if (phase === 'ready') {
      this.renderReady(snapshot, state, roomLayout, errorMessage);
      return;
    }

    this.renderGame(snapshot, state, roomLayout, errorMessage);
  }

  private renderWaiting(snapshot: RoomSnapshot | null, errorMessage: string) {
    this.centerCard.setVisible(true);
    this.spinner.setVisible(true);
    this.hintText.setVisible(true);
    this.codeText.setVisible(Boolean(snapshot?.matchID));
    this.primaryButton.setVisible(true);
    this.statusText.setText(snapshot ? t('waiting.waitingForPlayers') : t('waiting.loadingRoom'));
    this.hintText.setText(t('waiting.hint'));
    this.codeText.setText(snapshot?.matchID ?? '');
    this.primaryButton.setText(this.getCopyButtonLabel());
    this.primaryButton.setOnClick(() => {
      void this.handleCopy();
    });
    this.centerErrorText.setText(errorMessage);
  }

  private renderReady(
    snapshot: RoomSnapshot | null,
    state: ReturnType<typeof roomController.getState>,
    roomLayout: ReturnType<typeof layout.getRoomLayout>,
    errorMessage: string,
  ) {
    const session = state.session;
    const selectedCardIDs = session ? snapshot?.selectedCardIDsByPlayer[session.playerID] ?? [] : [];
    const isReady = !!(snapshot && session && snapshot.readyByPlayer[session.playerID]);
    const isSelectionComplete = selectedCardIDs.length === READY_CARD_SELECTION_LIMIT;

    this.phaseInfo.setVisible(true);
    this.phaseActions.setVisible(true);
    this.phaseInfo.setStyles({
      left: `${roomLayout.centerX}px`,
      top: `${roomLayout.board.y - 78}px`,
      width: `${roomLayout.board.width}px`,
    });
    this.phaseActions.setStyles({
      left: `${roomLayout.centerX}px`,
      top: `${roomLayout.board.bottom + 24}px`,
      width: `${Math.min(520, roomLayout.board.width)}px`,
    });
    this.phaseButtonsRow.setStyles({
      maxWidth: `${Math.min(460, roomLayout.board.width)}px`,
    });

    this.phaseStatusText.setText(
      isReady
        ? t('ready.waitingForSecondPlayer')
        : t('ready.selectionProgress', {
            count: selectedCardIDs.length,
            limit: READY_CARD_SELECTION_LIMIT,
          }),
    );
    this.phaseMetaText.setText('');
    this.phaseMetaText.setVisible(false);

    this.phasePrimaryButton.setVisible(true);
    this.phasePrimaryButton.setText(isReady ? t('actions.cancel') : t('actions.ready'));
    this.phasePrimaryButton.setDisabled(!isReady && !isSelectionComplete);
    this.phasePrimaryButton.setOnClick(() => {
      void this.handleReadyToggle();
    });
    this.phaseLeaveButton.setVisible(true);
    this.phaseLeaveButton.setText(t('actions.leaveRoom'));
    this.phaseErrorText.setText(errorMessage);
  }

  private renderGame(
    snapshot: RoomSnapshot | null,
    state: ReturnType<typeof roomController.getState>,
    roomLayout: ReturnType<typeof layout.getRoomLayout>,
    errorMessage: string,
  ) {
    this.phaseInfo.setVisible(true);
    this.phaseActions.setVisible(true);
    this.phaseInfo.setStyles({
      left: `${roomLayout.centerX}px`,
      top: `${roomLayout.board.y - 74}px`,
      width: `${roomLayout.board.width}px`,
    });
    this.phaseActions.setStyles({
      left: `${roomLayout.centerX}px`,
      top: `${roomLayout.board.bottom + 28}px`,
      width: `${Math.min(320, roomLayout.board.width)}px`,
    });
    this.phaseButtonsRow.setStyles({
      maxWidth: `${Math.min(320, roomLayout.board.width)}px`,
    });
    this.phasePrimaryButton.setVisible(false);
    this.phasePrimaryButton.setDisabled(false);
    this.phaseLeaveButton.setVisible(true);
    this.phaseLeaveButton.setText(t('actions.leaveRoom'));
    this.phaseErrorText.setText(errorMessage);

    const scores = state.gameState?.G?.scoreByPlayer ?? snapshot?.scores ?? { '0': 0, '1': 0 };
    const winner = snapshot?.winner ?? state.gameState?.G?.winner ?? null;

    if (!snapshot) {
      this.phaseStatusText.setText(t('game.syncing'));
      this.phaseMetaText.setText(t('game.score', { left: 0, right: 0 }));
      this.phaseMetaText.setVisible(true);
      return;
    }

    this.phaseMetaText.setVisible(true);

    if (winner) {
      this.phaseStatusText.setText(t('game.winner', { player: getPlayerLabel(winner) }));
      this.phaseMetaText.setText(t('game.finalScore', { left: scores['0'] ?? 0, right: scores['1'] ?? 0 }));
      return;
    }

    this.phaseStatusText.setText(t('game.matchActive'));
    this.phaseMetaText.setText(t('game.currentTurnScore', {
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
    this.readyView.destroy();
    this.boardView.destroy();
    this.overlay.destroy();
  }
}
