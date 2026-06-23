# Aseprite → Attachment Points

A lightweight pipeline that converts **Aseprite slice exports** into named, rotation-aware
attachment points (origins, pivots, barrel mounts, spawn sockets, seat positions, etc.)
for use in Phaser 3, Phaser 4 and other game engines.

---

## Why This Exists

Game objects need reference points beyond their bounding box — where a turret's barrels
are, where a character's hand is, where an explosion spawns.  Hardcoding pixel offsets
in game logic is fragile and breaks whenever art is updated.

This tool lets artists define those points visually in Aseprite, and lets game code
look them up **by name** at runtime, with rotation automatically handled.

---

## Contents

| Path | What it is |
|---|---|
| `aseprite_slices_to_points.py` | CLI converter: Aseprite JSON → `.points.json` |
| `lib/AttachmentPoints.ts` | Phaser 3 or Phaser 4 runtime utility class |
| `schema/attachment_points.schema.json` | JSON Schema for the `.points.json` format |
| `ATTACHMENT_POINTS_SKILL.md` | Agent skill — full system reference for AI assistants |
| `Asset_Examples/Turret_1.json` | Sample Aseprite export |
| `Asset_Examples/Turret_1.points.json` | Sample generated output |

---

## Requirements

- Python 3.8+ (no third-party packages — stdlib only)
- Aseprite (any recent version with slice export support)
- Phaser 3 or Phaser 4 (Phaser 4 is the primary target; for the TypeScript runtime utility)

---

## Quickstart

### 1. Define slices in Aseprite

In your sprite file, add at least two slices:

- `Origin` — **required.** The rotation pivot / anchor point.  Place it at the physical
  centre of rotation (e.g. the base of a turret, the hip of a character).
- Any other name — an attachment point you need in code (`Barrel_01`, `muzzle`, `seat_left`, etc.)

Use a 1×1 or 2×2 px rectangle.  The **pixel centre** of the rectangle is recorded.

Then: **File › Export Sprite Sheet** → tick *Slices* → export JSON.

### 2. Run the converter

```bash
python aseprite_slices_to_points.py Asset_Examples/Turret_1.json
```

Output:

```
Written: Asset_Examples/Turret_1.points.json
  Sprite size : 200 x 539
  Origin      : (99.0, 422.0)  →  Phaser setOrigin(0.495, 0.782931)
  Points      : 2
    • Barrel_02     offset (-45.5, -405.5)  dist 408.0px  angle -96.4°
    • Barrel_01     offset (+42.0, -401.5)  dist 403.7px  angle -84.0°
```

Options:

```
--out <path>    Custom output path (default: <input>.points.json)
--compact       Minified JSON output
```

### 3. Use in Phaser 3 or Phaser 4

Copy `lib/AttachmentPoints.ts` into your project's source tree.

```typescript
// preload()
this.load.json('turret_points', 'assets/Turret_1.points.json');
this.load.image('turret', 'assets/Turret_1-sheet.png');

// create()
const sprite = this.add.sprite(400, 300, 'turret');
const points = AttachmentPoints.fromCache(this, 'turret_points', sprite);
// ↑ also calls sprite.setOrigin() automatically

// update() / fire logic
const barrel = points.get('Barrel_01');  // Phaser.Math.Vector2, world space
this.spawnProjectile(barrel.x, barrel.y, sprite.angle);
```

---

## .points.json Format

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
      "raw":       { "x": 141.0, "y": 20.5  },
      "offset":    { "x": 42.0,  "y": -401.5 },
      "distance":  403.69,
      "angle_deg": -84.03
    }
  ]
}
```

`offset` is in **sprite-local space** (`+x` right, `+y` down).
`AttachmentPoints.get()` rotates it by the live sprite's angle before returning world coords.

---

## Workflow for New Sprites

1. Add slices in Aseprite → export JSON.
2. `python aseprite_slices_to_points.py <file>.json`
3. Commit `<file>.points.json` alongside the spritesheet PNG.
4. Load with `AttachmentPoints.fromCache()` in your scene.

No new code needed — only new data files.

---

## Known Limitations

**Per-frame slice positions:** The converter reads only frame 0 bounds for each slice.
Animated sprites with per-frame attachment point variation are not yet fully supported.
Static sprites and sprites where attachment positions do not change across frames
are fully supported.

---

## Agent Skill

`ATTACHMENT_POINTS_SKILL.md` is a self-contained reference document.
Add it to your AI agent's context at the start of any session that involves sprite
attachment points.  The agent will understand the full system without any re-explanation.
