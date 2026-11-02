#!/bin/sh
# Cessna 172 G1000 (MSFS 2024) MyCrew liveries, from design to package sources.
#   scripts/c172-package.sh build     art -> textures -> decal glTF -> checks, thumbnails
#   scripts/c172-package.sh sources   copy into c172/PackageSources
#   scripts/c172-package.sh compile   fspackagetool (MSFS 2024 must be closed)
# Position maps and geometry (once, or after the kit's .blend changes):
#   scripts/blender-low.sh -b --python blender/c172_posmap.py -- work/c172/posmap work/ref
# Nothing here installs into Community.
set -e
cd "$(dirname "$0")/.."
W=$(cygpath -m "$PWD")
B=scripts/blender-low.sh
# variant:registration:livery name
LIVERIES="a:OK-MCA:Cheatline b:OK-MCB:Navy Tail c:OK-MCC:Hex Trail"
SRC=c172/PackageSources/SimObjects/Airplanes/asobo_c172sp_g1000/Liveries/MyCrew

each() { echo "$LIVERIES" | sed 's/ \([a-z]\):/\n\1:/g'; }

case "$1" in
build)
	each | while IFS=: read v reg name; do
		d=mycrew172-$v
		node scripts/render-art.mjs $d c172 work/art/$d 500 --proof
		$B -b --factory-startup --python "$W/blender/c172_composite.py" -- "$W/work/c172/posmap" "$W/work/ref/c172.json" "$W/work/art/$d" "$W/work/c172/tex/$d" | grep -E "TEX|Error"
		$B -b --python "$W/blender/c172_preview.py" -- "$W/work/c172/tex/$d/preview" "$W/work/c172/prev/$d" | grep -E "Error" || true
		rm -rf "work/c172/export/$d"
		$B -b --factory-startup --python "$W/blender/c172_export.py" -- "$W/work/c172/tex/$d" "$W/work/c172/export/$d" | grep -E "EXPORTED|Error"
		$B -b --python "$W/blender/c172_verify.py" -- "$W/work/c172/export/$d" "$W/work/c172/verify/$d" | grep -E "WORST|Error"
	done ;;
sources)
	each | while IFS=: read v reg name; do
		d=mycrew172-$v id=$(echo "mycrew-c172-$reg" | tr 'A-Z' 'a-z')
		L=$SRC/$id
		rm -rf "$L"; mkdir -p "$L/thumbnail"
		cp -r work/c172/export/$d/. "$L/"
		cp work/c172/verify/$d/thumbnail/*.png "$L/thumbnail/"
		cat > "$L/livery.cfg" <<CFG
[Version]
major = 1
minor = 0

[General]
name = "MyCrew $name $reg"

[Selection]
required_tags = "wheels"
CFG
		echo "sources $L"
	done ;;
compile)
	if tasklist //FI "IMAGENAME eq FlightSimulator2024.exe" | grep -qi FlightSimulator2024; then
		echo "MSFS 2024 is running: close it before compiling" >&2
		exit 1
	fi
	"/c/MSFS 2024 SDK/Tools/bin/fspackagetool.exe" "$(cygpath -w "$PWD/c172/MyCrewC172.xml")" -nopause -rebuild || true
	cat "$APPDATA/Microsoft Flight Simulator 2024/BuilderLogError.txt" 2>/dev/null || true
	find c172/Packages -type f ;;
*) sed -n 2,8p "$0"; exit 1 ;;
esac
