import { collectSelectorStats, createInboxPage, launchBrowser } from './xiaohongshu.js';
import { logger } from './logger.js';

async function main() {
  const context = await launchBrowser();
  const page = await createInboxPage(context);
  const stats = await collectSelectorStats(page);

  for (const [group, items] of Object.entries(stats)) {
    logger.info(`选择器分组: ${group}`);
    for (const item of items) {
      logger.info(`  ${item.selector} => ${item.count}`);
    }
  }

  await context.close();
}

main().catch((error) => {
  logger.error(error.message);
  process.exitCode = 1;
});
