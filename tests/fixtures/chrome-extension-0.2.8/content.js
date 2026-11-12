"use strict";
(() => {
  // ../../packages/protocol/src/index.ts
  function isAllowedUrl(current, allowed) {
    return (Array.isArray(allowed) ? allowed : [allowed]).some((value) => {
      try {
        const candidate = new URL(current ?? "");
        const base = new URL(value);
        const path = base.pathname.replace(/\/+$/, "");
        return candidate.origin === base.origin && (candidate.pathname === path || candidate.pathname.startsWith(`${path}/`));
      } catch {
        return false;
      }
    });
  }

  // src/content/index.ts
  var enabled = false;
  function signal(name) {
    if (enabled)
      void chrome.runtime.sendMessage({ type: "content_signal", signal: name }).catch(() => {
      });
  }
  var visibility = () => signal(document.hidden ? "hidden" : "visible");
  var blur = () => signal("blur");
  var focus = () => signal("focus");
  var blockContextMenu = (event) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    signal("contextmenu");
  };
  var rightButton = (event) => {
    if (event.button === 2) blockContextMenu(event);
  };
  var mouseRightButton = (event) => {
    if (event.button === 2) blockContextMenu(event);
  };
  var contextMenuKey = (event) => {
    if (!enabled || event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    signal("contextmenu");
  };
  function configure(message) {
    const next = !!message.active && !!message.allowed_urls?.length && isAllowedUrl(location.href, message.allowed_urls);
    if (next === enabled) return;
    enabled = next;
    if (enabled) {
      document.addEventListener("visibilitychange", visibility);
      window.addEventListener("blur", blur);
      window.addEventListener("focus", focus);
      window.addEventListener("pointerdown", rightButton, true);
      window.addEventListener("mousedown", mouseRightButton, true);
      window.addEventListener("mouseup", mouseRightButton, true);
      window.addEventListener("contextmenu", blockContextMenu, true);
      window.addEventListener("keydown", contextMenuKey, true);
    } else {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pointerdown", rightButton, true);
      window.removeEventListener("mousedown", mouseRightButton, true);
      window.removeEventListener("mouseup", mouseRightButton, true);
      window.removeEventListener("contextmenu", blockContextMenu, true);
      window.removeEventListener("keydown", contextMenuKey, true);
    }
  }
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "monitor_config") configure(message);
  });
  void chrome.runtime.sendMessage({ type: "get_monitor_config" }).then(configure).catch(() => {
  });
})();
