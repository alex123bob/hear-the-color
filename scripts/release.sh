#!/bin/bash
# Run on your laptop: bump the version, tag it and push. The "release" GitHub Action then builds dist/ and
# publishes it as a release asset.
# Usage: ./scripts/release.sh [patch|minor|major]   (default: patch)

set -euo pipefail
cd "$(dirname "$0")/.."

BUMP="${1:-patch}"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean. Commit or stash your changes first."
  exit 1
fi
if [ "$(git branch --show-current)" != "main" ]; then
  echo "Release from the main branch."
  exit 1
fi

git pull --ff-only
# Fail early if the project does not build
npm ci --silent
npm run build >/dev/null

# Updates package.json / package-lock.json, commits, and creates the v<version> tag
npm version "$BUMP" -m "Release v%s"
git push origin main --follow-tags

TAG="v$(node -p "require('./package.json').version")"
echo
echo "Pushed $TAG. The GitHub Action is building it:"
echo "  gh run watch   (or open https://github.com/alex123bob/hear-the-color/actions)"
echo "When it is done, run on the server:  ./scripts/server-deploy.sh"
