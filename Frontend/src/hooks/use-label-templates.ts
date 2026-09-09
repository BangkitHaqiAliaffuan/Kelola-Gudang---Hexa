import { useCallback, useMemo, useState } from "react";
import { LABEL_TEMPLATES, validateTemplate, type LabelTemplate } from "@/lib/barcode-label";

/** Kunci penyimpanan template custom milik operator (per browser). */
const STORAGE_KEY = "kg-label-templates";

/** Draft editor: subset field yang bisa diubah operator. */
export type TemplateDraft = Pick<
  LabelTemplate,
  "cols" | "rows" | "marginMm" | "gapMm" | "showName" | "showMeta"
>;

export const BLANK_DRAFT: TemplateDraft = {
  cols: 3,
  rows: 2,
  marginMm: 10,
  gapMm: 0,
  showName: true,
  showMeta: true,
};

function readStored(): LabelTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is LabelTemplate =>
        typeof t === "object" &&
        t !== null &&
        typeof (t as LabelTemplate).id === "string" &&
        validateTemplate({
          name: String((t as LabelTemplate).name ?? ""),
          cols: Number((t as LabelTemplate).cols),
          rows: Number((t as LabelTemplate).rows),
          marginMm: Number((t as LabelTemplate).marginMm),
          gapMm: Number((t as LabelTemplate).gapMm),
        }) === null,
    );
  } catch {
    return [];
  }
}

/** Template label: preset read-only + custom milik operator (localStorage). */
export function useLabelTemplates() {
  const [custom, setCustom] = useState<LabelTemplate[]>(readStored);

  const persist = useCallback((next: LabelTemplate[]) => {
    setCustom(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage penuh/diblokir — state memori tetap dipakai sesi ini
    }
  }, []);

  const saveCustom = useCallback(
    (name: string, draft: TemplateDraft): { template?: LabelTemplate; error?: string } => {
      const error =
        validateTemplate({ ...draft, name }) ??
        (custom.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())
          ? "Nama template sudah dipakai"
          : null);
      if (error) return { error };
      const template: LabelTemplate = {
        ...draft,
        id: `custom-${Date.now()}`,
        name: name.trim(),
      };
      persist([...custom, template]);
      return { template };
    },
    [custom, persist],
  );

  const removeCustom = useCallback(
    (id: string) => persist(custom.filter((t) => t.id !== id)),
    [custom, persist],
  );

  const all = useMemo(() => [...LABEL_TEMPLATES, ...custom], [custom]);
  const byId = useCallback(
    (id: string): LabelTemplate => all.find((t) => t.id === id) ?? LABEL_TEMPLATES[1]!,
    [all],
  );

  return { presets: LABEL_TEMPLATES, custom, all, byId, saveCustom, removeCustom };
}
