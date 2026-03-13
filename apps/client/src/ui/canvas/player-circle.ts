import Phaser from 'phaser';

export interface PlayerCircleOptions {
  x: number;
  y: number;
  radius: number;
  fillColor: number;
  fillAlpha?: number;
  strokeColor: number;
  strokeWidth?: number;
  strokeAlpha?: number;
}

export function drawPlayerCircle(graphics: Phaser.GameObjects.Graphics, options: PlayerCircleOptions) {
  graphics.fillStyle(options.fillColor, options.fillAlpha ?? 1);
  graphics.fillCircle(options.x, options.y, options.radius);
  graphics.lineStyle(options.strokeWidth ?? 2, options.strokeColor, options.strokeAlpha ?? 1);
  graphics.strokeCircle(options.x, options.y, options.radius);
}
