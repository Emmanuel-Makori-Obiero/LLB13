import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: InstallPromptEvent | null = null;

export default function InstallButton({
  className = "secondary-button",
  label = "Download app",
}: {
  className?: string;
  label?: string;
}) {
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
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
    if (!deferredPrompt) {
      window.alert(
        "To install Group 13 Hub, open your browser menu and choose “Install app” or “Add to home screen”.",
      );
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    deferredPrompt = null;
    setCanInstall(false);
  };

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
            : "Add Group 13 Hub to your home screen"
      }
      aria-label={installed ? "Group 13 Hub is installed" : label}
    >
      <Download size={14} /> {installed ? "App installed" : label}
    </button>
  );
}
