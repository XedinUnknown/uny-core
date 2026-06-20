/**
 * @uny/cli — flags
 * Parse command-line arguments.
 */

export interface Flags {
  command: string;
  verbose: number;
  quiet: number;
  format: 'human' | 'json';
  projectDir: string;
  help: boolean;
}

/**
 * parseFlags(argv: string[]): Flags
 *
 * Parses CLI arguments. Hand-rolled for simplicity (no Commander yet).
 *
 * Supported:
 *   --project-dir <path>   (default: process.env.UNY_PROJECT_DIR ?? cwd)
 *   -v                     (repeatable, increments verbosity)
 *   -q                     (repeatable, increments quiet)
 *   --format human|json    (default: human)
 *   --help                 (print usage, set help: true)
 *   <word>                 (first non-flag word = command, default 'inspect')
 */
export function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    command: 'inspect',
    verbose: 0,
    quiet: 0,
    format: 'human',
    projectDir: process.env.UNY_PROJECT_DIR ?? process.cwd(),
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    // Long flags with values
    if (arg === '--project-dir' && i + 1 < argv.length) {
      flags.projectDir = argv[++i];
      continue;
    }

    if (arg === '--format' && i + 1 < argv.length) {
      const fmt = argv[++i];
      if (fmt === 'human' || fmt === 'json') {
        flags.format = fmt;
      }
      continue;
    }

    // Boolean flags
    if (arg === '--help') {
      flags.help = true;
      continue;
    }

    // Verbose/quiet
    if (arg === '-v') {
      flags.verbose++;
      continue;
    }

    if (arg === '-q') {
      flags.quiet++;
      continue;
    }

    // Command (first non-flag word)
    if (!arg.startsWith('-') && flags.command === 'inspect') {
      flags.command = arg;
      continue;
    }
  }

  return flags;
}
