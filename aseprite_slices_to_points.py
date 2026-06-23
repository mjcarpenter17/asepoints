"""
aseprite_slices_to_points.py
----------------------------
Converts Aseprite JSON slice exports into a .points.json file —
a clean, game-engine-agnostic attachment points schema.

Usage:
    python aseprite_slices_to_points.py <input.json> [--out <output.points.json>]

Examples:
    python aseprite_slices_to_points.py Asset_Examples/Turret_1.json
    python aseprite_slices_to_points.py Asset_Examples/Turret_1.json --out my_turret.points.json
Output schema:  See schema/attachment_points.schema.json
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Schema version — bump when the output format changes
# ---------------------------------------------------------------------------
SCHEMA_VERSION = "1.0"

# The slice name that marks the rotation/anchor origin.
# Change this if your Aseprite convention uses a different name.
ORIGIN_SLICE_NAME = "Origin"


def _center(bounds: dict) -> tuple[float, float]:
    """Return the pixel-center of an Aseprite bounds rect."""
    return bounds["x"] + bounds["w"] / 2, bounds["y"] + bounds["h"] / 2


def convert(aseprite_json: dict) -> dict:
    """
    Given a parsed Aseprite JSON dict, return a .points.json dict.

    Raises:
        ValueError  — if the JSON is missing expected structure, or if
                      no Origin slice is found.
    """
    meta = aseprite_json.get("meta")
    if meta is None:
        raise ValueError("Input JSON has no 'meta' key — is this a valid Aseprite export?")

    slices: list[dict] = meta.get("slices", [])
    if not slices:
        raise ValueError("No slices found in meta.slices.")

    sprite_size = meta.get("size", {})
    sprite_w = sprite_size.get("w", 0)
    sprite_h = sprite_size.get("h", 0)
    image_file = meta.get("image", "")

    # ------------------------------------------------------------------
    # Locate the Origin slice
    # ------------------------------------------------------------------
    origin_slice = next((s for s in slices if s["name"] == ORIGIN_SLICE_NAME), None)
    if origin_slice is None:
        raise ValueError(
            f"No slice named '{ORIGIN_SLICE_NAME}' found. "
            "Add an Origin slice in Aseprite to mark the pivot/rotation center."
        )

    origin_bounds = origin_slice["keys"][0]["bounds"]
    ox, oy = _center(origin_bounds)

    # Normalized Phaser origin (0–1 range)
    phaser_origin_x = round(ox / sprite_w, 6) if sprite_w else 0.0
    phaser_origin_y = round(oy / sprite_h, 6) if sprite_h else 0.0

    # ------------------------------------------------------------------
    # Build attachment points (all slices except Origin)
    # ------------------------------------------------------------------
    attachment_points: list[dict] = []

    for sl in slices:
        if sl["name"] == ORIGIN_SLICE_NAME:
            continue

        # NOTE: Per-frame slice support is not implemented.
        # Aseprite slices can define different bounds per animation frame via multiple
        # keys (e.g. keys[0], keys[1], ...). This converter reads only the first key
        # (frame 0) for each slice.
        # For static sprites and single-frame sprites this is correct.
        # For animated sprites where attachment positions shift across frames (e.g. a
        # recoil animation), a future version of this tool will need to output a
        # per-frame points array rather than a single offset per point.
        bounds = sl["keys"][0]["bounds"]
        px, py = _center(bounds)

        offset_x = round(px - ox, 4)
        offset_y = round(py - oy, 4)
        distance = round(math.hypot(offset_x, offset_y), 4)
        angle_deg = round(math.degrees(math.atan2(offset_y, offset_x)), 4)

        attachment_points.append(
            {
                "name": sl["name"],
                "raw": {"x": px, "y": py},
                "offset": {"x": offset_x, "y": offset_y},
                "distance": distance,
                "angle_deg": angle_deg,
            }
        )

    # ------------------------------------------------------------------
    # Assemble output document
    # ------------------------------------------------------------------
    output = {
        "_schema": f"attachment_points/{SCHEMA_VERSION}",
        "source_image": image_file,
        "sprite_size": {"w": sprite_w, "h": sprite_h},
        "origin": {
            "raw": {"x": ox, "y": oy},
            "phaser_origin": {"x": phaser_origin_x, "y": phaser_origin_y},
        },
        "attachment_points": attachment_points,
    }

    return output


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert an Aseprite slice JSON export to a .points.json attachment file."
    )
    parser.add_argument("input", help="Path to the Aseprite-exported .json file")
    parser.add_argument(
        "--out",
        default=None,
        help=(
            "Output path for the .points.json file. "
            "Defaults to <input_stem>.points.json next to the input file."
        ),
    )
    parser.add_argument(
        "--compact",
        action="store_true",
        default=False,
        help="Write compact (minified) JSON instead of the default pretty-printed output.",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    try:
        aseprite_json = json.loads(input_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"ERROR: Could not parse JSON — {e}", file=sys.stderr)
        sys.exit(1)

    try:
        result = convert(aseprite_json)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    # Determine output path
    if args.out:
        out_path = Path(args.out)
    else:
        out_path = input_path.with_suffix(".points.json")

    indent = None if args.compact else 2
    out_path.write_text(json.dumps(result, indent=indent), encoding="utf-8")

    print(f"Written: {out_path}")
    print(f"  Sprite size : {result['sprite_size']['w']} x {result['sprite_size']['h']}")
    print(
        f"  Origin      : ({result['origin']['raw']['x']}, {result['origin']['raw']['y']})  "
        f"→  Phaser setOrigin({result['origin']['phaser_origin']['x']}, "
        f"{result['origin']['phaser_origin']['y']})"
    )
    print(f"  Points      : {len(result['attachment_points'])}")
    for pt in result["attachment_points"]:
        print(
            f"    • {pt['name']:<20}  offset ({pt['offset']['x']:+.1f}, {pt['offset']['y']:+.1f})  "
            f"dist {pt['distance']:.1f}px  angle {pt['angle_deg']:.1f}°"
        )


if __name__ == "__main__":
    main()
