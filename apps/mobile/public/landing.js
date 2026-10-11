// Gate E: the landing page's motion. Shared by welcome.html and welcome.en.html; each page
// holds its own words in <script type="application/json" id="demo-script">.
// With "reduce motion" nothing moves: the phone shows its last scene, the envelopes are full.
(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Sections enter as they scroll into view, once.
  const reveal = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        reveal.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  document.querySelectorAll('.reveal').forEach((el) => (still ? el.classList.add('in') : reveal.observe(el)));

  // The three envelopes fill, and their amounts count to the final number.
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const count = (el) => {
    const from = +el.dataset.from;
    const to = +el.dataset.to;
    const tpl = el.dataset.tpl;
    if (still) return void (el.textContent = tpl.replace('#', fmt(to)));
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 1100);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = tpl.replace('#', fmt(from + (to - from) * eased));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const fill = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.querySelectorAll('.env').forEach((env, i) =>
          setTimeout(() => {
            env.classList.add('filled');
            const n = env.querySelector('[data-to]');
            if (n) count(n);
          }, still ? 0 : i * 180),
        );
        fill.unobserve(e.target);
      }
    },
    { threshold: 0.35 },
  );
  document.querySelectorAll('.envs').forEach((el) => fill.observe(el));

  // The phone: types an amount, taps an envelope, the envelope takes it. Loops while on
  // screen; the button under it pauses it (WCAG 2.2.2), and it stops when scrolled away.
  const phone = document.querySelector('.phone');
  const scriptEl = document.getElementById('demo-script');
  if (!phone || !scriptEl) return;
  const S = JSON.parse(scriptEl.textContent);
  const amount = phone.querySelector('.amount');
  const prompt = phone.querySelector('.prompt');
  const save = phone.querySelector('.save');
  const toast = phone.querySelector('.toast');
  const finger = phone.querySelector('.finger');
  const envs = [...phone.querySelectorAll('.menv')];
  const toggle = document.querySelector('.demo-toggle');
  const initial = envs.map((e) => ({ w: e.style.getPropertyValue('--w'), text: e.querySelector('span').textContent, close: e.classList.contains('close') }));

  const showAmount = (digits) => {
    amount.innerHTML = digits ? `${fmt(+digits)}<span class="caret"></span> ₪` : '<span class="ph">0</span><span class="caret"></span> ₪';
  };
  const reset = () => {
    envs.forEach((e, i) => {
      e.style.setProperty('--w', initial[i].w);
      e.querySelector('span').textContent = initial[i].text;
      e.classList.toggle('close', initial[i].close);
    });
    showAmount('');
    prompt.textContent = S.prompt;
    prompt.classList.remove('close');
    save.textContent = S.saveIdle;
    save.classList.remove('on');
    toast.classList.remove('show');
  };
  const tapOn = async (el) => {
    const s = phone.querySelector('.screen').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    finger.style.left = `${r.left - s.left + r.width / 2 - 22}px`;
    finger.style.top = `${r.top - s.top + r.height / 2 - 22}px`;
    finger.classList.add('down');
    el.classList.add('pressed');
    await sleep(260);
    el.classList.remove('pressed');
    finger.classList.remove('down');
  };

  // One round: the steps of S.rounds[i].
  const play = async (round, alive) => {
    const env = envs[round.env];
    for (let i = 1; i <= round.digits.length; i++) {
      if (!alive()) return;
      await sleep(260);
      showAmount(round.digits.slice(0, i));
    }
    prompt.textContent = round.prompt;
    prompt.classList.toggle('close', !!round.close);
    save.textContent = round.save;
    save.classList.add('on');
    await sleep(900);
    if (!alive()) return;
    await tapOn(env);
    env.style.setProperty('--w', round.w);
    env.querySelector('span').textContent = round.after;
    env.classList.toggle('close', !!round.close);
    env.classList.remove('flash');
    void env.offsetWidth;
    env.classList.add('flash');
    showAmount('');
    prompt.textContent = S.prompt;
    prompt.classList.remove('close');
    save.textContent = S.saveIdle;
    save.classList.remove('on');
    toast.querySelector('b').textContent = round.toast;
    toast.classList.add('show');
    await sleep(1900);
    toast.classList.remove('show');
    await sleep(500);
  };

  let running = false;
  let paused = false;
  let visible = false;
  let generation = 0;
  const loop = async () => {
    if (running) return;
    running = true;
    const mine = ++generation;
    const alive = () => mine === generation && !paused && visible;
    while (alive()) {
      reset();
      await sleep(700);
      for (const round of S.rounds) {
        if (!alive()) break;
        await play(round, alive);
      }
      await sleep(600);
    }
    running = false;
  };
  const stop = () => {
    generation++;
    running = false;
  };

  // Reduced motion: the phone shows the end of the story, standing still.
  if (still) {
    const last = S.rounds[S.rounds.length - 1];
    S.rounds.forEach((r) => {
      envs[r.env].style.setProperty('--w', r.w);
      envs[r.env].querySelector('span').textContent = r.after;
      envs[r.env].classList.toggle('close', !!r.close);
    });
    showAmount('');
    toast.querySelector('b').textContent = last.toast;
    toast.classList.add('show');
    if (toggle) toggle.hidden = true;
    return;
  }

  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible && !paused) loop();
      else stop();
    },
    { threshold: 0.3 },
  ).observe(phone);

  toggle?.addEventListener('click', () => {
    paused = !paused;
    toggle.textContent = paused ? S.play : S.pause;
    toggle.setAttribute('aria-pressed', String(paused));
    if (paused) stop();
    else if (visible) loop();
  });
})();
