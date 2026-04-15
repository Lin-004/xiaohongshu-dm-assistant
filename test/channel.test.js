import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getChannel } from '../src/channel.js';
import { config } from '../src/config.js';

const configModuleUrl = pathToFileURL(
  path.resolve('E:/code/xhs-atuo-reply/xiaohongshu-dm-assistant/src/config.js')
).href;

async function loadConfigProviderWithEnv(channelValue) {
  const previousChannel = process.env.XHS_CHANNEL;

  if (channelValue === undefined) {
    delete process.env.XHS_CHANNEL;
  } else {
    process.env.XHS_CHANNEL = channelValue;
  }

  try {
    const module = await import(`${configModuleUrl}?test=${Math.random()}`);
    return module.config.channel.provider;
  } finally {
    if (previousChannel === undefined) {
      delete process.env.XHS_CHANNEL;
    } else {
      process.env.XHS_CHANNEL = previousChannel;
    }
  }
}

test('config defaults to android channel when env is absent', async () => {
  assert.equal(await loadConfigProviderWithEnv(undefined), 'android');
});

test('config respects explicit web channel override', async () => {
  assert.equal(await loadConfigProviderWithEnv('web'), 'web');
});

test('getChannel uses configured provider', () => {
  const previousProvider = config.channel.provider;
  config.channel.provider = 'android';

  try {
    assert.equal(getChannel().name, 'android');
  } finally {
    config.channel.provider = previousProvider;
  }
});

test('getChannel can switch to android channel', () => {
  const previousProvider = config.channel.provider;
  config.channel.provider = 'android';

  try {
    assert.equal(getChannel().name, 'android');
  } finally {
    config.channel.provider = previousProvider;
  }
});
