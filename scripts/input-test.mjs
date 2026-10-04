// Headless touch-routing test (TouchRouter): joystick + camera drag + buttons at the same
// time, each touch tracked by its identifier; lost/cancelled touches; enlarged hit areas.
// Usage: npm run test:input   (exits non-zero on failure)
import { TouchRouter } from '../src/input.js';
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

console.log(failed ? 'INPUT TEST FAILED' : 'input test passed');
process.exit(failed ? 1 : 0);
