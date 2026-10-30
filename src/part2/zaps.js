import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { trackPoint } from './rideModel.js';

// The Lightning level's tesla coils and the Steam level's violet bolts from the sky (CONFIG.part2.fire.tesla / .skyBolts). Placeholder shapes only:
// posts with a glowing top, an additive beam across the lane and a ground ring / column for a sky bolt. Everything is timed from `time`, so a respawn
// needs no reset; `onHit({ damage, at, source })` is the level's damage (half a heart).

const F = CONFIG.part2.fire;
const add = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

export class Zaps {
  constructor({ scene, track, onHit, sound, cam }) {
    this.track = track;
    this.onHit = onHit;
    this.sound = sound;
    this.cam = cam;
    this.root = new THREE.Group();
    this.root.name = 'zaps';
    this.root.visible = false;
    scene.add(this.root);
    this.time = 0;
    this.coils = [];
    this.bolts = [];
    this.next = 0;
    this.stats = { coilHits: 0, boltHits: 0, strikes: 0 };
  }

  /** The coils of the level in use (call after the overlay is on). */
  build() {
    const T = F.tesla;
    const post = new THREE.MeshLambertMaterial({ color: 0x2a2c4a, emissive: 0x10123a });
    for (const c of T.coils) {
      const g = new THREE.Group();
      const centre = trackPoint(this.track, c.s, c.lat);
      const posts = [-1, 1].map((side) => {
        const at = trackPoint(this.track, c.s, c.lat + side * (T.halfWidth + 0.6)).pos;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, T.postHeight, 8), post);
        m.position.copy(at).setY(T.postHeight / 2);
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), add(T.color, 0.9));
        top.position.copy(at).setY(T.postHeight + 0.2);
        g.add(m, top);
        return top;
      });
      const beam = new THREE.Mesh(new THREE.BoxGeometry(T.halfWidth * 2, 0.35, T.depth), add(T.core, 0));
      beam.position.copy(centre.pos).setY(1.0);
      beam.rotation.y = centre.heading;
      g.add(beam);
      this.root.add(g);
      this.coils.push({ ...c, beam, posts, at: centre.pos, cycle: -1, warned: -1 });
    }
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28), add(F.skyBolts.color, 0));
      ring.rotation.x = -Math.PI / 2;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, F.skyBolts.height, 12, 1, true), add(F.skyBolts.core, 0));
      col.position.y = F.skyBolts.height / 2;
      const g = new THREE.Group();
      g.add(ring, col);
      g.visible = false;
      this.root.add(g);
      this.bolts.push({ g, ring, col, t: -1, at: new THREE.Vector3(), hit: false });
    }
  }

  /** @param {{ playing: boolean, pos: THREE.Vector3 }} o  the rider (the horse, or AJ on foot) */
  update(dt, { playing, pos }) {
    const T = F.tesla;
    const SB = F.skyBolts;
    if (dt > 0 && playing) this.time += dt;
    const n = this.track.nearest(pos.x, pos.z, 12);
    for (const c of this.coils) {
      const t = (this.time + c.phase) % T.period;
      const cycle = Math.floor((this.time + c.phase) / T.period);
      const warn = t >= T.period - T.warn - T.hold && t < T.period - T.hold;
      const hold = t >= T.period - T.hold;
      c.beam.material.opacity = hold ? 0.95 : warn ? 0.16 + 0.12 * Math.sin(this.time * 40) : 0;
      for (const p of c.posts) p.material.opacity = hold || warn ? 1 : 0.35;
      if (warn && c.warned !== cycle && n && Math.abs(n.s - c.s) < 60) {
        c.warned = cycle;
        this.sound?.play('hammer_swing', { position: c.at, pitch: 1.6, volume: 0.6 });
      }
      if (hold && playing && c.cycle !== cycle && n && Math.abs(n.s - c.s) < T.depth / 2 + 0.8 && Math.abs(n.lateral - c.lat) < T.halfWidth + 0.6 && pos.y < T.jumpClear) {
        c.cycle = cycle;
        this.stats.coilHits++;
        this.sound?.play('saw_hit', { position: pos, pitch: 1.4 });
        this.cam?.shake?.(0.2, 0.25);
        this.onHit?.({ damage: T.damage, at: pos.clone(), source: 'tesla' });
      }
    }
    if (SB.zones.length && playing && dt > 0 && n && SB.zones.some(([a, b]) => n.s >= a && n.s <= b)) {
      this.next -= dt;
      const free = this.bolts.find((b) => b.t < 0);
      if (this.next <= 0 && free) {
        this.next = SB.every[0] + Math.random() * (SB.every[1] - SB.every[0]);
        const ahead = n.s + SB.ahead[0] + Math.random() * (SB.ahead[1] - SB.ahead[0]);
        free.at.copy(trackPoint(this.track, Math.min(ahead, this.track.length - 5), (Math.random() * 2 - 1) * SB.lat).pos).setY(0.1);
        free.t = 0;
        free.hit = false;
        free.g.position.copy(free.at);
        free.g.visible = true;
        this.sound?.play('amy_magic_cast', { position: free.at, volume: 0.6 });
      }
    }
    for (const b of this.bolts) {
      if (b.t < 0) continue;
      if (dt > 0) b.t += dt;
      const strike = b.t >= SB.warn;
      b.ring.scale.setScalar(SB.radius * (strike ? 1 : 0.4 + 0.6 * (b.t / SB.warn)));
      b.ring.material.opacity = strike ? 0.9 : 0.35 + 0.2 * Math.sin(b.t * 30);
      b.col.scale.set(SB.radius * 0.5, 1, SB.radius * 0.5);
      b.col.material.opacity = strike ? 0.9 : 0;
      if (strike && !b.struck) {
        b.struck = true;
        this.stats.strikes++;
      }
      if (strike && !b.hit && playing && Math.hypot(pos.x - b.at.x, pos.z - b.at.z) < SB.radius) {
        b.hit = true;
        this.stats.boltHits++;
        this.sound?.play('fire_blast_hit', { position: b.at, pitch: 1.3 });
        this.cam?.shake?.(0.3, 0.3);
        this.onHit?.({ damage: SB.damage, at: pos.clone(), source: 'skybolt' });
      }
      if (b.t >= SB.warn + SB.hold) {
        b.t = -1;
        b.struck = false;
        b.g.visible = false;
      }
    }
  }

  /** The level is left or restarted: no bolt in the air. */
  reset() {
    for (const b of this.bolts) {
      b.t = -1;
      b.struck = false;
      b.g.visible = false;
    }
    this.next = 2;
  }
}
