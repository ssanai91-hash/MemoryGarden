// 기억의 정원 방 서버.
// 방 하나 = Durable Object 하나. 접속자 위치·동작은 중계만 하고,
// 꽃·음악·날씨·최근 대화는 방 저장소에 남겨 늦게 온 사람도 같은 상태를 본다.
import { DurableObject } from 'cloudflare:workers';

const MAX_PEERS = 16;
// index.html의 PRAYER_SPOTS와 동일하게 유지한다.
const PRAYER_SPOTS=Array.from({length:16},(_,i)=>({x:[-1.2,1.2,-3.6,3.6][i%4],z:7.6+Math.floor(i/4)*3.4}));
const TRACKS = ['dawn', 'wind', 'bowl', 'melody', 'banya'];
const WEATHER = ['auto', 'clear', 'rain', 'snow'];
const POSES = ['stand', 'sit', 'lie', 'wave', 'pray', 'bow', 'coffee'];
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
    ctx.blockConcurrencyWhile(async () => {
      this.shared = (await ctx.storage.get('shared')) || {
        flowers: [], music: { track: null, startedAt: 0, videoId: null }, weather: 'auto', chat: [],
      };
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
  assignPrayerSlot(a) {
    const used = new Set(this.readyPeers().filter(p => p.a.id !== a.id).map(p => p.a.prayerSlot).filter(Number.isInteger));
    if (!Number.isInteger(a.prayerSlot) || !PRAYER_SPOTS[a.prayerSlot] || used.has(a.prayerSlot)) {
      a.prayerSlot = PRAYER_SPOTS.findIndex((_, i) => !used.has(i));
    }
  }
  alignPrayerState(a) {
    if (!['pray', 'bow'].includes(a.s.p)) return;
    this.assignPrayerSlot(a);
    const spot = PRAYER_SPOTS[a.prayerSlot];
    if (spot) a.s = { ...a.s, x: spot.x, z: Math.round(spot.z * 100) / 100, h: Math.atan2(-spot.x, -spot.z) };
  }
  peerInfo(a) {
    return { id: a.id, name: a.name, look: a.look, dog: a.dog, prayerSlot: a.prayerSlot, s: a.s };
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

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 4096) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const a = ws.deserializeAttachment();
    if (!a || !m || typeof m.t !== 'string') return;

    if (m.t === 'hello') {
      if (a.ready) return;
      if (this.readyPeers().length >= MAX_PEERS) {
        ws.send(JSON.stringify({ t: 'full', max: MAX_PEERS }));
        ws.close(4001, 'room full');
        return;
      }
      a.name = clean(m.name, 12) || '친구';
      a.look = cleanLook(m.look);
      a.dog = cleanDog(m.dog);
      a.s = cleanState(m.s) || { x: 0, z: 14, h: Math.PI, p: 'stand', bp: 0 };
      this.assignPrayerSlot(a);
      this.alignPrayerState(a);
      a.ready = true;
      ws.serializeAttachment(a);
      const peers = this.readyPeers().filter((p) => p.a.id !== a.id).map((p) => this.peerInfo(p.a));
      ws.send(JSON.stringify({ t: 'welcome', you: a.id, prayerSlot: a.prayerSlot, now: Date.now(), max: MAX_PEERS, peers, shared: this.shared }));
      this.broadcast({ t: 'join', peer: this.peerInfo(a) }, ws);
      return;
    }
    if (!a.ready) return;

    switch (m.t) {
      case 'state': {
        if (!this.allow(a, 's', 25)) return;
        const s = cleanState(m.s);
        if (!s) return;
        a.s = s;
        this.alignPrayerState(a);
        ws.serializeAttachment(a);
        this.broadcast({ t: 'state', id: a.id, s: a.s }, ws);
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
      this.broadcast({ t: 'leave', id: a.id }, ws);
    }
    if (a) for (const key of this.rate.keys()) if (key.startsWith(a.id + ':')) this.rate.delete(key);
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

