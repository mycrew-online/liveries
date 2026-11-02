#!/bin/sh
# Photo-style hero shots (transparent PNG, 16:9 + 9:16) of the built liveries.
#   scripts/hero.sh [size] [samples]      -> dist/screenshots/<aircraft>/<livery>/
# BRAND=mycrew renders the MyCrew fleet into dist/screenshots-mycrew (no LJ25).
# THREADS (default 4) caps Blender's CPU threads; sets with all 8 shots are
# skipped, so a stopped run resumes.
set -e
cd "$(dirname "$0")/.."
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
W=$(cygpath -m "$PWD")
size=${1:-3840}; samples=${2:-64}
brand=${BRAND:-wanted}
if [ "$brand" = wanted ]; then shots=screenshots; liveries="a:sweep b:hexagon c:midnight d:flame"
else shots=screenshots-$brand; liveries="a:sweep b:badge c:night-crew d:radar"; fi
shot() { # <aircraft> <livery> <parts> <smooth> <tex dirs...>
  name=$1 liv=$2 parts=$3 smooth=$4; shift 4
  out="$W/dist/$shots/$name/$liv"
  if [ "$(ls "$out" 2>/dev/null | wc -l)" -ge 8 ]; then echo "have $name $liv"; return; fi
  SMOOTH=$smooth "$B" -b --factory-startup -t ${THREADS:-4} --python blender/hero.py -- "$W/work/$parts" "$out" $size $samples "$@" 2>&1 | grep -E "Error|Traceback" || true
  echo "done $name $liv $(ls "$out" | wc -l) shots"
}
for v in $liveries; do
  k=${v%%:*} liv=${v#*:}
  for t in a319 a320 a321; do shot fenix-$t $liv hero/$t "" "$W/work/comp/$brand-$k-$t-8k" "$W/work/tex8k"; done
  shot fbw-a320neo $liv fbw "" "$W/work/comp/$brand-$k-fbw-4k" "$W/work/texfbw-w" "$W/work/texfbw-ov"
  if [ "$brand" = wanted ]; then shot learjet-25 $liv fsltl-lj25 50 "$W/work/comp/wantedjet-$k-fsltl-lj25" "$W/work/texlj25-w"; fi
done
