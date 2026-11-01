import { useEffect, useState } from "react";
import { Download, ExternalLink, Share, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type DeviceKind = "ios" | "android" | "legacy" | "desktop";
let deferredPrompt: InstallPromptEvent | null = null;
let installedGlobally = false;
const installListeners = new Set<() => void>();
const notifyInstallState = () => installListeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notifyInstallState();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installedGlobally = true;
    notifyInstallState();
  });
}

function deviceKind(): DeviceKind {
  const ua = navigator.userAgent.toLowerCase();
  const isIPad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/.test(ua) || isIPad) return "ios";
  if (/android/.test(ua)) {
    // Older Nokia/Asha-style Android webviews and old Android browsers cannot install PWAs.
    if (
      /android\s([1-6])(?:\.|;)/.test(ua) ||
      /opera mini|opera mobi|ucbrowser/.test(ua)
    )
      return "legacy";
    return "android";
  }
  if (/series40|windows phone|kaios|j2me|blackberry|opera mini/.test(ua))
    return "legacy";
  return "desktop";
}

export default function InstallButton({
  className = "secondary-button",
  label = "Download app",
}: {
  className?: string;
  label?: string;
}) {
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [device, setDevice] = useState<DeviceKind>("desktop");
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    setDevice(deviceKind());
    const iosInstalled = Boolean(
      (navigator as Navigator & { standalone?: boolean }).standalone,
    );
    if (iosInstalled || window.matchMedia("(display-mode: standalone)").matches) {
      installedGlobally = true;
      setInstalled(true);
    }
    const sync = () => {
      setCanInstall(Boolean(deferredPrompt));
      setInstalled(installedGlobally);
    };
    installListeners.add(sync);
    sync();
    return () => {
      installListeners.delete(sync);
    };
  }, []);

  const install = async () => {
    if (installed) return;
    if (device === "ios") {
      setGuideOpen(true);
      return;
    }
    if (device === "legacy") {
      setGuideOpen(true);
      return;
    }
    if (!deferredPrompt) {
      setGuideOpen(true);
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    deferredPrompt = null;
    setCanInstall(false);
  };

  const fallback =
    device === "legacy"
      ? "Open web version"
      : device === "ios"
        ? "Add to Home Screen"
        : label;
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => void install()}
        title={
          installed
            ? "Group 13 Hub is installed"
            : canInstall
              ? "Install Group 13 Hub"
              : "Use Group 13 Hub in your browser"
        }
        aria-label={installed ? "Group 13 Hub is installed" : fallback}
      >
        {device === "legacy" ? <ExternalLink size={14} /> : <Download size={14} />}{" "}
        {installed ? "App installed" : fallback}
      </button>
      {guideOpen && (
        <div className="pwa-guide-backdrop" role="presentation" onClick={() => setGuideOpen(false)}>
          <section className="pwa-guide" role="dialog" aria-modal="true" aria-labelledby="pwa-guide-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="pwa-guide-close" aria-label="Close installation guide" onClick={() => setGuideOpen(false)}><X size={18} /></button>
            <p className="pwa-guide-kicker">Install Group 13 Hub</p>
            <h2 id="pwa-guide-title">Keep your study workspace one tap away.</h2>
            {device === "ios" ? (
              <ol className="pwa-guide-steps">
                <li>Open this page in <strong>Safari</strong>. Installation is not available from an in-app browser.</li>
                <li>Tap the <strong>Share</strong> button <Share size={15} aria-label="Share" />.</li>
                <li>Choose <strong>Add to Home Screen</strong>, then turn on <strong>Open as Web App</strong> if it appears.</li>
                <li>Tap <strong>Add</strong>. The Group 13 icon will appear on your Home Screen.</li>
              </ol>
            ) : device === "legacy" ? (
              <ol className="pwa-guide-steps">
                <li>Open the browser menu.</li>
                <li>Choose <strong>Add to home screen</strong>, <strong>Add shortcut</strong>, or <strong>Add bookmark</strong>.</li>
                <li>Name it <strong>Group 13 Hub</strong> and save it.</li>
              </ol>
            ) : (
              <ol className="pwa-guide-steps">
                <li>Open the browser menu.</li>
                <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                <li>Confirm <strong>Install</strong>. The icon will be added to your phone’s launcher.</li>
              </ol>
            )}
            <p className="pwa-guide-note">Your installed version uses the same secure website and receives future platform updates automatically when you reopen it.</p>
            <button type="button" className="pwa-guide-done" onClick={() => setGuideOpen(false)}>Done</button>
          </section>
        </div>
      )}
    </>
  );
}
