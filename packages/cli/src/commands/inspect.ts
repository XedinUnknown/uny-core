/**
 * @uny/cli — commands/inspect
 * Lists all keys and their sources.
 */

import type { Container, KeyInspection } from '@uny/di';
import type { Flags } from '../flags.js';

/**
 * inspectCommand(container: Container, flags: Flags): void
 *
 * Resolves all keys and prints in human or JSON format.
 * --format json → JSON array of KeyInspection objects
 * --format human → aligned text table
 */
export function inspectCommand(container: Container, flags: Flags): void {
  const keys = container.keys?.() ?? [];
  const inspections: KeyInspection[] = keys.map((key) => container.inspect?.(key) ?? {
    key,
    definedBy: null,
    extendedBy: [],
    resolved: false,
  });

  if (flags.format === 'json') {
    console.log(JSON.stringify(inspections, null, 2));
  } else {
    // Human format: table
    printHumanTable(inspections);
  }
}

function printHumanTable(inspections: KeyInspection[]): void {
  if (inspections.length === 0) {
    console.log('(no keys)');
    return;
  }

  // Compute column widths
  const maxKeyLen = Math.max(...inspections.map((i) => i.key.length), 10);
  const maxDefinedLen = Math.max(
    ...inspections.map((i) => (i.definedBy ?? '-').length),
    11
  );

  // Header
  const keyHeader = 'KEY'.padEnd(maxKeyLen);
  const definedHeader = 'DEFINED-BY'.padEnd(maxDefinedLen);
  const extendedHeader = 'EXTENDED-BY';
  console.log(`${keyHeader} ${definedHeader} ${extendedHeader}`);
  console.log('─'.repeat(maxKeyLen + maxDefinedLen + extendedHeader.length + 2));

  // Rows
  for (const inspection of inspections) {
    const keyStr = inspection.key.padEnd(maxKeyLen);
    const definedStr = (inspection.definedBy ?? '-').padEnd(maxDefinedLen);
    const extendedStr = inspection.extendedBy.length > 0
      ? `[${inspection.extendedBy.join(', ')}]`
      : '-';
    console.log(`${keyStr} ${definedStr} ${extendedStr}`);
  }
}
