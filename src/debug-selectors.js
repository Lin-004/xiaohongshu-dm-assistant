import { getChannel } from './channel.js';
import { logger } from './logger.js';

async function main() {
  const channel = getChannel();
  if (channel.name !== 'web') {
    throw new Error('选择器调试工具只支持 web 通道。请先使用 XHS_CHANNEL=web。');
  }

  const runtime = await channel.createRuntime();
  const stats = await channel.collectDebugStats(runtime);

  for (const [group, items] of Object.entries(stats)) {
    logger.info(`选择器分组: ${group}`);
    for (const item of items) {
      logger.info(`  ${item.selector} => ${item.count}`);
    }
  }

  await channel.closeRuntime(runtime);
}

main().catch((error) => {
  logger.error(error.message);
  process.exitCode = 1;
});
