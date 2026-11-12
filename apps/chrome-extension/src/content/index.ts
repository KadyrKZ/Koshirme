import { isAllowedUrl } from '@koshirme/protocol';
let enabled = false;
function signal(name: string) {
  if (enabled)
    void chrome.runtime.sendMessage({ type: 'content_signal', signal: name }).catch(() => {});
}
const visibility = () => signal(document.hidden ? 'hidden' : 'visible');
const blur = () => signal('blur');
const focus = () => signal('focus');
const blockContextMenu = (event: Event) => {
  if (!enabled) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  signal('contextmenu');
};
const rightButton = (event: PointerEvent) => {
  if (event.button === 2) blockContextMenu(event);
};
const mouseRightButton = (event: MouseEvent) => {
  if (event.button === 2) blockContextMenu(event);
};
const contextMenuKey = (event: KeyboardEvent) => {
  if (!enabled || (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  signal('contextmenu');
};
function configure(message: { active?: boolean; allowed_urls?: string[] }) {
  const next =
    !!message.active &&
    !!message.allowed_urls?.length &&
    isAllowedUrl(location.href, message.allowed_urls);
  if (next === enabled) return;
  enabled = next;
  if (enabled) {
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    window.addEventListener('pointerdown', rightButton, true);
    window.addEventListener('mousedown', mouseRightButton, true);
    window.addEventListener('mouseup', mouseRightButton, true);
    window.addEventListener('contextmenu', blockContextMenu, true);
    window.addEventListener('keydown', contextMenuKey, true);
  } else {
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('blur', blur);
    window.removeEventListener('focus', focus);
    window.removeEventListener('pointerdown', rightButton, true);
    window.removeEventListener('mousedown', mouseRightButton, true);
    window.removeEventListener('mouseup', mouseRightButton, true);
    window.removeEventListener('contextmenu', blockContextMenu, true);
    window.removeEventListener('keydown', contextMenuKey, true);
  }
}
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'monitor_config') configure(message);
});
void chrome.runtime
  .sendMessage({ type: 'get_monitor_config' })
  .then(configure)
  .catch(() => {});

// Only the top-level Fizmat contest page can use this bridge. No token/config is returned.
if (location.origin === 'https://fizmat.win' && window === window.top) {
  window.addEventListener('message', (event) => {
    if (
      event.source !== window ||
      event.origin !== 'https://fizmat.win' ||
      event.data?.source !== 'fizmat-koshirme' ||
      !['status', 'pair', 'start'].includes(event.data.action) ||
      typeof event.data.requestId !== 'string' ||
      event.data.requestId.length > 80
    )
      return;
    const { requestId, action, ticket, contestId, userId, consent } = event.data;
    void chrome.runtime
      .sendMessage({ type: 'fizmat_bridge', action, ticket, contestId, userId, consent })
      .then((result) =>
        window.postMessage({ source: 'koshirme-fizmat', requestId, result }, 'https://fizmat.win'),
      )
      .catch(() =>
        window.postMessage(
          { source: 'koshirme-fizmat', requestId, result: { error: 'EXTENSION_UNAVAILABLE' } },
          'https://fizmat.win',
        ),
      );
  });
}
