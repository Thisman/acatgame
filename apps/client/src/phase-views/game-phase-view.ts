import Phaser from 'phaser';
import {
  CAT_MATCH_BOARD_SIZE,
  CAT_MATCH_HAND_SIZE,
  getAdjacentConvertMechanic,
  getHiddenMineMechanic,
  getAdjacentPushMechanic,
  isConvertImmuneCard,
  isPushImmuneCard,
  type BoardCell,
  type BoardCellEffect,
  type RoomSnapshot,
} from '@acatgame/game-core';

import {
  getArmedMineEffect,
  getCardTooltipContent,
  getPlacementLockEffect,
  normalizeCellEffects,
  previewCellEffectsForPlacement,
} from '../card-ui.js';
import type { RoomLayout } from '../layout.js';
import {
  getCardAnimationKey,
  getPlayerCatAnimationKey,
  getPlayerCatBaseTexture,
} from '../ready-card-assets.js';
import type { RoomController } from '../room-controller.js';
import type { RoomControllerState } from '../room-controller.js';
import { UI_THEME } from '../theme.js';
import { drawBoardSurface } from '../ui/canvas/board-surface.js';
import { createCatCardView, renderCatCard, type CatCardView } from '../ui/canvas/cat-card.js';

interface GamePhaseViewDeps {
  scene: Phaser.Scene;
  controller: RoomController;
  showTurnMessage: (message: string) => void;
}

interface GridCellView {
  x: number;
  y: number;
  tile: Phaser.GameObjects.Rectangle;
  card: CatCardView;
  lockLabel: Phaser.GameObjects.Text;
}

interface ComputedGameLayout {
  boardRect: Phaser.Geom.Rectangle;
  cellSize: number;
  handY: number;
  handStartX: number;
}

type TargetedPlacementMode = 'convert' | 'push' | 'mine';

interface PendingTargetedPlacement {
  mode: TargetedPlacementMode;
  cellX: number;
  cellY: number;
  handIndex: number;
  cardID: number;
  targetBoardIndexes: number[];
}

const CELL_TARGET_FILL = 0xf8d8ac;
const CELL_PLACEMENT_FILL = 0xd9f1f6;
const CELL_HOVER_FILL = 0xf5fcfe;
const CELL_TARGET_BORDER = UI_THEME.accentBorderNumber;
const CELL_PLACEMENT_BORDER = 0x8fc5cf;
const CELL_SELECTION_TARGET_FILL = 0xa8c8d8;
const CELL_SELECTION_TARGET_BORDER = 0x5f8799;

const getBoardIndex = (cellX: number, cellY: number) => cellY * CAT_MATCH_BOARD_SIZE + cellX;

const getTargetingModeForCard = (cardID: number | null): TargetedPlacementMode | null => {
  if (cardID !== null && getAdjacentConvertMechanic(cardID)) {
    return 'convert';
  }

  if (cardID !== null && getAdjacentPushMechanic(cardID)) {
    return 'push';
  }

  if (cardID !== null && getHiddenMineMechanic(cardID)) {
    return 'mine';
  }

  return null;
};

const getAdjacentEnemyBoardIndexes = (
  board: Array<BoardCell | null>,
  cellX: number,
  cellY: number,
  playerID: string,
  cardID: number | null,
) => {
  const mechanic = cardID === null ? null : getAdjacentConvertMechanic(cardID);

  if (!mechanic) {
    return [];
  }

  const targetBoardIndexes: number[] = [];

  for (let deltaY = -mechanic.radius; deltaY <= mechanic.radius; deltaY += 1) {
    for (let deltaX = -mechanic.radius; deltaX <= mechanic.radius; deltaX += 1) {
      if (deltaX === 0 && deltaY === 0) {
        continue;
      }

      if (!mechanic.includeDiagonals && Math.abs(deltaX) + Math.abs(deltaY) !== 1) {
        continue;
      }

      const targetX = cellX + deltaX;
      const targetY = cellY + deltaY;

      if (
        targetX < 0 ||
        targetX >= CAT_MATCH_BOARD_SIZE ||
        targetY < 0 ||
        targetY >= CAT_MATCH_BOARD_SIZE
      ) {
        continue;
      }

      const targetBoardIndex = getBoardIndex(targetX, targetY);
      const targetCell = board[targetBoardIndex];

      if (targetCell && targetCell.playerID !== playerID && !isConvertImmuneCard(targetCell.cardID)) {
        targetBoardIndexes.push(targetBoardIndex);
      }
    }
  }

  return targetBoardIndexes;
};

const getAdjacentOccupiedOrthogonalBoardIndexes = (
  board: Array<BoardCell | null>,
  cellX: number,
  cellY: number,
  cardID: number | null,
) => {
  const mechanic = cardID === null ? null : getAdjacentPushMechanic(cardID);

  if (!mechanic) {
    return [];
  }

  const targetBoardIndexes: number[] = [];

  for (const [deltaX, deltaY] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const) {
    const targetX = cellX + deltaX;
    const targetY = cellY + deltaY;

    if (
      targetX < 0 ||
      targetX >= CAT_MATCH_BOARD_SIZE ||
      targetY < 0 ||
      targetY >= CAT_MATCH_BOARD_SIZE
    ) {
      continue;
    }

    const targetBoardIndex = getBoardIndex(targetX, targetY);

    if (board[targetBoardIndex] && !isPushImmuneCard(board[targetBoardIndex]!.cardID)) {
      targetBoardIndexes.push(targetBoardIndex);
    }
  }

  return targetBoardIndexes;
};

const getAdjacentEmptyBoardIndexes = (
  board: Array<BoardCell | null>,
  cellX: number,
  cellY: number,
  cardID: number | null,
) => {
  const mechanic = cardID === null ? null : getHiddenMineMechanic(cardID);

  if (!mechanic) {
    return [];
  }

  const targetBoardIndexes: number[] = [];

  for (let deltaY = -mechanic.radius; deltaY <= mechanic.radius; deltaY += 1) {
    for (let deltaX = -mechanic.radius; deltaX <= mechanic.radius; deltaX += 1) {
      if (deltaX === 0 && deltaY === 0) {
        continue;
      }

      if (!mechanic.includeDiagonals && Math.abs(deltaX) + Math.abs(deltaY) !== 1) {
        continue;
      }

      const targetX = cellX + deltaX;
      const targetY = cellY + deltaY;

      if (
        targetX < 0 ||
        targetX >= CAT_MATCH_BOARD_SIZE ||
        targetY < 0 ||
        targetY >= CAT_MATCH_BOARD_SIZE
      ) {
        continue;
      }

      const targetBoardIndex = getBoardIndex(targetX, targetY);

      if (!board[targetBoardIndex]) {
        targetBoardIndexes.push(targetBoardIndex);
      }
    }
  }

  return targetBoardIndexes;
};

const getTargetBoardIndexesForCard = (
  board: Array<BoardCell | null>,
  cellX: number,
  cellY: number,
  playerID: string,
  cardID: number | null,
) => {
  const mode = getTargetingModeForCard(cardID);

  if (mode === 'convert') {
    return getAdjacentEnemyBoardIndexes(board, cellX, cellY, playerID, cardID);
  }

  if (mode === 'push') {
    return getAdjacentOccupiedOrthogonalBoardIndexes(board, cellX, cellY, cardID);
  }

  if (mode === 'mine') {
    return getAdjacentEmptyBoardIndexes(board, cellX, cellY, cardID);
  }

  return [];
};

export class GamePhaseView {
  private scene!: Phaser.Scene;
  private deps!: GamePhaseViewDeps;
  private boardGraphics!: Phaser.GameObjects.Graphics;
  private gridCells: GridCellView[] = [];
  private handCards: CatCardView[] = [];
  private lastLayout: RoomLayout | null = null;
  private visible = false;
  private selectedHandIndex: number | null = null;
  private hoveredCellKey: string | null = null;
  private hoveredHandIndex: number | null = null;
  private pendingTargetedPlacement: PendingTargetedPlacement | null = null;

  create(deps: GamePhaseViewDeps): void {
    this.scene = deps.scene;
    this.deps = deps;
    this.boardGraphics = this.scene.add.graphics();

    for (let y = 0; y < CAT_MATCH_BOARD_SIZE; y += 1) {
      for (let x = 0; x < CAT_MATCH_BOARD_SIZE; x += 1) {
        const tile = this.scene.add.rectangle(0, 0, 10, 10, 0xfff7de, 1).setOrigin(0.5);
        tile.setStrokeStyle(2, UI_THEME.cardBorderLightNumber, 0.85);
        tile.setInteractive({ useHandCursor: true });
        tile.on('pointerdown', () => {
          this.handleCellPressed(x, y);
        });
        tile.on('pointerover', () => {
          this.hoveredCellKey = `${x}:${y}`;
          this.rerender();
        });
        tile.on('pointerout', () => {
          if (this.hoveredCellKey === `${x}:${y}`) {
            this.hoveredCellKey = null;
            this.rerender();
          }
        });
        const card = createCatCardView({
          scene: this.scene,
          id: y * CAT_MATCH_BOARD_SIZE + x,
          textureKey: getPlayerCatBaseTexture(this.scene, '0'),
          animationKey: getPlayerCatAnimationKey(this.scene, '0'),
          onPress: () => {
            this.handleCellPressed(x, y);
          },
          onHover: () => {
            this.hoveredCellKey = `${x}:${y}`;
            this.rerender();
          },
          onOut: () => {
            if (this.hoveredCellKey === `${x}:${y}`) {
              this.hoveredCellKey = null;
              this.rerender();
            }
          },
        });
        card.container.setVisible(false);
        const lockLabel = this.scene.add.text(0, 0, '', {
          fontFamily: 'Trebuchet MS',
          fontSize: '24px',
          fontStyle: '700',
          color: '#F06060',
          stroke: '#FFF7DE',
          strokeThickness: 4,
        });
        lockLabel.setOrigin(0.5);
        lockLabel.setVisible(false);
        lockLabel.setDepth(15);

        this.gridCells.push({ x, y, tile, card, lockLabel });
      }
    }

    for (let handIndex = 0; handIndex < CAT_MATCH_HAND_SIZE; handIndex += 1) {
      this.handCards.push(
        createCatCardView({
          scene: this.scene,
          id: handIndex,
          textureKey: getPlayerCatBaseTexture(this.scene, '0'),
          animationKey: getPlayerCatAnimationKey(this.scene, '0'),
          onPress: () => {
            this.handleHandPressed(handIndex);
          },
          onHover: () => {
            this.hoveredHandIndex = handIndex;
            this.rerender();
          },
          onOut: () => {
            if (this.hoveredHandIndex === handIndex) {
              this.hoveredHandIndex = null;
              this.rerender();
            }
          },
        }),
      );
    }

    this.hide();
  }

  show(snapshot: RoomSnapshot | null, state: RoomControllerState): void {
    this.visible = true;
    this.boardGraphics.setVisible(true);

    if (this.lastLayout) {
      this.render(this.lastLayout, snapshot, state);
    }
  }

  hide(): void {
    this.visible = false;
    this.boardGraphics?.setVisible(false);
    this.resetPlacementSelection();

    for (const cell of this.gridCells) {
      cell.tile.setVisible(false);
      cell.card.container.setVisible(false);
      cell.lockLabel.setVisible(false);
    }

    for (const card of this.handCards) {
      card.container.setVisible(false);
    }
  }

  layout(roomLayout: RoomLayout): void {
    this.lastLayout = roomLayout;

    if (this.visible) {
      const state = this.deps.controller.getState();
      this.render(roomLayout, state.snapshot, state);
    }
  }

  destroy(): void {
    this.boardGraphics.destroy();

    for (const cell of this.gridCells) {
      cell.tile.destroy();
      cell.card.container.destroy(true);
      cell.lockLabel.destroy();
    }

    for (const card of this.handCards) {
      card.container.destroy(true);
    }
  }

  private handleHandPressed(handIndex: number) {
    if (!this.visible) {
      return;
    }

    const state = this.deps.controller.getState();

    if (!this.canLocalPlayerMove(state)) {
      return;
    }

    const hand = state.gameState?.G?.localPlayer?.hand ?? [];
    const cardID = hand[handIndex] ?? null;

    if (cardID === null) {
      return;
    }

    if (this.selectedHandIndex === handIndex) {
      this.resetPlacementSelection();
    } else {
      this.selectedHandIndex = handIndex;
      this.pendingTargetedPlacement = null;
    }

    this.rerender();
  }

  private handleCellPressed(cellX: number, cellY: number) {
    if (!this.visible || this.selectedHandIndex === null) {
      return;
    }

    const state = this.deps.controller.getState();

    if (!this.canLocalPlayerMove(state)) {
      return;
    }

    const hand = state.gameState?.G?.localPlayer?.hand ?? [];
    const sessionPlayerID = state.session?.playerID ?? '0';
    const board = state.gameState?.G?.board ?? state.snapshot?.board ?? [];
    const cellEffects = previewCellEffectsForPlacement(state.gameState?.G?.cellEffects ?? state.snapshot?.cellEffects);
    const handIndex = this.selectedHandIndex;
    const cardID = hand[handIndex] ?? null;
    const boardIndex = getBoardIndex(cellX, cellY);
    const targetingMode = getTargetingModeForCard(cardID);

    if (cardID === null) {
      return;
    }

    if (targetingMode && this.pendingTargetedPlacement) {
      const pendingPlacementIndex = getBoardIndex(
        this.pendingTargetedPlacement.cellX,
        this.pendingTargetedPlacement.cellY,
      );

      if (boardIndex === pendingPlacementIndex) {
        return;
      }

      if (this.pendingTargetedPlacement.targetBoardIndexes.includes(boardIndex)) {
        const pendingPlacement = this.pendingTargetedPlacement;
        this.resetPlacementSelection();
        this.rerender();
        void this.deps.controller.placeCat(
          pendingPlacement.cellX,
          pendingPlacement.cellY,
          pendingPlacement.handIndex,
          cellX,
          cellY,
        );
        return;
      }

      this.resetPlacementSelection();
      this.deps.showTurnMessage('game.invalidTarget');
      this.rerender();
      return;
    }

    if (board[boardIndex]) {
      return;
    }

    if (getPlacementLockEffect(cellEffects[boardIndex])) {
      return;
    }

    if (targetingMode) {
      const targetBoardIndexes = getTargetBoardIndexesForCard(board, cellX, cellY, sessionPlayerID, cardID);

      if (targetBoardIndexes.length === 0) {
        this.deps.showTurnMessage('game.noAvailableTarget');
        return;
      }

      this.pendingTargetedPlacement = {
        mode: targetingMode,
        cellX,
        cellY,
        handIndex,
        cardID,
        targetBoardIndexes,
      };
      this.rerender();
      return;
    }

    this.resetPlacementSelection();
    this.rerender();
    void this.deps.controller.placeCat(cellX, cellY, handIndex);
  }

  private render(roomLayout: RoomLayout, snapshot: RoomSnapshot | null, state: RoomControllerState) {
    const board = state.gameState?.G?.board ?? snapshot?.board ?? [];
    const rawCellEffects = state.gameState?.G?.cellEffects ?? snapshot?.cellEffects ?? [];
    const hand = state.gameState?.G?.localPlayer?.hand ?? [];
    const sessionPlayerID = state.session?.playerID ?? '0';
    const gameLayout = this.getGameLayout(roomLayout);
    const canPlay = this.canLocalPlayerMove(state);
    const cellEffects = canPlay
      ? previewCellEffectsForPlacement(rawCellEffects)
      : normalizeCellEffects(rawCellEffects);

    if (!canPlay) {
      this.resetPlacementSelection();
    }

    if (this.selectedHandIndex !== null) {
      const selectedCardID = hand[this.selectedHandIndex] ?? null;

      if (selectedCardID === null) {
        this.resetPlacementSelection();
      } else if (
        this.pendingTargetedPlacement &&
        (this.pendingTargetedPlacement.handIndex !== this.selectedHandIndex ||
          this.pendingTargetedPlacement.cardID !== selectedCardID)
      ) {
        this.pendingTargetedPlacement = null;
      }
    }

    this.drawBoard(gameLayout, board, cellEffects, canPlay, hand, sessionPlayerID);
    this.drawHand(gameLayout, hand, sessionPlayerID, canPlay);
  }

  private drawBoard(
    gameLayout: ComputedGameLayout,
    board: Array<BoardCell | null>,
    cellEffects: Array<BoardCellEffect[]>,
    canPlay: boolean,
    hand: Array<number | null>,
    sessionPlayerID: string,
  ) {
    this.boardGraphics.clear();
    drawBoardSurface(this.boardGraphics, {
      rect: gameLayout.boardRect,
      radius: 0,
      fill: {
        topLeft: UI_THEME.backgroundNumber,
        topRight: UI_THEME.backgroundNumber,
        bottomLeft: UI_THEME.backgroundNumber,
        bottomRight: UI_THEME.backgroundNumber,
        alpha: 1,
      },
      stroke: {
        width: 2,
        color: UI_THEME.surfaceStrongNumber,
        alpha: 1,
      },
      shadow: {
        offsetX: 0,
        offsetY: 10,
        color: UI_THEME.textNumber,
        alpha: 0.16,
      },
    });

    const inset = 8;
    const selectedCardID = this.selectedHandIndex === null ? null : hand[this.selectedHandIndex] ?? null;
    const targetingMode = getTargetingModeForCard(selectedCardID);
    const pendingTargetBoardIndexes = new Set(this.pendingTargetedPlacement?.targetBoardIndexes ?? []);

    for (const cell of this.gridCells) {
      const centerX = gameLayout.boardRect.x + gameLayout.cellSize * (cell.x + 0.5);
      const centerY = gameLayout.boardRect.y + gameLayout.cellSize * (cell.y + 0.5);
      const boardIndex = getBoardIndex(cell.x, cell.y);
      const boardCell = board[boardIndex];
      const placementLock = getPlacementLockEffect(cellEffects[boardIndex]);
      const armedMine = getArmedMineEffect(cellEffects[boardIndex]);
      const mined = Boolean(armedMine);
      const blocked = !boardCell && Boolean(placementLock);
      const hovered = this.hoveredCellKey === `${cell.x}:${cell.y}`;
      const pendingPlacement =
        this.pendingTargetedPlacement?.cellX === cell.x && this.pendingTargetedPlacement?.cellY === cell.y;
      const pendingPlacedCardID = pendingPlacement ? this.pendingTargetedPlacement?.cardID ?? null : null;
      const targetedCell = pendingTargetBoardIndexes.has(boardIndex);
      const canPlaceHere = canPlay && this.selectedHandIndex !== null && !boardCell && !blocked;
      const targetedPlacementOptions =
        canPlay && targetingMode && !boardCell && !blocked
          ? getTargetBoardIndexesForCard(board, cell.x, cell.y, sessionPlayerID, selectedCardID)
          : [];
      const placementCandidate =
        canPlaceHere &&
        !this.pendingTargetedPlacement &&
        (!targetingMode || targetedPlacementOptions.length > 0);
      const selectable = targetingMode
        ? Boolean(placementCandidate || pendingPlacement || targetedCell)
        : canPlaceHere;
      const statusHighlighted = blocked || mined;
      const selectionTargetHighlighted = targetedCell;
      const hoverHighlightedCell = !boardCell && hovered && selectable;
      const fillColor = hoverHighlightedCell
        ? CELL_HOVER_FILL
        : !boardCell && selectionTargetHighlighted
          ? CELL_SELECTION_TARGET_FILL
        : !boardCell && statusHighlighted
          ? CELL_TARGET_FILL
          : placementCandidate
            ? CELL_PLACEMENT_FILL
            : UI_THEME.backgroundNumber;

      cell.tile.setVisible(this.visible);
      cell.tile.setPosition(centerX, centerY);
      cell.tile.setSize(gameLayout.cellSize - inset, gameLayout.cellSize - inset);
      cell.tile.setFillStyle(fillColor, 1);
      if (boardCell || pendingPlacedCardID !== null) {
        cell.tile.setStrokeStyle();
      } else {
        cell.tile.setStrokeStyle(
          statusHighlighted || selectionTargetHighlighted || placementCandidate || (hovered && selectable) ? 3 : 2,
          statusHighlighted
            ? CELL_TARGET_BORDER
            : selectionTargetHighlighted
              ? CELL_SELECTION_TARGET_BORDER
              : placementCandidate
                ? CELL_PLACEMENT_BORDER
                : UI_THEME.surfaceStrongNumber,
          1,
        );
      }

      if (boardCell || pendingPlacedCardID !== null) {
        const renderedPlayerID = boardCell?.playerID ?? sessionPlayerID;
        const renderedCardID = boardCell?.cardID ?? pendingPlacedCardID;

        if (renderedCardID === null) {
          cell.card.container.setVisible(false);
          continue;
        }

        const textureKey = getPlayerCatBaseTexture(this.scene, renderedPlayerID);
        const animationKey = getCardAnimationKey(this.scene, renderedPlayerID, renderedCardID);
        const tooltipContent = getCardTooltipContent(renderedCardID);
        if (cell.card.sprite.texture.key !== textureKey) {
          cell.card.sprite.setTexture(textureKey);
        }
        if (cell.card.sprite.anims.currentAnim?.key !== animationKey) {
          cell.card.sprite.play(animationKey);
        }
        renderCatCard(cell.card, {
          x: centerX,
          y: centerY,
          visible: this.visible,
          interactive: true,
          cardSize: gameLayout.cellSize - 14,
          spriteScale: Math.min((gameLayout.cellSize - 36) / 64, 1),
          hovered,
          selected: false,
          disabled: false,
          faceTint: targetedCell ? CELL_SELECTION_TARGET_FILL : undefined,
          tooltipTitle: tooltipContent.title,
          tooltipText: tooltipContent.text,
        });
      } else {
        cell.card.container.setVisible(false);
      }

      const showMineCounter = Boolean(armedMine);
      const showCellCounter = showMineCounter || blocked;
      cell.lockLabel.setVisible(this.visible && showCellCounter);
      if (showCellCounter) {
        cell.lockLabel.setText(String(armedMine?.remainingTurns ?? placementLock?.remainingTurns ?? ''));
        if (showMineCounter && boardCell) {
          cell.lockLabel.setPosition(centerX + gameLayout.cellSize * 0.22, centerY - gameLayout.cellSize * 0.22);
          cell.lockLabel.setFontSize('22px');
          cell.lockLabel.setColor('#FF8A3D');
        } else if (showMineCounter) {
          cell.lockLabel.setPosition(centerX, centerY);
          cell.lockLabel.setFontSize('26px');
          cell.lockLabel.setColor('#FF8A3D');
        } else {
          cell.lockLabel.setPosition(centerX, centerY);
          cell.lockLabel.setFontSize('24px');
          cell.lockLabel.setColor('#F06060');
        }
      }
    }
  }

  private drawHand(
    gameLayout: ComputedGameLayout,
    hand: Array<number | null>,
    playerID: string,
    canPlay: boolean,
  ) {
    const textureKey = getPlayerCatBaseTexture(this.scene, playerID);
    const gap = 18;
    const cardSize = 98;

    for (let handIndex = 0; handIndex < this.handCards.length; handIndex += 1) {
      const card = this.handCards[handIndex];
      const cardID = hand[handIndex] ?? null;
      const x = gameLayout.handStartX + handIndex * (cardSize + gap);
      const animationKey = getCardAnimationKey(this.scene, playerID, cardID);

      if (card.sprite.texture.key !== textureKey) {
        card.sprite.setTexture(textureKey);
      }
      if (card.sprite.anims.currentAnim?.key !== animationKey) {
        card.sprite.play(animationKey);
      }

      const tooltipContent = cardID === null ? null : getCardTooltipContent(cardID);

      renderCatCard(card, {
        x,
        y: gameLayout.handY,
        visible: this.visible,
        selected: this.selectedHandIndex === handIndex,
        hovered: this.hoveredHandIndex === handIndex && cardID !== null,
        disabled: !canPlay || cardID === null,
        interactive: cardID !== null,
        tooltipTitle: tooltipContent?.title,
        tooltipText: tooltipContent?.text,
      });
    }
  }

  private resetPlacementSelection() {
    this.selectedHandIndex = null;
    this.pendingTargetedPlacement = null;
  }

  private canLocalPlayerMove(state: RoomControllerState) {
    return Boolean(
      state.session &&
        state.snapshot?.phase === 'game' &&
        state.gameState?.isConnected &&
        state.gameState?.ctx?.currentPlayer === state.session.playerID &&
        !state.gameState?.G?.matchResult,
    );
  }

  private getGameLayout(roomLayout: RoomLayout): ComputedGameLayout {
    const handHeight = 150;
    const boardSize = Math.max(300, Math.min(roomLayout.board.width, roomLayout.board.height - handHeight));
    const boardRect = new Phaser.Geom.Rectangle(
      roomLayout.centerX - boardSize / 2,
      roomLayout.board.y + 6,
      boardSize,
      boardSize,
    );
    const totalHandWidth = CAT_MATCH_HAND_SIZE * 98 + (CAT_MATCH_HAND_SIZE - 1) * 18;

    return {
      boardRect,
      cellSize: boardSize / CAT_MATCH_BOARD_SIZE,
      handY: boardRect.bottom + 82,
      handStartX: roomLayout.centerX - totalHandWidth / 2 + 49,
    };
  }

  private rerender() {
    if (!this.visible || !this.lastLayout) {
      return;
    }

    const state = this.deps.controller.getState();
    this.render(this.lastLayout, state.snapshot, state);
  }
}
