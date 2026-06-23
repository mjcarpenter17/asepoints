/**
 * AttachmentPoints.ts
 * -------------------
 * Loads a .points.json file (produced by aseprite_slices_to_points.py) and
 * resolves each named attachment point to world-space coordinates at runtime,
 * taking the live sprite's position and rotation into account.
 *
 * Compatible with Phaser 3 and Phaser 4.
 * Phaser 4 is the primary target. Phaser 3 compatibility is maintained
 * via internal shims where APIs diverged; see inline comments.
 *
 * Zero runtime dependencies beyond Phaser itself.
 *
 * ---------------------------------------------------------------------------
 * Quick-start
 * ---------------------------------------------------------------------------
 *
 *   // 1. Preload (in your Phaser Scene's preload())
 *   this.load.json('turret_1_points', 'assets/Turret_1.points.json');
 *   this.load.image('turret_1', 'assets/Turret_1-sheet.png');
 *
 *   // 2. Create sprite and attachment helper (in create())
 *   const turretSprite = this.add.sprite(400, 300, 'turret_1');
 *   const turretPoints = AttachmentPoints.fromCache(this, 'turret_1_points', turretSprite);
 *
 *   // 3. Use in update() or fire logic
 *   const barrel1 = turretPoints.get('Barrel_01');   // Phaser.Math.Vector2, world space
 *   this.spawnProjectile(barrel1.x, barrel1.y, turretSprite.angle);
 *
 * ---------------------------------------------------------------------------
 */

/** Raw shape of a single attachment point inside the .points.json file. */
interface PointsFileEntry {
  name: string;
  raw: { x: number; y: number };
  offset: { x: number; y: number };
  distance: number;
  angle_deg: number;
}

/** Root shape of a .points.json file. */
interface PointsFile {
  _schema: string;
  source_image: string;
  sprite_size: { w: number; h: number };
  origin: {
    raw: { x: number; y: number };
    phaser_origin: { x: number; y: number };
  };
  attachment_points: PointsFileEntry[];
}

/**
 * Compatible with Phaser 3 and Phaser 4.
 * Phaser 4 is the primary target. Phaser 3 compatibility is maintained
 * via internal shims where APIs diverged; see inline comments.
 */
export class AttachmentPoints {
  /** Pre-computed offsets (relative to Origin, in sprite-local space). */
  private readonly offsets = new Map<string, { x: number; y: number }>();

  /** Managed Text objects created by drawDebug(); keyed by point name. */
  private debugLabels: Map<string, Phaser.GameObjects.Text> = new Map();

  /** Phaser-normalised origin values (0–1).  Use with sprite.setOrigin(). */
  readonly phaserOrigin: { x: number; y: number };

  /** The sprite this helper is bound to. */
  private readonly sprite: Phaser.GameObjects.Sprite;

  // -------------------------------------------------------------------------
  // Compatibility shims
  // -------------------------------------------------------------------------

  /**
   * Phaser 3/4 shim: Phaser.Math.DegToRad was present in Phaser 3 but its
   * namespace path shifted in early Phaser 4 builds. Using the inline formula
   * avoids any version dependency while producing identical results.
   */
  private static degToRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  // -------------------------------------------------------------------------

  private constructor(data: PointsFile, sprite: Phaser.GameObjects.Sprite) {
    this.sprite = sprite;
    this.phaserOrigin = data.origin.phaser_origin;

    for (const pt of data.attachment_points) {
      this.offsets.set(pt.name, { x: pt.offset.x, y: pt.offset.y });
    }

    // Apply the correct origin so Phaser rotates around the exact pixel.
    sprite.setOrigin(this.phaserOrigin.x, this.phaserOrigin.y);
  }

  // -------------------------------------------------------------------------
  // Factory helpers
  // -------------------------------------------------------------------------

  /**
   * Build from a raw parsed object (useful in tests or non-Phaser contexts).
   */
  static from(data: PointsFile, sprite: Phaser.GameObjects.Sprite): AttachmentPoints {
    return new AttachmentPoints(data, sprite);
  }

  /**
   * Build from a key already loaded into Phaser's JSON cache.
   *
   * @param scene  — the current Phaser.Scene
   * @param key    — the key passed to `this.load.json(key, ...)`
   * @param sprite — the live sprite to bind to
   */
  static fromCache(
    scene: Phaser.Scene,
    key: string,
    sprite: Phaser.GameObjects.Sprite
  ): AttachmentPoints {
    const data = scene.cache.json.get(key) as PointsFile;
    if (!data) {
      throw new Error(
        `AttachmentPoints: JSON key "${key}" not found in cache. ` +
          'Did you call this.load.json() in preload()?'
      );
    }
    return new AttachmentPoints(data, sprite);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns the world-space position of a named attachment point,
   * correctly rotated with the sprite.
   *
   * @param name — the slice name defined in Aseprite (e.g. 'Barrel_01')
   * @returns    Phaser.Math.Vector2 in world coordinates
   * @throws     Error if the name is not found
   */
  get(name: string): Phaser.Math.Vector2 {
    const offset = this.offsets.get(name);
    if (!offset) {
      throw new Error(
        `AttachmentPoints: No attachment point named "${name}". ` +
          `Available: ${[...this.offsets.keys()].join(', ')}`
      );
    }

    const angleRad = AttachmentPoints.degToRad(this.sprite.angle);
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    // Rotate the sprite-local offset by the sprite's current rotation
    const rx = offset.x * cos - offset.y * sin;
    const ry = offset.x * sin + offset.y * cos;

    return new Phaser.Math.Vector2(this.sprite.x + rx, this.sprite.y + ry);
  }

  /**
   * Returns a Map of all attachment point names to their current world-space
   * positions, correctly rotated with the sprite.
   *
   * Useful for alternate-fire logic, bulk transforms, or iterating all points
   * without calling get() individually.
   *
   * @returns Map<string, Phaser.Math.Vector2>
   */
  getAll(): Map<string, Phaser.Math.Vector2> {
    const result = new Map<string, Phaser.Math.Vector2>();
    for (const name of this.offsets.keys()) {
      result.set(name, this.get(name));
    }
    return result;
  }

  /**
   * Returns all defined attachment point names.
   */
  names(): string[] {
    return [...this.offsets.keys()];
  }

  /**
   * Returns the raw (unrotated, sprite-local) offset for a named point.
   * Useful for editor tooling or debug overlays.
   */
  getOffset(name: string): { x: number; y: number } {
    const offset = this.offsets.get(name);
    if (!offset) {
      throw new Error(`AttachmentPoints: No attachment point named "${name}".`);
    }
    return { ...offset };
  }

  /**
   * Draws a debug overlay onto a Phaser Graphics object.
   * Shows the origin (green dot) and all attachment points (yellow dots).
   *
   * Pass `scene` to also render a text label beside each dot.
   * Without `scene`, only dots are rendered — useful when a Scene reference
   * is unavailable (e.g. isolated Graphics objects or unit tests).
   *
   * Labels are reused across calls — safe to call every frame in update().
   * Call `destroyDebug()` when finished debugging or before destroying the sprite.
   *
   * @param gfx   — Phaser Graphics object to draw dots onto
   * @param scene — optional; when provided, text labels are added via scene.add.text()
   *
   * Call in your scene's update() while debugging, e.g.:
   *   this.debugGfx.clear();
   *   turretPoints.drawDebug(this.debugGfx, this);        // dots + labels
   *   turretPoints.drawDebug(this.debugGfx);              // dots only
   */
  drawDebug(gfx: Phaser.GameObjects.Graphics, scene?: Phaser.Scene): void {
    const labelStyle = {
      fontSize: '10px',
      color: '#ffff00',
      backgroundColor: '#00000066',
      padding: { x: 2, y: 1 },
    };

    // Origin dot (green)
    gfx.fillStyle(0x00ff00, 1);
    gfx.fillCircle(this.sprite.x, this.sprite.y, 4);
    if (scene) {
      this._upsertLabel(scene, '__origin__', this.sprite.x + 6, this.sprite.y, 'origin', labelStyle);
    }

    // Attachment point dots (yellow)
    gfx.fillStyle(0xffff00, 1);
    for (const name of this.offsets.keys()) {
      const pos = this.get(name);
      gfx.fillCircle(pos.x, pos.y, 3);
      if (scene) {
        this._upsertLabel(scene, name, pos.x + 6, pos.y, name, labelStyle);
      }
    }
  }

  /**
   * Destroys all Text objects created by drawDebug() and clears the internal map.
   * Call when finished debugging or before destroying the sprite.
   */
  destroyDebug(): void {
    for (const label of this.debugLabels.values()) {
      label.destroy();
    }
    this.debugLabels.clear();
  }

  private _upsertLabel(
    scene: Phaser.Scene,
    key: string,
    x: number,
    y: number,
    text: string,
    style: object
  ): void {
    const existing = this.debugLabels.get(key);
    if (existing) {
      existing.setPosition(x, y);
    } else {
      this.debugLabels.set(key, scene.add.text(x, y, text, style));
    }
  }
}
