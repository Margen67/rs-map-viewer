#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
project_dir="$PWD"
revision=fd11813208272b4271d92bd92feb8f3fdbe61be5
# The source and toolchain are build dependencies, never ROM assets.
source_dir="${LIBSM64_SOURCE:-$project_dir/.cache/libsm64}"
if ! command -v emcc >/dev/null; then
    echo 'Install Emscripten 4.0.19 and source emsdk_env.sh before building.' >&2
    exit 1
fi
if [ ! -d "$source_dir/.git" ]; then
    git clone --no-checkout https://github.com/libsm64/libsm64.git "$source_dir"
    git -C "$source_dir" checkout --detach "$revision"
fi
if [ "$(git -C "$source_dir" rev-parse HEAD)" != "$revision" ]; then
    echo "libsm64 must be checked out at $revision (source: $source_dir)." >&2
    exit 1
fi
make -C "$source_dir" src/decomp/mario/geo.inc.c
sources=()
for dir in src src/decomp src/decomp/engine src/decomp/include/PR src/decomp/game \
    src/decomp/pc src/decomp/pc/audio src/decomp/mario src/decomp/tools src/decomp/audio; do
    for file in "$source_dir/$dir/"*.c; do
        [ ! -f "$file" ] || sources+=("$file")
    done
done
mkdir -p public/libsm64
emcc "${sources[@]}" scripts/libsm64/bridge.c \
    -I "$source_dir/src" -I "$source_dir/src/decomp/include" \
    -fno-strict-aliasing -DGBI_FLOATS -DVERSION_US -DNO_SEGMENTED_MEMORY \
    -Wno-incompatible-pointer-types -O2 -lm --no-entry \
    -sMODULARIZE=1 -sEXPORT_NAME=createLibSM64 -sENVIRONMENT=web,node \
    -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 \
    '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAP32","HEAPF32","HEAP16"]' \
    '-sEXPORTED_FUNCTIONS=["_malloc","_free","_rs64_init","_rs64_terminate","_rs64_surfaces","_rs64_floor","_rs64_spawn","_rs64_tick","_rs64_move","_rs64_position","_rs64_health","_rs64_triangles","_rs64_buffer","_rs64_audio_buffer","_rs64_audio_tick","_rs64_music"]' \
    -o public/libsm64/libsm64.js
cp "$source_dir/LICENSE.md" public/libsm64/LICENSE.md
