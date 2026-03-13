import Phaser from 'phaser';

import { i18n, t } from '../i18n.js';
import { layout } from '../layout.js';
import { roomController } from '../singletons.js';
import { UI_THEME } from '../theme.js';
import { createButton, type ButtonComponent } from '../ui/HTML/button.js';
import { createCard, type CardComponent } from '../ui/HTML/card.js';
import { OverlayRoot } from '../ui/HTML/overlay.js';
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
  private errorText!: TextBlockComponent<HTMLParagraphElement>;
  private unsubscribeI18n: (() => void) | null = null;
  private currentError: UiError | null = null;

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
    this.errorText = createTextBlock({ variant: 'error' });

    this.panel.element.append(
      this.title.element,
      this.subtitle.element,
      this.roomCodeInput.element,
      this.joinButton.element,
      this.createButton.element,
      this.errorText.element,
    );
    this.overlay.element.appendChild(this.panel.element);

    this.unsubscribeI18n = i18n.subscribe(() => this.renderTexts());
    this.scale.on('resize', this.relayout, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    this.renderTexts();
    this.relayout();
  }

  private async handleCreate() {
    try {
      this.currentError = null;
      this.renderTexts();
      await roomController.createRoom();
      this.scene.start('RoomScene');
    } catch (error) {
      this.currentError = toUiError(error, 'unable_create_room');
      this.renderTexts();
    }
  }

  private async handleJoin() {
    try {
      this.currentError = null;
      this.renderTexts();
      await roomController.joinRoom(this.roomCodeInput.element.value);
      this.scene.start('RoomScene');
    } catch (error) {
      this.currentError = toUiError(error, 'unable_join_room');
      this.renderTexts();
    }
  }

  private renderTexts() {
    this.title.setText(t('lobby.title'));
    this.subtitle.setText(t('lobby.subtitle'));
    this.roomCodeInput.setPlaceholder(t('lobby.roomCodePlaceholder'));
    this.joinButton.setText(t('actions.joinRoom'));
    this.createButton.setText(t('actions.createRoom'));
    this.errorText.setText(getUiErrorMessage(this.currentError));
  }

  private relayout() {
    const lobbyLayout = layout.getLobbyLayout(this);
    this.panel.setWidth(lobbyLayout.panelWidth);
  }

  private onShutdown() {
    this.scale.off('resize', this.relayout, this);
    this.unsubscribeI18n?.();
    this.unsubscribeI18n = null;
    this.overlay.destroy();
  }
}
