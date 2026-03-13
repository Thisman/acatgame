import Phaser from 'phaser';
import {
  CAT_MATCH_MAX_ROUNDS,
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
  private phaseTurnText!: TextBlockComponent<HTMLParagraphElement>;
  private phaseStatusText!: TextBlockComponent<HTMLParagraphElement>;
  private phaseMetaText!: TextBlockComponent<HTMLParagraphElement>;
  private phaseActions!: ContainerComponent<HTMLDivElement>;
  private phaseButtonsRow!: ContainerComponent<HTMLDivElement>;
  private phasePrimaryButton!: ButtonComponent;
  private phaseLeaveButton!: ButtonComponent;
  private phaseErrorText!: TextBlockComponent<HTMLParagraphElement>;
  private resultCard!: CardComponent;
  private resultSpinner!: SpinnerComponent;
  private resultStatusText!: TextBlockComponent<HTMLParagraphElement>;
  private resultMetaText!: TextBlockComponent<HTMLParagraphElement>;
  private resultHintText!: TextBlockComponent<HTMLParagraphElement>;
  private resultErrorText!: TextBlockComponent<HTMLParagraphElement>;
  private resultActionButton!: ButtonComponent;
  private resultExitButton!: ButtonComponent;
  private unsubscribe: (() => void) | null = null;
  private unsubscribeI18n: (() => void) | null = null;
  private boardView = new GamePhaseView();
  private readyView = new ReadyPhaseView();
  private localError: UiError | null = null;
  private copyFeedbackState: CopyFeedbackState = 'default';
  private resetCopyLabelEvent: Phaser.Time.TimerEvent | null = null;
  private transientTurnMessageKey: string | null = null;
  private transientTurnMessageEvent: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super('RoomScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(UI_THEME.background);

    this.boardView.create({
      scene: this,
      controller: roomController,
      showTurnMessage: (message) => this.showTransientTurnMessage(message),
    });
    this.readyView.create({ scene: this, controller: roomController });
    this.boardView.hide();
    this.readyView.hide();
    this.createHtml();

    this.scale.on('resize', this.renderView, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    this.unsubscribe = roomController.subscribe(() => this.renderView());
    this.unsubscribeI18n = i18n.subscribe(() => this.renderView());

    void roomController.refreshSnapshot().catch(() => {});
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
    this.phaseTurnText = createTextBlock({
      variant: 'meta',
      className: 'ui-turn-indicator',
      visible: false,
    });
    this.phaseStatusText = createTextBlock({
      variant: 'status',
      className: 'ui-game-status',
    });
    this.phaseMetaText = createTextBlock({ variant: 'meta' });
    this.phaseInfo.element.append(this.phaseTurnText.element, this.phaseStatusText.element, this.phaseMetaText.element);

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

    this.resultCard = createCard({ className: 'ui-card--result', visible: false });
    this.resultSpinner = createSpinner({
      className: 'ui-result-spinner',
      visible: false,
    });
    this.resultStatusText = createTextBlock({
      variant: 'status',
      className: 'ui-result-status',
    });
    this.resultMetaText = createTextBlock({
      variant: 'meta',
      className: 'ui-result-meta',
    });
    this.resultHintText = createTextBlock({
      variant: 'hint',
      className: 'ui-result-hint',
      visible: false,
    });
    this.resultErrorText = createTextBlock({
      variant: 'error',
      className: 'ui-result-error',
      visible: false,
    });
    this.resultActionButton = createButton({ visible: false });
    this.resultExitButton = createButton({
      text: t('actions.leaveRoom'),
      visible: false,
      onClick: () => {
        void this.handleLeave();
      },
    });
    this.resultCard.element.append(
      this.resultSpinner.element,
      this.resultStatusText.element,
      this.resultMetaText.element,
      this.resultHintText.element,
      this.resultErrorText.element,
      this.resultActionButton.element,
      this.resultExitButton.element,
    );

    this.overlay.element.append(
      this.centerCard.element,
      this.phaseInfo.element,
      this.phaseActions.element,
      this.resultCard.element,
    );
  }

  private renderView() {
    const roomLayout = layout.getRoomLayout(this);
    const state = roomController.getState();

    if (state.needsLobbyRedirect && roomController.consumeLobbyRedirect()) {
      this.scene.start('LobbyScene');
      return;
    }

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
    this.resultCard.setVisible(false);
    this.centerCard.setWidth(centerWidth);
    this.primaryButton.setOnClick(null);
    this.phasePrimaryButton.setOnClick(null);
    this.phasePrimaryButton.setDisabled(false);
    this.resultActionButton.setOnClick(null);
    this.resultActionButton.setVisible(false);
    this.resultActionButton.setDisabled(false);
    this.resultExitButton.setVisible(false);
    this.resultSpinner.setVisible(false);
    this.resultHintText.setVisible(false);
    this.resultErrorText.setVisible(false);

    if (phase === 'waiting') {
      this.renderWaiting(snapshot, errorMessage);
      return;
    }

    if (phase === 'ready') {
      this.renderReady(snapshot, state, roomLayout, errorMessage);
      return;
    }

    if (phase === 'roundover') {
      this.renderRoundOver(snapshot, state, errorMessage);
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
    this.phaseButtonsRow.setVisible(true);
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
      top: `${roomLayout.board.y - 122}px`,
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
    this.phaseLeaveButton.setVisible(false);
    this.phaseButtonsRow.setVisible(false);
    this.phaseErrorText.setText(errorMessage);
    this.phaseActions.setVisible(Boolean(errorMessage));

    const roundWins = state.gameState?.G?.roundWinsByPlayer ?? snapshot?.roundWinsByPlayer ?? { '0': 0, '1': 0 };
    const round = state.gameState?.G?.currentRound ?? snapshot?.round ?? 1;
    const roundResult = state.gameState?.G?.roundResult ?? snapshot?.roundResult ?? null;
    const matchResult = snapshot?.matchResult ?? state.gameState?.G?.matchResult ?? null;
    const currentPlayer = snapshot?.currentPlayer ?? state.gameState?.ctx?.currentPlayer ?? null;
    const sessionPlayerID = state.session?.playerID ?? null;
    const transientTurnMessage = this.transientTurnMessageKey ? t(this.transientTurnMessageKey) : '';

    this.phaseTurnText.setText('');
    this.phaseTurnText.setVisible(false);

    if (!snapshot) {
      this.phaseStatusText.setText(t('game.syncing'));
      this.phaseMetaText.setText(t('game.roundScore', {
        round: 1,
        maxRounds: CAT_MATCH_MAX_ROUNDS,
        left: 0,
        right: 0,
        draws: 0,
      }));
      this.phaseMetaText.setVisible(true);
      return;
    }

    this.phaseMetaText.setVisible(true);

    if (matchResult) {
      this.phaseStatusText.setText(
        matchResult.draw
          ? t('game.matchDraw')
          : t('game.matchWinner', { player: getPlayerLabel(matchResult.winner ?? '0') }),
      );
      this.phaseMetaText.setText(t('game.roundScore', {
        round: snapshot.round,
        maxRounds: CAT_MATCH_MAX_ROUNDS,
        left: roundWins['0'] ?? 0,
        right: roundWins['1'] ?? 0,
        draws: snapshot.drawRounds ?? 0,
      }));
      this.renderMatchResultPopup(matchResult.draw ? null : matchResult.winner, roundWins, snapshot.drawRounds ?? 0);
      return;
    }

    if (roundResult) {
      this.phaseStatusText.setText(
        roundResult.draw
          ? t('game.roundDraw', { round: roundResult.round })
          : t('game.roundWinner', { round: roundResult.round, player: getPlayerLabel(roundResult.winner ?? '0') }),
      );
    } else {
      if (transientTurnMessage) {
        this.phaseTurnText.setText(transientTurnMessage);
        this.phaseTurnText.setVisible(true);
      } else if (currentPlayer && sessionPlayerID) {
        this.phaseTurnText.setText(
          currentPlayer === sessionPlayerID ? t('game.yourTurn') : t('game.waitingForOpponentTurn'),
        );
        this.phaseTurnText.setVisible(true);
      }
      this.phaseStatusText.setText(t('game.matchActive'));
    }

    this.phaseMetaText.setText(t('game.roundScore', {
      round,
      maxRounds: CAT_MATCH_MAX_ROUNDS,
      left: roundWins['0'] ?? 0,
      right: roundWins['1'] ?? 0,
      draws: snapshot.drawRounds ?? 0,
    }));
  }

  private renderRoundOver(
    snapshot: RoomSnapshot | null,
    state: ReturnType<typeof roomController.getState>,
    errorMessage: string,
  ) {
    if (!snapshot?.roundResult) {
      return;
    }

    const session = state.session;
    const isReady = !!(session && snapshot.readyByPlayer[session.playerID]);
    const roundWins = snapshot.roundWinsByPlayer ?? { '0': 0, '1': 0 };

    this.resultCard.setVisible(true);
    this.resultCard.setWidth(Math.min(550, window.innerWidth - 48));
    this.resultSpinner.setVisible(isReady);
    this.resultStatusText.setText(
      snapshot.roundResult.draw
        ? t('game.roundDraw', { round: snapshot.roundResult.round })
        : t('game.roundWinner', {
            round: snapshot.roundResult.round,
            player: getPlayerLabel(snapshot.roundResult.winner ?? '0'),
          }),
    );
    this.resultMetaText.setText(t('game.finalRoundScore', {
      left: roundWins['0'] ?? 0,
      right: roundWins['1'] ?? 0,
      draws: snapshot.drawRounds ?? 0,
    }));
    this.resultHintText.setText(isReady ? t('game.waitingForOpponentReady') : '');
    this.resultHintText.setVisible(isReady);
    this.resultErrorText.setText(errorMessage);
    this.resultErrorText.setVisible(Boolean(errorMessage));
    this.resultActionButton.setText(t('actions.ready'));
    this.resultActionButton.setVisible(!isReady);
    this.resultActionButton.setOnClick(() => {
      void this.handleRoundReady();
    });
  }

  private renderMatchResultPopup(winner: string | null, roundWins: Record<string, number>, drawRounds: number) {
    this.resultCard.setVisible(true);
    this.resultCard.setWidth(Math.min(550, window.innerWidth - 48));
    this.resultStatusText.setText(
      winner ? t('game.matchWinner', { player: getPlayerLabel(winner) }) : t('game.matchDraw'),
    );
    this.resultMetaText.setText(t('game.finalRoundScore', {
      left: roundWins['0'] ?? 0,
      right: roundWins['1'] ?? 0,
      draws: drawRounds,
    }));
    this.resultExitButton.setVisible(true);
    this.resultExitButton.setText(t('actions.leaveRoom'));
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

  private async handleRoundReady() {
    try {
      this.localError = null;
      await roomController.setReady(true);
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

  private showTransientTurnMessage(messageKey: string) {
    this.transientTurnMessageKey = messageKey;
    this.transientTurnMessageEvent?.destroy();
    this.transientTurnMessageEvent = this.time.delayedCall(1400, () => {
      this.transientTurnMessageKey = null;
      this.renderView();
    });
    this.renderView();
  }

  private onShutdown() {
    this.scale.off('resize', this.renderView, this);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.unsubscribeI18n?.();
    this.unsubscribeI18n = null;
    this.resetCopyLabelEvent?.destroy();
    this.transientTurnMessageEvent?.destroy();
    this.readyView.destroy();
    this.boardView.destroy();
    this.overlay.destroy();
  }
}
