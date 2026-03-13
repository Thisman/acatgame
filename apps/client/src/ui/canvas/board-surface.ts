import Phaser from 'phaser';

export interface BoardSurfaceFill {
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
  alpha?: number;
}

export interface BoardSurfaceStroke {
  width: number;
  color: number;
  alpha?: number;
}

export interface BoardSurfaceOptions {
  rect: Phaser.Geom.Rectangle;
  radius: number;
  fill: BoardSurfaceFill;
  stroke: BoardSurfaceStroke;
}

export function drawBoardSurface(graphics: Phaser.GameObjects.Graphics, options: BoardSurfaceOptions) {
  const { rect, radius, fill, stroke } = options;

  graphics.fillGradientStyle(
    fill.topLeft,
    fill.topRight,
    fill.bottomLeft,
    fill.bottomRight,
    fill.alpha ?? 1,
  );
  graphics.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, radius);
  graphics.lineStyle(stroke.width, stroke.color, stroke.alpha ?? 1);
  graphics.strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, radius);
}
