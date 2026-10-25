#!/usr/bin/env node

/**
 * @uny/cli — bin/uny
 * Executable entry point.
 */

import { main } from '../main.js';

main(process.argv.slice(2)).catch((e) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});
