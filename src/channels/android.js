import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { normalizeText, sleep } from '../utils.js';
import {
  dumpUiHierarchy,
  ensureDeviceConnected,
  launchApp,
  pressBack,
  tap
} from './android-adb.js';
import { AndroidChannelError, androidErrorCodes } from './android-errors.js';
import { detectAndroidPageState } from './android-page-state.js';
import {
  extractConversationContext,
  extractConversationSummaries,
  findBottomTabBounds,
  findMessageInputBounds,
  findMessageInputState,
  findSendButtonBounds
} from './android-ui.js';

const listRecoveryAttempts = 3;
const detailConfirmAttempts = 4;
const navigationDelayMs = 900;
const sendConfirmAttempts = 3;
const execFile = promisify(execFileCallback);
let adbCommandRunner = defaultAdbCommandRunner;
const androidInputStrategyCodes = {
  adbKeyboard: 'adb_keyboard'
};

export const androidChannel = {
  name: 'android',
  capabilities: {
    sendReply: true
  },
  async createRuntime() {
    const runtime = {
      adbPath: config.android.adbPath,
      deviceId: config.android.deviceId,
      packageName: config.android.packageName,
      launcherActivity: config.android.launcherActivity,
      inputStrategy: config.android.inputStrategy,
      adbKeyboardEnabled: config.android.adbKeyboardEnabled,
      adbKeyboardIme: config.android.adbKeyboardIme
    };

    await ensureDeviceConnected(runtime);
    await launchApp(runtime);
    return runtime;
  },
  async closeRuntime() {},
  async listUnreadConversations(runtime) {
    const xml = await ensureConversationListPage(runtime);
    const conversations = extractConversationSummaries(xml);

    if (!conversations.length) {
      throw new AndroidChannelError(
        androidErrorCodes.listParseFailed,
        '当前页面已识别为会话列表，但没有解析到任何会话。',
        { pageState: detectAndroidPageState(xml) }
      );
    }

    logger.info(`Android 通道识别到 ${conversations.length} 个会话候选`);
    return conversations;
  },
  async openConversation(runtime, conversation) {
    if (!conversation?.bounds) {
      throw new AndroidChannelError(
        androidErrorCodes.clickNavigationFailed,
        'Android 会话缺少可点击区域，无法打开。'
      );
    }

    await ensureConversationListPage(runtime);
    await tap(runtime, conversation.bounds.centerX, conversation.bounds.centerY);
    await confirmConversationDetailPage(runtime, conversation);
  },
  async readConversationContext(runtime) {
    const xml = await dumpUiHierarchy(runtime);
    const pageState = detectAndroidPageState(xml);

    if (pageState.state !== 'conversation_detail') {
      throw new AndroidChannelError(
        androidErrorCodes.detailParseFailed,
        `当前页面不是会话详情页，实际状态: ${pageState.state}`,
        { pageState }
      );
    }

    return extractConversationContext(
      xml,
      config.xiaohongshu.messageHistoryLimit
    );
  },
  async sendReply(runtime, reply) {
    const precheck = await runSendPrecheck(runtime);
    if (!precheck.success) {
      return precheck;
    }

    const beforeXml = await dumpUiHierarchy(runtime);
    const beforeState = detectAndroidPageState(beforeXml);
    if (beforeState.state !== 'conversation_detail') {
      return failureResult(
        'SEND_NOT_IN_DETAIL',
        'precheck',
        false,
        '当前页面不在会话详情页'
      );
    }

    const beforeContext = extractConversationContext(
      beforeXml,
      config.xiaohongshu.messageHistoryLimit
    );
    const inputBounds = findMessageInputBounds(beforeXml);
    if (!inputBounds) {
      return failureResult(
        'SEND_INPUT_NOT_FOUND',
        'input',
        false,
        '未找到发送输入框'
      );
    }

    let previousIme = precheck.currentIme;

    try {
      await tap(runtime, inputBounds.centerX, inputBounds.centerY);
      await sleep(300);
      await clearMessageInput(runtime, beforeXml);

      const inputResult = await inputReplyWithStrategy(runtime, reply, previousIme);
      previousIme = inputResult.previousIme;
      if (!inputResult.success) {
        return inputResult;
      }

      await sleep(300);
      const afterTypeXml = await dumpUiHierarchy(runtime);
      const sendButtonBounds = findSendButtonBounds(afterTypeXml);
      if (!sendButtonBounds) {
        return failureResult(
          'SEND_BUTTON_NOT_FOUND',
          'tap_send',
          false,
          '未找到发送按钮'
        );
      }

      await tap(runtime, sendButtonBounds.centerX, sendButtonBounds.centerY);
      await sleep(500);

      const confirmed = await confirmSendSuccess(runtime, reply, beforeContext);
      if (!confirmed) {
        return failureResult(
          'SEND_CONFIRM_FAILED',
          'confirm',
          true,
          '发送后无法确认消息已发出'
        );
      }

      return {
        success: true,
        failureCode: '',
        failureStage: '',
        retryable: false
      };
    } catch (error) {
      return failureResult(
        error.code || 'SEND_FAILED',
        'input',
        true,
        error.message
      );
    } finally {
      await restoreInputMethod(runtime, previousIme);
    }
  }
};

async function ensureConversationListPage(runtime) {
  let lastState = null;

  for (let attempt = 0; attempt < listRecoveryAttempts; attempt += 1) {
    const xml = await dumpUiHierarchy(runtime);
    const pageState = detectAndroidPageState(xml);
    lastState = pageState;

    if (pageState.state === 'conversation_list') {
      return xml;
    }

    if (
      pageState.state === 'conversation_detail' ||
      pageState.state === 'blocked_by_popup'
    ) {
      logger.warn(`Android 当前不在会话列表页，尝试恢复: ${pageState.state}`);
      await pressBack(runtime);
      await sleep(800);
      continue;
    }

    if (pageState.state === 'unknown') {
      const messageTabBounds = findBottomTabBounds(xml, '消息');
      if (messageTabBounds) {
        logger.warn('Android 当前不在消息列表页，尝试点击底部消息 Tab');
        await tap(runtime, messageTabBounds.centerX, messageTabBounds.centerY);
        await sleep(1000);
        continue;
      }
    }

    break;
  }

  throw new AndroidChannelError(
    lastState?.state === 'unknown'
      ? androidErrorCodes.unknownPage
      : androidErrorCodes.listParseFailed,
    `无法进入会话列表页，当前状态: ${lastState?.state || 'unknown'}`,
    { pageState: lastState }
  );
}

async function confirmConversationDetailPage(runtime, conversation) {
  const expectedTitle = normalizeConversationTitleForMatch(
    conversation.title || conversation.text
  );
  let lastState = null;

  for (let attempt = 0; attempt < detailConfirmAttempts; attempt += 1) {
    await sleep(navigationDelayMs);
    const xml = await dumpUiHierarchy(runtime);
    const pageState = detectAndroidPageState(xml);
    const context = extractConversationContext(
      xml,
      config.xiaohongshu.messageHistoryLimit
    );
    lastState = {
      ...pageState,
      contextTitle: context.title
    };

    if (
      pageState.state === 'conversation_detail' &&
      isExpectedConversationTitle(expectedTitle, context.title)
    ) {
      return;
    }

    if (pageState.state === 'blocked_by_popup') {
      await pressBack(runtime);
      await sleep(600);
      await tap(runtime, conversation.bounds.centerX, conversation.bounds.centerY);
      continue;
    }

    if (pageState.state === 'conversation_list') {
      const latestBounds = findConversationBounds(xml, conversation, expectedTitle);
      const targetBounds = latestBounds || conversation.bounds;
      await tap(runtime, targetBounds.centerX, targetBounds.centerY);
    }
  }

  throw new AndroidChannelError(
    androidErrorCodes.clickNavigationFailed,
    `打开会话失败: ${expectedTitle || '未知会话'}`,
    { pageState: lastState, conversation }
  );
}

function isExpectedConversationTitle(expectedTitle, actualTitle) {
  const expected = normalizeConversationTitleForMatch(expectedTitle);
  const actual = normalizeConversationTitleForMatch(actualTitle);

  if (!expected || !actual) {
    return false;
  }

  return actual.includes(expected) || expected.includes(actual);
}

function findConversationBounds(xml, conversation, expectedTitle) {
  const conversations = extractConversationSummaries(xml);
  const expected = expectedTitle || normalizeConversationTitleForMatch(conversation.title);
  const expectedText = normalizeConversationTitleForMatch(conversation.text);

  const matchedConversation = conversations.find((item) => {
    const itemTitle = normalizeConversationTitleForMatch(item.title);
    const itemText = normalizeConversationTitleForMatch(item.text);

    return (
      (expected && (itemTitle.includes(expected) || expected.includes(itemTitle))) ||
      (expectedText &&
        (itemText.includes(expectedText) || expectedText.includes(itemText)))
    );
  });

  return matchedConversation?.bounds || null;
}

function normalizeConversationTitleForMatch(value) {
  return normalizeText(value)
    .normalize('NFKC')
    .replace(/&#(x?[0-9a-fA-F]+);/g, '')
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

async function runSendPrecheck(runtime) {
  try {
    await runAdbCommand(runtime, ['version']);
  } catch (error) {
    return failureResult(
      'SEND_ADB_NOT_AVAILABLE',
      'precheck',
      false,
      error.message
    );
  }

  try {
    const deviceState = await runAdbCommand(runtime, ['get-state']);
    if (deviceState.stdout.trim() !== 'device') {
      return failureResult(
        'SEND_DEVICE_NOT_READY',
        'precheck',
        true,
        `设备状态异常: ${deviceState.stdout.trim() || 'unknown'}`
      );
    }
  } catch (error) {
    return failureResult(
      'SEND_DEVICE_NOT_READY',
      'precheck',
      true,
      error.message
    );
  }

  return detectInputStrategy(runtime);

  if (!runtime.adbKeyboardEnabled) {
    return failureResult(
      'SEND_INPUT_METHOD_NOT_AVAILABLE',
      'precheck',
      false,
      'ADB Keyboard 输入方案未启用'
    );
  }

  const imeId = runtime.adbKeyboardIme;

  try {
    const imeList = await runAdbShell(runtime, ['ime', 'list', '-s']);
    const installedImes = imeList.stdout
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!installedImes.includes(imeId)) {
      return failureResult(
        'SEND_INPUT_METHOD_NOT_AVAILABLE',
        'precheck',
        false,
        `未检测到 ADB Keyboard IME: ${imeId}`
      );
    }

    await runAdbShell(runtime, ['ime', 'enable', imeId]);
    const currentIme = await readCurrentInputMethod(runtime);

    return {
      success: true,
      failureCode: '',
      failureStage: '',
      retryable: false,
      currentIme
    };
  } catch (error) {
    return failureResult(
      'SEND_INPUT_METHOD_NOT_AVAILABLE',
      'precheck',
      false,
      error.message
    );
  }
}

async function clearMessageInput(runtime, xml) {
  const inputState = findMessageInputState(xml);
  if (inputState?.isEmpty) {
    return;
  }

  const clearCount = Math.max((inputState?.text || '').length + 8, 16);
  await runAdbShell(runtime, ['input', 'keyevent', '123']);

  for (let index = 0; index < clearCount; index += 1) {
    await runAdbShell(runtime, ['input', 'keyevent', '67']);
  }
}

async function inputReplyWithStrategy(runtime, reply, previousIme) {
  const strategy = createInputStrategy(runtime);

  if (!strategy.supported) {
    return {
      ...failureResult(
        strategy.unsupportedCode || 'SEND_INPUT_METHOD_UNSUPPORTED',
        'precheck',
        false,
        strategy.unsupportedMessage || 'Android input strategy is unsupported'
      ),
      previousIme
    };
  }

  const availability = await strategy.checkAvailability();
  if (!availability.success) {
    return {
      ...availability,
      previousIme
    };
  }

  try {
    await strategy.enterText(reply);

    return {
      success: true,
      failureCode: '',
      failureStage: '',
      retryable: false,
      previousIme
    };
  } catch (error) {
    return {
      ...failureResult(
        strategy.writeFailureCode || 'SEND_INPUT_WRITE_FAILED',
        'input',
        true,
        error.message
      ),
      previousIme
    };
  }

  if (!runtime.adbKeyboardEnabled) {
    return failureResult(
      'SEND_INPUT_METHOD_NOT_AVAILABLE',
      'precheck',
      false,
      'ADB Keyboard 输入方案未启用'
    );
  }

  try {
    await switchInputMethod(runtime, runtime.adbKeyboardIme);
    await clearAdbKeyboardText(runtime);
    await sendAdbKeyboardText(runtime, reply);

    return {
      success: true,
      failureCode: '',
      failureStage: '',
      retryable: false,
      previousIme
    };
  } catch (error) {
    return {
      ...failureResult(
        'SEND_INPUT_WRITE_FAILED',
        'input',
        true,
        error.message
      ),
      previousIme
    };
  }
}

async function confirmSendSuccess(runtime, reply, beforeContext) {
  const expected = normalizeText(reply);
  const previousLatest = normalizeText(beforeContext.latestMessage);

  for (let attempt = 0; attempt < sendConfirmAttempts; attempt += 1) {
    await sleep(500);
    const xml = await dumpUiHierarchy(runtime);
    const pageState = detectAndroidPageState(xml);

    if (pageState.state !== 'conversation_detail') {
      return false;
    }

    const afterContext = extractConversationContext(
      xml,
      config.xiaohongshu.messageHistoryLimit
    );
    const inputState = findMessageInputState(xml);
    const latestMessage = normalizeText(afterContext.latestMessage);

    if (latestMessage && latestMessage === expected) {
      return true;
    }

    if (
      inputState?.isEmpty &&
      latestMessage &&
      latestMessage !== previousLatest &&
      areMessagesHighlySimilar(latestMessage, expected)
    ) {
      return true;
    }
  }

  return false;
}

function areMessagesHighlySimilar(left, right) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

async function switchInputMethod(runtime, imeId) {
  await runAdbShell(runtime, ['ime', 'set', imeId]);
}

async function restoreInputMethod(runtime, imeId) {
  if (!imeId || imeId === runtime.adbKeyboardIme) {
    return restoreSuccess();
  }

  try {
    await switchInputMethod(runtime, imeId);
    return restoreSuccess();
  } catch (error) {
    logger.warn(`恢复输入法失败: ${error.message}`);
  }
}

async function readCurrentInputMethod(runtime) {
  const result = await runAdbShell(runtime, [
    'settings',
    'get',
    'secure',
    'default_input_method'
  ]);

  return result.stdout.trim();
}

async function clearAdbKeyboardText(runtime) {
  await runAdbShell(runtime, ['am', 'broadcast', '-a', 'ADB_CLEAR_TEXT']);
}

async function sendAdbKeyboardText(runtime, value) {
  const base64 = Buffer.from(String(value), 'utf8').toString('base64');
  await runAdbShell(runtime, [
    'am',
    'broadcast',
    '-a',
    'ADB_INPUT_B64',
    '--es',
    'msg',
    base64
  ]);
}

function failureResult(code, stage, retryable, message = '') {
  return {
    success: false,
    failureCode: code,
    failureStage: stage,
    retryable,
    message
  };
}

function restoreSuccess() {
  return {
    success: true,
    failureCode: '',
    failureStage: '',
    retryable: false
  };
}

function detectInputStrategy(runtime) {
  const strategy = createInputStrategy(runtime);

  if (!strategy.supported) {
    return Promise.resolve(
      failureResult(
        strategy.unsupportedCode || 'SEND_INPUT_METHOD_UNSUPPORTED',
        'precheck',
        false,
        strategy.unsupportedMessage || 'Android input strategy is unsupported'
      )
    );
  }

  return strategy.checkAvailability();
}

function createInputStrategy(runtime) {
  if (runtime.inputStrategy === androidInputStrategyCodes.adbKeyboard) {
    return createAdbKeyboardStrategy(runtime);
  }

  return {
    supported: false,
    unsupportedCode: 'SEND_INPUT_METHOD_UNSUPPORTED',
    unsupportedMessage: `Unsupported Android input strategy: ${runtime.inputStrategy || 'unknown'}`
  };
}

function createAdbKeyboardStrategy(runtime) {
  return {
    code: androidInputStrategyCodes.adbKeyboard,
    supported: true,
    writeFailureCode: 'SEND_INPUT_WRITE_FAILED',
    async checkAvailability() {
      if (!runtime.adbKeyboardEnabled) {
        return failureResult(
          'SEND_INPUT_METHOD_UNAVAILABLE',
          'precheck',
          false,
          'ADB Keyboard input strategy is disabled'
        );
      }

      const imeId = runtime.adbKeyboardIme;

      try {
        const imeList = await runAdbShell(runtime, ['ime', 'list', '-s']);
        const installedImes = imeList.stdout
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean);

        if (!installedImes.includes(imeId)) {
          return failureResult(
            'SEND_INPUT_METHOD_UNAVAILABLE',
            'precheck',
            false,
            `ADB Keyboard IME not detected: ${imeId}`
          );
        }

        await runAdbShell(runtime, ['ime', 'enable', imeId]);
        const currentIme = await readCurrentInputMethod(runtime);

        return {
          success: true,
          failureCode: '',
          failureStage: '',
          retryable: false,
          currentIme,
          strategy: this.code
        };
      } catch (error) {
        return failureResult(
          'SEND_INPUT_METHOD_UNAVAILABLE',
          'precheck',
          false,
          error.message
        );
      }
    },
    async enterText(reply) {
      await switchInputMethod(runtime, runtime.adbKeyboardIme);
      await clearAdbKeyboardText(runtime);
      await sendAdbKeyboardText(runtime, reply);
    }
  };
}

export const __test = {
  createInputStrategy,
  detectInputStrategy,
  inputReplyWithStrategy,
  restoreInputMethod,
  setAdbCommandRunner(runner) {
    adbCommandRunner = runner;
  },
  resetAdbCommandRunner() {
    adbCommandRunner = defaultAdbCommandRunner;
  }
};

async function runAdbShell(runtime, args) {
  return runAdbCommand(runtime, ['shell', ...args]);
}

async function runAdbCommand(runtime, args) {
  return adbCommandRunner(runtime, args);
}

async function defaultAdbCommandRunner(runtime, args) {
  const baseArgs = runtime.deviceId ? ['-s', runtime.deviceId] : [];

  try {
    return await execFile(runtime.adbPath, [...baseArgs, ...args], {
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message).trim();
    throw new Error(detail || 'ADB 命令执行失败');
  }
}
