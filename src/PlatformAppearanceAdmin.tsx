import { useEffect, useState } from "react";
import { repository } from "./data/repository";
import { THEME_PRESETS, type ThemeId } from "./lib/appearance";

type Props = { setNotice: (notice: string) => void };

export default function PlatformAppearanceAdmin({ setNotice }: Props) {
  const [selectedTheme, setSelectedTheme] = useState<ThemeId | null>(null);
  const [savedTheme, setSavedTheme] = useState<ThemeId | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void repository.getDefaultWallpaperTheme().then((themeId) => {
      if (!active) return;
      setSelectedTheme(themeId);
      setSavedTheme(themeId);
      setError("");
    }).catch((caught) => {
      if (!active) return;
      setError(caught instanceof Error ? caught.message : "Could not load the default wallpaper.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (loading || saving) return;
    setSaving(true);
    setError("");
    try {
      await repository.adminSetDefaultWallpaperTheme(selectedTheme);
      setSavedTheme(selectedTheme);
      window.dispatchEvent(new CustomEvent<ThemeId | null>("platform-wallpaper-default-change", {
        detail: selectedTheme,
      }));
      setNotice(selectedTheme
        ? "Platform wallpaper default saved. Members without a personal appearance choice will see it the next time they open the app."
        : "Platform wallpaper default cleared. Members without a personal choice will use Classic Paper.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not save the platform wallpaper default.";
      setError(message);
      setNotice(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card card-pad platform-appearance-admin" aria-labelledby="platform-wallpaper-title">
      <div className="card-header">
        <span className="section-label" id="platform-wallpaper-title">Member wallpaper default</span>
        <span className="quiet">Primary admin only</span>
      </div>
      <p className="field-hint">
        Choose the starter study atmosphere for members who have not chosen a personal theme or uploaded a wallpaper.
        Any personal theme or uploaded wallpaper is preserved. Other members see changes the next time they open the app.
      </p>
      {error && <div className="connection-error" role="alert"><strong>Wallpaper setting</strong><span>{error}</span></div>}
      {loading ? <p className="quiet">Loading the current default…</p> : (
        <div className="theme-gallery platform-theme-gallery">
          {THEME_PRESETS.map((preset) => (
            <button
              className={`theme-card${selectedTheme === preset.id ? " selected" : ""}`}
              type="button"
              key={preset.id}
              aria-pressed={selectedTheme === preset.id}
              onClick={() => setSelectedTheme(preset.id)}
            >
              <span
                className="theme-card-preview"
                style={{ backgroundImage: preset.wallpaper
                  ? `linear-gradient(rgba(17, 24, 21, .18), rgba(17, 24, 21, .18)), url(${JSON.stringify(preset.wallpaper)})`
                  : "linear-gradient(135deg, #f3f0e7, #ded8ca)" }}
              >
                {selectedTheme === preset.id && <span className="theme-card-selected">Selected</span>}
              </span>
              <span className="theme-card-copy">
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
              </span>
            </button>
          ))}
          <button
            className={`theme-card${selectedTheme === null ? " selected" : ""}`}
            type="button"
            aria-pressed={selectedTheme === null}
            onClick={() => setSelectedTheme(null)}
          >
            <span className="theme-card-preview platform-theme-no-default" aria-hidden="true">
              {selectedTheme === null && <span className="theme-card-selected">Selected</span>}
            </span>
            <span className="theme-card-copy">
              <strong>Let members choose</strong>
              <span>No platform default; members without a saved choice use Classic Paper.</span>
            </span>
          </button>
        </div>
      )}
      <div className="platform-appearance-actions">
        <button className="primary-button" type="button" disabled={loading || saving || selectedTheme === savedTheme} onClick={() => void save()}>
          {saving ? "Saving…" : "Save member default"}
        </button>
        <span className="quiet">This does not overwrite personal themes or wallpaper uploads.</span>
      </div>
    </section>
  );
}
