"""Adapt the pinned native collision classifier to RuneScape's slanted wall meshes."""
from pathlib import Path
import sys

source = Path(sys.argv[1]) / "src/decomp/engine/surface_collision.c"
text = source.read_text()
include = '#include "../game/object_stuff.h"'
assert text.count(include) == 1
text = text.replace(include, include + """
/* Stable per-contact normals for the back side of imported thin walls. */
static struct SM64SurfaceCollisionData viewer_wall_contacts[128];
static uint32_t viewer_wall_contact_cursor = 0;
""")
for old, new in [
    ("surf->normal.y >= -0.01f", "surf->normal.y >= -0.5f"),
    ("surf->normal.y <= 0.01f", "surf->normal.y <= 0.5f"),
    ("surf->normal.y < -0.01f || surf->normal.y > 0.01f", "surf->normal.y < -0.5f || surf->normal.y > 0.5f"),
]:
    if text.count(old) != 1:
        raise RuntimeError(f"Pinned collision source changed: {old}")
    text = text.replace(old, new)
# Resolve each wall against the result of the previous wall, avoiding seam over-correction.
start = text.index("static s32 find_wall_collisions_from_list")
head, wall = text[:start], text[start:]
old = "surf = loaded_surface_iter_get_at_index( i, j );"
assert wall.count(old) == 1
wall = wall.replace(old, old + "\n        x = data->x; z = data->z;")
# RuneScape also uses single-plane fences. Resolve to the side Mario approached,
# rather than teleporting a back-side contact through the plane or duplicating faces.
old = """data->x += surf->normal.x * (radius - offset);
        data->z += surf->normal.z * (radius - offset);"""
assert wall.count(old) == 1
wall = wall.replace(old, """f32 side = offset < 0.0f ? -1.0f : 1.0f;
        f32 horizontal = surf->normal.x * surf->normal.x + surf->normal.z * surf->normal.z;
        f32 push = side * (radius - fabsf(offset)) / horizontal;
        data->x += surf->normal.x * push;
        data->z += surf->normal.z * push;""")
old = "data->walls[data->numWalls++] = surf;"
assert wall.count(old) == 1
wall = wall.replace(old, """struct SM64SurfaceCollisionData *contact = &viewer_wall_contacts[viewer_wall_contact_cursor++ % 128];
            *contact = *surf;
            if (side < 0.0f) {
                contact->normal.x *= -1.0f;
                contact->normal.y *= -1.0f;
                contact->normal.z *= -1.0f;
                contact->originOffset *= -1.0f;
            }
            data->walls[data->numWalls++] = contact;""")
source.with_name(".viewer-surface-collision.c").write_text(head + wall)
