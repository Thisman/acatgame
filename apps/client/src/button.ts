import Phaser from 'phaser';

export class TextButton extends Phaser.GameObjects.Container {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    onClick: () => void,
  ) {
    super(scene, x, y);

    this.background = scene.add.rectangle(0, 0, width, height, 0xcbded9, 1);
    this.background.setStrokeStyle(2, 0x91ada6, 0.95);
    this.background.setInteractive({ useHandCursor: true });
    this.background.on('pointerup', onClick);
    this.background.on('pointerover', () => this.background.setFillStyle(0xd8e8e3, 1));
    this.background.on('pointerout', () => this.background.setFillStyle(0xcbded9, 1));

    this.label = scene.add.text(0, 0, text, {
      color: '#4d625c',
      fontFamily: 'Trebuchet MS',
      fontSize: '26px',
      fontStyle: 'bold',
    });
    this.label.setOrigin(0.5);

    this.add([this.background, this.label]);
    scene.add.existing(this);
  }

  setButtonPosition(x: number, y: number) {
    this.setPosition(x, y);
  }
}
