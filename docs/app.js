// Shared ball logic. Each page sets window.BALL = { answers, code } and window.LANGS = { code: path }.
(function () {
  const ball = document.getElementById("ball");
  const win = document.getElementById("window");
  const text = document.getElementById("answer-text");
  const q = document.getElementById("q");
  const select = document.getElementById("lang");
  const answers = window.BALL.answers;
  let last = -1, busy = false;

  function pick() {
    let i;
    do { i = Math.floor(Math.random() * answers.length); } while (i === last && answers.length > 1);
    last = i;
    return answers[i];
  }

  function fitText(el) {
    let size = Math.max(8, Math.round(el.clientWidth / 6));
    el.style.fontSize = size + "px";
    while (size > 7 && (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)) {
      size -= 0.5;
      el.style.fontSize = size + "px";
    }
  }

  function shake() {
    if (busy) return;
    busy = true;
    text.textContent = "";
    win.innerHTML = "";
    ball.classList.remove("shake");
    void ball.offsetWidth;
    ball.classList.add("shake");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      const a = pick();
      win.innerHTML = '<div class="tri reveal"><span></span></div>';
      const span = win.querySelector("span");
      span.textContent = a;
      fitText(span);
      text.textContent = a;
      busy = false;
    }, reduced ? 50 : 700);
  }

  ball.addEventListener("click", shake);
  q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); shake(); } });

  function remember(code) { try { localStorage.setItem("lang", code); } catch (e) {} }
  select.addEventListener("change", () => {
    remember(select.value);
    location.href = window.ROOT + window.LANGS[select.value];
  });
  document.querySelectorAll(".langs a").forEach(a => a.addEventListener("click", () => remember(a.dataset.code)));
})();
