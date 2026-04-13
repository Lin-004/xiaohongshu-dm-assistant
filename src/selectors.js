export const defaultSelectors = {
  conversationItems: [
    '[data-testid*="conversation"]',
    '[class*="conversation"]',
    '[class*="chat-item"]',
    '[class*="message-item"]',
    'aside li',
    'main li'
  ],
  unreadBadge: [
    '[class*="unread"]',
    '[class*="badge"]',
    '[class*="dot"]',
    'text=未读'
  ],
  messageRows: [
    '[data-testid*="message"]',
    '[class*="message-item"]',
    '[class*="msg-item"]',
    '[class*="chat-msg"]',
    '[class*="message-row"]'
  ],
  messageInput: [
    'textarea',
    '[contenteditable="true"]',
    'div[role="textbox"]'
  ],
  sendButton: [
    'button:has-text("发送")',
    'div[role="button"]:has-text("发送")',
    'span:has-text("发送")'
  ]
};
