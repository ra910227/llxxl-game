# 月兔排行榜 Worker 部署步骤

## 方法A:用 Cloudflare 网页后台(不用装任何东西,推荐)

1. 到 https://dash.cloudflare.com 注册/登入免费帐号。
2. 左侧选单找到 **Workers & Pages** → 建一个 KV namespace:
   - 左侧 **Storage & Databases → KV** → Create namespace,取名 `llxxl-leaderboard`,建好后记下它的 ID。
3. 回到 **Workers & Pages** → **Create** → **Create Worker**,取名 `llxxl-leaderboard`(名字会变成网址的一部分)。
4. 建好后进编辑器,把 `worker.js` 的全部内容贴进去,取代预设内容,按 **Deploy**。
5. 部署完,到该 Worker 的 **Settings → Variables → KV Namespace Bindings**,新增一个绑定:
   - Variable name 填 `LEADERBOARD`(要跟 worker.js 里用的名字完全一样)
   - 选刚刚建的 KV namespace
   - 存档,可能需要重新部署一次才生效。
6. 部署完成后,Worker 网址会长得像:
   `https://llxxl-leaderboard.<你的帐号名>.workers.dev`
   把这个网址给我,我会把它接进游戏里。

## 方法B:用 Wrangler CLI(需要装 Node.js)

```bash
cd leaderboard-worker
npm install -g wrangler
wrangler login          # 会打开浏览器登入 Cloudflare 帐号
wrangler kv namespace create LEADERBOARD   # 建 KV,把回传的 id 填进 wrangler.toml
wrangler deploy         # 部署
```

部署完 wrangler 会印出 Worker 网址,一样把网址给我。

## 测试部署是否成功

部署完可以直接在浏览器打开 `<你的Worker网址>/leaderboard`,如果看到
`{"ok":true,"entries":[]}` 就表示成功了。
