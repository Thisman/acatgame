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
  shadow?: {
    offsetX?: number;
    offsetY?: number;
    color: number;
    alpha?: number;
  };
}

export function drawBoardSurface(graphics: Phaser.GameObjects.Graphics, options: BoardSurfaceOptions) {
  const { rect, radius, fill, stroke, shadow } = options;

  if (shadow) {
    graphics.fillStyle(shadow.color, shadow.alpha ?? 1);

    if (radius > 0) {
      graphics.fillRoundedRect(
        rect.x + (shadow.offsetX ?? 0),
        rect.y + (shadow.offsetY ?? 0),
        rect.width,
        rect.height,
        radius,
      );
    } else {
      graphics.fillRect(
        rect.x + (shadow.offsetX ?? 0),
        rect.y + (shadow.offsetY ?? 0),
        rect.width,
        rect.height,
      );
    }
  }

  graphics.fillGradientStyle(
    fill.topLeft,
    fill.topRight,
    fill.bottomLeft,
    fill.bottomRight,
    fill.alpha ?? 1,
  );
  if (radius > 0) {
    graphics.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, radius);
  } else {
    graphics.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  graphics.lineStyle(stroke.width, stroke.color, stroke.alpha ?? 1);

  if (radius > 0) {
    graphics.strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, radius);
  } else {
    graphics.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }
}
