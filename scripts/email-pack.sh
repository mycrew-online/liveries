#!/bin/sh
# Email-size copy of the hero shots: WebP (transparent), long side 1920 px,
# zipped into one attachment.
#   scripts/email-pack.sh [size=1920] [quality=85]  -> dist/screenshots-email.zip
set -e
cd "$(dirname "$0")/.."
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
W=$(cygpath -m "$PWD")
out=dist/screenshots-email
rm -rf $out $out.zip
"$B" -b --factory-startup --python blender/shrink.py -- "$W/dist/screenshots" "$W/$out" ${1:-1920} ${2:-85} 2>&1 | grep -E "Error|Traceback" || true
powershell -NoProfile -Command "Compress-Archive -Path '$(cygpath -w "$PWD/$out")\\*' -DestinationPath '$(cygpath -w "$PWD/$out.zip")'"
echo "$(find $out -name '*.webp' | wc -l) shots, $(du -h $out.zip | cut -f1)"
