// Озвучка английских слов встроенным синтезатором речи iPhone.

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
let voices = [];

function refresh() {
  if (!synth) return;
  voices = synth.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
}

if (synth) {
  refresh();
  synth.addEventListener?.("voiceschanged", refresh);
}

export const supported = () => !!synth;

export function englishVoices() {
  refresh();
  return voices;
}

function pickVoice(uri) {
  if (uri) {
    const v = voices.find((v) => v.voiceURI === uri);
    if (v) return v;
  }
  return (
    voices.find((v) => /en-US/i.test(v.lang) && /samantha|ava|allison|google/i.test(v.name)) ||
    voices.find((v) => /en-US/i.test(v.lang)) ||
    voices[0] ||
    null
  );
}

// Для озвучки убираем формы глаголов в скобках и многоточия.
export function cleanForSpeech(text) {
  return text.replace(/\([^)]*\)/g, "").replace(/…/g, "").trim();
}

export function speak(text, { voiceURI = "", rate = 0.9 } = {}) {
  if (!synth || !text) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(cleanForSpeech(text));
  const v = pickVoice(voiceURI);
  if (v) u.voice = v;
  u.lang = v?.lang || "en-US";
  u.rate = rate;
  synth.speak(u);
}
