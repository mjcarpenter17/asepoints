# ATTACHMENT_POINTS_SKILL

> **Agent skill — load this at the start of every session that involves sprite attachment points.**
> It explains the full system so you never need to re-describe it.

---

## What This System Does

Attachment Points is a small pipeline that converts named **Aseprite slice markers** into
engine-ready, rotation-aware world-space coordinates.

It lets game code (and agents writing game code) reference named points on a sprite
**by name** — `'Barrel_01'`, `'muzzle_flash'`, `'seat_left'` — without ever hardcoding
pixel offsets or recomputing geometry.

---

## Pipeline Overview

```
Aseprite (.ase file)
  └─ define slices visually
  └─ export → JSON  (Aseprite built-in: File › Export Sprite Sheet)
          ↓
aseprite_slices_to_points.py
  └─ reads meta.slices from the exported JSON
  └─ computes offsets relative to the "Origin" slice
  └─ writes  <sprite>.points.json
          ↓
lib/AttachmentPoints.ts   (runtime utility, Phaser 3 / Phaser 4)
  └─ loads .points.json from Phaser cache
  └─ AttachmentPoints.fromCache(scene, key, sprite)
  └─ .get('Barrel_01')  →  Phaser.Math.Vector2 (world space, rotation-aware)
          ↓
Game code
  └─ references points by name — no pixel maths in game logic
```

---

## Aseprite Authoring Convention

Every sprite that uses this system must define **at least one slice** named exactly:

| Slice name | Purpose |
|---|---|
| `Origin` | **Required.** The rotation pivot / Phaser `setOrigin` point. |
| Any other name | An attachment point (barrel, seat, socket, spawn location, etc.) |

### How to define slices in Aseprite

1. Open the sprite in Aseprite.
2. **Edit › Slices** (or the Slice tool in the toolbar).
3. Draw a small rectangle (1×1 or 2×2 px) centred on the pixel you want to mark.
4. Name it (double-click the slice in the Slices panel).
5. **File › Export Sprite Sheet** → check *Slices* → export JSON.

The pixel **centre** of each slice rectangle is the coordinate that gets recorded.

---

## Running the Converter

```bash
# Basic usage — writes Turret_1.points.json next to the input
python aseprite_slices_to_points.py Asset_Examples/Turret_1.json

# Explicit output path
python aseprite_slices_to_points.py Asset_Examples/Turret_1.json --out assets/Turret_1.points.json
```

The converter prints a summary to stdout:

```
Written: Asset_Examples/Turret_1.points.json
  Sprite size : 200 x 539
  Origin      : (99.0, 422.0)  →  Phaser setOrigin(0.495, 0.782931)
  Points      : 2
    • Barrel_02             offset (-45.5, -405.5)  dist 408.0px  angle -96.4°
    • Barrel_01             offset (+42.0, -401.5)  dist 403.7px  angle -84.0°
```

---

## .points.json Schema (v1.0)

**File:** `schema/attachment_points.schema.json`

```json
{
  "_schema": "attachment_points/1.0",
  "source_image": "Turret_1-sheet.png",
  "sprite_size": { "w": 200, "h": 539 },
  "origin": {
    "raw":           { "x": 99.0,  "y": 422.0 },
    "phaser_origin": { "x": 0.495, "y": 0.782931 }
  },
  "attachment_points": [
    {
      "name":      "Barrel_01",
      "raw":       { "x": 141.0, "y": 20.5 },
      "offset":    { "x": 42.0,  "y": -401.5 },
      "distance":  403.69,
      "angle_deg": -84.03
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `origin.raw` | Pixel centre of the Origin slice (sprite canvas space) |
| `origin.phaser_origin` | Normalised 0-1 values for `sprite.setOrigin()` |
| `attachment_points[].offset` | Pixels from Origin. `+x` = right, `+y` = down |
| `attachment_points[].distance` | Euclidean distance from Origin |
| `attachment_points[].angle_deg` | atan2 angle — useful for cone / arc queries |

---

## Using AttachmentPoints in Phaser 3 / Phaser 4

**File:** `lib/AttachmentPoints.ts`

### Preload

```typescript
this.load.json('turret_1_points', 'assets/Turret_1.points.json');
this.load.image('turret_1', 'assets/Turret_1-sheet.png');
```

### Create

```typescript
const turretSprite = this.add.sprite(400, 300, 'turret_1');
// setOrigin() is called automatically inside fromCache():
const turretPoints = AttachmentPoints.fromCache(this, 'turret_1_points', turretSprite);
```

### Fire / Update logic

```typescript
// Returns a Phaser.Math.Vector2 in world space, correctly rotated
const barrel1 = turretPoints.get('Barrel_01');
const barrel2 = turretPoints.get('Barrel_02');

this.spawnProjectile(barrel1.x, barrel1.y, turretSprite.angle);
this.spawnMuzzleFlash(barrel1.x, barrel1.y);
```

```typescript
// Alternate fire between barrels
const allPoints = turretPoints.getAll();
const barrelNames = ['Barrel_01', 'Barrel_02'];
const fireFrom = allPoints.get(barrelNames[this.shotCount % barrelNames.length]);
this.spawnProjectile(fireFrom.x, fireFrom.y, turretSprite.angle);
this.shotCount++;
```

### Debug overlay

```typescript
// In create()
const debugGfx = this.add.graphics();

// In update() — dots only (no scene reference required)
debugGfx.clear();
turretPoints.drawDebug(debugGfx);

// In update() — dots + text labels beside each point
debugGfx.clear();
turretPoints.drawDebug(debugGfx, this);   // green dot = origin, yellow dots = attachment points
```

Pass `scene` (the second argument) to render a text label next to each dot.
Without it, only the dots are drawn — useful in contexts where a Scene reference
is unavailable.

### Inspect available points at runtime

```typescript
console.log(turretPoints.names());          // ['Barrel_02', 'Barrel_01']
console.log(turretPoints.getOffset('Barrel_01'));  // { x: 42, y: -401.5 }
console.log(turretPoints.phaserOrigin);     // { x: 0.495, y: 0.782931 }
```

---

## Adding a New Sprite

1. **Open in Aseprite** → add slices for `Origin` + any named points.
2. **Export Sprite Sheet** (with Slices checked) → `MySprite.json`.
3. **Run converter:**
   ```bash
   python aseprite_slices_to_points.py path/to/MySprite.json
   ```
4. **Commit** `MySprite.points.json` alongside the spritesheet PNG.
5. **Load in Phaser** as shown above.

That's it. No new utility code needed.

---

## Coordinate System Notes

- **Screen space:** `+x` = right, `+y` = down.
- `offset` values are in **sprite-local space** before rotation.
- `AttachmentPoints.get()` rotates the offset by `sprite.angle` (degrees) automatically,
  then adds `sprite.x / sprite.y` to give true world coordinates.
- Phaser `sprite.angle` is in degrees, clockwise. An inline shim is used internally for cross-version compatibility.

---

## File Layout Reference

```
<project root>/
├── aseprite_slices_to_points.py   ← converter (run once per new slice export)
├── schema/
│   └── attachment_points.schema.json
├── lib/
│   └── AttachmentPoints.ts        ← copy into any Phaser project's src/lib/
└── assets/  (per game project)
    ├── Turret_1-sheet.png
    ├── Turret_1.json              ← raw Aseprite export (source of truth)
    └── Turret_1.points.json       ← generated, committed to repo
```

---

## Quick Reference — What to Do When

| Situation | Action |
|---|---|
| New sprite needs points defined | Add slices in Aseprite → export JSON → run converter → commit `.points.json` |
| A point is in the wrong place | Move the slice in Aseprite → re-export → re-run converter |
| Need a new kind of point | Just add another slice in Aseprite — no code changes needed |
| Want the world position at runtime | `attachmentPoints.get('SliceName')` → `Vector2` |
| Want the local offset for maths | `attachmentPoints.getOffset('SliceName')` → `{x, y}` |
| Sprite rotates around wrong pixel | Check `Origin` slice placement in Aseprite; `setOrigin` is set automatically |
| Debugging visually | Call `attachmentPoints.drawDebug(graphics)` in update() |

---

## Known Limitations

### Per-frame attachment points (not yet supported)

Aseprite slices support per-frame bounds — a slice can occupy a different pixel
region on each animation frame. This is useful for animated sprites where an
attachment point moves across frames (e.g. a character's hand during a swing animation,
or a muzzle that shifts during recoil).

The current converter reads only the first frame's bounds for each slice.
For static or non-animated sprites this is correct and complete.
For animated sprites with shifting attachment points, manually compute frame-specific
offsets in game code until per-frame support is added to the converter.
