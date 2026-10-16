#!/bin/bash
# Build and upload the static frontend to the server.
# Usage: DEPLOY_TARGET=user@host:/home/alex123bobo/hear-the-color/ ./deploy.sh

set -e

if [ -z "$DEPLOY_TARGET" ]; then
  echo "Set DEPLOY_TARGET, e.g. DEPLOY_TARGET=user@host:/home/alex123bobo/hear-the-color/ ./deploy.sh"
  exit 1
fi

[ -d node_modules ] || npm install
npm run build
rsync -avz --delete dist/ "$DEPLOY_TARGET"
echo "Deployed. Open https://lijialab.com/hear-the-color/"
