#include "libsm64.h"
#include <stdlib.h>
#include <string.h>

/* Keep the C ABI (struct layout and padding) on the C side of the WASM boundary. */
static uint8_t texture[SM64_TEXTURE_WIDTH * SM64_TEXTURE_HEIGHT * 4];
static float positions[SM64_GEO_MAX_TRIANGLES * 9];
static float normals[SM64_GEO_MAX_TRIANGLES * 9];
static float colors[SM64_GEO_MAX_TRIANGLES * 9];
static float uvs[SM64_GEO_MAX_TRIANGLES * 6];
static struct SM64MarioGeometryBuffers geometry = {positions, normals, colors, uvs, 0};
static struct SM64MarioState state;
static int32_t mario = -1;
static int16_t audio[544 * 2 * 2];

uint8_t *rs64_init(const uint8_t *rom) {
    sm64_global_init(rom, texture);
    sm64_audio_init(rom);
    return texture;
}

int16_t *rs64_audio_buffer(void) { return audio; }
uint32_t rs64_audio_tick(uint32_t queued) {
    /* libsm64 produces two chunks of stereo frames per call, at 32 kHz. */
    return sm64_audio_tick(queued, 1100, audio) * 2;
}
void rs64_music(int enabled) {
    if (enabled) sm64_play_music(0, 3, 0); /* SEQ_LEVEL_GRASS */
    else sm64_stop_background_music(3);
}

void rs64_terminate(void) {
    if (mario >= 0) sm64_mario_delete(mario);
    mario = -1;
    geometry.numTrianglesUsed = 0;
    sm64_global_terminate();
}

int rs64_surfaces(const int32_t *vertices, uint32_t count) {
    struct SM64Surface *surfaces = calloc(count, sizeof(*surfaces));
    if (count && !surfaces) return 0;
    for (uint32_t i = 0; i < count; ++i)
        memcpy(surfaces[i].vertices, vertices + i * 9, 9 * sizeof(int32_t));
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
}

void rs64_move(float x, float y, float z) {
    sm64_set_mario_position(mario, x, y, z);
    state.position[0] = x;
    state.position[1] = y;
    state.position[2] = z;
    geometry.numTrianglesUsed = 0;
}

float *rs64_position(void) { return state.position; }
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
