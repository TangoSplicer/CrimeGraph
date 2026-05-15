#!/bin/bash

echo "Cleaning up old config files to prevent module conflicts..."
rm -f postcss.config.js tailwind.config.js

echo "Creating tailwind.config.cjs..."
cat << 'EOF' > tailwind.config.cjs
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      }
    },
  },
  plugins: [],
}
EOF

echo "Creating postcss.config.cjs..."
cat << 'EOF' > postcss.config.cjs
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

echo "Updating index.css with robust base layers..."
cat << 'EOF' > src/index.css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --bg-base: #0c0e14;
    --bg-surface: #14171f;
    --bg-elevated: #1c2030;
    --bg-input: #0f1219;
    --border: #252a3a;
    --border-focus: #3a7bd5;
    --text-primary: #dde1ec;
    --text-secondary: #7880a0;
    --text-muted: #454d66;
    --accent: #3a7bd5;
    --accent-hover: #4a8be5;
    --confirm: #1d9a6c;
    --warn: #c8830a;
    --danger: #c0392b;
  }

  body {
    @apply bg-[#0c0e14] text-[#dde1ec] font-sans antialiased;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  /* Force standard inputs to adopt dark theme behaviors (like cursor color) */
  input {
    color-scheme: dark;
  }
}
EOF

echo "Staging files..."
git add tailwind.config.cjs postcss.config.cjs src/index.css
# Safely remove the old files from git tracking if they were there
git rm --cached postcss.config.js tailwind.config.js 2>/dev/null || true

echo "Committing..."
git commit -m "fix: enforce strict CJS tailwind configuration and add font fallbacks"

echo "Pushing to GitHub..."
git push origin main

echo "UI patch deployed!"
