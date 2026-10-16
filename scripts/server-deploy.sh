#!/bin/bash
# Run on the server (needs only curl and tar, no Node): download a release and switch Nginx's folder to it.
# Usage: ./server-deploy.sh [tag]      (default: the latest release, e.g. ./server-deploy.sh v0.2.0)
#
# Layout it creates under $BASE (default /home/alex123bobo/hear-the-color):
#   releases/<tag>/   one folder per release
#   dist -> releases/<tag>   symlink that Nginx serves; switching it is instant and rolling back is one command

set -euo pipefail

REPO="alex123bob/hear-the-color"
BASE="${BASE:-/home/alex123bobo/hear-the-color}"
TAG="${1:-}"

if [ -z "$TAG" ]; then
  # The "latest" redirect avoids the API and any rate limit; the tag is the last path segment
  TAG=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest")
  TAG="${TAG##*/}"
fi
case "$TAG" in v[0-9]*) ;; *) echo "Could not determine a release tag (got '$TAG'). Has a release been published?"; exit 1;; esac

DEST="$BASE/releases/$TAG"
mkdir -p "$BASE/releases"

if [ -d "$DEST" ]; then
  echo "$TAG is already downloaded."
else
  echo "Downloading $TAG ..."
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  curl -fsSL -o "$TMP/dist.tar.gz" "https://github.com/$REPO/releases/download/$TAG/hear-the-color-dist.tar.gz"
  mkdir -p "$TMP/dist"
  tar -xzf "$TMP/dist.tar.gz" -C "$TMP/dist"
  [ -f "$TMP/dist/index.html" ] || { echo "Archive has no index.html, aborting."; exit 1; }
  mv "$TMP/dist" "$DEST"
  # Nginx (a different user) must be able to read the files
  chmod -R a+rX "$DEST"
fi

# Point dist at the new release. "ln -sfn" replaces an existing symlink in place; it refuses to touch a real
# directory, which would otherwise end up with the link created inside it.
if [ -e "$BASE/dist" ] && [ ! -L "$BASE/dist" ]; then
  echo "$BASE/dist is a real directory (from an earlier manual copy). Move it away first:"
  echo "  mv $BASE/dist $BASE/dist.manual-backup"
  exit 1
fi
ln -sfn "$DEST" "$BASE/dist"

# Keep the 5 most recent releases, never deleting the one that is live
ls -1dt "$BASE"/releases/v* 2>/dev/null | tail -n +6 | grep -vxF "$DEST" | xargs -r rm -rf

echo "Deployed $TAG -> $BASE/dist"
echo "Open https://lijialab.com/hear-the-color/ (hard-refresh if you still see the old version)."
echo "Rollback: ./server-deploy.sh <older-tag>   (releases kept: $(ls -1 "$BASE/releases" | tr '\n' ' '))"
