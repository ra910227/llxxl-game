// 月兔排行榜 API,存在 Cloudflare KV 里,免费额度足够(每天10万次读、1千次写)。
// 部署后要绑定一个叫 LEADERBOARD 的 KV namespace(见 README.md 步骤)。
//
// 排行榜规则:同一个名字只留最新一笔(用姓名当唯一键,重新上传会直接覆盖旧纪录,
// 不会同一个人留好几笔),排名依据 rabbits(累计月兔总数,消耗满月不会倒扣)。

const MAX_NAME_LEN = 16;
const MAX_ENTRIES_STORED = 500; // KV 里最多留这么多个不同的名字,避免无限长大
const MAX_RETURNED = 100;       // 排行榜实际显示前几名

// 除了排名用的 rabbits,还额外记录这些统计数字,数值本身不影响排序,只是附加显示用
const STAT_FIELDS = ['bunnyMatches', 'dogfaceMatches', 'butterflyBursts', 'sunBursts', 'moonPoundings'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

// 数字栏位统一验证:必须是 0~999999999 的整数,不合格就回传 null
function parseCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 999999999) return null;
  return n;
}

async function readEntries(env) {
  const raw = await env.LEADERBOARD.get('entries');
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

async function writeEntries(env, entries) {
  await env.LEADERBOARD.put('entries', JSON.stringify(entries));
}

function sortEntries(entries) {
  return entries.slice().sort((a, b) => b.rabbits - a.rabbits || a.date - b.date);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // env.LEADERBOARD 没绑好(部署时忘记绑 KV)会在这里直接报错,
    // 用 try/catch 包起来回传清楚的错误讯息,而不是让 Workers 丢出一片空白的 500。
    try {
      if (!env.LEADERBOARD) {
        return json({ ok: false, error: 'kv_not_bound' }, 500);
      }

      const url = new URL(request.url);

      if (url.pathname === '/leaderboard' && request.method === 'GET') {
        const entries = await readEntries(env);
        return json({ ok: true, entries: sortEntries(entries).slice(0, MAX_RETURNED) });
      }

      if (url.pathname === '/submit' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return json({ ok: false, error: 'bad_json' }, 400);
        }

        let name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) return json({ ok: false, error: 'empty_name' }, 400);
        if (name.length > MAX_NAME_LEN) name = name.slice(0, MAX_NAME_LEN);

        const rabbits = parseCount(body.rabbits);
        if (rabbits === null) return json({ ok: false, error: 'bad_rabbits' }, 400);

        const record = { name, rabbits, date: Date.now() };
        for (const field of STAT_FIELDS) {
          const v = parseCount(body[field]);
          if (v === null) return json({ ok: false, error: 'bad_' + field }, 400);
          record[field] = v;
        }

        const entries = await readEntries(env);
        const idx = entries.findIndex(e => e.name === name);
        if (idx >= 0) entries[idx] = record;
        else entries.push(record);

        const trimmed = sortEntries(entries).slice(0, MAX_ENTRIES_STORED);
        await writeEntries(env, trimmed);

        return json({ ok: true, entries: trimmed.slice(0, MAX_RETURNED) });
      }

      return json({ ok: false, error: 'not_found' }, 404);
    } catch (e) {
      return json({ ok: false, error: 'server_error' }, 500);
    }
  },
};
