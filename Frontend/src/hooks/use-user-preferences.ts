import { useCallback, useState } from "react";

/** Preferensi personal per perangkat (tanpa backend — lihat SettingService: hanya key company). */
export type UserPreferences = {
  notifStok: boolean;
  emailDaily: boolean;
  densityMode: boolean;
};

const STORAGE_KEY = "kg-prefs";

const DEFAULTS: UserPreferences = {
  notifStok: true,
  emailDaily: false,
  densityMode: false,
};

function load(): UserPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      notifStok: typeof parsed.notifStok === "boolean" ? parsed.notifStok : DEFAULTS.notifStok,
      emailDaily: typeof parsed.emailDaily === "boolean" ? parsed.emailDaily : DEFAULTS.emailDaily,
      densityMode:
        typeof parsed.densityMode === "boolean" ? parsed.densityMode : DEFAULTS.densityMode,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Preferensi tersimpan otomatis saat diubah + tombol Simpan sebagai penegas. */
export function useUserPreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(load);

  const update = useCallback((patch: Partial<UserPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Penyimpanan penuh/diblokir — state memori tetap dipakai sesi ini.
      }
      return next;
    });
  }, []);

  return { prefs, update };
}
