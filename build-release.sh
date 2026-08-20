#!/usr/bin/env bash
set -euo pipefail

python3 -X utf8 "$(dirname "$0")/packaging/build_macos_release.py" "$@"
