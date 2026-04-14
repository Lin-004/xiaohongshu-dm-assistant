import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getChannel } from './channel.js';
import { logger } from './logger.js';
import { saveInboxUrl } from './state-store.js';

async function main() {
  const channel = getChannel();
  if (channel.name !== 'web') {
    throw new Error('当前登录脚本只支持 web 通道。请先使用 XHS_CHANNEL=web。');
  }

  const runtime = await channel.createRuntime();

  logger.info('浏览器已打开。请手动登录小红书，并进入私信页面。');
  logger.info('登录完成后，回到终端按回车，我会保留当前登录态。');

  const rl = readline.createInterface({ input, output });
  await rl.question('');
  rl.close();

  const currentUrl = await channel.getCurrentLocation(runtime);
  await saveInboxUrl(currentUrl);
  logger.info(`当前页面: ${currentUrl}`);
  logger.info('已记住当前私信页 URL，后续启动会优先打开这个地址。');

  await channel.closeRuntime(runtime);
  logger.info('登录态已保存到 .data/browser-profile');
}

main().catch((error) => {
  logger.error(error.message);
  process.exitCode = 1;
});
