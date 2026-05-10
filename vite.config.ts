import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  esbuild: {
    // 🚀 PHASE 9: Security Hardening - strips all debug output from the final APK
    drop: ['console', 'debugger'],
  },
});
