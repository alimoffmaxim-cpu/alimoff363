// Сохранение прогресса в localStorage. Все обращения обёрнуты в try/catch:
// в приватном режиме Safari хранилище может быть недоступно — тогда приложение
// просто работает без сохранения.

const KEY = "wordflow.v1";

export const DEFAULT_SETTINGS = {
  newPerDay: 15,
  maxReviews: 200,
  direction: "both",      // "en-ru" | "ru-en" | "both"
  autoSpeak: true,
  voiceURI: "",
  rate: 0.9,
};

export function load() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {}
  data = data || {};
  return {
    cards: data.cards || {},
    log: data.log || {},
    decks: data.decks || {},
    settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
  };
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

// Просим iOS не удалять данные сайта при нехватке места.
export function requestPersistence() {
  try {
    navigator.storage?.persist?.();
  } catch {}
}
