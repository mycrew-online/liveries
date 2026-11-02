#!/bin/sh
# Converts the Fenix exterior parts of one variant to plain glTF for Blender.
#   scripts/convert-parts.sh <out dir> <LOD> <part> [<part> ...]
set -e
out=$1; lod=$2; shift 2
pk="$(cygpath "$APPDATA")/Microsoft Flight Simulator 2024/Packages/Community"
mkdir -p "$out"
for part in "$@"; do
  f=$(ls "$pk"/fnx-aircraft-3*/SimObjects/Airplanes/FNX_32X/attachments/fnx/$part/model/*LOD$lod.gltf 2>/dev/null | head -1)
  if [ -z "$f" ]; then echo "skip $part"; continue; fi
  node "$(dirname "$0")/patch-gltf.mjs" "$(cygpath -w "$f")" "$out/$part.gltf"
  echo "ok $part"
done
