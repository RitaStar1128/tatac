export interface MemoRecord {
  id: string;
  text: string;
  date: string;
  updatedAt?: string;
}

const STORAGE_KEY = "tatac_records";

const isMemoRecord = (value: unknown): value is MemoRecord => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<MemoRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.text === "string" &&
    typeof record.date === "string"
  );
};

export const getStoredRecords = (): MemoRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    return parsed.filter(isMemoRecord);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
};

export const setStoredRecords = (records: MemoRecord[]): boolean => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
};

