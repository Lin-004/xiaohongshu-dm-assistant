import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const emptyState = {
  conversations: {}
};

export async function ensureDataDir() {
  await fs.mkdir(config.paths.dataDir, { recursive: true });
}

export async function loadState() {
  await ensureDataDir();

  try {
    const raw = await fs.readFile(config.paths.stateFile, 'utf8');
    return { ...emptyState, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return structuredClone(emptyState);
    }

    throw error;
  }
}

export async function saveState(state) {
  await ensureDataDir();
  const directory = path.dirname(config.paths.stateFile);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(config.paths.stateFile, JSON.stringify(state, null, 2), 'utf8');
}

export async function saveInboxUrl(url) {
  await ensureDataDir();
  await fs.writeFile(config.paths.inboxUrlFile, `${url}\n`, 'utf8');
}
