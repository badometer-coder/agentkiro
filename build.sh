#!/bin/bash
set -e

echo "🚀 Building Agent Swarm for Render..."

# Install dependencies
npm install

# Create Proximity app directory if needed
mkdir -p /opt/render/project/proximity-app-final

# Clone Proximity app if not exists
if [ ! -d "/opt/render/project/proximity-app-final/.git" ]; then
  echo "📦 Cloning Proximity app..."
  git clone https://github.com/YOUR_GITHUB_USER/proximity-app-final /opt/render/project/proximity-app-final || echo "⚠️ Could not clone - using local copy"
fi

echo "✅ Build complete!"
