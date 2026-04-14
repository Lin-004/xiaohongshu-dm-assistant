export class AndroidChannelError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AndroidChannelError';
    this.code = code;
    this.details = details;
  }
}

export const androidErrorCodes = {
  emptyUiDump: 'EMPTY_UI_DUMP',
  unknownPage: 'UNKNOWN_PAGE',
  blockedByPopup: 'BLOCKED_BY_POPUP',
  clickNavigationFailed: 'CLICK_NAVIGATION_FAILED',
  detailParseFailed: 'DETAIL_PARSE_FAILED',
  listParseFailed: 'LIST_PARSE_FAILED',
  deviceDisconnected: 'DEVICE_DISCONNECTED'
};
