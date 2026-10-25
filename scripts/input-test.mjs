// Headless touch-routing test (TouchRouter): joystick + camera drag + buttons at the same
// time, each touch tracked by its identifier; lost/cancelled touches; enlarged hit areas.
// Usage: npm run test:input   (exits non-zero on failure)
import { TouchRouter, HoldTimer, buttonLayout } from '../src/input.js';
import { CONFIG } from '../src/config.js';

const W = 900;
const buttons = [
  { name: 'attack', x: 820, y: 330, r: 52 },
  { name: 'jump', x: 700, y: 352, r: 38 },
  { name: 'dodge', x: 850, y: 210, r: 32 },
  { name: 'gallop', x: 610, y: 346, r: 38, hold: true },
];
const R = new TouchRouter(() => buttons, () => W);
let failed = false;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed = true; };

// 1) Joystick (id 7, left), camera drag (id 3, right, open area) and Jump (id 12) together.
check(R.start(7, 120, 300) === 'joy', 'left-half touch → joystick');
check(R.start(3, 560, 120) === 'look', 'right-half touch away from buttons → camera drag');
R.move(7, 120, 240); // push up
R.move(3, 600, 130);
check(R.start(12, 700, 352) === 'button:jump', 'tap on Jump while moving and looking → jump');
let taps = R.consume();
check(taps.has('jump') && R.joy.y > 0.9 && R.look.dx === 40, `jump pressed, joystick still forward (${R.joy.y.toFixed(2)}), look delta ${R.look.dx}`);
R.move(12, 705, 350); // a jitter on the button moves nothing else
check(R.joy.y > 0.9 && R.look.dx === 40, 'moving the Jump finger does not touch the joystick or camera');
R.end(12);
check(R.joy.id === 7 && R.look.id === 3, 'releasing Jump keeps the joystick and camera fingers');

// 2) Rapid taps: every tap is a new press (no stuck "held" state).
let presses = 0;
for (let i = 0; i < 5; i++) { R.start(20 + i, 702, 355); if (R.consume().has('jump')) presses++; R.end(20 + i); }
check(presses === 5, `5 quick Jump taps → ${presses} presses`);

// 3) A lost touchend: the next touch event's active list drops the stale finger.
R.start(40, 700, 352); R.consume();
R.sync(new Set([7, 3])); // id 40 vanished without an end event
check(!R.owners.has(40), 'stale Jump touch dropped by sync');
R.start(41, 700, 352);
check(R.consume().has('jump'), 'Jump works again right after a lost touchend');
R.end(41);

// 4) Identifier reused without an end (some browsers recycle ids): treated as a new touch.
R.start(41, 700, 352); R.start(41, 700, 352);
check(R.consume().has('jump') && R.owners.size === 3, 'reused identifier → a fresh press, no leak');
R.end(41);

// 5) Larger hit areas: a tap just outside the drawn button still counts; the nearest button wins.
const edge = buttons[1].r * (CONFIG.input.buttonHitScale - 0.05);
check(R.start(50, 700, 352 - edge) === 'button:jump', `tap ${edge.toFixed(0)} px from Jump's centre (drawn radius ${buttons[1].r}) → jump`);
R.end(50);
check(R.start(51, 760, 340) === 'button:attack', 'between Jump and Attack → the nearer one (Attack)');
R.end(51);

// 6) Hold button (Gallop) is held only while its own finger stays down.
R.start(60, 610, 346);
const held = R.held.has('gallop');
R.start(61, 700, 352); R.end(61); // tapping Jump meanwhile
const stillHeld = R.held.has('gallop');
R.end(60);
check(held && stillHeld && !R.held.has('gallop'), 'Gallop held by its own finger, unaffected by a Jump tap, released on its touchend');

// 7) touchcancel ends the joystick and camera cleanly; a second left touch can't steal the stick.
check(R.start(70, 200, 300) === null, 'second left-half finger does not steal the joystick');
R.end(7); R.end(3); // (cancel)
check(R.joy.id === null && R.joy.x === 0 && R.joy.y === 0 && R.look.id === null, 'cancel releases joystick (centred) and camera drag');
check(R.start(71, 150, 280) === 'joy', 'joystick free again for a new finger');
R.endAll();
check(R.owners.size === 0 && R.held.size === 0, 'endAll clears everything');

// Corner layout (two thumbs) on 20:9, 18:9 and 16:9 landscape phones, with and without
// notch / navigation-bar insets: every button ≥ minButton, no overlaps, all on screen in the
// bottom-right (right half, nothing in the middle), and a tap on each goes to that button.
{
  const LY = CONFIG.input.layout;
  for (const mode of ['foot', 'ride', 'foot2', 'ride2']) { // (foot2 / ride2: Part 2's fighting levels — Jump / Gallop, the Batarang and Fire Blast)
    for (const [w, h] of CONFIG.input.checkSizes) {
      for (const safe of [{ right: 0, bottom: 0 }, { right: 44, bottom: 21 }]) {
        const circles = buttonLayout(mode, w, h, safe);
        const small = circles.filter((c) => c.r * 2 < LY.minButton).map((c) => c.name);
        // (the Dismount button while riding: small, top right under the gem counters — its fallback spot)
        const D = CONFIG.input.dismount;
        const dismount = mode === 'ride' ? { name: 'dismount', x: w - safe.right - D.fallback.right - D.size / 2, y: D.fallback.top + D.size / 2, r: D.size / 2 } : null;
        const overlaps = [];
        let minGap = Infinity;
        const all = dismount ? [...circles, dismount] : circles;
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
          const a = all[i], b = all[j];
          const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
          if (gap < LY.minGap) overlaps.push(`${a.name}/${b.name} (${gap.toFixed(0)}px)`);
          minGap = Math.min(minGap, gap);
        }
        const off = circles.filter((c) => c.x - c.r < w / 2 || c.x + c.r > w - safe.right || c.y - c.r < h * 0.15 || c.y + c.r > h - safe.bottom).map((c) => c.name);
        const R2 = new TouchRouter(() => circles.map((c) => ({ ...c })), () => w);
        const routed = circles.filter((c, i) => R2.start(100 + i, c.x, c.y) === `button:${c.name}`).length;
        const corner = circles.find((c) => c.name === { foot: 'attack', ride: 'gallop', foot2: 'jump', ride2: 'gallop' }[mode]);
        const nearest = Math.max(...circles.map((c) => c.x + c.y)) === corner.x + corner.y;
        check(!small.length && !overlaps.length && !off.length && routed === circles.length && nearest && !circles.some((c) => c.name === 'mount' && mode.startsWith('ride')),
          `${mode} ${w}x${h}${safe.right ? ' (insets)' : ''}: ${circles.length} corner buttons ≥ ${LY.minButton}px${small.length ? ' SMALL ' + small : ''}, clear space ≥ ${LY.minGap}px between them${dismount ? ' and the Dismount button' : ''} (min ${minGap.toFixed(0)}px)${overlaps.length ? ' TOO CLOSE ' + overlaps.join(' ') : ''}, off-corner ${off.join(' ') || 'none'}, taps routed ${routed}/${circles.length}, ${corner.name} in the corner`);
      }
    }
  }
}

// Dismount: not in the corner cluster; small (≈44 px), under the gem counters at the top right;
// a hold (0.4 s), never a tap; only while the horse is slow enough; once per press.
{
  const D = CONFIG.input.dismount;
  check(!CONFIG.input.layout.ride.dismount && !CONFIG.input.layout.ride.mount && D.size === 44 && D.maxSpeed === 3 && D.holdSeconds === 0.4, `Dismount: ${D.size}px, top right (not in the corner cluster), hold ${D.holdSeconds} s, only below speed ${D.maxSpeed}`);
  const dt = 1 / 60;
  const run = (secs, down, allowed, h) => { let fired = 0; for (let t = 0; t < secs - 1e-9; t += dt) if (h.update(dt, down, allowed)) fired++; return fired; };
  const h = new HoldTimer(D.holdSeconds);
  const tap = run(0.15, true, true, h) + run(0.1, false, true, h);
  const moving = run(1, true, false, h) + run(0.05, false, true, h);
  const half = run(0.3, true, true, h);
  const prog = h.progress;
  const done = run(0.15, true, true, h);
  const keep = run(1, true, true, h); // still holding after it fired: no repeat
  const again = run(0.05, false, true, h) + run(0.45, true, true, h);
  const stopMid = run(0.3, false, true, h) + run(0.25, true, true, h) + run(0.2, true, false, h) + run(0.25, true, true, h); // the horse starts moving mid-hold: starts over
  check(tap === 0 && moving === 0 && prog > 0.7 && prog < 0.8 && done === 1 && keep === 0 && again === 1 && stopMid === 0 && h.progress > 0.6,
    `hold to dismount: a tap does nothing, nothing while the horse moves, the ring fills (${prog.toFixed(2)} at 0.3 s), fires once at ${D.holdSeconds} s, no repeat while still held, again on a new press; the horse moving mid-hold restarts it`);
}

console.log(failed ? 'INPUT TEST FAILED' : 'input test passed');
process.exit(failed ? 1 : 0);
