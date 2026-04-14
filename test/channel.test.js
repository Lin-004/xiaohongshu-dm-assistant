import test from 'node:test';
import assert from 'node:assert/strict';
import { getChannel } from '../src/channel.js';
import { config } from '../src/config.js';

test('getChannel uses web by default', () => {
  const previousProvider = config.channel.provider;
  config.channel.provider = 'web';

  try {
    assert.equal(getChannel().name, 'web');
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
