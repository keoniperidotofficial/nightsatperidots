// Night at Peridots — v1
(() => {
  // Mapping (as specified by the user):
  // Kee = Purple, Olo = Yellow, Anza = Green, Retto = Red, Vida = White
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const clockEl = $('#clock');
  const startBtn = $('#startBtn');
  const retryBtn = $('#retryBtn');
  const overlay = $('#overlay');
  const overlayTitle = $('#overlayTitle');
  const overlayMsg = $('#overlayMsg');

  const lanesLeft = $$('.hall-left .lane');
  const lanesRight = $$('.hall-right .lane');

  const checkLeftBtn = $('#checkLeft');
  const checkRightBtn = $('#checkRight');

  // GAME CONSTANTS
  const NIGHT_MS = 120000; // 120s = one full night (12AM -> 6AM)
  const TICK_MS = 1200;    // movement tick
  const VIDA_START_HOUR = 4; // Vida begins after 4AM
  const PUSH_BACK_STEPS = 1; // how much a check pushes them back
  const MAX_POS = 3; // 0 far, 1 mid, 2 door, 3 office (jumpscare)
  const LEFT = 'left', RIGHT = 'right';

  let state = null;
  let tickTimer = null;
  let startTime = 0;

  function createPeridot(name, side, behavior){
    return {
      name, side, behavior,
      pos: 0, active: true, // active = can move/spawn
    };
  }

  // Assign sides: Kee & Anza on Left; Olo & Retto on Right; Vida spawns on the busier side.
  const peridotsBase = [
    createPeridot('Kee', LEFT, {speed: 0.5, teleport: 0, burst: 0.1}),      // balanced
    createPeridot('Olo', RIGHT, {speed: 0.45, teleport: 0.18, burst: 0.05}), // teleporter
    createPeridot('Anza', LEFT, {speed: 0.35, teleport: 0, burst: 0.05}),    // slow/steady
    createPeridot('Retto', RIGHT, {speed: 0.75, teleport: 0, burst: 0.25}),  // aggressive
    createPeridot('Vida', RIGHT, {speed: 0.65, teleport: 0.05, burst: 0.2}), // appears late
  ];

  function resetGame(){
    state = {
      over: false,
      win: false,
      peridots: JSON.parse(JSON.stringify(peridotsBase)).map(p => ({...p})),
      // Vida locked until 4AM
      vidaUnlocked: false,
    };
    state.peridots.forEach(p => p.pos = 0);
    render();
  }

  function currentHour(){
    // Map progress to 12->6
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / NIGHT_MS, 1);
    // 0.0 => 12 AM, 1.0 => 6 AM
    const hourFloat = 12 + progress * 6;
    const hour = Math.floor(hourFloat);
    const minute = Math.floor((hourFloat - hour) * 60);
    return {hour, minute, done: progress >= 1};
  }

  function formatClock(h, m){
    let dispH = h;
    let suffix = 'AM';
    if (h >= 12) suffix = 'AM';
    if (h >= 6) suffix = 'AM';
    if (h === 0) dispH = 12;
    if (h > 12) dispH = h - 12;
    const mm = String(m).padStart(2, '0');
    return `${dispH}:${mm} ${suffix}`;
  }

  function updateClock(){
    const {hour, minute, done} = currentHour();
    clockEl.textContent = formatClock(hour, minute);
    // unlock Vida after 4AM
    if (!state.vidaUnlocked && hour >= 4){
      state.vidaUnlocked = true;
    }
    if (done){
      // Player survives if we aren't already jumpscared
      winGame();
    }
  }

  function pickSideLoad(){
    // Which side currently has higher threat near the door?
    const leftMax = Math.max(...state.peridots.filter(p => p.side===LEFT).map(p => p.pos));
    const rightMax = Math.max(...state.peridots.filter(p => p.side===RIGHT).map(p => p.pos));
    return (rightMax > leftMax) ? RIGHT : LEFT;
  }

  function movementTick(){
    if (state.over) return;

    updateClock();

    // Choose a random Peridot that is allowed to act
    const hourNow = currentHour().hour;
    const candidates = state.peridots.filter(p => {
      if (p.name === 'Vida' && !state.vidaUnlocked) return false;
      return p.active;
    });
    if (candidates.length === 0) return;

    let p = candidates[Math.floor(Math.random() * candidates.length)];

    // Vida prefers the busier side
    if (p.name === 'Vida'){
      p.side = pickSideLoad();
    }

    // Movement logic
    const r = Math.random();
    // Teleport behavior (e.g., Olo): can jump to mid/door sometimes
    if (p.behavior.teleport > 0 && r < p.behavior.teleport){
      p.pos = Math.min(2, p.pos + 1 + Math.round(Math.random())); // jump 1-2 steps toward door
    } else {
      // Regular speed-based move
      if (r < p.behavior.speed){
        p.pos = Math.min(MAX_POS, p.pos + 1);
      }
      // Occasional burst for aggressive ones (e.g., Retto)
      if (Math.random() < p.behavior.burst){
        p.pos = Math.min(MAX_POS, p.pos + 1);
      }
    }

    // Jumpscare check
    if (p.pos >= MAX_POS){
      return loseGame(p);
    }

    render();
  }

  function clearLanes(){
    lanesLeft.forEach(el => el.innerHTML = '');
    lanesRight.forEach(el => el.innerHTML = '');
  }

  function render(){
    clearLanes();
    // Place peridots in left/right lanes by position (0..2)
    state.peridots.forEach(p => {
      const el = document.createElement('div');
      el.className = `peridot ${p.name}`;
      el.textContent = p.name[0]; // first letter
      const laneIdx = Math.max(0, Math.min(2, p.pos)); // clamp 0-2 for display
      const lanes = (p.side === LEFT) ? lanesLeft : lanesRight;
      lanes[laneIdx].appendChild(el);
    });
  }

  function pushBack(side){
    if (state.over) return;
    const group = state.peridots.filter(p => p.side === side);
    group.forEach(p => {
      if (p.pos > 0){
        p.pos = Math.max(0, p.pos - PUSH_BACK_STEPS);
      }
    });
    // Tiny stun to reduce immediate re-push
    group.forEach(p => p.active = false);
    setTimeout(() => group.forEach(p => p.active = true), 700);
    render();
  }

  function startGame(){
    resetGame();
    startTime = Date.now();
    clockEl.textContent = '12:00 AM';
    overlay.classList.add('hidden');
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(movementTick, TICK_MS);
  }

  function winGame(){
    if (state.over) return;
    state.over = true;
    state.win = true;
    if (tickTimer) clearInterval(tickTimer);
    overlayTitle.textContent = '6:00 AM';
    overlayMsg.textContent = 'You survived the Night at Peridots. 🎉';
    overlay.classList.remove('hidden');
  }

  function loseGame(byPeridot){
    if (state.over) return;
    state.over = true;
    state.win = false;
    if (tickTimer) clearInterval(tickTimer);
    overlayTitle.textContent = 'JUMPSCARE!';
    overlayMsg.textContent = `${byPeridot.name} got you at the door... Try again.`;
    overlay.classList.remove('hidden');
  }

  // Bindings
  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);
  checkLeftBtn.addEventListener('click', () => pushBack(LEFT));
  checkRightBtn.addEventListener('click', () => pushBack(RIGHT));

  // Keyboard helpers
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'a' || e.key === 'ArrowLeft') pushBack(LEFT);
    if (e.key.toLowerCase() === 'd' || e.key === 'ArrowRight') pushBack(RIGHT);
    if (e.key.toLowerCase() === ' '){ e.preventDefault(); if (!state || state.over) startGame(); }
  });

  // Initial paint
  resetGame();
  render();
})();