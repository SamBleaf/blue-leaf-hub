const KEY = "blue-leaf-hub.notification-prefs.v1";

const DEFAULTS = {
  reminderAuto: false,
  reminderDaysBefore: 2,
  emailOnQuoteReceived: false
};

export function loadNotificationPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveNotificationPrefs(patch) {
  const next = { ...loadNotificationPrefs(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
