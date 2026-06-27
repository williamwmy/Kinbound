// Myke animasjoner (spec kap. 4). Lette, prosedyrale animasjoner som ikke
// krever sprite-ark: en rolig "pust"/idle-bob og retningsvendt sprite.
import Phaser from 'phaser';

type Bobbable = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite;

/** Gir en sprite en myk, repeterende skala-puls (idle/pust). */
export function addIdleBob(scene: Phaser.Scene, sprite: Bobbable, amount = 0.06, duration = 700): void {
  const baseY = sprite.scaleY;
  const baseX = sprite.scaleX;
  scene.tweens.add({
    targets: sprite,
    scaleY: baseY * (1 + amount),
    scaleX: baseX * (1 - amount * 0.5),
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.InOut',
  });
}

/** Vender spriten etter bevegelsesretning (venstre/høyre). */
export function faceByVelocity(sprite: Phaser.Physics.Arcade.Sprite): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body | null;
  if (!body) return;
  if (body.velocity.x < -4) sprite.setFlipX(true);
  else if (body.velocity.x > 4) sprite.setFlipX(false);
}
