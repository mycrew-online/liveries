#!/bin/sh
# Blender 5.2 in the background at below-normal priority on 4 threads, so a
# running sim keeps the CPU:  scripts/blender-low.sh [blender args...]
exec cmd //c start '""' //belownormal //b //wait "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -t 4 "$@"
