import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  HITBOX,
  PARALLAX,
  PHYSICS,
  SCORING,
  SKY_COLOR,
  SPAWN,
} from '../config';
import { audioManager } from '../audio';

type PigeonState = 'targeting' | 'swoop' | 'recover';
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

const PLAYER_PEDAL_FRAMES = [
  'spr_player_pedal_0',
  'spr_player_pedal_1',
  'spr_player_pedal_2',
  'spr_player_pedal_3',
] as const;

const PIGEON_FRAMES = [
  'spr_pigeon_0',
  'spr_pigeon_1',
  'spr_pigeon_2',
  'spr_pigeon_3',
  'spr_pigeon_4',
] as const;

const SMOKE_FRAMES = [
  'spr_smoke_0',
  'spr_smoke_1',
  'spr_smoke_2',
] as const;

const FLOCK_OFFSET = 14;
const SWOOP_COLLISION_START = 0.85;
const TELEGRAPH_LANDING_OFFSET = 24;

/** Scale sprites to consistent on-screen sizes (source PNGs vary widely). */
const SCALE = {
  player: 0.34,
  playerDuck: 0.34,
  cargo: 0.1,
  pigeon: 0.24,
  arrow: 0.13,
  smoke: 0.18,
  scorePopup: 0.06,
  pastryDrop: 0.05,
  levelBanner: 1,
};

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
  private activePointersLeft = new Set<number>();
  private activePointersRight = new Set<number>();
  private pointerStartY = new Map<number, number>();
  private swipeDuckPointers = new Set<number>();
  private pointerDownAt = new Map<number, number>();
  private readonly holdSpeedUpMs = 500;
  private readonly swipeDuckThreshold = 28;
  private dustTimer = 0;
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
    this.createBackground();
    this.createPlayer();
    this.createPigeonPool();
    this.setupInput();

    this.scoreText = this.add
      .text(GAME_WIDTH - 8, 8, '0', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '8px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(200);

    this.pastryText = this.add
      .text(8, 8, `🥯 ${this.pastries}`, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '8px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(200);

    this.events.on('pause', () => {
      audioManager.stopBGM();
      this.onGameEvent?.('pause');
    });
    this.events.on('resume', () => {
      audioManager.startBGM();
      this.onGameEvent?.('resume');
    });
    audioManager.startBGM();
    this.onGameEvent?.('level_start', { level_id: this.level });
  }

  private resetState() {
    this.pedalFrame = 0;
    this.pedalTimer = 0;
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
    this.spawnTimer = SPAWN.initialDelay;
    this.dustTimer = 0;
    this.pigeonPool = [];
    this.parallaxLayers = [];
    this.activePointersLeft.clear();
    this.activePointersRight.clear();
    this.pointerStartY.clear();
    this.swipeDuckPointers.clear();
    this.pointerDownAt.clear();
  }

  private createBackground() {
    // Solid sky — no image
    this.add
      .rectangle(GAME_WIDTH / 2, 30, GAME_WIDTH, 60, SKY_COLOR)
      .setScrollFactor(0)
      .setDepth(-10);

    // Ground fill below path
    this.add
      .rectangle(GAME_WIDTH / 2, 165, GAME_WIDTH, 30, 0x4a4038)
      .setScrollFactor(0)
      .setDepth(5);

    this.createGroundDetail();

    PARALLAX.forEach((layer, i) => {
      const ts = this.add
        .tileSprite(0, layer.y, GAME_WIDTH * 2, layer.height, layer.key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(i);

      if ('tileScale' in layer && layer.tileScale !== 1) {
        ts.setTileScale(layer.tileScale);
      }

      this.parallaxLayers.push(ts);
    });
  }

  /** Subtle paving/brick lines along the ride surface. */
  private createGroundDetail() {
    const g = this.add.graphics().setDepth(6).setScrollFactor(0);
    const y = PHYSICS.groundY - 1;
    g.lineStyle(1, 0x8b7355, 0.55);
    g.lineBetween(0, y, GAME_WIDTH, y);

    g.fillStyle(0x6b5a48, 0.35);
    for (let x = 0; x < GAME_WIDTH; x += 12) {
      const h = x % 24 === 0 ? 3 : 2;
      g.fillRect(x, y + 2, 10, h);
    }
  }

  private createPlayer() {
    this.player = this.add
      .image(PHYSICS.playerX, this.playerY, PLAYER_PEDAL_FRAMES[0])
      .setDepth(50)
      .setScale(SCALE.player)
      .setOrigin(0.5, 1);

    this.cargo = this.add
      .image(PHYSICS.playerX - 6, this.playerY - 36, 'spr_pastry_stack')
      .setDepth(51)
      .setScale(SCALE.cargo)
      .setOrigin(0.5, 1);

    this.updateCargoVisual();
  }

  private setCyclistFrame(idx: number) {
    const key = this.isJumping
      ? 'spr_player_jump'
      : PLAYER_PEDAL_FRAMES[idx % PLAYER_PEDAL_FRAMES.length];
    this.player.setTexture(key);
  }

  private createPigeonPool() {
    for (let i = 0; i < 10; i++) {
      const sprite = this.add
        .image(-100, -100, PIGEON_FRAMES[0])
        .setDepth(60)
        .setScale(SCALE.pigeon)
        .setVisible(false);
      this.pigeonPool.push({
        sprite,
        state: 'targeting',
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

    const releasePointer = (p: Phaser.Input.Pointer) => {
      this.activePointersLeft.delete(p.id);
      this.activePointersRight.delete(p.id);
      this.swipeDuckPointers.delete(p.id);
      this.pointerStartY.delete(p.id);
      this.pointerDownAt.delete(p.id);
    };

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.pointerStartY.set(p.id, p.y);
      this.pointerDownAt.set(p.id, Date.now());
      if (p.x > GAME_WIDTH / 2) this.activePointersRight.add(p.id);
      else this.activePointersLeft.add(p.id);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const startY = this.pointerStartY.get(p.id);
      if (startY === undefined || p.x <= GAME_WIDTH / 2) return;
      if (p.y - startY >= this.swipeDuckThreshold) {
        this.swipeDuckPointers.add(p.id);
      }
    });
    this.input.on('pointerup', releasePointer);
    this.input.on('pointerupoutside', releasePointer);
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
    const pointerJump = this.activePointersRight.size > 0;
    const pointerBrake = this.activePointersLeft.size > 0;
    const pointerDuck = this.swipeDuckPointers.size > 0;
    const pointerHoldSpeedUp = [...this.activePointersRight].some((id) => {
      const downAt = this.pointerDownAt.get(id);
      return downAt !== undefined && Date.now() - downAt >= this.holdSpeedUpMs;
    });

    const jump = this.spaceKey?.isDown || this.cursors?.up?.isDown || pointerJump;
    const duck = this.cursors?.down?.isDown || pointerDuck;
    const speedUp = this.cursors?.right?.isDown || pointerHoldSpeedUp;
    const brake = this.cursors?.left?.isDown || pointerBrake;

    this.speedMult = speedUp ? PHYSICS.speedUpMultiplier : brake ? PHYSICS.brakeMultiplier : 1;

    if (duck && !this.isJumping) {
      this.isDucking = true;
      this.player.setScale(SCALE.playerDuck, SCALE.playerDuck * 0.75);
    } else {
      this.isDucking = false;
      this.player.setScale(SCALE.player);
    }

    if (jump && !this.isJumping && !this.isDucking) {
      this.isJumping = true;
      this.jumpVy = PHYSICS.jumpVelocity;
      this.setCyclistFrame(0);
      this.playJumpSquash();
    }
  }

  private playJumpSquash() {
    const baseX = this.isDucking ? SCALE.playerDuck : SCALE.player;
    const baseY = this.isDucking ? SCALE.playerDuck * 0.75 : SCALE.player;
    this.tweens.add({
      targets: this.player,
      scaleX: baseX * 0.82,
      scaleY: baseY * 1.18,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  private playLandSquash() {
    const baseX = this.isDucking ? SCALE.playerDuck : SCALE.player;
    const baseY = this.isDucking ? SCALE.playerDuck * 0.75 : SCALE.player;
    this.tweens.add({
      targets: this.player,
      scaleX: baseX * 1.15,
      scaleY: baseY * 0.72,
      duration: 55,
      yoyo: true,
      repeat: 1,
      ease: 'Bounce.easeOut',
    });
    audioManager.playLand();
    this.cameras.main.shake(60, 0.004);
  }

  private spawnPedalDust() {
    const colors = [0xc4a882, 0xa89070, 0xd4c4a8];
    for (let i = 0; i < 2; i++) {
      const dust = this.add
        .circle(
          this.player.x - 10 - i * 4,
          this.playerY - 2 + i,
          1.5 + Math.random(),
          colors[i % colors.length],
          0.55,
        )
        .setDepth(45);
      this.tweens.add({
        targets: dust,
        x: dust.x - 12 - Math.random() * 8,
        y: dust.y + 2 + Math.random() * 3,
        alpha: 0,
        scale: 0.2,
        duration: 220 + i * 40,
        ease: 'Quad.easeOut',
        onComplete: () => dust.destroy(),
      });
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
        this.playLandSquash();
      }
    }

    this.player.y = this.playerY;
    this.cargo.setPosition(
      this.player.x - 6,
      this.playerY - (this.isDucking ? 24 : 36),
    );
    this.cargo.setScale(SCALE.cargo * (this.pastries / PHYSICS.startingPastries + 0.4));

    if (Date.now() < this.invincibleUntil) {
      this.player.setAlpha(Math.sin(Date.now() / 80) > 0 ? 0.35 : 1);
    } else {
      this.player.setAlpha(1);
    }
  }

  private updatePedalAnimation(dt: number) {
    if (this.isJumping) {
      this.setCyclistFrame(0);
      return;
    }
    this.pedalTimer += dt;
    const interval = 0.15 / this.speedMult;
    if (this.pedalTimer >= interval) {
      this.pedalTimer = 0;
      this.pedalFrame = (this.pedalFrame + 1) % PLAYER_PEDAL_FRAMES.length;
      this.setCyclistFrame(this.pedalFrame);
    }

    if (!this.isDucking && this.speedMult >= 1) {
      this.dustTimer += dt;
      const dustRate = 0.12 / this.speedMult;
      if (this.dustTimer >= dustRate) {
        this.dustTimer = 0;
        this.spawnPedalDust();
      }
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
    const rate = Math.max(
      SPAWN.minInterval,
      SPAWN.baseInterval - this.distance * SPAWN.rampPerMeter,
    );
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
    if (this.level >= 6 && Math.random() < 0.18) variant = 'flock';
    else if (this.level >= 4 && Math.random() < 0.25) variant = 'divebomber';

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
    pigeon.timer = variant === 'flock' ? -index * 0.12 : 0;
    pigeon.startY = -20 - index * 8;
    pigeon.targetX = this.player.x;
    pigeon.frameIdx = 0;
    pigeon.flockOffset =
      variant === 'flock' ? Math.sin((index / flockSize) * Math.PI * 2) * FLOCK_OFFSET : 0;

    pigeon.sprite.setVisible(true);
    pigeon.sprite.setPosition(GAME_WIDTH + 20 + index * 15, pigeon.startY);
    pigeon.sprite.setScale(SCALE.pigeon);
    pigeon.sprite.setTexture(PIGEON_FRAMES[0]);
    pigeon.telegraph = this.createTelegraph(this.getLandingX(pigeon), this.playerY - TELEGRAPH_LANDING_OFFSET);
  }

  private getLandingX(pigeon: PigeonObj): number {
    return pigeon.targetX + (pigeon.flockOffset ?? 0);
  }

  private updateTelegraph(pigeon: PigeonObj) {
    if (!pigeon.telegraph) return;
    const landingX = this.getLandingX(pigeon);
    const landingY = this.playerY - TELEGRAPH_LANDING_OFFSET;
    pigeon.telegraph.setPosition(landingX, landingY);
    const arrow = pigeon.telegraph.list[0] as Phaser.GameObjects.Image | undefined;
    if (arrow) {
      arrow.setRotation(Math.PI);
    }
  }

  private destroyTelegraph(pigeon: PigeonObj) {
    pigeon.telegraph?.destroy();
    pigeon.telegraph = undefined;
  }

  private createTelegraph(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(100);
    const arrow = this.add
      .image(0, 0, 'spr_telegraph_arrow')
      .setOrigin(0.5, 0)
      .setScale(SCALE.arrow)
      .setRotation(Math.PI);
    c.add(arrow);
    this.tweens.add({
      targets: arrow,
      scaleY: SCALE.arrow * 1.35,
      scaleX: SCALE.arrow * 1.1,
      alpha: { from: 1, to: 0.25 },
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    return c;
  }

  private playSmokeVfx(x: number, y: number) {
    const smoke = this.add
      .image(x, y - 10, SMOKE_FRAMES[0])
      .setDepth(85)
      .setScale(SCALE.smoke)
      .setOrigin(0.5);
    let frame = 0;

    this.time.addEvent({
      delay: 70,
      repeat: SMOKE_FRAMES.length - 1,
      callback: () => {
        frame += 1;
        if (frame >= SMOKE_FRAMES.length) {
          smoke.destroy();
          return;
        }
        smoke.setTexture(SMOKE_FRAMES[frame]);
      },
    });
  }

  private updatePigeons(dt: number) {
    for (const pigeon of this.pigeonPool) {
      if (!pigeon.sprite.visible) continue;
      pigeon.timer += dt;
      pigeon.frameIdx = Math.floor(pigeon.timer * 8) % PIGEON_FRAMES.length;
      pigeon.sprite.setTexture(PIGEON_FRAMES[pigeon.frameIdx]);

      switch (pigeon.state) {
        case 'targeting':
          pigeon.targetX = this.player.x;
          pigeon.sprite.x = GAME_WIDTH - 30;
          pigeon.sprite.y = 15 + Math.sin(pigeon.timer * 4) * 3;
          this.updateTelegraph(pigeon);
          if (pigeon.timer >= PHYSICS.telegraphDuration / 1000) {
            pigeon.state = 'swoop';
            pigeon.timer = 0;
            pigeon.targetX = this.player.x;
            audioManager.playSwoop();
          }
          break;

        case 'swoop': {
          const progress = Math.min(1, pigeon.timer / 0.8);
          const landingX = this.getLandingX(pigeon);
          const curve = Math.min(1, progress * progress);
          pigeon.sprite.x = Phaser.Math.Linear(GAME_WIDTH - 30, landingX, progress);
          pigeon.sprite.y = Phaser.Math.Linear(
            pigeon.startY,
            this.playerY - 20,
            curve,
          );
          this.updateTelegraph(pigeon);

          const overlapping = this.pigeonOverlapsPlayer(pigeon);
          const invincible = Date.now() < this.invincibleUntil;
          const swoopResolved =
            (progress >= SWOOP_COLLISION_START && overlapping && !invincible) || progress >= 1;

          if (swoopResolved) {
            if (overlapping && !invincible) {
              this.takeDamage(pigeon);
            } else if (!overlapping && !invincible) {
              this.awardDodge(pigeon);
            }
            this.destroyTelegraph(pigeon);
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
            this.destroyTelegraph(pigeon);
            pigeon.state = 'targeting';
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
      h,
    );
  }

  private getPigeonHitbox(pigeon: PigeonObj): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      pigeon.sprite.x - HITBOX.pigeonBeak.w / 2,
      pigeon.sprite.y - HITBOX.pigeonBeak.h / 2,
      HITBOX.pigeonBeak.w,
      HITBOX.pigeonBeak.h,
    );
  }

  private pigeonOverlapsPlayer(pigeon: PigeonObj): boolean {
    return Phaser.Geom.Rectangle.Overlaps(this.getPlayerHitbox(), this.getPigeonHitbox(pigeon));
  }

  private takeDamage(pigeon: PigeonObj) {
    audioManager.playDamage();
    this.playSmokeVfx(this.player.x, this.playerY - 30);
    this.pastries = Math.max(0, this.pastries - 1);
    this.updateCargoVisual();
    this.invincibleUntil = Date.now() + PHYSICS.iFrameDuration;
    this.onGameEvent?.('player_damage_taken', {
      x: this.player.x,
      y: this.playerY,
      enemy_type: pigeon.variant,
    });

    const lost = this.add
      .image(this.player.x, this.playerY - 50, 'spr_pastry_single')
      .setScale(SCALE.pastryDrop)
      .setDepth(80);
    this.tweens.add({
      targets: lost,
      y: this.playerY + 20,
      alpha: 0,
      duration: 600,
      onComplete: () => lost.destroy(),
    });

    this.cameras.main.shake(220, 0.018);

    if (this.pastries <= 0) {
      this.triggerGameOver();
    }
  }

  private awardDodge(pigeon: PigeonObj) {
    const nearMiss = Math.abs(pigeon.sprite.x - this.player.x) < PHYSICS.perfectDodgeWindow;
    const points = nearMiss ? SCORING.perfectDodge : SCORING.dodge;
    this.score += points;
    if (nearMiss) {
      audioManager.playBell();
      this.playPerfectDodgeBounce();
    } else {
      audioManager.playScore();
    }
    this.showFloatingScore(pigeon.sprite.x, pigeon.sprite.y, points, nearMiss);
  }

  private playPerfectDodgeBounce() {
    const cam = this.cameras.main;
    this.tweens.add({
      targets: cam,
      zoom: 1.025,
      duration: 90,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  }

  private showFloatingScore(x: number, y: number, points: number, perfect: boolean) {
    if (points === SCORING.dodge) {
      const img = this.add
        .image(x, y, 'spr_score_100')
        .setScale(SCALE.scorePopup)
        .setDepth(90);
      this.tweens.add({
        targets: img,
        y: y - 30,
        alpha: 0,
        duration: 500,
        onComplete: () => img.destroy(),
      });
    } else {
      const txt = this.add
        .text(x, y, perfect ? 'RAD!\n+250' : `+${points}`, {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '6px',
          color: '#00ff00',
          stroke: '#000',
          strokeThickness: 1,
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(90);
      this.tweens.add({
        targets: txt,
        y: y - 30,
        alpha: 0,
        duration: 500,
        onComplete: () => txt.destroy(),
      });
    }
  }

  private updateCargoVisual() {
    const lost = PHYSICS.startingPastries - this.pastries;
    const wobble = 4 + lost * 3;
    this.tweens.add({
      targets: this.cargo,
      angle: { from: -wobble, to: wobble },
      y: this.cargo.y + 3,
      duration: 80,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: this.cargo,
      scaleX: this.cargo.scaleX * 1.15,
      scaleY: this.cargo.scaleY * 0.85,
      duration: 60,
      yoyo: true,
      repeat: 2,
    });
  }

  private triggerGameOver() {
    this.gameOver = true;
    audioManager.stopBGM();
    this.onGameEvent?.('game_over', {
      score: this.score,
      pastries: this.pastries,
      cause: 'no_pastries',
      level: this.level,
    });
    this.scene.pause();
  }

  private triggerLevelComplete() {
    this.levelComplete = true;
    audioManager.stopBGM();
    const cargoBonus = this.pastries * SCORING.pastryBonus;
    this.score += SCORING.levelComplete + cargoBonus;
    this.onGameEvent?.('level_complete', {
      score: this.score,
      pastries: this.pastries,
      level: this.level,
    });

    const overlay = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10, 'spr_level_complete')
      .setDepth(300)
      .setScrollFactor(0)
      .setScale(0.5)
      .setAlpha(0);
    this.tweens.add({
      targets: overlay,
      alpha: 1,
      scale: SCALE.levelBanner,
      duration: 600,
      ease: 'Back.easeOut',
    });
    this.scene.pause();
  }

  getScore() {
    return this.score;
  }
  getPastries() {
    return this.pastries;
  }
  getLevel() {
    return this.level;
  }
  isGameOver() {
    return this.gameOver;
  }
  isLevelComplete() {
    return this.levelComplete;
  }

  restart() {
    this.children.removeAll(true);
    this.resetState();
    this.scene.restart();
  }
}
