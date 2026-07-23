import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  HITBOX,
  PARALLAX,
  PHYSICS,
  SCORING,
} from '../config';
import { audioManager } from '../audio';

type PigeonState = 'patrol' | 'targeting' | 'swoop' | 'recover';
type PigeonVariant = 'standard' | 'divebomber' | 'flock';

interface PigeonObj {
  sprite: Phaser.GameObjects.Image;
  state: PigeonState;
  variant: PigeonVariant;
  timer: number;
  targetX: number;
  startY: number;
  frameIdx: number;
  telegraph?: Phaser.GameObjects.Container;
  flockOffset?: number;
}

const PIGEON_FRAMES = [
  { x: 0.05, y: 0.05, w: 0.28, h: 0.42 },
  { x: 0.37, y: 0.05, w: 0.28, h: 0.42 },
  { x: 0.69, y: 0.05, w: 0.28, h: 0.42 },
  { x: 0.05, y: 0.52, w: 0.28, h: 0.42 },
  { x: 0.69, y: 0.52, w: 0.28, h: 0.42 },
];

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private cargo!: Phaser.GameObjects.Image;
  private pedalFrame = 0;
  private pedalTimer = 0;
  private isJumping = false;
  private isDucking = false;
  private jumpVy = 0;
  private playerY = PHYSICS.groundY;
  private speedMult = 1;
  private distance = 0;
  private scrollSpeed = PHYSICS.baseScrollSpeed;
  private pastries = PHYSICS.startingPastries;
  private score = 0;
  private level = 1;
  private invincibleUntil = 0;
  private gameOver = false;
  private levelComplete = false;
  private pigeonPool: PigeonObj[] = [];
  private spawnTimer = 0;
  private parallaxLayers: Phaser.GameObjects.TileSprite[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private pointerDownRight = false;
  private pointerDownLeft = false;
  private scoreText!: Phaser.GameObjects.Text;
  private pastryText!: Phaser.GameObjects.Text;
  private onGameEvent?: (event: string, data?: Record<string, unknown>) => void;

  constructor() {
    super('Game');
  }

  init(data: { onGameEvent?: (event: string, data?: Record<string, unknown>) => void }) {
    this.onGameEvent = data.onGameEvent;
  }

  create() {
    this.resetState();
    this.createParallax();
    this.createPlayer();
    this.createPigeonPool();
    this.setupInput();
    this.scoreText = this.add.text(GAME_WIDTH - 8, 8, '0', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(200);

    this.pastryText = this.add.text(8, 8, `🥯 ${this.pastries}`, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(200);

    this.events.on('pause', () => this.onGameEvent?.('pause'));
    this.events.on('resume', () => this.onGameEvent?.('resume'));
    this.onGameEvent?.('level_start', { level_id: this.level });
  }

  private resetState() {
    this.pedalFrame = 0;
    this.isJumping = false;
    this.isDucking = false;
    this.jumpVy = 0;
    this.playerY = PHYSICS.groundY;
    this.speedMult = 1;
    this.distance = 0;
    this.scrollSpeed = PHYSICS.baseScrollSpeed;
    this.pastries = PHYSICS.startingPastries;
    this.score = 0;
    this.level = 1;
    this.invincibleUntil = 0;
    this.gameOver = false;
    this.levelComplete = false;
    this.spawnTimer = 2;
  }

  private createParallax() {
    PARALLAX.forEach((layer, i) => {
      const ts = this.add.tileSprite(0, layer.y, GAME_WIDTH * 2, GAME_HEIGHT - layer.y, 'bg_parallax')
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(i)
        .setAlpha(i === 0 ? 0.3 : 0.5 + i * 0.07)
        .setCrop(0, layer.y, GAME_WIDTH * 2, GAME_HEIGHT - layer.y);
      this.parallaxLayers.push(ts);
    });
  }

  private createPlayer() {
    this.player = this.add.image(PHYSICS.playerX, this.playerY, 'cyclist_sheet')
      .setDepth(50)
      .setScale(0.35)
      .setOrigin(0.5, 1);
    this.setCyclistFrame(0);

    this.cargo = this.add.image(PHYSICS.playerX - 8, this.playerY - 42, 'pastry_stack')
      .setDepth(51)
      .setScale(0.12)
      .setOrigin(0.5, 1);
    this.updateCargoVisual();
  }

  private setCyclistFrame(idx: number) {
    const frames = [
      { x: 0.02, y: 0.02, w: 0.31, h: 0.46 },
      { x: 0.35, y: 0.02, w: 0.31, h: 0.46 },
      { x: 0.68, y: 0.02, w: 0.31, h: 0.46 },
      { x: 0.02, y: 0.52, w: 0.31, h: 0.46 },
      { x: 0.35, y: 0.52, w: 0.31, h: 0.46 },
      { x: 0.68, y: 0.52, w: 0.31, h: 0.46 },
    ];
    const f = frames[idx % frames.length];
    this.player.setCrop(
      f.x * this.player.width,
      f.y * this.player.height,
      f.w * this.player.width,
      f.h * this.player.height
    );
  }

  private createPigeonPool() {
    for (let i = 0; i < 10; i++) {
      const sprite = this.add.image(-100, -100, 'pigeon_sheet')
        .setDepth(60)
        .setScale(0.18)
        .setVisible(false);
      this.pigeonPool.push({
        sprite,
        state: 'patrol',
        variant: 'standard',
        timer: 0,
        targetX: 0,
        startY: 0,
        frameIdx: 0,
      });
    }
  }

  private setupInput() {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > GAME_WIDTH / 2) this.pointerDownRight = true;
      else this.pointerDownLeft = true;
    });
    this.input.on('pointerup', () => {
      this.pointerDownRight = false;
      this.pointerDownLeft = false;
    });
  }

  update(_time: number, deltaMs: number) {
    if (this.gameOver || this.levelComplete) return;

    const dt = deltaMs / 1000;
    this.distance += this.scrollSpeed * this.speedMult * dt;
    this.scrollSpeed = Math.min(800, PHYSICS.baseScrollSpeed + this.distance * 0.05);
    this.level = Math.floor(this.distance / 3000) + 1;

    if (this.distance > 15000) {
      this.triggerLevelComplete();
      return;
    }

    this.handleInput();
    this.updatePlayer(dt);
    this.updateParallax(dt);
    this.updatePigeons(dt);
    this.updateSpawner(dt);
    this.updatePedalAnimation(dt);

    this.scoreText.setText(String(this.score));
    this.pastryText.setText(`🥯 ${this.pastries}`);
  }

  private handleInput() {
    const jump = this.spaceKey?.isDown || this.cursors?.up?.isDown || this.pointerDownRight;
    const duck = this.cursors?.down?.isDown;
    const speedUp = this.cursors?.right?.isDown;
    const brake = this.cursors?.left?.isDown || this.pointerDownLeft;

    this.speedMult = speedUp ? PHYSICS.speedUpMultiplier : brake ? PHYSICS.brakeMultiplier : 1;

    if (duck && !this.isJumping) {
      this.isDucking = true;
      this.player.setScale(0.35, 0.28);
    } else {
      this.isDucking = false;
      this.player.setScale(0.35);
    }

    if (jump && !this.isJumping && !this.isDucking) {
      this.isJumping = true;
      this.jumpVy = PHYSICS.jumpVelocity;
      this.setCyclistFrame(5);
    }
  }

  private updatePlayer(dt: number) {
    if (this.isJumping) {
      this.jumpVy = Math.min(PHYSICS.terminalVelocity, this.jumpVy + PHYSICS.gravity * dt);
      this.playerY += this.jumpVy * dt;
      const brakeDamp = this.speedMult < 1 ? 0.6 : 1;
      this.player.x += (this.jumpVy < 0 ? 20 : 10) * dt * brakeDamp;

      if (this.playerY >= PHYSICS.groundY) {
        this.playerY = PHYSICS.groundY;
        this.isJumping = false;
        this.jumpVy = 0;
      }
    }

    this.player.y = this.playerY;
    this.cargo.setPosition(this.player.x - 8, this.playerY - (this.isDucking ? 28 : 42));
    this.cargo.setScale(0.12 * (this.pastries / PHYSICS.startingPastries + 0.3));

    if (Date.now() < this.invincibleUntil) {
      this.player.setTintFill(0xffffff);
      this.player.setAlpha(Math.sin(Date.now() / 80) > 0 ? 0.4 : 1);
    } else {
      this.player.clearTint();
      this.player.setAlpha(1);
    }
  }

  private updatePedalAnimation(dt: number) {
    if (this.isJumping) return;
    this.pedalTimer += dt;
    const interval = 0.15 / this.speedMult;
    if (this.pedalTimer >= interval) {
      this.pedalTimer = 0;
      this.pedalFrame = (this.pedalFrame + 1) % 4;
      this.setCyclistFrame(this.pedalFrame);
    }
  }

  private updateParallax(dt: number) {
    PARALLAX.forEach((layer, i) => {
      const ts = this.parallaxLayers[i];
      if (ts) ts.tilePositionX += this.scrollSpeed * layer.speed * this.speedMult * dt;
    });
  }

  private updateSpawner(dt: number) {
    this.spawnTimer -= dt;
    const rate = Math.max(0.5, 3.0 - this.distance * 0.001);
    if (this.spawnTimer <= 0) {
      this.spawnPigeon();
      this.spawnTimer = rate;
    }
  }

  private getFreePigeon(): PigeonObj | null {
    return this.pigeonPool.find((p) => !p.sprite.visible) ?? null;
  }

  private spawnPigeon() {
    let variant: PigeonVariant = 'standard';
    if (this.level >= 5 && Math.random() < 0.2) variant = 'flock';
    else if (this.level >= 3 && Math.random() < 0.3) variant = 'divebomber';

    const count = variant === 'flock' ? 3 : 1;
    for (let i = 0; i < count; i++) {
      this.activatePigeon(variant, i, count);
    }
  }

  private activatePigeon(variant: PigeonVariant, index: number, flockSize: number) {
    const pigeon = this.getFreePigeon();
    if (!pigeon) return;

    pigeon.variant = variant;
    pigeon.state = 'targeting';
    pigeon.timer = 0;
    pigeon.startY = -20 - index * 8;
    pigeon.targetX = this.player.x + (variant === 'divebomber' ? 30 : 0);
    pigeon.frameIdx = 0;
    pigeon.flockOffset =
      variant === 'flock'
        ? Math.sin((index / flockSize) * Math.PI * 2) * 35
        : 0;

    pigeon.sprite.setVisible(true);
    pigeon.sprite.setPosition(GAME_WIDTH + 20 + index * 15, pigeon.startY);
    pigeon.sprite.setScale(0.18);

    pigeon.telegraph = this.createTelegraph(pigeon.sprite.x, pigeon.startY + 10);
  }

  private createTelegraph(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(100).setScrollFactor(0);
    const arrow = this.add.triangle(0, 0, 0, -8, -6, 4, 6, 4, 0x00ff00).setStrokeStyle(2, 0xffffff);
    c.add(arrow);
    this.tweens.add({
      targets: c,
      alpha: { from: 1, to: 0.2 },
      duration: 200,
      yoyo: true,
      repeat: 3,
    });
    return c;
  }

  private setPigeonFrame(pigeon: PigeonObj, idx: number) {
    const f = PIGEON_FRAMES[idx % PIGEON_FRAMES.length];
    pigeon.sprite.setCrop(
      f.x * pigeon.sprite.width,
      f.y * pigeon.sprite.height,
      f.w * pigeon.sprite.width,
      f.h * pigeon.sprite.height
    );
  }

  private updatePigeons(dt: number) {
    for (const pigeon of this.pigeonPool) {
      if (!pigeon.sprite.visible) continue;
      pigeon.timer += dt;
      pigeon.frameIdx = Math.floor(pigeon.timer * 8) % 5;
      this.setPigeonFrame(pigeon, pigeon.frameIdx);

      switch (pigeon.state) {
        case 'targeting':
          pigeon.sprite.x = GAME_WIDTH - 30;
          pigeon.sprite.y = 15 + Math.sin(pigeon.timer * 4) * 3;
          if (pigeon.timer >= PHYSICS.telegraphDuration / 1000) {
            pigeon.state = 'swoop';
            pigeon.timer = 0;
            pigeon.telegraph?.destroy();
            pigeon.telegraph = undefined;
          }
          break;

        case 'swoop': {
          const progress = Math.min(1, pigeon.timer / 0.8);
          const targetX = pigeon.targetX + (pigeon.flockOffset ?? 0);
          const curve = progress * progress;
          pigeon.sprite.x = Phaser.Math.Linear(GAME_WIDTH - 30, targetX, progress);
          const swoopDepth = pigeon.variant === 'divebomber' ? 1.3 : 1;
          pigeon.sprite.y = Phaser.Math.Linear(pigeon.startY, this.playerY - 20, curve * swoopDepth);

          if (progress >= 1) {
            if (this.checkCollision(pigeon)) {
              this.takeDamage(pigeon);
            } else {
              this.awardDodge(pigeon);
              audioManager.playSwoop();
            }
            pigeon.state = 'recover';
            pigeon.timer = 0;
          }
          break;
        }

        case 'recover':
          pigeon.sprite.y -= 120 * dt;
          pigeon.sprite.x -= 40 * dt;
          if (pigeon.sprite.y < -40) {
            pigeon.sprite.setVisible(false);
            pigeon.telegraph?.destroy();
            pigeon.state = 'patrol';
          }
          break;
      }
    }
  }

  private getPlayerHitbox(): Phaser.Geom.Rectangle {
    const h = this.isDucking
      ? HITBOX.playerCore.h * (1 - PHYSICS.duckHitboxReduction)
      : HITBOX.playerCore.h;
    return new Phaser.Geom.Rectangle(
      this.player.x - HITBOX.playerCore.w / 2,
      this.playerY - h,
      HITBOX.playerCore.w,
      h
    );
  }

  private getPigeonHitbox(pigeon: PigeonObj): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      pigeon.sprite.x - HITBOX.pigeonBeak.w / 2,
      pigeon.sprite.y - HITBOX.pigeonBeak.h / 2,
      HITBOX.pigeonBeak.w,
      HITBOX.pigeonBeak.h
    );
  }

  private checkCollision(pigeon: PigeonObj): boolean {
    if (Date.now() < this.invincibleUntil) return false;
    return Phaser.Geom.Rectangle.Overlaps(this.getPlayerHitbox(), this.getPigeonHitbox(pigeon));
  }

  private takeDamage(pigeon: PigeonObj) {
    audioManager.playDamage();
    this.pastries = Math.max(0, this.pastries - 1);
    this.updateCargoVisual();
    this.invincibleUntil = Date.now() + PHYSICS.iFrameDuration;
    this.onGameEvent?.('player_damage_taken', {
      x: this.player.x,
      y: this.playerY,
      enemy_type: pigeon.variant,
    });

    const lost = this.add.image(this.player.x, this.playerY - 50, 'pastry_single')
      .setScale(0.15).setDepth(80);
    this.tweens.add({
      targets: lost,
      y: this.playerY + 20,
      alpha: 0,
      duration: 600,
      onComplete: () => lost.destroy(),
    });

    this.cameras.main.shake(150, 0.01);

    if (this.pastries <= 0) {
      this.triggerGameOver();
    }
  }

  private awardDodge(pigeon: PigeonObj) {
    const nearMiss = Math.abs(pigeon.sprite.x - this.player.x) < 20;
    const points = nearMiss ? SCORING.perfectDodge : SCORING.dodge;
    this.score += points;
    audioManager.playScore();
    if (nearMiss) audioManager.playBell();
    this.showFloatingScore(pigeon.sprite.x, pigeon.sprite.y, points, nearMiss);
  }

  private showFloatingScore(x: number, y: number, points: number, perfect: boolean) {
    if (points === SCORING.dodge) {
      const img = this.add.image(x, y, 'score_100').setScale(0.2).setDepth(90);
      this.tweens.add({ targets: img, y: y - 30, alpha: 0, duration: 500, onComplete: () => img.destroy() });
    } else {
      const txt = this.add.text(x, y, perfect ? 'RAD!\n+250' : `+${points}`, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '6px',
        color: '#00ff00',
        stroke: '#000',
        strokeThickness: 1,
        align: 'center',
      }).setOrigin(0.5).setDepth(90);
      this.tweens.add({ targets: txt, y: y - 30, alpha: 0, duration: 500, onComplete: () => txt.destroy() });
    }
  }

  private updateCargoVisual() {
    const wobble = (PHYSICS.startingPastries - this.pastries) * 2;
    this.tweens.add({
      targets: this.cargo,
      angle: { from: -wobble, to: wobble },
      duration: 100,
      yoyo: true,
      repeat: 2,
    });
  }

  private triggerGameOver() {
    this.gameOver = true;
    const bonus = this.score;
    this.onGameEvent?.('game_over', {
      score: bonus,
      pastries: this.pastries,
      cause: 'no_pastries',
      level: this.level,
    });
    this.scene.pause();
  }

  private triggerLevelComplete() {
    this.levelComplete = true;
    const cargoBonus = this.pastries * SCORING.pastryBonus;
    this.score += SCORING.levelComplete + cargoBonus;
    this.onGameEvent?.('level_complete', {
      score: this.score,
      pastries: this.pastries,
      level: this.level,
    });

    const overlay = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'level_complete')
      .setDepth(300).setScrollFactor(0).setScale(0.45).setAlpha(0);
    this.tweens.add({ targets: overlay, alpha: 1, duration: 500 });
    this.scene.pause();
  }

  getScore() { return this.score; }
  getPastries() { return this.pastries; }
  getLevel() { return this.level; }
  isGameOver() { return this.gameOver; }
  isLevelComplete() { return this.levelComplete; }

  restart() {
    this.children.removeAll(true);
    this.pigeonPool = [];
    this.parallaxLayers = [];
    this.resetState();
    this.scene.restart();
  }
}
