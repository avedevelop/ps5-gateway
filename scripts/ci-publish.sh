#!/bin/sh
# Used by the release workflow: attach one archive to the release for this tag (creating the release if it is not there
# yet) and rebuild SHA256SUMS.txt from every archive attached so far. Each platform calls it when its own build is done,
# so a slow runner for one system never holds back the other.
#   sh scripts/ci-publish.sh dist/ps5-gateway-windows-v1.2.1.zip
set -eu
tag="${GITHUB_REF_NAME:?run this inside the release workflow}"
file="${1:?archive path}"
if ! gh release view "$tag" >/dev/null 2>&1; then
  # the other platform may create it at the same moment: if ours fails, the release exists by now
  gh release create "$tag" --title "PS5 Gateway $tag" --generate-notes >/dev/null 2>&1 || gh release view "$tag" >/dev/null
fi
gh release upload "$tag" "$file" --clobber
d=$(mktemp -d)
gh release download "$tag" --dir "$d" --pattern 'ps5-gateway-*'
(cd "$d" && sha256sum ps5-gateway-* > SHA256SUMS.txt && cat SHA256SUMS.txt)
gh release upload "$tag" "$d/SHA256SUMS.txt" --clobber
