import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type DeviceKind = "ios" | "android" | "legacy" | "desktop";
let deferredPrompt: InstallPromptEvent | null = null;

function deviceKind(): DeviceKind {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
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

  useEffect(() => {
    setDevice(deviceKind());
    const iosInstalled = Boolean(
      (navigator as Navigator & { standalone?: boolean }).standalone,
    );
    if (iosInstalled || window.matchMedia("(display-mode: standalone)").matches)
      setInstalled(true);
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPrompt = event as InstallPromptEvent;
      setCanInstall(true);
    };
    const onInstalled = () => {
      deferredPrompt = null;
      setCanInstall(false);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (installed) return;
    if (device === "ios") {
      window.alert(
        "On iPhone or iPad: tap Share in Safari, then choose “Add to Home Screen”.",
      );
      return;
    }
    if (device === "legacy") {
      window.alert(
        "To put a Group 13 icon on this Nokia’s home screen, open the browser menu and choose Add to home screen, Add shortcut, or Add bookmark. If the browser asks for a name, enter Group 13. The browser may use the supplied Group 13 icon, although very old Nokia browsers control the icon themselves.",
      );
      return;
    }
    if (!deferredPrompt) {
      window.alert(
        "Open your browser menu and choose “Install app”, “Add to home screen”, or “Add shortcut”. The web version remains available if your browser does not support installation.",
      );
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
      {device === "legacy" ? (
        <ExternalLink size={14} />
      ) : (
        <Download size={14} />
      )}{" "}
      {installed ? "App installed" : fallback}
    </button>
  );
}
