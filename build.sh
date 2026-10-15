#!/bin/bash
set -e

echo "🚀 Building Agent Swarm for Render..."

# Install dependencies
npm install

# Clone Proximity app using HTTPS token
PROXIMITY_PATH="/opt/render/project/proximity-app"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
REPO="badometer-coder/proximity-app"

if [ -n "$GITHUB_TOKEN" ]; then
  CLONE_URL="https://${GITHUB_TOKEN}@github.com/${REPO}.git"
  
  if [ ! -d "$PROXIMITY_PATH/.git" ]; then
    echo "📦 Cloning Proximity app..."
    git clone "$CLONE_URL" "$PROXIMITY_PATH" && echo "✅ Cloned successfully" || echo "⚠️ Clone failed"
  else
    echo "📦 Pulling latest Proximity app..."
    cd "$PROXIMITY_PATH"
    git remote set-url origin "$CLONE_URL"
    git pull origin main || echo "⚠️ Pull failed"
    cd /opt/render/project/src
  fi
else
  echo "⚠️ GITHUB_TOKEN not set - skipping clone"
  mkdir -p "$PROXIMITY_PATH"
fi

echo "✅ Build complete!"
