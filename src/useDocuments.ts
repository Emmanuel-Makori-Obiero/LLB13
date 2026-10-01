import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "./data/repository";
import { deleteMaterial, listMyMaterials, uploadMaterial } from "./lib/ai";

export type Doc = {
  id: string;
  title: string;
  citation: string | null;
  scope: string;
  created_at: string;
};

/** The user's uploaded documents plus shared library books, with selection, upload and delete. */
export function useDocuments() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setDocs((await listMyMaterials()) as Doc[]);
    } catch {
      setNote("Could not load your documents.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-10)));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setNote("");
    for (const file of Array.from(files)) {
      try {
        const r = await uploadMaterial(file);
        setNote(`Uploaded ${file.name} (${r.chunks} sections).`);
        setSelected((s) => [...s, r.id].slice(-10));
      } catch (e) {
        setNote((e as Error).message);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
    setUploading(false);
    void refresh();
  };

  const remove = async (d: Doc) => {
    if (!window.confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
    await deleteMaterial(d.id);
    setSelected((s) => s.filter((x) => x !== d.id));
    void refresh();
  };

  return {
    docs,
    mine: docs.filter((d) => d.scope === "user"),
    shared: docs.filter((d) => d.scope !== "user"),
    selected,
    toggle,
    upload,
    remove,
    uploading,
    note,
    fileRef,
  };
}
