#include "libsm64.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "decomp/include/surface_terrains.h"
#include "decomp/include/sm64.h"
#include "decomp/include/audio_defines.h"
#include "decomp/tools/libmio0.h"
#include "decomp/global_state.h"
#include "decomp/engine/surface_collision.h"

/* Keep the C ABI (struct layout and padding) on the C side of the WASM boundary. */
static uint8_t texture[SM64_TEXTURE_WIDTH * SM64_TEXTURE_HEIGHT * 4];
static float positions[SM64_GEO_MAX_TRIANGLES * 9];
static float normals[SM64_GEO_MAX_TRIANGLES * 9];
static float colors[SM64_GEO_MAX_TRIANGLES * 9];
static float uvs[SM64_GEO_MAX_TRIANGLES * 6];
static struct SM64MarioGeometryBuffers geometry = {positions, normals, colors, uvs, 0};
static struct SM64MarioState state;
static int32_t mario = -1;
static int song = 3;
static float effects_volume = .5f, music_volume = .3f;
void rs64_volumes(float effects, float music) {effects_volume=fminf(1,fmaxf(0,effects));music_volume=fminf(1,fmaxf(0,music));}
float rs64_sequence_volume(int player) {return player == 2 ? effects_volume : music_volume;}
static float movement_scale = 1.0f;
void rs64_speed(float value) { movement_scale = fminf(3.0f, fmaxf(0.25f, value)); }
static float shore_clearance = -11000;
float rs64_movement_scale(void) {
    /* Rise clear of the bank before moving over its top face; do not snap up through it. */
    if (mario >= 0 && shore_clearance > -10000 && g_state->mgMarioStateVal.action == ACT_WATER_JUMP
        && g_state->mgMarioStateVal.pos[1] < shore_clearance + 5 && g_state->mgMarioStateVal.vel[1] >= 0) return 0;
    return movement_scale;
}
static float water_bottom = -11000;
static int has_water = 0;
static struct SM64SurfaceCollisionData *burning_floor = NULL;
static int16_t audio[544 * 2 * 2];
static uint8_t effects[640 * 32 * 4];

/* US ROM offsets from n64decomp/sm64 assets.json. No extracted assets are shipped. */
static void load_effects(const uint8_t *rom) {
    const uint32_t segments[] = {1132368, 2102288};
    for (int segment = 0; segment < 2; ++segment) {
        mio0_header_t header;
        mio0_decode_header(rom + segments[segment], &header);
        uint8_t *data = malloc(header.dest_size);
        mio0_decode(rom + segments[segment], data, NULL);
        for (int frame = segment ? 19 : 0; frame < (segment ? 20 : 19); ++frame) {
            int rgba = frame >= 13 && frame < 19;
            uint32_t offset = frame < 7 ? 122528 + frame * 2048 :
                frame < 13 ? 139592 + (frame - 7) * 2048 :
                frame < 19 ? 160912 + (frame - 13) * 2048 : 128;
            for (int y = 0; y < 32; ++y) for (int x = 0; x < 32; ++x) {
                const uint8_t *pixel = data + offset + (y * 32 + x) * 2;
                uint8_t *out = effects + (y * 640 + frame * 32 + x) * 4;
                if (rgba) {
                    uint16_t value = (pixel[0] << 8) | pixel[1];
                    out[0] = ((value >> 11) & 31) * 255 / 31;
                    out[1] = ((value >> 6) & 31) * 255 / 31;
                    out[2] = ((value >> 1) & 31) * 255 / 31;
                    out[3] = (value & 1) ? 255 : 0;
                } else {
                    out[0] = out[1] = out[2] = pixel[0]; out[3] = pixel[1];
                }
            }
        }
        free(data);
    }
}

uint8_t *rs64_init(const uint8_t *rom) {
    sm64_global_init(rom, texture);
    sm64_audio_init(rom);
    load_effects(rom);
    return texture;
}

int16_t *rs64_audio_buffer(void) { return audio; }
uint32_t rs64_audio_tick(uint32_t queued) {
    /* libsm64 produces two chunks of stereo frames per call, at 32 kHz. */
    return sm64_audio_tick(queued, 1100, audio) * 2;
}
void rs64_music(int enabled) {
    if (enabled) sm64_play_music(0, song, 0);
    else sm64_stop_background_music(song);
}
void rs64_song(int sequence) {
    sm64_stop_background_music(song);
    if (sequence >= 2 && sequence <= 33) song = sequence;
}
void rs64_environment(float water, float bottom, float lava) {
    if (mario < 0) return;
    if (burning_floor) { burning_floor->type = SURFACE_NOT_SLIPPERY; burning_floor = NULL; }
    sm64_set_mario_water_level(mario, (int)water);
    has_water = water > -10000;
    water_bottom = bottom;
    struct MarioState *m = &g_state->mgMarioStateVal;
    if (lava > -10000 && m->floor && fabsf(m->floorHeight - lava) < 8) {
        burning_floor = m->floor;
        burning_floor->type = SURFACE_BURNING;
    }
}

void rs64_terminate(void) {
    if (mario >= 0) sm64_mario_delete(mario);
    mario = -1;
    geometry.numTrianglesUsed = 0;
    burning_floor = NULL;
    has_water = 0;
    shore_clearance = -11000;
    sm64_global_terminate();
}

int rs64_surfaces(const int32_t *vertices, uint32_t count) {
    burning_floor = NULL;
    struct SM64Surface *surfaces = calloc(count, sizeof(*surfaces));
    if (count && !surfaces) return 0;
    for (uint32_t i = 0; i < count; ++i) {
        surfaces[i].type = SURFACE_NOT_SLIPPERY;
        surfaces[i].terrain = TERRAIN_GRASS;
        memcpy(surfaces[i].vertices, vertices + i * 9, 9 * sizeof(int32_t));
    }
    if (mario >= 0) {
        /* Streaming/rebasing replaces the native surface allocation. Do not retain contacts into it. */
        sm64_set_mario_position(mario, state.position[0], state.position[1], state.position[2]);
        g_state->mgMarioStateVal.floor = NULL;
        g_state->mgMarioStateVal.ceil = NULL;
        g_state->mgMarioStateVal.wall = NULL;
        g_state->mgMarioObject->platform = NULL;
    }
    sm64_static_surfaces_load(surfaces, count);
    free(surfaces);
    return 1;
}

float rs64_floor(float x, float y, float z) {
    return sm64_surface_find_floor_height(x, y, z);
}

int rs64_spawn(float x, float y, float z) {
    if (mario >= 0) sm64_mario_delete(mario);
    mario = sm64_mario_create(x, y, z);
    memset(&state, 0, sizeof(state));
    state.position[0] = x;
    state.position[1] = y;
    state.position[2] = z;
    geometry.numTrianglesUsed = 0;
    return mario;
}

void rs64_tick(float camX, float camZ, float stickX, float stickY, int a, int b, int z) {
    const struct SM64MarioInputs inputs = {camX, camZ, stickX, stickY, a != 0, b != 0, z != 0};
    sm64_mario_tick(mario, &inputs, &state, &geometry);
    if (state.action != ACT_WATER_JUMP) shore_clearance = -11000;
    if (has_water && state.position[1] < water_bottom + 10) {
        sm64_set_mario_position(mario, state.position[0], water_bottom + 10, state.position[2]);
        state.position[1] = water_bottom + 10;
        sm64_set_mario_velocity(mario, state.velocity[0], fmaxf(0, state.velocity[1]), state.velocity[2]);
    }
}

void rs64_move(float x, float y, float z) {
    float dx = x - state.position[0], dy = y - state.position[1], dz = z - state.position[2];
    sm64_set_mario_position(mario, x, y, z);
    state.position[0] = x;
    state.position[1] = y;
    state.position[2] = z;
    /* Keep the last pose visible during paused size changes and coordinate rebasing. */
    for (int i = 0; i < geometry.numTrianglesUsed * 9; i += 3) {
        positions[i] += dx; positions[i + 1] += dy; positions[i + 2] += dz;
    }
}

float *rs64_position(void) { return state.position; }
float *rs64_velocity(void) { return state.velocity; }
uint32_t rs64_action(void) { return state.action; }
uint32_t rs64_particles(void) { return state.particleFlags; }
uint8_t *rs64_effects(void) { return effects; }
int rs64_attack(float x, float y, float z, float height) {
    return sm64_mario_attack(mario, x, y, z, height);
}
void rs64_stomp(float x, float y, float z) {
    rs64_move(x, y + 5, z);
    state.velocity[1] = 30;
    sm64_set_mario_action(mario, ACT_JUMP);
    sm64_set_mario_velocity(mario, state.velocity[0], 30, state.velocity[2]);
    sm64_play_sound_global(SOUND_ACTION_BOUNCE_OFF_OBJECT);
}
int rs64_shore_jump(float x, float z, float water) {
    if (mario < 0) return 0;
    struct MarioState *m = &g_state->mgMarioStateVal;
    if (!(m->action & ACT_FLAG_SWIMMING)) return 0;
    struct SM64SurfaceCollisionData *floor = NULL;
    float height = find_floor(x, water + 150, z, &floor);
    if (!floor || floor->normal.y < 0.5f || floor->type == SURFACE_BURNING || height < water - 40 || height > water + 140) return 0;
    float dx = x - m->pos[0], dz = z - m->pos[2];
    if (dx*dx + dz*dz < 0.001f) return 0;
    sm64_set_mario_faceangle(mario, atan2f(dx, dz));
    if (m->pos[1] < water - 100) {
        /* Swim up toward a reachable bank first, rather than launching out of deep water. */
        m->faceAngle[0] = 0x3000;
        sm64_set_mario_forward_velocity(mario, 20);
        return 2;
    }
    shore_clearance = height;
    sm64_set_mario_action(mario, ACT_WATER_JUMP);
    sm64_set_mario_forward_velocity(mario, 20);
    float distance = sqrtf(dx*dx + dz*dz);
    sm64_set_mario_velocity(mario, dx/distance*20, 44, dz/distance*20);
    return 1;
}
void rs64_door_sound(int open) { sm64_play_sound_global(open ? SOUND_GENERAL_OPEN_WOOD_DOOR : SOUND_GENERAL_CLOSE_WOOD_DOOR); }
void rs64_enemy_sound(void) { sm64_play_sound_global(SOUND_OBJ_DYING_ENEMY1); }
void rs64_push(float dx, float dz) {
    float x = state.position[0] + dx, y = state.position[1], z = state.position[2] + dz;
    sm64_surface_find_wall_collision(&x, &y, &z, 60, 37);
    rs64_move(x, y, z);
}
int rs64_health(void) { return state.health; }
int rs64_triangles(void) { return geometry.numTrianglesUsed; }
float *rs64_buffer(int index) {
    switch (index) {
        case 0: return positions;
        case 1: return normals;
        case 2: return colors;
        default: return uvs;
    }
}
