import Phaser from 'phaser';

export class SpinnerLoader extends Phaser.GameObjects.Container {
  private readonly arc: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, color: number = 0x91ada6) {
    super(scene, 0, 0);

    this.arc = scene.add.graphics();
    this.arc.lineStyle(6, color, 1);
    this.arc.beginPath();
    this.arc.arc(0, 0, 22, Phaser.Math.DegToRad(35), Phaser.Math.DegToRad(300), false);
    this.arc.strokePath();
    this.add(this.arc);

    scene.add.existing(this);
    scene.tweens.add({
      targets: this,
      angle: 360,
      duration: 1200,
      repeat: -1,
      ease: 'Linear',
    });
  }
}

