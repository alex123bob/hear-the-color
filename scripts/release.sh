#!/bin/bash
# Run on your laptop: check the build, bump the version and commit it. It does NOT tag or push:
#   1. push the commit with GitHub Desktop
#   2. GitHub -> Actions -> release -> Run workflow (it creates the v<version> tag and the release)
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

# Bump package.json / package-lock.json only; the tag is created later by the GitHub Action
VERSION=$(npm version "$BUMP" --no-git-tag-version | tr -d 'v')
git add package.json package-lock.json
git commit -q -m "Release v$VERSION"

echo
echo "Committed 'Release v$VERSION'. Next:"
echo "  1. Push it with GitHub Desktop"
echo "  2. GitHub -> Actions -> release -> Run workflow (branch: main, tag: leave empty)"
echo "  3. On the server:  ./server-deploy.sh"
