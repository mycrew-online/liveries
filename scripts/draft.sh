#!/bin/sh
# Quick draft of design variants on one Fenix type: art, 2K composite, previews.
#   scripts/draft.sh <type> <design-variant> [...]   e.g. a319 wanted-e wanted-f
set -e
cd "$(dirname "$0")/.."
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
W=$(cygpath -m "$PWD")
type=$1; shift
for d in "$@"; do
  node scripts/render-art.mjs "$d" "$type" "$W/work/art/$d-$type-draft" 100 >/dev/null
  "$B" -b --factory-startup --python blender/composite.py -- "$W/work/posmap/$type-2k" "$W/work/tex2k" "$W/work/art/$d-$type-draft" "$W/work/comp/$d-$type-draft" 2>&1 | grep -E "Error|Traceback" || true
  VIEWS=${VIEWS:-side_right,side_left,front34,rear34} "$B" -b --factory-startup --python blender/preview.py -- "$W/work/$type" "$W/work/prev/$d-$type" "$W/work/comp/$d-$type-draft" "$W/work/tex2k" 2>&1 | grep -E "Error|Traceback" || true
  echo "done $d"
done
