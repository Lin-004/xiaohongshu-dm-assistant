import { config } from './config.js';
import { androidChannel } from './channels/android.js';
import { webChannel } from './channels/web.js';

const channels = {
  android: androidChannel,
  web: webChannel
};

export function getChannel() {
  const channel = channels[config.channel.provider];

  if (!channel) {
    throw new Error(`不支持的消息通道: ${config.channel.provider}`);
  }

  return channel;
}
