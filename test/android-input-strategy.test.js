import test from 'node:test';
import assert from 'node:assert/strict';
import { __test } from '../src/channels/android.js';

function createRuntime(overrides = {}) {
  return {
    adbPath: 'adb',
    deviceId: '',
    inputStrategy: 'adb_keyboard',
    adbKeyboardEnabled: true,
    adbKeyboardIme: 'com.android.adbkeyboard/.AdbIME',
    ...overrides
  };
}

test.afterEach(() => {
  __test.resetAdbCommandRunner();
});

test('detectInputStrategy reports ready when adb keyboard is installed', async () => {
  const commands = [];
  __test.setAdbCommandRunner(async (_runtime, args) => {
    commands.push(args);

    if (args.join(' ') === 'shell ime list -s') {
      return { stdout: 'com.android.adbkeyboard/.AdbIME\ncom.example/.Ime\n' };
    }

    if (args.join(' ') === 'shell ime enable com.android.adbkeyboard/.AdbIME') {
      return { stdout: '' };
    }

    if (args.join(' ') === 'shell settings get secure default_input_method') {
      return { stdout: 'com.example/.Ime\n' };
    }

    throw new Error(`unexpected adb call: ${args.join(' ')}`);
  });

  const result = await __test.detectInputStrategy(createRuntime());

  assert.equal(result.success, true);
  assert.equal(result.currentIme, 'com.example/.Ime');
  assert.deepEqual(commands, [
    ['shell', 'ime', 'list', '-s'],
    ['shell', 'ime', 'enable', 'com.android.adbkeyboard/.AdbIME'],
    ['shell', 'settings', 'get', 'secure', 'default_input_method']
  ]);
});

test('detectInputStrategy reports unavailable when adb keyboard ime is missing', async () => {
  __test.setAdbCommandRunner(async (_runtime, args) => {
    if (args.join(' ') === 'shell ime list -s') {
      return { stdout: 'com.example/.Ime\n' };
    }

    throw new Error(`unexpected adb call: ${args.join(' ')}`);
  });

  const result = await __test.detectInputStrategy(createRuntime());

  assert.equal(result.success, false);
  assert.equal(result.failureCode, 'SEND_INPUT_METHOD_UNAVAILABLE');
  assert.equal(result.failureStage, 'precheck');
});

test('inputReplyWithStrategy enters text through adb keyboard when the strategy is ready', async () => {
  const commands = [];
  __test.setAdbCommandRunner(async (_runtime, args) => {
    commands.push(args);
    const command = args.join(' ');

    if (command === 'shell ime list -s') {
      return { stdout: 'com.android.adbkeyboard/.AdbIME\n' };
    }

    if (command === 'shell ime enable com.android.adbkeyboard/.AdbIME') {
      return { stdout: '' };
    }

    if (command === 'shell settings get secure default_input_method') {
      return { stdout: 'com.example/.Ime\n' };
    }

    if (command === 'shell ime set com.android.adbkeyboard/.AdbIME') {
      return { stdout: '' };
    }

    if (command === 'shell am broadcast -a ADB_CLEAR_TEXT') {
      return { stdout: '' };
    }

    if (args[0] === 'shell' && args[1] === 'am' && args[2] === 'broadcast') {
      return { stdout: '' };
    }

    throw new Error(`unexpected adb call: ${command}`);
  });

  const result = await __test.inputReplyWithStrategy(
    createRuntime(),
    'hello world',
    'com.example/.Ime'
  );

  assert.equal(result.success, true);
  assert.equal(result.previousIme, 'com.example/.Ime');
  assert.deepEqual(commands, [
    ['shell', 'ime', 'list', '-s'],
    ['shell', 'ime', 'enable', 'com.android.adbkeyboard/.AdbIME'],
    ['shell', 'settings', 'get', 'secure', 'default_input_method'],
    ['shell', 'ime', 'set', 'com.android.adbkeyboard/.AdbIME'],
    ['shell', 'am', 'broadcast', '-a', 'ADB_CLEAR_TEXT'],
    [
      'shell',
      'am',
      'broadcast',
      '-a',
      'ADB_INPUT_B64',
      '--es',
      'msg',
      'aGVsbG8gd29ybGQ='
    ]
  ]);
});

test('inputReplyWithStrategy reports write failure after a successful precheck', async () => {
  const commands = [];
  __test.setAdbCommandRunner(async (_runtime, args) => {
    commands.push(args);
    const command = args.join(' ');

    if (command === 'shell ime list -s') {
      return { stdout: 'com.android.adbkeyboard/.AdbIME\n' };
    }

    if (command === 'shell ime enable com.android.adbkeyboard/.AdbIME') {
      return { stdout: '' };
    }

    if (command === 'shell settings get secure default_input_method') {
      return { stdout: 'com.example/.Ime\n' };
    }

    if (command === 'shell ime set com.android.adbkeyboard/.AdbIME') {
      throw new Error('ime set failed');
    }

    throw new Error(`unexpected adb call: ${command}`);
  });

  const result = await __test.inputReplyWithStrategy(
    createRuntime(),
    'hello world',
    'com.example/.Ime'
  );

  assert.equal(result.success, false);
  assert.equal(result.failureCode, 'SEND_INPUT_WRITE_FAILED');
  assert.equal(result.failureStage, 'input');
  assert.equal(result.previousIme, 'com.example/.Ime');
  assert.deepEqual(commands, [
    ['shell', 'ime', 'list', '-s'],
    ['shell', 'ime', 'enable', 'com.android.adbkeyboard/.AdbIME'],
    ['shell', 'settings', 'get', 'secure', 'default_input_method'],
    ['shell', 'ime', 'set', 'com.android.adbkeyboard/.AdbIME']
  ]);
});

test('restoreInputMethod attempts to switch back to the previous ime safely', async () => {
  const commands = [];
  __test.setAdbCommandRunner(async (_runtime, args) => {
    commands.push(args);
    return { stdout: '' };
  });

  const result = await __test.restoreInputMethod(
    createRuntime(),
    'com.example/.Ime'
  );

  assert.equal(result.success, true);
  assert.deepEqual(commands, [['shell', 'ime', 'set', 'com.example/.Ime']]);
});
