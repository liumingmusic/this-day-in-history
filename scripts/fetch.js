#!/usr/bin/env node
'use strict';

/**
 * fetch.js — 「历史上的今天」数据抓取脚本
 *
 * 数据源（全部免 key）：
 *   主源  : Wikimedia On This Day API（中文）  api.wikimedia.org/feed/v1/wikipedia/zh/onthisday/all/{MM}/{DD}
 *   保底源: 60s.viki.moe/v2/today_in_history（国内，免 key）
 *
 * 多源自动回退：主源不可达时切保底源（仅填充「事件」类）。
 * 全部失败：打印清晰错误并以非 0 退出，绝不写空快照覆盖旧数据。
 *
 * 产物：
 *   data/snapshots/YYYY-MM-DD.json   当日北京日期快照
 *   data/manifest.json               索引（按 generatedAt 倒序，保留最近 40 天）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SNAP_DIR = path.join(DATA_DIR, 'snapshots');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');
const KEEP_DAYS = 40;

// 各类保留条数上限（事件 15–25，出生/逝世各 8–15，节日全部）
const LIMITS = { events: 25, births: 15, deaths: 15 };

const UA =
  'this-day-in-history-bot/1.0 (https://github.com/liumingmusic/this-day-in-history; educational use)';

function log(...a) {
  console.log('[fetch]', ...a);
}
function fail(msg) {
  console.error('[fetch][ERROR]', msg);
  process.exit(1);
}

/** 当前 Asia/Shanghai（UTC+8，无夏令时）墙钟时间 */
function getShanghaiDate() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 8 * 3600000);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'User-Agent': UA, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return res.json();
}

/** 将 Wikimedia 条目映射为统一结构 */
function mapItem(item) {
  const page = Array.isArray(item.pages) && item.pages[0] ? item.pages[0] : null;
  let link = '';
  if (page && page.titles && page.titles.canonical) {
    link = `https://zh.wikipedia.org/wiki/${encodeURIComponent(page.titles.canonical)}`;
  }
  return {
    year: typeof item.year === 'number' ? item.year : null,
    text: (item.text || '').trim(),
    thumb: page && page.thumbnail && page.thumbnail.source ? page.thumbnail.source : '',
    link,
  };
}

function dedupeAndLimit(items, limit) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = `${(it.year ?? '')}|${it.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  out.sort((a, b) => (a.year ?? 99999) - (b.year ?? 99999)); // 按年份升序
  return out.slice(0, limit);
}

async function fetchWikimedia(mm, dd) {
  const url = `https://api.wikimedia.org/feed/v1/wikipedia/zh/onthisday/all/${mm}/${dd}`;
  log('主源 Wikimedia:', url);
  const data = await fetchJSON(url, { headers: { Accept: 'application/json' } });

  const events = dedupeAndLimit(
    [...(data.selected || []), ...(data.events || [])].map(mapItem),
    LIMITS.events
  );
  const births = dedupeAndLimit((data.births || []).map(mapItem), LIMITS.births);
  const deaths = dedupeAndLimit((data.deaths || []).map(mapItem), LIMITS.deaths);
  const holidays = (data.holidays || []).map((h) => {
    const page = Array.isArray(h.pages) && h.pages[0] ? h.pages[0] : null;
    const link = page && page.titles && page.titles.canonical
      ? `https://zh.wikipedia.org/wiki/${encodeURIComponent(page.titles.canonical)}`
      : '';
    return { year: null, text: (h.text || '').trim(), thumb: '', link };
  });

  return { source: 'wikimedia', events, births, deaths, holidays };
}

async function fetchFallback() {
  log('保底源 60s.viki.moe ...');
  const data = await fetchJSON('https://60s.viki.moe/v2/today_in_history', {
    headers: { Accept: 'application/json' },
  });
  const items = data && data.data && Array.isArray(data.data.items) ? data.data.items : [];
  const events = items
    .map((it) => ({
      year: it.year && /^-?\d+$/.test(String(it.year)) ? parseInt(it.year, 10) : null,
      text: (it.description || it.title || '').trim(),
      thumb: '',
      link: '',
    }))
    .sort((a, b) => (a.year ?? 99999) - (b.year ?? 99999))
    .slice(0, LIMITS.events);
  return { source: '60s.viki.moe', events, births: [], deaths: [], holidays: [] };
}

async function main() {
  if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });

  const sh = getShanghaiDate();
  const mm = pad(sh.getMonth() + 1);
  const dd = pad(sh.getDate());
  const dateStr = `${sh.getFullYear()}-${mm}-${dd}`;
  const monthDay = `${mm}-${dd}`;
  const generatedAt = new Date().toISOString();

  let result = null;
  try {
    result = await fetchWikimedia(mm, dd);
  } catch (e) {
    log('Wikimedia 失败:', e.message);
  }

  if (!result) {
    try {
      result = await fetchFallback();
    } catch (e) {
      log('保底源失败:', e.message);
    }
  }

  const hasData =
    result &&
    (result.events.length ||
      result.births.length ||
      result.deaths.length ||
      result.holidays.length);

  if (!hasData) {
    fail('所有数据源均不可用或返回空。未写入空快照，保留旧数据。');
  }

  const total =
    result.events.length + result.births.length + result.deaths.length + result.holidays.length;

  const snapshot = {
    generatedAt,
    monthDay,
    source: result.source,
    sections: {
      events: result.events,
      births: result.births,
      deaths: result.deaths,
      holidays: result.holidays,
    },
    total,
  };

  const file = `${dateStr}.json`;
  fs.writeFileSync(path.join(SNAP_DIR, file), JSON.stringify(snapshot, null, 2), 'utf8');
  log(`已写入快照 ${file}（共 ${total} 条，来源 ${result.source}）`);

  // 更新 manifest
  let manifest = { updatedAt: generatedAt, snapshots: [] };
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    } catch (_) {
      /* 损坏则重建 */
    }
    if (!Array.isArray(manifest.snapshots)) manifest.snapshots = [];
  }
  manifest.snapshots = manifest.snapshots.filter((s) => s.file !== file);
  manifest.snapshots.push({ file, monthDay, generatedAt, total });
  manifest.snapshots.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));

  // 仅保留最近 KEEP_DAYS 个快照，删除超出部分文件
  const keep = manifest.snapshots.slice(0, KEEP_DAYS);
  const keepFiles = new Set(keep.map((s) => s.file));
  for (const s of manifest.snapshots) {
    if (!keepFiles.has(s.file)) {
      const p = path.join(SNAP_DIR, s.file);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        log('删除过期快照:', s.file);
      }
    }
  }
  manifest.snapshots = keep;
  manifest.updatedAt = generatedAt;
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  log(`manifest 已更新，保留 ${manifest.snapshots.length} 个快照。`);

  // 控制台摘要（用于本地验证）
  console.log('\n========== SUMMARY ==========');
  console.log('source   :', result.source);
  console.log('monthDay :', monthDay);
  console.log('total    :', total);
  console.log('events   :', result.events.length);
  console.log('births   :', result.births.length);
  console.log('deaths   :', result.deaths.length);
  console.log('holidays :', result.holidays.length);
  console.log('sample   :', result.events.slice(0, 3).map((e) => `${e.year}: ${e.text.slice(0, 24)}`));
  console.log('=============================\n');
}

main().catch((e) => fail(e && e.message ? e.message : String(e)));
