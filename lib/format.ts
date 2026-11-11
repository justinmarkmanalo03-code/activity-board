export const PRESENCE_TTL_SECONDS = 120;
export const PRESENCE_PING_SECONDS = 15;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
export const ATTACHMENT_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "rtf",
  "odt", "ods", "odp", "zip", "png", "jpg", "jpeg", "gif", "webp",
];

export const LIST_COLORS = [
  "#ffffff", "#f1f5f9", "#e2e8f0", "#dbeafe",
  "#e0f2fe", "#ccfbf1", "#dcfce7", "#fef9c3",
  "#ffedd5", "#ffe4e6", "#fae8ff", "#ede9fe",
];

export function avatarInitial(username: string | null | undefined): string {
  const trimmed = (username ?? "").trim();
  return trimmed === "" ? "?" : trimmed.charAt(0).toUpperCase();
}

export function isOnline(lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() <= PRESENCE_TTL_SECONDS * 1000;
}

export function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, power);
  return `${value >= 10 || power === 0 ? Math.round(value) : value.toFixed(1)} ${units[power]}`;
}

export function formatDue(date: string | null, time: string | null | undefined): string {
  if (!date) return "";
  const stamp = new Date(`${date}T00:00:00`);
  if (Number.isNaN(stamp.getTime())) return date;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (time) {
    const [h, m] = time.split(":").map(Number);
    stamp.setHours(h || 0, m || 0);
    return stamp.toLocaleString(undefined, { ...opts, hour: "numeric", minute: "2-digit" });
  }
  return stamp.toLocaleDateString(undefined, opts);
}

export function displayDate(value: string | null | undefined): string {
  if (!value) return "";
  const stamp = new Date(value);
  return Number.isNaN(stamp.getTime())
    ? String(value)
    : stamp.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fileExtension(name: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

// Accepts "example.com/file" or "https://example.com/file" and returns a
// normalized http(s) URL, or null when the input is not a usable web link.
export function normalizeLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
