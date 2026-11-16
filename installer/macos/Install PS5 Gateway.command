#!/bin/bash
# Double-click to install PS5 Gateway. Runs install.sh next to this file.
cd "$(dirname "$0")" || exit 1
sh ./install.sh "$@"
status=$?
echo
read -n 1 -s -r -p "Press any key to close this window..."
exit $status
