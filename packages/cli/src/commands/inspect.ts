/**
 * @uny/cli — commands/inspect
 * Lists all keys and their sources via the composed provenance.
 */

import type { Container } from '@uny/di';
import type { Flags } from '../flags.js';

interface KeyInfo {
  key: string;
  definedBy: string;      // winner (last in definedBy array)
  definedByFull: string[]; // full override history
  extendedBy: string[];
}

/**
 * inspectCommand(container: Container, flags: Flags): void
 *
 * Resolves app/provenance from the container and displays all keys,
 * showing which provider defined (and extended) each one.
 */
export function inspectCommand(container: Container, flags: Flags): void {
  let provenance: Map<string, any>;
  try {
    provenance = container.resolve('app/provenance');
  } catch (e) {
    console.error('error: app/provenance not available in container');
    process.exit(1);
  }

  if (!(provenance instanceof Map)) {
    console.error('error: app/provenance is not a Map');
    process.exit(1);
  }

  // Build key info list, excluding the provenance key itself
  const keyInfos: KeyInfo[] = [];
  for (const [key, prov] of provenance) {
    // Skip the reserved provenance key
    if (key === 'app/provenance') {
      continue;
    }

    const definedByArray = prov.definedBy || [];
    const winner = definedByArray.length > 0 ? definedByArray[definedByArray.length - 1] : null;

    keyInfos.push({
      key,
      definedBy: winner || '-',
      definedByFull: definedByArray,
      extendedBy: prov.extendedBy || [],
    });
  }

  // Sort by key
  keyInfos.sort((a, b) => a.key.localeCompare(b.key));

  if (flags.format === 'json') {
    // JSON output: keep the original KeyInspection shape for backward compat
    const jsonOutput = keyInfos.map((info) => ({
      key: info.key,
      definedBy: info.definedBy,
      extendedBy: info.extendedBy,
      resolved: false,
      cached: false,
    }));
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    // Human-readable table
    printHumanTable(keyInfos);
  }
}

function printHumanTable(keyInfos: KeyInfo[]): void {
  if (keyInfos.length === 0) {
    console.log('(no keys)');
    return;
  }

  // Compute column widths
  const maxKeyLen = Math.max(...keyInfos.map((i) => i.key.length), 10);
  const maxDefinedLen = Math.max(
    ...keyInfos.map((i) => i.definedBy.length),
    11
  );

  // Header
  const keyHeader = 'KEY'.padEnd(maxKeyLen);
  const definedHeader = 'DEFINED-BY'.padEnd(maxDefinedLen);
  const extendedHeader = 'EXTENDED-BY';
  console.log(`${keyHeader} ${definedHeader} ${extendedHeader}`);
  console.log('─'.repeat(maxKeyLen + maxDefinedLen + extendedHeader.length + 2));

  // Rows
  for (const info of keyInfos) {
    const keyStr = info.key.padEnd(maxKeyLen);
    const definedStr = info.definedBy.padEnd(maxDefinedLen);
    const extendedStr = info.extendedBy.length > 0
      ? `[${info.extendedBy.join(', ')}]`
      : '-';
    console.log(`${keyStr} ${definedStr} ${extendedStr}`);
  }
}
