#!/usr/bin/env node

// Simple wrapper that ensures the built ESM entrypoint is executed when the
// packaged `codex-delegate` binary is invoked.
// Importing the compiled `dist/codex-delegate.js` will run the CLI (it calls
// its `main` entrypoint at module load), so no further wiring is required.
// Keep this small and ESM-compatible.

import '../dist/codex-delegate.js';
