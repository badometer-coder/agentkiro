#!/bin/bash
set -e

echo "🚀 Building Agent Swarm for Render..."

# Install dependencies
npm install

# Clone Proximity app using SSH key or token
PROXIMITY_REPO="git@github.com:badometer-coder/proximity-app.git"
PROXIMITY_PATH="/opt/render/project/proximity-app"

if [ ! -d "$PROXIMITY_PATH/.git" ]; then
  echo "📦 Cloning Proximity app..."
  git clone "$PROXIMITY_REPO" "$PROXIMITY_PATH" || echo "⚠️ Could not clone - will try at runtime"
else
  echo "📦 Proximity app already cloned"
  cd "$PROXIMITY_PATH" && git pull origin main || echo "⚠️ Could not pull latest"
  cd /opt/render/project/src
fi

echo "✅ Build complete!"
