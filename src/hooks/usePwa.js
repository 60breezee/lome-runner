import { useCallback, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

// beforeinstallprompt can fire before React mounts, so it is captured at module load.
let savedInstallPrompt = null;
const promptListeners = new Set();
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  savedInstallPrompt = event;
  promptListeners.forEach((listener) => listener(event));
});

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  window.navigator.standalone === true;

// iPadOS reports itself as a Mac, hence the touch check.
const isIos = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
  (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(savedInstallPrompt);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const handlePrompt = (event) => setInstallPrompt(event);
    const handleInstalled = () => {
      savedInstallPrompt = null;
      setInstallPrompt(null);
      setInstalled(true);
    };
    promptListeners.add(handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      promptListeners.delete(handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    // A prompt can only be used once; the browser fires a new beforeinstallprompt if it is still installable.
    savedInstallPrompt = null;
    setInstallPrompt(null);
  }, [installPrompt]);

  return {
    canPromptInstall: !installed && Boolean(installPrompt),
    needsIosInstallHelp: !installed && !installPrompt && isIos(),
    promptInstall,
  };
}

export function useAppUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      window.setInterval(() => {
        if (navigator.onLine) registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  return {
    updateAvailable: needRefresh,
    applyUpdate: () => updateServiceWorker(true),
    dismissUpdate: () => setNeedRefresh(false),
  };
}
