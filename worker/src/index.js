// 기억의 정원 방 서버.
// 방 하나 = Durable Object 하나. 접속자 위치·동작은 중계만 하고,
// 꽃·음악·날씨·최근 대화는 방 저장소에 남겨 늦게 온 사람도 같은 상태를 본다.
import { DurableObject } from 'cloudflare:workers';

const MAX_PEERS = 16;
// index.html의 PRAYER_SPOTS와 동일하게 유지한다.
// index.html의 CENTERPIECE와 같은 값으로 맞춘다.
const CENTERPIECE='campfire';
const PRAYER_SPOTS=CENTERPIECE==='campfire'
  ?Array.from({length:16},(_,i)=>{const a=(i+.5)/16*Math.PI*2;return{x:Math.round(Math.sin(a)*370)/100,z:Math.round(Math.cos(a)*370)/100}})
  :Array.from({length:16},(_,i)=>({x:[-1.2,1.2,-3.6,3.6][i%4],z:7.6+Math.floor(i/4)*3.4}));
const TRACKS = ['dawn', 'wind', 'bowl', 'melody', 'banya'];
const WEATHER = ['auto', 'clear', 'rain', 'snow'];

const RPS_DISTANCE = 4, RPS_BREAK_DISTANCE = 6;
const RPS_INVITE_MS = 15000, RPS_RETAIN_MS = 30000;
const RPS_CHOICES = ['scissors', 'rock', 'paper'];
const RPS_BEATS = { scissors: 'paper', rock: 'scissors', paper: 'rock' };
const activeRps = g => g.status === 'invited' || g.status === 'playing';

const POSES = ['stand', 'sit', 'lie', 'prone', 'wave', 'pray', 'bow', 'coffee', 'beer', 'fuel', 'yoga', 'soda', 'soju', 'cheers', 'makgeolli'];
const POCHA_ITEMS = ['odeng', 'dakbal', 'egg', 'golbaeng', 'jeon', 'tteok', 'soju', 'beer', 'makgeolli', 'cider'];
const INVISIBLE = /[\u0000-\u001f\u007f​-‏‪-‮⁠-⁤﻿]/g;

const clean = (v, n) => (typeof v === 'string' ? v.replace(INVISIBLE, '').trim().slice(0, n) : '');
const num = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v * 100) / 100)) : null);

function cleanLook(l) {
  if (!l || typeof l !== 'object') return null;
  const o = {};
  for (const k of ['skin', 'hair', 'shirt', 'pants', 'shoe']) {
    if (!Number.isInteger(l[k]) || l[k] < 0 || l[k] > 0xffffff) return null;
    o[k] = l[k];
  }
  o.hs = l.hs === 1 ? 1 : 0;
  o.hat = !!l.hat;
  return o;
}
function cleanDog(d) {
  if (!d || !Number.isInteger(d.b) || d.b < 0 || d.b > 9) return null;
  return { b: d.b, n: clean(d.n, 8) };
}
function cleanState(s) {
  if (!s || typeof s !== 'object') return null;
  const x = num(s.x, -60, 60), z = num(s.z, -60, 60);
  if (x === null || z === null) return null;
  return { x, z, h: num(s.h, -1000, 1000) ?? 0, p: POSES.includes(s.p) ? s.p : 'stand', bp: num(s.bp, 0, 1) ?? 0 };
}
const validVideo = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v);

export class GardenRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rate = new Map();
    this.rps = [];
    ctx.blockConcurrencyWhile(async () => {
      this.shared = (await ctx.storage.get('shared')) || {
        flowers: [], music: { track: null, startedAt: 0, videoId: null }, weather: 'auto', chat: [],
      };
      if (!Array.isArray(this.shared.pocha)) this.shared.pocha = [];
      this.rps = (await ctx.storage.get('rpsGames')) || [];
      // Preserve a pending alarm when waking from hibernation.
      if (this.rps.length && await ctx.storage.getAlarm() === null) await this.armRpsAlarm();
    });
  }

  async fetch() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID().replace(/-/g, '').slice(0, 10), ready: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  readyPeers() {
    return this.ctx.getWebSockets().map((ws) => ({ ws, a: ws.deserializeAttachment() })).filter((p) => p.ws.readyState === 1 && p.a && p.a.ready);
  }
  assignPrayerSlot(a, preferred = null) {
    // 실제로 기도·절하는 동안만 자리를 사용한다. 서 있거나 떠나면 다시 빈자리다.
    const used = new Set(this.readyPeers()
      .filter(p => p.a.id !== a.id && ['pray', 'bow'].includes(p.a.s?.p))
      .map(p => p.a.prayerSlot).filter(Number.isInteger));
    if (Number.isInteger(preferred) && PRAYER_SPOTS[preferred] && !used.has(preferred)) {
      a.prayerSlot = preferred;
    } else if (!Number.isInteger(a.prayerSlot) || !PRAYER_SPOTS[a.prayerSlot] || used.has(a.prayerSlot)) {
      a.prayerSlot = PRAYER_SPOTS.findIndex((_, i) => !used.has(i));
    }
  }
  alignPrayerState(a) {
    if (!['pray', 'bow'].includes(a.s.p)) return;
    let preferred = 0, distance = Infinity;
    PRAYER_SPOTS.forEach((spot, slot) => {
      const d = Math.hypot(spot.x - a.s.x, spot.z - a.s.z);
      if (d < distance) { preferred = slot; distance = d; }
    });
    this.assignPrayerSlot(a, preferred);
    const spot = PRAYER_SPOTS[a.prayerSlot];
    if (spot) a.s = { ...a.s, x: spot.x, z: Math.round(spot.z * 100) / 100, h: Math.atan2(-spot.x, -spot.z) };
  }
  peerInfo(a) {
    return { id: a.id, name: a.name, look: a.look, dog: a.dog, prayerSlot: a.prayerSlot, lastChat: a.lastChat || null, s: a.s };
  }
  broadcast(msg, except) {
    const text = JSON.stringify(msg);
    for (const { ws } of this.readyPeers()) {
      if (ws === except) continue;
      try { ws.send(text); } catch (e) { /* closing socket */ }
    }
  }
  // Small per-connection budget: n messages per second for each kind.
  allow(a, kind, n) {
    const key = a.id + ':' + kind, now = Date.now(), r = this.rate.get(key);
    if (!r || now - r.t > 1000) { this.rate.set(key, { t: now, c: 1 }); return true; }
    if (r.c >= n) return false;
    r.c++;
    return true;
  }
  async save() {
    await this.ctx.storage.put('shared', this.shared);
  }


  // Game state is private to its two players. Choices never appear in shared or peer data.
  rpsFor(id) {
    return this.rps.find(g => activeRps(g) && g.players.includes(id))
      || [...this.rps].reverse().find(g => g.players.includes(id)) || null;
  }
  rpsView(game, id) {
    if (!game || !game.players.includes(id)) return null;
    const index = game.players.indexOf(id), other = game.players[1 - index];
    return {
      id: game.id, status: game.status, inviter: index === 0,
      opponent: { id: other, name: game.names[1 - index] },
      expiresAt: game.expiresAt, startAt: game.startAt || 0, deadline: game.deadline || 0,
      choice: game.choices[id] || null,
      opponentChoice: game.status === 'result' ? game.choices[other] : null,
      result: game.status === 'result' ? (game.winner === null ? 'draw' : game.winner === id ? 'win' : 'lose') : null,
      reason: game.reason || null,
    };
  }
  sendRps(game) {
    for (const { ws, a } of this.readyPeers()) {
      if (game.players.includes(a.id)) {
        try { ws.send(JSON.stringify({ t: 'rps_state', game: this.rpsView(game, a.id) })); } catch (e) {}
      }
    }
  }
  async armRpsAlarm() {
    const next = this.rps.length ? Math.min(...this.rps.map(g => g.expiresAt)) : null;
    if (next !== null) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, next));
    else await this.ctx.storage.deleteAlarm();
  }
  async saveRps() {
    await this.ctx.storage.put('rpsGames', this.rps);
    await this.armRpsAlarm();
  }
  finishRps(game, reason, now = Date.now()) {
    game.status = reason ? 'cancelled' : 'result';
    game.reason = reason || null;
    game.expiresAt = now + RPS_RETAIN_MS;
    if (!reason) {
      const [a, b] = game.players, left = game.choices[a], right = game.choices[b];
      game.winner = left === right ? null : RPS_BEATS[left] === right ? a : b;
    }
  }
  async advanceRps(now = Date.now()) {
    const changed = [];
    for (const game of this.rps) {
      if (activeRps(game) && now >= game.expiresAt) {
        const reason = game.status === 'invited' ? 'timeout'
          : game.players.every(id => RPS_CHOICES.includes(game.choices[id])) ? null : 'no_choice';
        this.finishRps(game, reason, now); changed.push(game);
      }
    }
    const count = this.rps.length;
    this.rps = this.rps.filter(g => activeRps(g) || g.expiresAt > now);
    if (changed.length || count !== this.rps.length) await this.saveRps();
    for (const game of changed) this.sendRps(game);
  }
  async alarm() {
    await this.advanceRps();
    await this.armRpsAlarm();
  }
  async cancelRpsFor(id, reason) {
    const games = this.rps.filter(g => activeRps(g) && g.players.includes(id));
    if (!games.length) return;
    await this.advanceRps();
    const cancelled = games.filter(activeRps);
    for (const game of cancelled) this.finishRps(game, reason);
    if (cancelled.length) await this.saveRps();
    for (const game of cancelled) this.sendRps(game);
  }
  async checkRpsDistance(id) {
    const game = this.rps.find(g => activeRps(g) && g.players.includes(id));
    if (!game) return;
    const peers = this.readyPeers(), pair = game.players.map(player => peers.find(p => p.a.id === player));
    if (pair.some(p => !p)) return this.cancelRpsFor(id, 'disconnected');
    if (Math.hypot(pair[0].a.s.x - pair[1].a.s.x, pair[0].a.s.z - pair[1].a.s.z) > RPS_BREAK_DISTANCE)
      await this.cancelRpsFor(id, 'away');
  }
  async handleRps(ws, a, m) {
    const error = code => { try { ws.send(JSON.stringify({ t: 'rps_error', code })); } catch (e) {} };
    if (!this.allow(a, 'rps', 5)) { error('slow'); return; }
    await this.advanceRps();
    const now = Date.now();
    if (m.t === 'rps_sync') {
      ws.send(JSON.stringify({ t: 'rps_state', game: this.rpsView(this.rpsFor(a.id), a.id) }));
      return;
    }
    if (m.t === 'rps_invite') {
      if (!this.allow(a, 'rpsi', 1)) { error('slow'); return; }
      if (typeof m.peer !== 'string' || m.peer === a.id) { error('peer'); return; }
      const other = this.readyPeers().find(p => p.a.id === m.peer);
      if (!other) { error('offline'); return; }
      if (this.rps.some(g => activeRps(g) && (g.players.includes(a.id) || g.players.includes(other.a.id)))) { error('busy'); return; }
      if (Math.hypot(a.s.x - other.a.s.x, a.s.z - other.a.s.z) > RPS_DISTANCE) { error('far'); return; }
      // Keep at most one completed match per player; a new invitation always takes priority.
      this.rps = this.rps.filter(g => !g.players.includes(a.id) && !g.players.includes(other.a.id));
      const game = { id: crypto.randomUUID(), players: [a.id, other.a.id], names: [a.name, other.a.name],
        status: 'invited', createdAt: now, expiresAt: now + RPS_INVITE_MS, choices: {} };
      this.rps.push(game); await this.saveRps(); this.sendRps(game); return;
    }
    const game = this.rps.find(g => g.id === m.game && g.players.includes(a.id));
    if (!game || !activeRps(game)) { error('ended'); return; }
    if (m.t === 'rps_reply') {
      if (game.status !== 'invited' || game.players[1] !== a.id || typeof m.accept !== 'boolean') { error('reply'); return; }
      if (!m.accept) this.finishRps(game, 'declined', now);
      else {
        const other = this.readyPeers().find(p => p.a.id === game.players[0]);
        if (!other) this.finishRps(game, 'disconnected', now);
        else if (Math.hypot(a.s.x - other.a.s.x, a.s.z - other.a.s.z) > RPS_DISTANCE) this.finishRps(game, 'away', now);
        else {
          game.status = 'playing';game.startAt = now + 800;game.deadline = game.startAt + 3000;game.expiresAt = game.deadline;
        }
      }
      await this.saveRps();this.sendRps(game);return;
    }
    if (m.t === 'rps_cancel') {
      this.finishRps(game, 'cancelled', now);await this.saveRps();this.sendRps(game);return;
    }
    if (m.t === 'rps_choose') {
      if (game.status !== 'playing' || now >= game.deadline || !RPS_CHOICES.includes(m.choice)) { error('choice'); return; }
      if (game.choices[a.id]) { error('locked'); return; }
      game.choices[a.id] = m.choice;
      await this.saveRps();this.sendRps(game);
    }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 4096) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const a = ws.deserializeAttachment();
    if (!a || !m || typeof m.t !== 'string') return;

    if (m.t === 'hello') {
      if (a.ready || a.handshaking) return;
      a.handshaking = true;
      ws.serializeAttachment(a);
      // 탭의 비공개 토큰에서 공개 접속 ID만 파생한다. 원문 토큰은 다른 사람에게 보내지 않는다.
      if (typeof m.resumeToken === 'string' && /^[a-f0-9]{64}$/.test(m.resumeToken)) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(m.resumeToken));
        a.id = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('').slice(0, 20);
      }
      const duplicates = this.readyPeers().filter(p => p.a.id === a.id);
      if (this.readyPeers().length - duplicates.length >= MAX_PEERS) {
        ws.send(JSON.stringify({ t: 'full', max: MAX_PEERS }));
        ws.close(4001, 'room full');
        return;
      }
      if (duplicates.length) a.lastChat = duplicates[0].a.lastChat || null;
      for (const prior of duplicates) {
        prior.a.ready = false;
        prior.ws.serializeAttachment(prior.a);
        try { prior.ws.send(JSON.stringify({ t: 'replaced' })); prior.ws.close(4002, 'session resumed'); } catch (e) {}
      }
      a.name = clean(m.name, 12) || '친구';
      a.look = cleanLook(m.look);
      a.dog = cleanDog(m.dog);
      a.s = cleanState(m.s) || { x: 0, z: 14, h: Math.PI, p: 'stand', bp: 0 };
      this.assignPrayerSlot(a);
      this.alignPrayerState(a);
      a.ready = true;
      a.handshaking = false;
      ws.serializeAttachment(a);
      await this.advanceRps();
      const peers = this.readyPeers().filter((p) => p.a.id !== a.id).map((p) => this.peerInfo(p.a));
      ws.send(JSON.stringify({ t: 'welcome', you: a.id, prayerSlot: a.prayerSlot, now: Date.now(), max: MAX_PEERS, peers, shared: this.shared, rps: this.rpsView(this.rpsFor(a.id), a.id) }));
      this.broadcast({ t: 'join', peer: this.peerInfo(a) }, ws);
      return;
    }
    if (!a.ready) return;
    if (['rps_invite', 'rps_reply', 'rps_cancel', 'rps_choose', 'rps_sync'].includes(m.t)) return this.handleRps(ws, a, m);

    switch (m.t) {
      case 'leave': {
        await this.webSocketClose(ws);
        return;
      }
      case 'state': {
        if (!this.allow(a, 's', 25)) return;
        const s = cleanState(m.s);
        if (!s) return;
        const wasPraying = ['pray', 'bow'].includes(a.s.p), previousSlot = a.prayerSlot;
        a.s = s;
        this.alignPrayerState(a);
        ws.serializeAttachment(a);
        if (['pray', 'bow'].includes(a.s.p) && (!wasPraying || previousSlot !== a.prayerSlot || Math.hypot(s.x - a.s.x, s.z - a.s.z) > .02)) {
          ws.send(JSON.stringify({ t: 'prayer_place', slot: a.prayerSlot }));
        }
        this.broadcast({ t: 'state', id: a.id, s: a.s }, ws);
        await this.checkRpsDistance(a.id);
        return;
      }
      case 'profile': {
        if (!this.allow(a, 'p', 2)) return;
        a.name = clean(m.name, 12) || a.name;
        a.look = cleanLook(m.look) || a.look;
        a.dog = cleanDog(m.dog) || a.dog;
        ws.serializeAttachment(a);
        this.broadcast({ t: 'profile', id: a.id, name: a.name, look: a.look, dog: a.dog }, ws);
        return;
      }
      case 'chat': {
        if (!this.allow(a, 'c', 1)) return;
        const text = clean(m.text, 200);
        if (!text) return;
        const msg = { id: a.id, name: a.name, text, at: Date.now() };
        a.lastChat = { text, at: msg.at };
        ws.serializeAttachment(a);
        this.shared.chat = this.shared.chat.concat(msg).slice(-50);
        await this.save();
        this.broadcast({ t: 'chat', ...msg });
        return;
      }
      case 'flower': {
        if (!this.allow(a, 'f', 2)) return;
        const c = Number.isInteger(m.c) && m.c >= 0 && m.c < 5 ? m.c : 0;
        this.shared.flowers = this.shared.flowers.concat(c).slice(-300);
        await this.save();
        this.broadcast({ t: 'flower', c, by: a.id });
        return;
      }
      case 'music': {
        if (!this.allow(a, 'm', 1)) return;
        if (m.track !== null && !TRACKS.includes(m.track)) return;
        const track = m.track;
        this.shared.music = { track, startedAt: Date.now(), videoId: track === 'banya' && validVideo(m.videoId) ? m.videoId : null, by: a.id };
        await this.save();
        this.broadcast({ t: 'music', music: this.shared.music, name: a.name });
        return;
      }
      case 'order': {
        // 포장마차 주문: 자리(0~7)와 차림표 항목만 받는다. 상차림은 방에 남겨 늦게 온 사람도 본다.
        if (!this.allow(a, 'o', 1) || !Number.isInteger(m.seat) || m.seat < 0 || m.seat > 7 || !POCHA_ITEMS.includes(m.item)) return;
        const order = { seat: m.seat, item: m.item, at: Date.now(), by: a.id };
        this.shared.pocha = this.shared.pocha.concat(order).slice(-48);
        await this.save();
        this.broadcast({ t: 'order', order, name: a.name });
        return;
      }
      case 'clearSeat': {
        if (!this.allow(a, 'x', 1) || !Number.isInteger(m.seat) || m.seat < 0 || m.seat > 7) return;
        this.shared.pocha = this.shared.pocha.filter(o => o.seat !== m.seat);
        await this.save();
        this.broadcast({ t: 'pocha', pocha: this.shared.pocha });
        return;
      }
      case 'cheers': {
        // 짠: 상태로 남기지 않고 지금 있는 사람들에게만 알린다. 같은 테이블 판단은 화면에서 한다.
        if (!this.allow(a, 'h', 1)) return;
        this.broadcast({ t: 'cheers', id: a.id, name: a.name }, ws);
        return;
      }
      case 'stoke': {
        // 장작 넣기: 상태로 남기지 않고 지금 있는 사람들에게만 불꽃 연출을 알린다.
        if (!this.allow(a, 'k', 1)) return;
        this.broadcast({ t: 'stoke', id: a.id, name: a.name }, ws);
        return;
      }
      case 'weather': {
        if (!this.allow(a, 'w', 1) || !WEATHER.includes(m.mode)) return;
        this.shared.weather = m.mode;
        await this.save();
        this.broadcast({ t: 'weather', mode: m.mode, name: a.name });
        return;
      }
      case 'ping': {
        if (!this.allow(a, 'g', 2)) return;
        ws.send(JSON.stringify({ t: 'pong', c: Number.isFinite(m.c) ? m.c : 0, s: Date.now() }));
        return;
      }
    }
  }

  async webSocketClose(ws) {
    const a = ws.deserializeAttachment();
    if (a && a.ready) {
      a.ready = false;
      ws.serializeAttachment(a);
      if (!this.readyPeers().some(p => p.a.id === a.id)) {
        this.broadcast({ t: 'leave', id: a.id }, ws);
        await this.cancelRpsFor(a.id, 'disconnected');
      }
    }
    if (a && !this.readyPeers().some(p => p.a.id === a.id)) {
      for (const key of this.rate.keys()) if (key.startsWith(a.id + ':')) this.rate.delete(key);
    }
    try { ws.close(1000, 'bye'); } catch (e) { /* already closed */ }
  }
  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    const m = url.pathname.match(/^\/room\/([a-z0-9-]{6,40})$/);
    if (!m) {
      if (env.ASSETS) return env.ASSETS.fetch(req);
      return new Response('기억의 정원 방 서버입니다.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket only', { status: 426 });
    const origins = env.ALLOWED_ORIGINS || (env.ASSETS ? url.origin : '');
    const allowed = origins.split(',').map((s) => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(req.headers.get('Origin') || '')) return new Response('origin not allowed', { status: 403 });
    // 통합 정원에서는 이전 링크를 열어도 모두 같은 공간으로 연결한다.
    const space = env.ASSETS ? 'memorygarden' : m[1];
    return env.ROOMS.get(env.ROOMS.idFromName(space)).fetch(req);
  },
};

