# 历史上的今天 · This Day in History

一个**纯静态、零构建、零框架**的「历史上的今天」小网站。每天自动展示大事件、人物出生 / 逝世、节日纪念，数据由 GitHub Actions 每日抓取并写入仓库，前端运行时读取本地 JSON 渲染。

> 全程**无任何 API key / token / 注册**，所有数据源均免鉴权。

## 特性

- 📜 顶部大字显示当前日期，可回看过去几天抓取的快照
- 🗂 分区 Tab：全部 / 事件 / 出生 / 逝世 / 节日
- 🔍 关键词搜索（标题 / 描述），实时过滤
- 🕰 编年史式时间线卡片：左侧年份徽章 + 竖向连接线，词条缩略图，点击跳转维基词条
- 📱 完整移动端适配（≤720px 单列、无横向滚动、触控目标 ≥40px）
- 🤖 GitHub Actions 每天 UTC 22:00（约北京次日 06:00）自动更新数据，保留最近 40 天快照

## 数据源（多源自动回退）

| 角色 | 来源 | 说明 |
| --- | --- | --- |
| 主源 | [Wikimedia On This Day API（中文）](https://api.wikimedia.org/feed/v1/wikipedia/zh/onthisday/all/{MM}/{DD}) | 精选事件 / 事件 / 出生 / 逝世 / 节日，含缩略图与词条链接 |
| 保底源 | [60s.viki.moe/v2/today_in_history](https://60s.viki.moe/v2/today_in_history) | 国内免 key，主源失败时启用（填充「事件」类） |

任一可用即可；**全部失败**时脚本以非 0 退出，绝不写空快照覆盖旧数据。

## 目录结构

```
this-day-in-history/
├── index.html
├── assets/
│   ├── css/style.css
│   └── js/app.js
├── scripts/fetch.js          # Node 抓取脚本（Actions 中运行）
├── data/
│   ├── manifest.json         # 索引：所有快照 + 更新时间
│   └── snapshots/            # 每次抓取一个 JSON 快照（按日期命名）
├── .github/workflows/fetch.yml
├── package.json
├── .gitignore
└── README.md
```

## 本地运行

```bash
# 1. 抓取一次数据（写入 data/snapshots/YYYY-MM-DD.json 与 data/manifest.json）
node scripts/fetch.js

# 2. 本地预览（需 HTTP 服务以支持 fetch 本地 JSON）
python3 -m http.server 8080
# 打开 http://localhost:8080
```

## 部署到 GitHub Pages

1. 将本仓库推送到 GitHub（仓库名如 `this-day-in-history`）。
2. 仓库 **Settings → Pages**，Source 选择 `Deploy from a branch`，分支 `main`，目录 `/ (root)`，保存。
3. 站点地址：`https://<用户名>.github.io/<仓库名>/`。
4. 每日自动更新；也可在 **Actions** 页手动 `Run workflow` 立即触发一次。

## 数据快照格式

```json
{
  "generatedAt": "2026-07-12T01:00:00Z",
  "monthDay": "07-12",
  "source": "wikimedia",
  "sections": {
    "events":  [ { "year": 1962, "text": "…", "thumb": "https://…", "link": "https://…" } ],
    "births":  [ { "year": 1904, "text": "…", "thumb": "", "link": "" } ],
    "deaths":  [ { "year": 1926, "text": "…", "thumb": "", "link": "" } ],
    "holidays":[ { "text": "世界人口日", "thumb": "", "link": "" } ]
  },
  "total": 52
}
```

## 许可

MIT
