#!/usr/bin/env node
'use strict';

/**
 * generate-poster.js — 「历史上的今天」每日海报生成
 *
 * 纯 Node 实现，零第三方依赖。读取当日（Asia/Shanghai）快照，
 * 渲染一张书卷/编年史风格的 SVG 海报，写入：
 *   data/posters/YYYY-MM-DD.svg
 *
 * 设计要点：
 *   - 米黄做旧宣纸底 + 暗角晕染 + 细微纸纹
 *   - 衬线字体、朱红印泥主色、墨蓝/赭石点缀
 *   - 右上角朱红印章；标题 / 大字日期
 *   - 「今日焦点」3 条（朱红年份徽章）+ 「更多往事」若干条
 * SVG 矢量图在任意带中文字体的设备上均清晰渲染，便于分享。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SNAP_DIR = path.join(DATA_DIR, 'snapshots');
const POSTER_DIR = path.join(DATA_DIR, 'posters');

/* ----------------------- 调色板 ----------------------- */
const C = {
  paper: '#f3e9d2',
  paper2: '#ece0c4',
  ink: '#2e2620',
  inkSoft: '#5a4a3a',
  bronze: '#a9814f',
  bronzeDk: '#8a6a3a',
  vermilion: '#b23b2e',
  vermilionDk: '#9e2b25',
  blue: '#34516b',
  line: '#c9b48d',
};

const FONT =
  "'Noto Serif SC','Source Han Serif SC','Songti SC','STSong','SimSun','serif'";

/* ----------------------- 工具函数 ----------------------- */
function pad(n) {
  return String(n).padStart(2, '0');
}
function getShanghaiDate() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 8 * 3600000);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[c]));
}
/** 按字符宽度折行（适配中文），最多 maxLines 行，超出末尾加省略号 */
function wrap(text, maxChars, maxLines) {
  const arr = Array.from(String(text || ''));
  const lines = [];
  let cur = '';
  for (const ch of arr) {
    cur += ch;
    if (Array.from(cur).length >= maxChars) {
      lines.push(cur);
      cur = '';
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === 0) return [''];
  const total = arr.length;
  const shown = Array.from(lines.join('')).length;
  if (total > shown) {
    let last = lines[lines.length - 1];
    last = Array.from(last).slice(0, Math.max(1, maxChars - 1)).join('') + '…';
    lines[lines.length - 1] = last;
  }
  return lines;
}
function truncate(text, n) {
  const a = Array.from(String(text || ''));
  return a.length > n ? a.slice(0, n - 1).join('') + '…' : text;
}
function monthDayLabel(md) {
  const [m, d] = (md || '').split('-');
  if (!m || !d) return '';
  return `${parseInt(m, 10)} 月 ${parseInt(d, 10)} 日`;
}

/* ----------------------- 读取快照 ----------------------- */
function pickSnapshot() {
  if (!fs.existsSync(SNAP_DIR)) return null;
  const sh = getShanghaiDate();
  const todayStr = `${sh.getFullYear()}-${pad(sh.getMonth() + 1)}-${pad(sh.getDate())}`;
  let file = `data/snapshots/${todayStr}.json`;
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    // 回退：取目录下最新的快照
    const files = fs
      .readdirSync(SNAP_DIR)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .reverse();
    if (!files.length) return null;
    file = `data/snapshots/${files[0]}`;
  }
  return file;
}

/* ----------------------- 海报构建 ----------------------- */
function buildPoster(snap) {
  const W = 1080;
  const H = 1440;
  const M = 64; // 外边距

  const featured = (snap.featured || []).slice(0, 3);
  const more = (snap.sections && snap.sections.events ? snap.sections.events : [])
    .filter((e) => !featured.some((f) => f.text === e.text))
    .slice(0, 5);
  const dateLabel = monthDayLabel(snap.monthDay) || '';

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`
  );

  // defs：暗角晕染 + 纸纹
  parts.push('<defs>');
  parts.push(
    `<radialGradient id="vig" cx="50%" cy="40%" r="78%">` +
      `<stop offset="58%" stop-color="#000000" stop-opacity="0"/>` +
      `<stop offset="100%" stop-color="#5a3a1a" stop-opacity="0.18"/>` +
      `</radialGradient>`
  );
  parts.push(
    `<filter id="paperNoise" x="0" y="0" width="100%" height="100%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="n"/>` +
      `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0"/>` +
      `</filter>`
  );
  parts.push('</defs>');

  // 背景
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${C.paper}"/>`);
  parts.push(
    `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#vig)"/>`
  );
  parts.push(
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#000" opacity="0.045" filter="url(#paperNoise)"/>`
  );

  // 双线边框
  parts.push(
    `<rect x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}" fill="none" stroke="${C.bronze}" stroke-width="3"/>`
  );
  parts.push(
    `<rect x="${M + 10}" y="${M + 10}" width="${W - 2 * M - 20}" height="${H - 2 * M - 20}" fill="none" stroke="${C.bronze}" stroke-width="1" opacity="0.7"/>`
  );

  // 顶部装饰：中央菱形 + 两侧横线
  const ornY = M + 58;
  const cx = W / 2;
  parts.push(
    `<line x1="${M + 60}" y1="${ornY}" x2="${cx - 40}" y2="${ornY}" stroke="${C.bronze}" stroke-width="1.5"/>`
  );
  parts.push(
    `<line x1="${cx + 40}" y1="${ornY}" x2="${W - M - 60}" y2="${ornY}" stroke="${C.bronze}" stroke-width="1.5"/>`
  );
  parts.push(
    `<path d="M ${cx} ${ornY - 12} L ${cx + 12} ${ornY} L ${cx} ${ornY + 12} L ${cx - 12} ${ornY} Z" fill="${C.vermilion}"/>`
  );

  // 标题
  parts.push(
    `<text x="${cx}" y="${M + 130}" text-anchor="middle" font-size="62" font-weight="700" fill="${C.ink}" letter-spacing="8">历史上的今天</text>`
  );
  parts.push(
    `<text x="${cx}" y="${M + 168}" text-anchor="middle" font-size="19" fill="${C.bronzeDk}" letter-spacing="6">ON THIS DAY IN HISTORY</text>`
  );

  // 大字日期
  parts.push(
    `<text x="${cx}" y="${M + 268}" text-anchor="middle" font-size="84" font-weight="700" fill="${C.vermilionDk}" letter-spacing="4">${esc(dateLabel)}</text>`
  );
  // 日期下朱红短横线
  parts.push(
    `<line x1="${cx - 70}" y1="${M + 296}" x2="${cx + 70}" y2="${M + 296}" stroke="${C.vermilion}" stroke-width="3"/>`
  );

  // 右上角朱红印章
  const sealCx = W - M - 78;
  const sealCy = M + 96;
  const sealS = 96;
  parts.push(
    `<g transform="rotate(-8 ${sealCx} ${sealCy})">` +
      `<rect x="${sealCx - sealS / 2}" y="${sealCy - sealS / 2}" width="${sealS}" height="${sealS}" rx="10" fill="${C.vermilion}" opacity="0.92"/>` +
      `<rect x="${sealCx - sealS / 2 + 6}" y="${sealCy - sealS / 2 + 6}" width="${sealS - 12}" height="${sealS - 12}" rx="6" fill="none" stroke="#f3e9d2" stroke-width="2"/>` +
      `<text x="${sealCx}" y="${sealCy + 20}" text-anchor="middle" font-size="56" font-weight="700" fill="#f7efdd">史</text>` +
      `</g>`
  );

  // 双分隔线
  const divY = M + 340;
  parts.push(
    `<line x1="${M + 40}" y1="${divY}" x2="${W - M - 40}" y2="${divY}" stroke="${C.bronze}" stroke-width="1.5"/>`
  );
  parts.push(
    `<line x1="${M + 40}" y1="${divY + 5}" x2="${W - M - 40}" y2="${divY + 5}" stroke="${C.bronze}" stroke-width="0.8" opacity="0.6"/>`
  );

  // 区段标签（带小印章）
  function sectionLabel(y, text, color) {
    const x = M + 50;
    parts.push(
      `<rect x="${x}" y="${y - 24}" width="34" height="34" rx="5" fill="${color}"/>` +
        `<text x="${x + 17}" y="${y - 1}" text-anchor="middle" font-size="20" font-weight="700" fill="#f7efdd">日</text>` +
        `<text x="${x + 50}" y="${y}" font-size="30" font-weight="700" fill="${color}" letter-spacing="3">${esc(text)}</text>`
    );
  }

  let y = divY + 70;
  sectionLabel(y, '今日焦点', C.vermilion);
  y += 46;

  // 焦点卡片（每条：年份徽章 + 多行文本）
  featured.forEach((item) => {
    const badgeX = M + 50;
    const badgeY = y;
    const badgeS = 78;
    const yearTxt = item.year != null ? String(item.year) : '节';
    parts.push(
      `<rect x="${badgeX}" y="${badgeY}" width="${badgeS}" height="${badgeS}" rx="8" fill="${C.vermilion}"/>`
    );
    parts.push(
      `<text x="${badgeX + badgeS / 2}" y="${badgeY + badgeS / 2 + 14}" text-anchor="middle" font-size="30" font-weight="700" fill="#f7efdd">${esc(yearTxt)}</text>`
    );

    const tx = badgeX + badgeS + 28;
    const tw = W - M - 40 - tx; // 文本可用宽度
    const maxChars = Math.floor(tw / 30); // 约 30px/字
    const lines = wrap(item.text, Math.max(8, maxChars), 3);
    const lh = 38;
    const blockH = Math.max(badgeS, lines.length * lh);
    lines.forEach((ln, i) => {
      parts.push(
        `<text x="${tx}" y="${badgeY + 30 + i * lh}" font-size="29" fill="${C.ink}">${esc(ln)}</text>`
      );
    });
    y += blockH + 30;
  });

  // 更多往事
  y += 18;
  sectionLabel(y, '更多往事', C.blue);
  y += 46;
  more.forEach((item) => {
    const yearTxt = item.year != null ? String(item.year) : '—';
    const label = `${yearTxt}　${truncate(item.text, 22)}`;
    parts.push(
      `<circle cx="${M + 58}" cy="${y - 8}" r="4" fill="${C.bronze}"/>` +
        `<text x="${M + 78}" y="${y}" font-size="25" fill="${C.inkSoft}">${esc(label)}</text>`
    );
    y += 44;
  });

  // 底部信息
  const footY = H - M - 46;
  parts.push(
    `<line x1="${M + 40}" y1="${footY - 22}" x2="${W - M - 40}" y2="${footY - 22}" stroke="${C.bronze}" stroke-width="1" opacity="0.7"/>`
  );
  const srcName =
    snap.source === 'wikimedia' ? '维基百科' : snap.source || '公开数据源';
  parts.push(
    `<text x="${cx}" y="${footY}" text-anchor="middle" font-size="20" fill="${C.bronzeDk}" letter-spacing="2">数据来源 · ${esc(srcName)}　|　每日更新</text>`
  );

  parts.push('</svg>');
  return parts.join('\n');
}

/* ----------------------- 主流程 ----------------------- */
function main() {
  const file = pickSnapshot();
  if (!file) {
    console.error('[poster][ERROR] 未找到任何快照，无法生成海报。');
    process.exit(1);
  }
  const abs = path.join(ROOT, file);
  const snap = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const dateStr = path.basename(file).replace(/\.json$/, '');

  if (!fs.existsSync(POSTER_DIR)) fs.mkdirSync(POSTER_DIR, { recursive: true });

  const svg = buildPoster(snap);
  const outPath = path.join(POSTER_DIR, `${dateStr}.svg`);
  fs.writeFileSync(outPath, svg, 'utf8');

  console.log('\n========== POSTER ==========');
  console.log('snapshot :', file);
  console.log('date     :', dateStr, monthDayLabel(snap.monthDay));
  console.log('featured :', (snap.featured || []).length);
  console.log('more     :', (snap.sections && snap.sections.events ? snap.sections.events.length : 0));
  console.log('output   :', outPath);
  console.log('============================\n');
}

main();
