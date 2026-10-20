// 月兔大挑战·限时赛 排行榜 API(Cloudflare Worker + KV)
//
// 规则:
//  - 活动时间(北京时间)2026/10/20 16:14 开始、2026/10/31 12:00 结束;时间一律以这台服务器为准,
//    结束后多给 5 分钟宽限让最后一刻的上传还送得进来。
//  - 一个玩家编号(playerId,游戏第一次打开自动产生)绑定一个名字;同名但编号不同 → 拒绝(name_taken)。
//  - 排名依据「排名分」= 月兔数 − 花掉的金币数(最低 0)。同一个玩家只留排名分最高的一笔;没有超过旧纪录就不写入(也省 KV 写入额度)。
//  - 活动结束后榜单先隐藏,管理者(/admin)看过前几名、删掉可疑纪录再按「公布」,玩家才看得到最终名次。
//  - 每位玩家一个 KV key(摘要放在 metadata 里),排行榜只用 list() 读取,不会有「读整份再写回」同时上传互相覆盖的问题。
//
// 部署后要:1) 绑定名叫 LEADERBOARD 的 KV namespace;2) 新增一个机密变量 ADMIN_TOKEN(管理页密码)。见 README.md。

const EVENT_ID = '2026-10b';   // 10/20 重新起算:换编号 = 全新榜单(旧编号 2026-10 的纪录还留在 KV,没有删)
const START_MS = Date.parse('2026-10-20T16:14:00+08:00');
const END_MS = Date.parse('2026-10-31T12:00:00+08:00');
const GRACE_MS = 5 * 60 * 1000;

const MAX_NAME_LEN = 16;
const MAX_RETURNED = 100;
const ID_RE = /^[A-Za-z0-9-]{16,64}$/;
const KEY_PREFIX = 'p:' + EVENT_ID + ':';
const PUBLISH_KEY = 'meta:' + EVENT_ID + ':published';

// 附带记录的统计数字:不影响排序,只拿来显示/称号判定/一致性检查
const COIN_PER_MATCH = 1;   // 每个兔兔/狗狗组合赚几枚金币,要跟游戏里的 COIN_PER_MATCH 一致
const STAT_FIELDS = ['coinsSpent', 'coinsEarned', 'score', 'bunnyMatches', 'dogfaceMatches', 'butterflyBursts', 'sunBursts', 'moonPoundings', 'moonBombs'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
};

// ---------- 小工具 ----------
function parseCount(value, max = 999999999) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > max) return null;
  return n;
}
function cleanName(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  if (s.length > MAX_NAME_LEN) s = s.slice(0, MAX_NAME_LEN);
  return s;
}
function nameKey(name) {
  return KEY_PREFIX + encodeURIComponent(name.normalize('NFKC').toLowerCase());
}
function toMeta(rec) {
  return { n: rec.name, r: rec.rabbits, p: rec.points, cs: rec.coinsSpent, ce: rec.coinsEarned, d: rec.date, s: rec.score, b: rec.bunnyMatches, g: rec.dogfaceMatches,
           bf: rec.butterflyBursts, su: rec.sunBursts, mp: rec.moonPoundings, mb: rec.moonBombs };
}
function fromMeta(m) {
  return { name: m.n, rabbits: m.r, points: m.p, coinsSpent: m.cs, coinsEarned: m.ce, date: m.d, score: m.s, bunnyMatches: m.b, dogfaceMatches: m.g,
           butterflyBursts: m.bf, sunBursts: m.su, moonPoundings: m.mp, moonBombs: m.mb };
}
function sortEntries(entries) {
  return entries.slice().sort((a, b) => b.points - a.points || b.rabbits - a.rabbits || a.date - b.date);
}
async function listAll(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.LEADERBOARD.list({ prefix: KEY_PREFIX, cursor, limit: 1000 });
    for (const k of page.keys) out.push({ key: k.name, meta: k.metadata });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}
async function isPublished(env) {
  return (await env.LEADERBOARD.get(PUBLISH_KEY)) === '1';
}
function phaseOf(now) {
  if (now < START_MS) return 'before';
  if (now < END_MS) return 'live';
  if (now <= END_MS + GRACE_MS) return 'grace';
  return 'closed';
}
function res(status, json) { return { status, json }; }

// ---------- 路由(纯函数,方便测试) ----------
async function route(method, path, body, headers, env, now) {
  if (!env.LEADERBOARD) return res(500, { ok: false, error: 'kv_not_bound' });

  if (path === '/status' && method === 'GET') {
    return res(200, { ok: true, now, start: START_MS, end: END_MS, grace: GRACE_MS, eventId: EVENT_ID, phase: phaseOf(now), published: await isPublished(env) });
  }

  if (path === '/leaderboard' && method === 'GET') {
    const phase = phaseOf(now);
    const published = await isPublished(env);
    if (phase === 'closed' && !published) return res(200, { ok: true, pending: true, phase, entries: [] });
    const entries = sortEntries((await listAll(env)).filter(x => x.meta).map(x => fromMeta(x.meta))).slice(0, MAX_RETURNED);
    return res(200, { ok: true, pending: false, phase, published, entries });
  }

  if (path === '/submit' && method === 'POST') return submit(body, env, now);

  if (path.startsWith('/admin/')) return admin(path, method, body, headers, env, now);

  return res(404, { ok: false, error: 'not_found' });
}

async function submit(body, env, now) {
  if (!body || typeof body !== 'object') return res(400, { ok: false, error: 'bad_json' });
  const phase = phaseOf(now);
  if (phase === 'before') return res(403, { ok: false, error: 'not_started' });
  if (phase === 'closed') return res(403, { ok: false, error: 'ended' });

  const name = cleanName(body.name);
  if (!name) return res(400, { ok: false, error: 'empty_name' });
  const playerId = typeof body.playerId === 'string' ? body.playerId : '';
  if (!ID_RE.test(playerId)) return res(400, { ok: false, error: 'bad_player_id' });
  const rabbits = parseCount(body.rabbits);
  if (rabbits === null) return res(400, { ok: false, error: 'bad_rabbits' });
  const runStartedAt = Number(body.runStartedAt);
  if (!Number.isFinite(runStartedAt)) return res(400, { ok: false, error: 'bad_run_start' });
  if (runStartedAt < START_MS - 60 * 1000) return res(400, { ok: false, error: 'run_before_start' });

  const rec = { name, rabbits, date: now };
  for (const f of STAT_FIELDS) {
    const v = parseCount(body[f]);
    if (v === null) return res(400, { ok: false, error: 'bad_' + f });
    rec[f] = v;
  }
  rec.points = Math.max(0, rabbits - rec.coinsSpent);   // 排名分由服务器自己算,不信任玩家端
  // 每只月兔都是用掉「一组狗狗+一组兔兔」换来的,每次用掉满月会扣 3 只:
  // 所以 现有月兔 + 3×月兔捣药次数 不可能超过 min(兔兔组合次数, 狗狗组合次数)
  if (rabbits + 3 * rec.moonPoundings > Math.min(rec.bunnyMatches, rec.dogfaceMatches) + 2) {
    return res(400, { ok: false, error: 'stats_inconsistent' });
  }
  // 金币只靠兔兔/狗狗组合赚,花掉的不可能比赚到的多
  if (rec.coinsEarned > (rec.bunnyMatches + rec.dogfaceMatches) * COIN_PER_MATCH || rec.coinsSpent > rec.coinsEarned) {
    return res(400, { ok: false, error: 'stats_inconsistent' });
  }

  const key = nameKey(name);
  const idxKey = 'i:' + EVENT_ID + ':' + playerId;   // 每个玩家编号对应唯一一笔纪录(改名时把纪录搬过去,不会留两笔)
  const parse = raw => { if (!raw) return null; try { return JSON.parse(raw); } catch (e) { return null; } };

  const existing = parse(await env.LEADERBOARD.get(key));
  if (existing && existing.id !== playerId) return res(409, { ok: false, error: 'name_taken' });

  const prevKey = await env.LEADERBOARD.get(idxKey);
  const prev = prevKey && prevKey !== key ? parse(await env.LEADERBOARD.get(prevKey)) : null;  // 这个人以前用别的名字上传过

  // 这个人目前的最佳纪录(同名那笔 或 旧名字那笔),新成绩要超过它才算更新
  const mine = existing || prev;
  let final, updated;
  if (!mine || rec.points > mine.points) { final = { id: playerId, ...rec }; updated = true; }
  else { final = { ...mine, name, id: playerId }; updated = false; }

  const needWrite = updated || !existing || existing.name !== name;   // 更新了分数,或是改名搬家
  if (needWrite) {
    await env.LEADERBOARD.put(key, JSON.stringify(final), { metadata: toMeta(final) });
    if (prevKey !== key) await env.LEADERBOARD.put(idxKey, key);
    if (prevKey && prevKey !== key) await env.LEADERBOARD.delete(prevKey);
  }
  const best = final.points;

  // 榜单可见时,把刚写入的这笔也合进去(KV 在别的节点最多有 1 分钟延迟)
  let entries = null;
  if (phase !== 'grace' || (await isPublished(env))) {
    const others = (await listAll(env)).filter(x => x.meta && x.key !== key && x.key !== prevKey).map(x => fromMeta(x.meta));
    entries = sortEntries(others.concat([fromMeta(toMeta(final))])).slice(0, MAX_RETURNED);
  }
  return res(200, { ok: true, updated, best, entries });
}

async function admin(path, method, body, headers, env, now) {
  const token = headers['x-admin-token'] || '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return res(401, { ok: false, error: 'unauthorized' });

  if (path === '/admin/entries' && method === 'GET') {
    const out = [];
    for (const k of await listAll(env)) {
      const raw = await env.LEADERBOARD.get(k.key);
      if (!raw) continue;
      try { out.push({ key: k.key, ...JSON.parse(raw) }); } catch (e) { /* 略过坏资料 */ }
    }
    out.sort((a, b) => b.points - a.points || b.rabbits - a.rabbits || a.date - b.date);
    return res(200, { ok: true, phase: phaseOf(now), published: await isPublished(env), entries: out });
  }
  if (path === '/admin/delete' && method === 'POST') {
    if (!body || typeof body.key !== 'string' || !body.key.startsWith(KEY_PREFIX)) return res(400, { ok: false, error: 'bad_key' });
    await env.LEADERBOARD.delete(body.key);
    return res(200, { ok: true });
  }
  if (path === '/admin/publish' && method === 'POST') {
    const on = !!(body && body.published);
    if (on) await env.LEADERBOARD.put(PUBLISH_KEY, '1'); else await env.LEADERBOARD.delete(PUBLISH_KEY);
    return res(200, { ok: true, published: on });
  }
  // 玩家换手机又没备份时,把这个名字改绑到他的新编号
  if (path === '/admin/rebind' && method === 'POST') {
    if (!body || typeof body.key !== 'string' || !body.key.startsWith(KEY_PREFIX) || !ID_RE.test(String(body.playerId))) return res(400, { ok: false, error: 'bad_input' });
    const raw = await env.LEADERBOARD.get(body.key);
    if (!raw) return res(404, { ok: false, error: 'no_such_entry' });
    const rec = JSON.parse(raw);
    rec.id = body.playerId;
    await env.LEADERBOARD.put(body.key, JSON.stringify(rec), { metadata: toMeta(rec) });
    return res(200, { ok: true });
  }
  return res(404, { ok: false, error: 'not_found' });
}

// ---------- 管理页(只有页面本身,不含任何密码;密码在你浏览器里输入后才拿得到资料) ----------
const ADMIN_HTML = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>月兔限时赛 管理页</title>
<style>body{font:14px system-ui,sans-serif;margin:16px;max-width:980px}input,button{font:inherit;padding:6px 10px}table{border-collapse:collapse;width:100%;margin-top:12px}
td,th{border:1px solid #ddd;padding:5px 8px;text-align:left;font-size:13px}th{background:#f6f0ee}.bad{color:#b00}.ok{color:#080}code{font-size:12px}</style>
<h2>🐇 月兔限时赛 · 管理页</h2>
<p>管理密码(Worker 的 ADMIN_TOKEN):<input id="tok" type="password" size="28"> <button onclick="load()">载入榜单</button></p>
<p id="info"></p>
<p><button onclick="pub(true)">✅ 公布榜单</button> <button onclick="pub(false)">🙈 取消公布</button></p>
<table id="t"></table>
<script>
const $=id=>document.getElementById(id);
$('tok').value=sessionStorage.getItem('tok')||'';
async function api(p,opt={}){opt.headers=Object.assign({'X-Admin-Token':$('tok').value,'Content-Type':'application/json'},opt.headers||{});
  const r=await fetch(p,opt);return r.json();}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function load(){sessionStorage.setItem('tok',$('tok').value);const d=await api('/admin/entries');
  if(!d.ok){$('info').innerHTML='<span class="bad">失败:'+esc(d.error)+'</span>';return;}
  $('info').innerHTML='阶段:<b>'+d.phase+'</b>(before 未开始 / live 进行中 / grace 宽限 / closed 已结束)· 目前'+(d.published?'<span class="ok">已公布</span>':'<span class="bad">未公布</span>')+' · 共 '+d.entries.length+' 笔';
  $('t').innerHTML='<tr><th>#</th><th>名字</th><th>排名分</th><th>月兔</th><th>花金币/赚</th><th>兔兔</th><th>狗狗</th><th>捣药</th><th>积分</th><th>上传时间</th><th>玩家编号</th><th></th></tr>'+
  d.entries.map((e,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(e.name)+'</td><td><b>'+e.points+'</b></td><td>'+e.rabbits+'</td><td>'+e.coinsSpent+'/'+e.coinsEarned+'</td><td>'+e.bunnyMatches+'</td><td>'+e.dogfaceMatches+'</td><td>'+e.moonPoundings+'</td><td>'+e.score+'</td><td>'+new Date(e.date).toLocaleString()+'</td><td><code>'+esc(e.id.slice(0,8))+'…</code></td>'+
  '<td><button data-k="'+esc(e.key)+'" onclick="del(this.dataset.k)">删除</button> <button data-k="'+esc(e.key)+'" onclick="rebind(this.dataset.k)">改绑编号</button></td></tr>').join('');}
async function del(k){if(!confirm('确定删除这笔纪录?'))return;await api('/admin/delete',{method:'POST',body:JSON.stringify({key:k})});load();}
async function rebind(k){const id=prompt('贴上玩家的新编号(对方在游戏的「存档备份」或你另行索取):');if(!id)return;const d=await api('/admin/rebind',{method:'POST',body:JSON.stringify({key:k,playerId:id.trim()})});alert(d.ok?'已改绑':'失败:'+d.error);load();}
async function pub(on){if(!confirm(on?'确定公布最终榜单?玩家会立刻看到。':'取消公布?'))return;const d=await api('/admin/publish',{method:'POST',body:JSON.stringify({published:on})});alert(d.ok?'完成':'失败:'+d.error);load();}
</script></html>`;

// ---------- Cloudflare 入口 ----------
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
    try {
      const url = new URL(request.url);
      if (url.pathname === '/admin' && request.method === 'GET') {
        return new Response(ADMIN_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
      let body = null;
      if (request.method === 'POST') {
        try { body = await request.json(); } catch (e) { return json(400, { ok: false, error: 'bad_json' }); }
      }
      const headers = {};
      request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
      const out = await route(request.method, url.pathname, body, headers, env, Date.now());
      return json(out.status, out.json);
    } catch (e) {
      return json(500, { ok: false, error: 'server_error' });
    }
  },
};

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  });
}
