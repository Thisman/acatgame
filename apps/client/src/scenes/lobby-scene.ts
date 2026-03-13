import Phaser from 'phaser';

import { createElement, HtmlOverlay } from '../html-ui.js';
import { i18n, t } from '../i18n.js';
import { layout } from '../layout.js';
import { roomController } from '../singletons.js';
import { UI_THEME } from '../theme.js';
import { getUiErrorMessage, toUiError, type UiError } from '../ui-error.js';

export class LobbyScene extends Phaser.Scene {
  private overlay!: HtmlOverlay;
  private panel!: HTMLDivElement;
  private title!: HTMLHeadingElement;
  private subtitle!: HTMLParagraphElement;
  private roomCodeInput!: HTMLInputElement;
  private joinButton!: HTMLButtonElement;
  private createButton!: HTMLButtonElement;
  private errorText!: HTMLParagraphElement;
  private unsubscribeI18n: (() => void) | null = null;
  private currentError: UiError | null = null;

  constructor() {
    super('LobbyScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(UI_THEME.background);

    this.overlay = new HtmlOverlay();
    this.panel = createElement('div', 'ui-card');
    this.title = createElement('h1', 'ui-title');
    this.subtitle = createElement('p', 'ui-subtitle');
    this.roomCodeInput = createElement('input', 'ui-input');
    this.roomCodeInput.type = 'text';
    this.roomCodeInput.maxLength = 64;
    this.roomCodeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        void this.handleJoin();
      }
    });

    this.joinButton = createElement('button', 'ui-button');
    this.joinButton.type = 'button';
    this.joinButton.addEventListener('click', () => {
      void this.handleJoin();
    });

    this.createButton = createElement('button', 'ui-button ui-button--secondary');
    this.createButton.type = 'button';
    this.createButton.addEventListener('click', () => {
      void this.handleCreate();
    });

    this.errorText = createElement('p', 'ui-error');

    this.panel.append(this.title, this.subtitle, this.roomCodeInput, this.joinButton, this.createButton, this.errorText);
    this.overlay.element.appendChild(this.panel);

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
      await roomController.joinRoom(this.roomCodeInput.value);
      this.scene.start('RoomScene');
    } catch (error) {
      this.currentError = toUiError(error, 'unable_join_room');
      this.renderTexts();
    }
  }

  private renderTexts() {
    this.title.textContent = t('lobby.title');
    this.subtitle.textContent = t('lobby.subtitle');
    this.roomCodeInput.placeholder = t('lobby.roomCodePlaceholder');
    this.joinButton.textContent = t('actions.joinRoom');
    this.createButton.textContent = t('actions.createRoom');
    this.errorText.textContent = getUiErrorMessage(this.currentError);
  }

  private relayout() {
    const lobbyLayout = layout.getLobbyLayout(this);
    this.panel.style.width = `${lobbyLayout.panelWidth}px`;
  }

  private onShutdown() {
    this.scale.off('resize', this.relayout, this);
    this.unsubscribeI18n?.();
    this.unsubscribeI18n = null;
    this.overlay.destroy();
  }
}
