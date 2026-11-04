"""Scale horizontal displacement inside native collision steps, never the simulation clock.

World speed and acceleration scale together. Native velocity remains in Mario's
normal units, keeping gravity, jump height, animation and action timers unchanged.
"""
from pathlib import Path
import sys

root = Path(sys.argv[1]) / "src/decomp/game"
for filename, replacements in {
    "mario_step.c": [
        ("(m->vel[0] / 4.0f)", "(m->vel[0] * rs64_movement_scale() / 4.0f)"),
        ("(m->vel[2] / 4.0f)", "(m->vel[2] * rs64_movement_scale() / 4.0f)"),
        ("m->pos[0] + m->vel[0] / 4.0f", "m->pos[0] + m->vel[0] * rs64_movement_scale() / 4.0f"),
        ("m->pos[2] + m->vel[2] / 4.0f", "m->pos[2] + m->vel[2] * rs64_movement_scale() / 4.0f"),
    ],
    "mario_actions_submerged.c": [
        ("m->pos[0] + step[0]", "m->pos[0] + step[0] * rs64_movement_scale()"),
        ("m->pos[2] + step[2]", "m->pos[2] + step[2] * rs64_movement_scale()"),
    ],
}.items():
    text = (root / filename).read_text()
    for old, new in replacements:
        if text.count(old) != 1:
            raise RuntimeError(f"Pinned movement source changed: {filename}: {old}")
        text = text.replace(old, new)
    text = "extern float rs64_movement_scale(void);\n" + text
    (root / (".viewer-" + filename)).write_text(text)
