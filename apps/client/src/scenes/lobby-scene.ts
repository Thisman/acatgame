import Phaser from 'phaser';
import type { AvailableRoomSummary } from '@acatgame/game-core';

import { i18n, t } from '../i18n.js';
import { layout } from '../layout.js';
import { roomController } from '../singletons.js';
import { UI_THEME } from '../theme.js';
import { createButton, type ButtonComponent } from '../ui/HTML/button.js';
import { createCard, type CardComponent } from '../ui/HTML/card.js';
import { createContainer, type ContainerComponent } from '../ui/HTML/container.js';
import { OverlayRoot } from '../ui/HTML/overlay.js';
import { createSpinner, type SpinnerComponent } from '../ui/HTML/spinner.js';
import { createTextBlock, type TextBlockComponent } from '../ui/HTML/text-block.js';
import { createTextInput, type TextInputComponent } from '../ui/HTML/text-input.js';
import { getUiErrorMessage, toUiError, type UiError } from '../ui-error.js';

export class LobbyScene extends Phaser.Scene {
  private overlay!: OverlayRoot;
  private panel!: CardComponent;
  private title!: TextBlockComponent<HTMLHeadingElement>;
  private subtitle!: TextBlockComponent<HTMLParagraphElement>;
  private roomCodeInput!: TextInputComponent;
  private joinButton!: ButtonComponent;
  private createButton!: ButtonComponent;
  private findRoomButton!: ButtonComponent;
  private errorText!: TextBlockComponent<HTMLParagraphElement>;
  private popupBackdrop!: ContainerComponent<HTMLDivElement>;
  private popupCard!: CardComponent;
  private popupHeader!: ContainerComponent<HTMLDivElement>;
  private popupTitle!: TextBlockComponent<HTMLParagraphElement>;
  private popupBody!: ContainerComponent<HTMLDivElement>;
  private popupSpinner!: SpinnerComponent;
  private popupEmptyText!: TextBlockComponent<HTMLParagraphElement>;
  private popupList!: ContainerComponent<HTMLDivElement>;
  private popupErrorText!: TextBlockComponent<HTMLParagraphElement>;
  private unsubscribeI18n: (() => void) | null = null;
  private currentError: UiError | null = null;
  private popupError: UiError | null = null;
  private availableRooms: AvailableRoomSummary[] = [];
  private popupOpen = false;
  private popupLoading = false;
  private joiningRoomID: string | null = null;
  private popupPollTimer: number | null = null;
  private popupRequestToken = 0;

  constructor() {
    super('LobbyScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(UI_THEME.background);

    this.overlay = new OverlayRoot();
    this.panel = createCard();
    this.title = createTextBlock({ variant: 'title', tagName: 'h1' });
    this.subtitle = createTextBlock({ variant: 'subtitle' });
    this.roomCodeInput = createTextInput({
      maxLength: 64,
      onEnter: () => {
        void this.handleJoin();
      },
    });
    this.joinButton = createButton({
      onClick: () => {
        void this.handleJoin();
      },
    });
    this.createButton = createButton({
      variant: 'secondary',
      onClick: () => {
        void this.handleCreate();
      },
    });
    this.findRoomButton = createButton({
      variant: 'secondary',
      onClick: () => {
        this.openPopup();
      },
    });
    this.errorText = createTextBlock({ variant: 'error' });

    this.panel.element.append(
      this.title.element,
      this.subtitle.element,
      this.roomCodeInput.element,
      this.joinButton.element,
      this.createButton.element,
      this.findRoomButton.element,
      this.errorText.element,
    );

    this.popupBackdrop = createContainer('div', {
      className: 'ui-popup-backdrop',
      visible: false,
      display: 'flex',
    });
    this.popupBackdrop.element.onclick = (event) => {
      if (event.target === this.popupBackdrop.element) {
        this.closePopup();
      }
    };
    this.popupCard = createCard({ className: 'ui-card--rooms-popup', visible: true });
    this.popupHeader = createContainer('div', {
      className: 'ui-room-popup-header',
      display: 'flex',
    });
    this.popupTitle = createTextBlock({
      variant: 'status',
      className: 'ui-room-popup-title',
    });
    this.popupHeader.element.append(this.popupTitle.element);

    this.popupBody = createContainer('div', {
      className: 'ui-room-popup-body',
      display: 'flex',
    });
    this.popupSpinner = createSpinner({
      className: 'ui-room-popup-spinner',
      visible: false,
    });
    this.popupEmptyText = createTextBlock({
      variant: 'hint',
      className: 'ui-room-popup-empty',
      visible: false,
    });
    this.popupList = createContainer('div', {
      className: 'ui-room-popup-list',
      visible: true,
    });
    this.popupBody.element.append(
      this.popupSpinner.element,
      this.popupEmptyText.element,
      this.popupList.element,
    );

    this.popupErrorText = createTextBlock({
      variant: 'error',
      className: 'ui-room-popup-error',
    });

    this.popupCard.element.append(
      this.popupHeader.element,
      this.popupBody.element,
      this.popupErrorText.element,
    );
    this.popupBackdrop.element.appendChild(this.popupCard.element);

    this.overlay.element.append(this.panel.element, this.popupBackdrop.element);

    this.unsubscribeI18n = i18n.subscribe(() => this.renderTexts());
    this.scale.on('resize', this.relayout, this);
    this.input.keyboard?.on('keydown-ESC', this.handleEscape, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    this.renderTexts();
    this.relayout();
  }

  private async handleCreate() {
    try {
      this.currentError = null;
      this.renderTexts();
      await roomController.createRoom();
      this.closePopup();
      this.scene.start('RoomScene');
    } catch (error) {
      roomController.consumeLobbyRedirect();
      this.currentError = toUiError(error, 'unable_create_room');
      this.renderTexts();
    }
  }

  private async handleJoin() {
    try {
      this.currentError = null;
      this.renderTexts();
      await roomController.joinRoom(this.roomCodeInput.element.value);
      this.closePopup();
      this.scene.start('RoomScene');
    } catch (error) {
      roomController.consumeLobbyRedirect();
      this.currentError = toUiError(error, 'unable_join_room');
      this.renderTexts();
    }
  }

  private async handlePopupJoin(matchID: string) {
    if (this.joiningRoomID) {
      return;
    }

    try {
      this.currentError = null;
      this.popupError = null;
      this.joiningRoomID = matchID;
      this.renderTexts();
      await roomController.joinRoom(matchID);
      this.closePopup();
      this.scene.start('RoomScene');
    } catch (error) {
      roomController.consumeLobbyRedirect();
      const uiError = toUiError(error, 'unable_join_room');
      this.currentError = uiError;
      this.popupError = uiError;
      this.joiningRoomID = null;
      this.renderTexts();
      await this.refreshAvailableRooms();
    }
  }

  private openPopup() {
    if (this.popupOpen) {
      return;
    }

    this.popupOpen = true;
    this.popupLoading = true;
    this.popupError = null;
    this.joiningRoomID = null;
    this.availableRooms = [];
    this.popupRequestToken += 1;
    this.startPopupPolling();
    this.renderTexts();
    void this.refreshAvailableRooms();
  }

  private closePopup() {
    this.popupOpen = false;
    this.popupLoading = false;
    this.popupError = null;
    this.joiningRoomID = null;
    this.popupRequestToken += 1;
    this.stopPopupPolling();
    this.renderTexts();
  }

  private startPopupPolling() {
    this.stopPopupPolling();
    this.popupPollTimer = window.setInterval(() => {
      void this.refreshAvailableRooms();
    }, 2_500);
  }

  private stopPopupPolling() {
    if (this.popupPollTimer) {
      window.clearInterval(this.popupPollTimer);
      this.popupPollTimer = null;
    }
  }

  private async refreshAvailableRooms() {
    if (!this.popupOpen) {
      return;
    }

    const requestToken = ++this.popupRequestToken;

    if (this.availableRooms.length === 0) {
      this.popupLoading = true;
      this.renderTexts();
    }

    try {
      const rooms = await roomController.listAvailableRooms();

      if (!this.popupOpen || requestToken !== this.popupRequestToken) {
        return;
      }

      this.availableRooms = [...rooms].sort((left, right) => left.matchID.localeCompare(right.matchID));
      this.popupError = null;
    } catch (error) {
      if (!this.popupOpen || requestToken !== this.popupRequestToken) {
        return;
      }

      this.popupError = toUiError(error);
    } finally {
      if (!this.popupOpen || requestToken !== this.popupRequestToken) {
        return;
      }

      this.popupLoading = false;
      this.renderTexts();
    }
  }

  private renderTexts() {
    this.title.setText(t('lobby.title'));
    this.subtitle.setText(t('lobby.subtitle'));
    this.roomCodeInput.setPlaceholder(t('lobby.roomCodePlaceholder'));
    this.joinButton.setText(t('actions.joinRoom'));
    this.createButton.setText(t('actions.createRoom'));
    this.findRoomButton.setText(t('actions.findRoom'));
    this.errorText.setText(getUiErrorMessage(this.currentError));

    this.popupBackdrop.setVisible(this.popupOpen);
    this.popupTitle.setText(t('lobby.findRoomTitle'));
    this.popupSpinner.setVisible(this.popupLoading);
    this.popupEmptyText.setText(t('lobby.noAvailableRooms'));
    this.popupEmptyText.setVisible(!this.popupLoading && this.availableRooms.length === 0);
    this.popupList.setVisible(this.availableRooms.length > 0);
    this.popupErrorText.setText(getUiErrorMessage(this.popupError));

    this.renderPopupList();
  }

  private renderPopupList() {
    this.popupList.element.replaceChildren();

    for (const room of this.availableRooms) {
      const row = createContainer('div', {
        className: 'ui-room-list-item',
        display: 'flex',
      });
      const code = createTextBlock({
        variant: 'code',
        tagName: 'p',
        className: 'ui-room-list-code',
      });
      const joinButton = createButton({
        text: t('actions.joinRoom'),
        minWidth: 180,
        disabled: this.joiningRoomID === room.matchID,
        onClick: () => {
          void this.handlePopupJoin(room.matchID);
        },
      });

      code.setText(room.matchID);

      row.element.append(code.element, joinButton.element);
      this.popupList.element.appendChild(row.element);
    }
  }

  private relayout() {
    const lobbyLayout = layout.getLobbyLayout(this);
    this.panel.setWidth(lobbyLayout.panelWidth);
  }

  private handleEscape() {
    if (this.popupOpen) {
      this.closePopup();
    }
  }

  private onShutdown() {
    this.scale.off('resize', this.relayout, this);
    this.input.keyboard?.off('keydown-ESC', this.handleEscape, this);
    this.unsubscribeI18n?.();
    this.unsubscribeI18n = null;
    this.stopPopupPolling();
    this.overlay.destroy();
  }
}
