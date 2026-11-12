"use strict";
(() => {
  // src/popup/index.ts
  var messages = {
    ru: {
      guide: "\u0418\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F",
      examLabel: "\u042D\u041A\u0417\u0410\u041C\u0415\u041D",
      noExam: "\u042D\u043A\u0437\u0430\u043C\u0435\u043D \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D",
      openApp: "\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 KOSH!RME \u0438 \u0432\u043E\u0439\u0434\u0438\u0442\u0435 \u0432 \u043A\u043E\u043C\u043D\u0430\u0442\u0443.",
      desktop: "\u041F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435",
      monitoring: "\u041C\u043E\u043D\u0438\u0442\u043E\u0440\u0438\u043D\u0433",
      pair: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435",
      secret: "\u041A\u043E\u0434 \u0438\u0437 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F",
      secretPlaceholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u043E\u0434 \u0438\u0437 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F",
      connect: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0432\u0440\u0443\u0447\u043D\u0443\u044E",
      autoPair: "\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043A\u043E\u0434 \u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C",
      pairHelp: "\u0415\u0441\u043B\u0438 \u0430\u0432\u0442\u043E\u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E, \u0432\u0432\u0435\u0434\u0438\u0442\u0435 8-\u0437\u043D\u0430\u0447\u043D\u044B\u0439 \u043A\u043E\u0434 \u0438\u0437 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F.",
      clipboardInvalid: "\u0412 \u0431\u0443\u0444\u0435\u0440\u0435 \u043D\u0435\u0442 pair-\u043A\u043E\u0434\u0430. \u0421\u043A\u043E\u043F\u0438\u0440\u0443\u0439\u0442\u0435 \u043A\u043E\u0434 \u0432 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0438 \u0438\u043B\u0438 \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u0435\u0433\u043E \u0432\u0440\u0443\u0447\u043D\u0443\u044E.",
      clipboardDenied: "\u0410\u0432\u0442\u043E\u0432\u0441\u0442\u0430\u0432\u043A\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430. \u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u043E\u0434 \u0438\u0437 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0432\u0440\u0443\u0447\u043D\u0443\u044E.",
      reconnect: "\u041F\u0435\u0440\u0435\u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C",
      connected: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
      disconnected: "\u041D\u0435\u0442 \u0441\u0432\u044F\u0437\u0438",
      active: "\u0410\u041A\u0422\u0418\u0412\u0415\u041D",
      stopped: "\u041E\u0421\u0422\u0410\u041D\u041E\u0412\u041B\u0415\u041D",
      protected: "\u0417\u0430\u0449\u0438\u0449\u0435\u043D\u043E",
      attention: "\u0412\u043D\u0438\u043C\u0430\u043D\u0438\u0435",
      idle: "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435",
      starting: "\u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043E\u043A\u043D\u043E \u0435\u0449\u0451 \u0440\u0430\u0437."
    },
    kz: {
      guide: "\u041D\u04B1\u0441\u049B\u0430\u0443\u043B\u044B\u049B",
      examLabel: "\u0415\u041C\u0422\u0418\u0425\u0410\u041D",
      noExam: "\u0415\u043C\u0442\u0438\u0445\u0430\u043D \u049B\u043E\u0441\u044B\u043B\u043C\u0430\u0493\u0430\u043D",
      openApp: "KOSH!RME \u049B\u043E\u043B\u0434\u0430\u043D\u0431\u0430\u0441\u044B\u043D \u0430\u0448\u044B\u043F, \u0431\u04E9\u043B\u043C\u0435\u0433\u0435 \u043A\u0456\u0440\u0456\u04A3\u0456\u0437.",
      desktop: "\u049A\u043E\u043B\u0434\u0430\u043D\u0431\u0430",
      monitoring: "\u041C\u043E\u043D\u0438\u0442\u043E\u0440\u0438\u043D\u0433",
      pair: "\u049A\u043E\u043B\u0434\u0430\u043D\u0431\u0430\u043D\u044B \u049B\u043E\u0441\u0443",
      secret: "\u049A\u043E\u043B\u0434\u0430\u043D\u0431\u0430\u0434\u0430\u0493\u044B \u043A\u043E\u0434",
      secretPlaceholder: "\u049A\u043E\u043B\u0434\u0430\u043D\u0431\u0430\u0434\u0430\u0493\u044B \u043A\u043E\u0434\u0442\u044B \u0435\u043D\u0433\u0456\u0437\u0456\u04A3\u0456\u0437",
      connect: "\u049A\u043E\u043B\u043C\u0435\u043D \u049B\u043E\u0441\u0443",
      autoPair: "\u041A\u043E\u0434\u0442\u044B \u049B\u043E\u0439\u044B\u043F, \u049B\u043E\u0441\u0443",
      pairHelp: "\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0442\u044B \u049B\u043E\u0441\u044B\u043B\u0443 \u049B\u043E\u043B\u0436\u0435\u0442\u0456\u043C\u0441\u0456\u0437 \u0431\u043E\u043B\u0441\u0430, \u049B\u043E\u043B\u0434\u0430\u043D\u0431\u0430\u0434\u0430\u0493\u044B 8 \u0442\u0430\u04A3\u0431\u0430\u043B\u044B \u043A\u043E\u0434\u0442\u044B \u0435\u043D\u0433\u0456\u0437\u0456\u04A3\u0456\u0437.",
      clipboardInvalid: "\u0410\u043B\u043C\u0430\u0441\u0443 \u0431\u0443\u0444\u0435\u0440\u0456\u043D\u0434\u0435 \u049B\u043E\u0441\u044B\u043B\u0443 \u043A\u043E\u0434\u044B \u0436\u043E\u049B. \u049A\u043E\u043B\u0434\u0430\u043D\u0431\u0430\u0434\u0430\u0493\u044B \u043A\u043E\u0434\u0442\u044B \u043A\u04E9\u0448\u0456\u0440\u0456\u04A3\u0456\u0437 \u043D\u0435\u043C\u0435\u0441\u0435 \u049B\u043E\u043B\u043C\u0435\u043D \u0435\u043D\u0433\u0456\u0437\u0456\u04A3\u0456\u0437.",
      clipboardDenied: "\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0442\u044B \u049B\u043E\u044E \u049B\u043E\u043B\u0436\u0435\u0442\u0456\u043C\u0441\u0456\u0437. \u049A\u043E\u043B\u0434\u0430\u043D\u0431\u0430\u0434\u0430\u0493\u044B \u043A\u043E\u0434\u0442\u044B \u049B\u043E\u043B\u043C\u0435\u043D \u0435\u043D\u0433\u0456\u0437\u0456\u04A3\u0456\u0437.",
      reconnect: "\u049A\u0430\u0439\u0442\u0430 \u049B\u043E\u0441\u0443",
      connected: "\u049A\u043E\u0441\u044B\u043B\u0434\u044B",
      disconnected: "\u0411\u0430\u0439\u043B\u0430\u043D\u044B\u0441 \u0436\u043E\u049B",
      active: "\u0411\u0415\u041B\u0421\u0415\u041D\u0414\u0406",
      stopped: "\u0422\u041E\u049A\u0422\u0410\u0422\u042B\u041B\u0414\u042B",
      protected: "\u049A\u043E\u0440\u0493\u0430\u043B\u0493\u0430\u043D",
      attention: "\u041D\u0430\u0437\u0430\u0440 \u0430\u0443\u0434\u0430\u0440\u044B\u04A3\u044B\u0437",
      idle: "\u041A\u04AF\u0442\u0443",
      starting: "\u041A\u0435\u04A3\u0435\u0439\u0442\u0456\u043C \u0456\u0441\u043A\u0435 \u049B\u043E\u0441\u044B\u043B\u0443\u0434\u0430. \u0422\u0435\u0440\u0435\u0437\u0435\u043D\u0456 \u049B\u0430\u0439\u0442\u0430 \u0430\u0448\u044B\u04A3\u044B\u0437."
    },
    en: {
      guide: "Instructions",
      examLabel: "EXAM",
      noExam: "No exam connected",
      openApp: "Open KOSH!RME and join a room.",
      desktop: "Desktop app",
      monitoring: "Monitoring",
      pair: "Connect app",
      secret: "Code from app",
      secretPlaceholder: "Enter the code from the app",
      connect: "Connect manually",
      autoPair: "Paste code and connect",
      pairHelp: "If automatic connection is unavailable, enter the 8-character code from the app.",
      clipboardInvalid: "No pairing code was found in the clipboard. Copy it in the app or enter it manually.",
      clipboardDenied: "Automatic paste is unavailable. Enter the code from the app manually.",
      reconnect: "Reconnect",
      connected: "Connected",
      disconnected: "Disconnected",
      active: "ACTIVE",
      stopped: "STOPPED",
      protected: "Protected",
      attention: "Attention",
      idle: "Waiting",
      starting: "Extension is starting. Open the app again."
    }
  };
  function element(id) {
    return document.getElementById(id);
  }
  var language = "ru";
  var t = (key) => messages[language][key];
  function indicator(id, good) {
    const target = element(id);
    target.textContent = good ? t("connected") : t("disconnected");
    target.className = good ? "good" : "bad";
  }
  function renderStatic() {
    element("brand-title").textContent = language === "kz" ? "\u041A\u04E9\u0448\u0456\u0440\u043C\u0435" : "KOSH!RME";
    element("guide-link").textContent = t("guide");
    element("exam-label").textContent = t("examLabel");
    element("desktop-label").textContent = t("desktop");
    element("monitoring-label").textContent = t("monitoring");
    element("pair-summary").textContent = t("pair");
    element("secret-label").textContent = t("secret");
    element("secret").placeholder = t("secretPlaceholder");
    element("auto-pair-button").textContent = t("autoPair");
    element("connect-button").textContent = t("connect");
    element("pair-help").textContent = t("pairHelp");
    element("reconnect").textContent = t("reconnect");
  }
  async function update() {
    try {
      const status = await chrome.runtime.sendMessage({ type: "get_status" });
      element("exam").textContent = status.examTitle || t("noExam");
      element("allowed").textContent = status.allowedUrls.length ? status.allowedUrls.map((url) => new URL(url).hostname + new URL(url).pathname).join(" \xB7 ") : t("openApp");
      indicator("desktop", status.desktop);
      indicator("monitoring", status.monitoring);
      element("monitoring").textContent = status.monitoring ? t("active") : t("stopped");
      element("badge").textContent = status.monitoring && status.desktop ? t("protected") : status.monitoring ? t("attention") : t("idle");
      element("error").textContent = status.error || "";
      if (status.desktop) element("pairing").open = false;
    } catch {
      element("error").textContent = t("starting");
    }
  }
  async function pair(secret) {
    await chrome.runtime.sendMessage({ type: "pair", secret });
    await update();
  }
  element("pair-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void pair(element("secret").value.trim().toUpperCase());
  });
  element("auto-pair-button").addEventListener("click", () => {
    void (async () => {
      const input = element("secret");
      try {
        const granted = await chrome.permissions.request({ permissions: ["clipboardRead"] });
        if (!granted) throw new Error("permission");
        const secret = (await navigator.clipboard.readText()).trim().toUpperCase();
        if (!/^[A-Z0-9]{8}$/.test(secret)) {
          element("error").textContent = t("clipboardInvalid");
          input.focus();
          return;
        }
        input.value = secret;
        await pair(secret);
      } catch {
        element("error").textContent = t("clipboardDenied");
        input.focus();
      }
    })();
  });
  element("reconnect").addEventListener("click", () => {
    void chrome.runtime.sendMessage({ type: "reconnect" }).then(update);
  });
  element("language").addEventListener("change", (event) => {
    language = event.target.value;
    void chrome.storage.local.set({ language });
    renderStatic();
    void update();
  });
  void chrome.storage.local.get("language").then((saved) => {
    language = saved.language === "en" || saved.language === "kz" ? saved.language : "ru";
    element("language").value = language;
    renderStatic();
    void update();
  });
  setInterval(() => void update(), 1e3);
})();
