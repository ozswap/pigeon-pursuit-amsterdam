import Phaser from 'phaser';
import {
  GAME_WIDTH,
  HITBOX,
  PARALLAX,
  PHYSICS,
  PROGRESSION,
  SCORING,
  SKY_COLOR,
  SPAWN,
} from '../config';
import { audioManager } from '../audio';
import { isCRTPipelineEnabled, registerCRTPipeline } from '../pipelines/CRTPipeline';

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
  scorePopup: 0.22,
  pastryDrop: 0.05,
};

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private cargo!: Phaser.GameObjects.Image;
  private pedalFrame = 0;
  private pedalTimer = 0;
  private isJumping = false;
  private isDucking = false;
  private jumpVy = 0;
  private jumpBuffered = false;
  private jumpBufferUntil = 0;
  private coyoteMsLeft = 0;
  private playerY = PHYSICS.groundY;
  private speedMult = 1;
  private distance = 0;
  private scrollSpeed = PHYSICS.baseScrollSpeed;
  private pastries = PHYSICS.startingPastries;
  private score = 0;
  private level = 1;
  private invincibleUntil = 0;
  private displayedScore = -1;
  private displayedPastries = -1;
  private currentPlayerTexture = '';
  private readonly playerHitbox = new Phaser.Geom.Rectangle();
  private readonly pigeonHitbox = new Phaser.Geom.Rectangle();
  private telegraphPool: Phaser.GameObjects.Container[] = [];
  private gameOver = false;
  private levelComplete = false;
  private pigeonPool: PigeonObj[] = [];
  private spawnTimer = 0;
  private parallaxLayers: Phaser.GameObjects.TileSprite[] = [];
  private groundBrick!: Phaser.GameObjects.TileSprite;
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
    this.createTelegraphPool();
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

    if (isCRTPipelineEnabled()) {
      registerCRTPipeline(this.cameras.main, this.game);
    }
  }

  private resetState() {
    this.pedalFrame = 0;
    this.pedalTimer = 0;
    this.isJumping = false;
    this.isDucking = false;
    this.jumpVy = 0;
    this.jumpBuffered = false;
    this.jumpBufferUntil = 0;
    this.coyoteMsLeft = 0;
    this.playerY = PHYSICS.groundY;
    this.speedMult = 1;
    this.distance = 0;
    this.scrollSpeed = PHYSICS.baseScrollSpeed;
    this.pastries = PHYSICS.startingPastries;
    this.score = 0;
    this.level = 1;
    this.invincibleUntil = 0;
    this.displayedScore = -1;
    this.displayedPastries = -1;
    this.currentPlayerTexture = '';
    this.telegraphPool = [];
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
    // Solid sky — matches building strip top / level-complete art
    this.add
      .rectangle(GAME_WIDTH / 2, 32, GAME_WIDTH, 64, SKY_COLOR)
      .setScrollFactor(0)
      .setDepth(-10);

    // Ground fill below fence — depth 2 keeps it behind fence (depth 3)
    this.add
      .rectangle(GAME_WIDTH / 2, 165, GAME_WIDTH, 30, 0x4a4038)
      .setScrollFactor(0)
      .setDepth(2);

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

  /** Scrolling sidewalk brick strip along the ride surface. */
  private createGroundDetail() {
    this.groundBrick = this.add
      .tileSprite(0, PHYSICS.groundY - 5, GAME_WIDTH * 2, 6, 'spr_brick_ground')
      .setOrigin(0, 0)
      .setDepth(5)
      .setScrollFactor(0);
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
    if (key === this.currentPlayerTexture) return;
    this.currentPlayerTexture = key;
    this.player.setTexture(key);
  }

  private createPigeonPool() {
    for (let i = 0; i < 15; i++) {
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
      if (p.x > GAME_WIDTH / 2) {
        this.activePointersRight.add(p.id);
        this.jumpBuffered = true;
        this.jumpBufferUntil = this.time.now + PHYSICS.jumpBufferMs;
      } else {
        this.activePointersLeft.add(p.id);
      }
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
    this.handleInput(deltaMs);

    this.distance += this.scrollSpeed * this.speedMult * dt;
    this.scrollSpeed = Math.min(800, PHYSICS.baseScrollSpeed + this.distance * 0.05);
    this.level = Math.floor(this.distance / PROGRESSION.levelDistance) + 1;

    if (this.distance > PROGRESSION.levelCompleteDistance) {
      this.triggerLevelComplete();
      return;
    }

    this.updatePlayer(dt);
    this.updateParallax(dt);
    this.updatePigeons(dt);
    this.updateSpawner(dt);
    this.updatePedalAnimation(dt);

    this.refreshHud();
  }

  private refreshHud() {
    if (this.score !== this.displayedScore) {
      this.displayedScore = this.score;
      this.scoreText.setText(String(this.score));
    }
    if (this.pastries !== this.displayedPastries) {
      this.displayedPastries = this.pastries;
      this.pastryText.setText(`🥯 ${this.pastries}`);
    }
  }

  private handleInput(deltaMs: number) {
    const pointerBrake = this.activePointersLeft.size > 0;
    const pointerDuck = this.swipeDuckPointers.size > 0;
    const pointerHoldSpeedUp = [...this.activePointersRight].some((id) => {
      const downAt = this.pointerDownAt.get(id);
      return downAt !== undefined && Date.now() - downAt >= this.holdSpeedUpMs;
    });

    const duck = this.cursors?.down?.isDown || pointerDuck;
    const speedUp = this.cursors?.right?.isDown || pointerHoldSpeedUp;
    const brake = this.cursors?.left?.isDown || pointerBrake;

    this.speedMult = speedUp ? PHYSICS.speedUpMultiplier : brake ? PHYSICS.brakeMultiplier : 1;

    if (this.jumpBuffered && this.time.now > this.jumpBufferUntil) {
      this.jumpBuffered = false;
    }

    const onGround = !this.isJumping;
    if (onGround) {
      this.coyoteMsLeft = PHYSICS.coyoteTimeMs;
    } else {
      this.coyoteMsLeft = Math.max(0, this.coyoteMsLeft - deltaMs);
    }

    const keyboardJump =
      Phaser.Input.Keyboard.JustDown(this.spaceKey) ||
      Phaser.Input.Keyboard.JustDown(this.cursors?.up);
    if (keyboardJump) {
      this.jumpBuffered = true;
      this.jumpBufferUntil = this.time.now + PHYSICS.jumpBufferMs;
    }

    if (
      this.jumpBuffered &&
      this.time.now <= this.jumpBufferUntil &&
      (onGround || this.coyoteMsLeft > 0)
    ) {
      this.performJump();
    }

    if (this.isJumping) {
      this.isDucking = false;
    } else if (duck) {
      this.isDucking = true;
      if (!this.tweens.isTweening(this.player)) {
        this.player.setScale(SCALE.playerDuck, SCALE.playerDuck * 0.75);
      }
    } else {
      this.isDucking = false;
      if (!this.tweens.isTweening(this.player)) {
        this.player.setScale(SCALE.player);
      }
    }
  }

  private performJump() {
    if (this.isJumping) return;
    this.isJumping = true;
    this.isDucking = false;
    this.jumpVy = PHYSICS.jumpVelocity;
    this.jumpBuffered = false;
    this.coyoteMsLeft = 0;
    this.setCyclistFrame(0);
    this.playJumpSquash();
  }

  private playJumpSquash() {
    this.tweens.killTweensOf(this.player);
    const baseX = SCALE.player;
    const baseY = SCALE.player;
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
    this.tweens.killTweensOf(this.player);
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
    this.cameras.main.shake(80, 0.012);
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
        this.player.x = PHYSICS.playerX;
        this.playLandSquash();
        if (this.jumpBuffered && this.time.now <= this.jumpBufferUntil) {
          this.performJump();
        }
      }
    }

    this.player.y = this.playerY;
    this.cargo.setPosition(
      this.player.x - 6,
      this.playerY - (this.isDucking ? 24 : 36),
    );
    this.cargo.setScale(SCALE.cargo * (this.pastries / PHYSICS.startingPastries + 0.4));

    const now = this.time.now;
    if (now < this.invincibleUntil) {
      const flickerAlpha = Math.sin(now / 80) > 0 ? 0.35 : 1;
      this.player.setAlpha(flickerAlpha);
      this.cargo.setAlpha(flickerAlpha);
    } else {
      this.player.setAlpha(1);
      this.cargo.setAlpha(1);
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
      const dustRate = (0.12 / this.speedMult) * (this.speedMult > 1.2 ? 1.3 : 1);
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
    if (this.groundBrick) {
      this.groundBrick.tilePositionX += this.scrollSpeed * 0.68 * this.speedMult * dt;
    }
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
    if (this.level >= PROGRESSION.flockUnlockLevel && Math.random() < 0.18) variant = 'flock';
    else if (this.level >= PROGRESSION.divebomberUnlockLevel && Math.random() < 0.25)
      variant = 'divebomber';

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
    pigeon.telegraph = this.acquireTelegraph(
      this.getLandingX(pigeon),
      this.playerY - TELEGRAPH_LANDING_OFFSET,
    );
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

  private releaseTelegraph(pigeon: PigeonObj) {
    if (pigeon.telegraph) {
      pigeon.telegraph.setVisible(false);
      pigeon.telegraph = undefined;
    }
  }

  private createTelegraphPool() {
    for (let i = 0; i < 5; i++) {
      this.telegraphPool.push(this.buildTelegraphContainer());
    }
  }

  private buildTelegraphContainer(): Phaser.GameObjects.Container {
    const c = this.add.container(-100, -100).setDepth(100).setVisible(false);
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

  private acquireTelegraph(x: number, y: number): Phaser.GameObjects.Container {
    const c =
      this.telegraphPool.find((t) => !t.visible) ?? this.buildTelegraphContainer();
    if (!this.telegraphPool.includes(c)) this.telegraphPool.push(c);
    return c.setPosition(x, y).setVisible(true);
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
      const frameIdx = Math.floor(pigeon.timer * 8) % PIGEON_FRAMES.length;
      if (frameIdx !== pigeon.frameIdx) {
        pigeon.frameIdx = frameIdx;
        pigeon.sprite.setTexture(PIGEON_FRAMES[frameIdx]);
      }

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
          const invincible = this.time.now < this.invincibleUntil;
          const swoopResolved =
            (progress >= SWOOP_COLLISION_START && overlapping && !invincible) || progress >= 1;

          if (swoopResolved) {
            if (overlapping && !invincible) {
              this.takeDamage(pigeon);
            } else if (!overlapping && !invincible) {
              this.awardDodge(pigeon);
            }
            this.releaseTelegraph(pigeon);
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
            this.releaseTelegraph(pigeon);
            pigeon.state = 'targeting';
          }
          break;
      }
    }
  }

  private updatePlayerHitbox(): Phaser.Geom.Rectangle {
    const h = this.isDucking
      ? HITBOX.playerCore.h * (1 - PHYSICS.duckHitboxReduction)
      : HITBOX.playerCore.h;
    this.playerHitbox.setTo(
      this.player.x - HITBOX.playerCore.w / 2,
      this.playerY - h,
      HITBOX.playerCore.w,
      h,
    );
    return this.playerHitbox;
  }

  private updatePigeonHitbox(pigeon: PigeonObj): Phaser.Geom.Rectangle {
    this.pigeonHitbox.setTo(
      pigeon.sprite.x - HITBOX.pigeonBeak.w / 2,
      pigeon.sprite.y - HITBOX.pigeonBeak.h / 2,
      HITBOX.pigeonBeak.w,
      HITBOX.pigeonBeak.h,
    );
    return this.pigeonHitbox;
  }

  private pigeonOverlapsPlayer(pigeon: PigeonObj): boolean {
    return Phaser.Geom.Rectangle.Overlaps(
      this.updatePlayerHitbox(),
      this.updatePigeonHitbox(pigeon),
    );
  }

  private takeDamage(pigeon: PigeonObj) {
    audioManager.playDamage();
    this.playSmokeVfx(this.player.x, this.playerY - 30);
    this.pastries = Math.max(0, this.pastries - 1);
    this.updateCargoVisual();
    this.invincibleUntil = this.time.now + PHYSICS.iFrameDuration;
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
