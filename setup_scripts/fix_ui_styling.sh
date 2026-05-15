#!/bin/bash

echo "Creating postcss.config.js..."
cat << 'EOF' > postcss.config.js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

echo "Staging files..."
git add postcss.config.js

echo "Committing..."
git commit -m "fix: add postcss config to compile tailwind css"

echo "Pushing to GitHub..."
git push origin main

echo "UI patch deployed!"
