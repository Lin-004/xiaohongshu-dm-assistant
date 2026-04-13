export const logger = {
  info(message, extra = undefined) {
    print('INFO', message, extra);
  },
  warn(message, extra = undefined) {
    print('WARN', message, extra);
  },
  error(message, extra = undefined) {
    print('ERROR', message, extra);
  }
};

function print(level, message, extra) {
  const prefix = `[${new Date().toISOString()}] [${level}] ${message}`;
  if (extra === undefined) {
    console.log(prefix);
    return;
  }

  console.log(prefix, extra);
}
