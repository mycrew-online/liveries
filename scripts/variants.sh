#!/bin/sh
# Bakes and previews livery variants on one type at draft resolution.
#   scripts/variants.sh <type> <design-variant> [...]   e.g. a319 wanted-a mycrew-b
set -e
cd "$(dirname "$0")/.."
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
W=$(cygpath -m "$PWD")
type=$1; shift
for d in "$@"; do
  node scripts/render-art.mjs "$d" "$type" "work/art/$d-$type" 100 >/dev/null
  "$B" -b --factory-startup --python blender/bake.py -- "$(node scripts/job.mjs "$d" "$type" 2048)" >/dev/null 2>&1
  "$B" -b --factory-startup --python blender/preview.py -- "$W/work/$type" "$W/work/prev/$d-$type" "$W/work/bake/$d-$type-2k" "$W/work/tex2k" 2>&1 | grep -E "Error|Traceback" || true
  echo "done $d $(ls work/prev/$d-$type | tr '\n' ' ')"
done
