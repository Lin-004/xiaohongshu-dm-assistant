import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { ensureDataDir } from '../state-store.js';

const execFile = promisify(execFileCallback);
const uiDumpRemotePath = '/sdcard/xhs-auto-reply-ui.xml';

export async function ensureDeviceConnected(runtime) {
  const { stdout } = await runAdb(runtime, ['devices']);
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1);
  const onlineDevices = lines
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts[1] === 'device')
    .map((parts) => parts[0]);

  if (!onlineDevices.length) {
    throw new Error('没有检测到可用的 Android 设备，请先连接手机或启动模拟器。');
  }

  if (runtime.deviceId && !onlineDevices.includes(runtime.deviceId)) {
    throw new Error(`未找到指定 Android 设备: ${runtime.deviceId}`);
  }

  if (!runtime.deviceId) {
    runtime.deviceId = onlineDevices[0];
  }
}

export async function launchApp(runtime) {
  if (runtime.launcherActivity) {
    await runShell(runtime, [
      'am',
      'start',
      '-n',
      `${runtime.packageName}/${runtime.launcherActivity}`
    ]);
    return;
  }

  await runShell(runtime, [
    'monkey',
    '-p',
    runtime.packageName,
    '-c',
    'android.intent.category.LAUNCHER',
    '1'
  ]);
}

export async function dumpUiHierarchy(runtime) {
  await ensureDataDir();
  await runShell(runtime, ['uiautomator', 'dump', uiDumpRemotePath]);

  const { stdout } = await runAdb(runtime, ['exec-out', 'cat', uiDumpRemotePath]);
  if (!stdout.trim()) {
    throw new Error('Android UI dump 为空，无法读取当前页面。');
  }

  const localPath = path.join(config.paths.dataDir, 'android-ui-latest.xml');
  await fs.writeFile(localPath, stdout, 'utf8');
  return stdout;
}

export async function tap(runtime, x, y) {
  await runShell(runtime, ['input', 'tap', String(x), String(y)]);
}

export async function pressBack(runtime) {
  await runShell(runtime, ['input', 'keyevent', '4']);
}

async function runShell(runtime, args) {
  return runAdb(runtime, ['shell', ...args]);
}

async function runAdb(runtime, args) {
  const baseArgs = runtime.deviceId ? ['-s', runtime.deviceId] : [];

  try {
    return await execFile(runtime.adbPath, [...baseArgs, ...args], {
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `找不到 adb，请检查 ANDROID_ADB_PATH 配置。当前值: ${runtime.adbPath}`
      );
    }

    const detail = String(error.stderr || error.stdout || error.message).trim();
    throw new Error(detail || 'ADB 命令执行失败');
  }
}
