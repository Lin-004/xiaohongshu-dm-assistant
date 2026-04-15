#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { runThreadStatusProjectSync } from '../src/thread-status-project-sync.js';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runThreadStatusProjectSync(args);

  if (result.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          projectOwner: result.projectOwner,
          projectNumber: result.projectNumber,
          draftCount: result.drafts.length,
          titles: result.drafts.map((draft) => ({
            title: draft.title,
            status: draft.status
          }))
        },
        null,
        2
      )}\n`
    );
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        projectOwner: result.projectOwner,
        projectNumber: result.projectNumber,
        projectTitle: result.projectTitle,
        syncedAt: result.syncedAt,
        updatedItems: result.results
      },
      null,
      2
    )}\n`
  );
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (arg === '--status-file') {
      args.statusFile = resolveNextValue(argv, ++index, '--status-file');
      continue;
    }

    if (arg === '--project-owner') {
      args.projectOwner = resolveNextValue(argv, ++index, '--project-owner');
      continue;
    }

    if (arg === '--project-number') {
      args.projectNumber = Number(
        resolveNextValue(argv, ++index, '--project-number')
      );
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.statusFile) {
    args.statusFile = path.resolve(args.statusFile);
  }

  return args;
}

function resolveNextValue(argv, index, flag) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/sync-thread-status.js [options]

Options:
  --dry-run                 Parse the status file and print the planned updates
  --status-file <path>      Override the default docs/thread-status.md path
  --project-owner <owner>   Override the default GitHub project owner
  --project-number <num>    Override the default GitHub project number
  -h, --help                Show this help

Environment:
  GITHUB_TOKEN or GITHUB_PERSONAL_ACCESS_TOKEN
  If neither is set, the script falls back to ~/.codex/config.toml
`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
