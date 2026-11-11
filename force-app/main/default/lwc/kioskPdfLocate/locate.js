/**
 * Place a checklist tick or measure on whatever text the open PDF contains.
 * Coordinates are page fractions, origin top-left, matching the annotator.
 * A page percent is only a tie-break. It is never the mark coordinate.
 */

const OK_PHRASES = ["okay", "ok", "yes", "pass", "passed"];
const ATT_PHRASES = [
  "attention",
  "attn",
  "att req",
  "att",
  "fail",
  "failed",
  "no"
];
const OPEN_TO_CLOSE = { "(": ")", "[": "]", "{": "}" };
const BOX_CHARS = new Set(["☐", "☑", "✓", "✔", "□", "■", "◻", "◼"]);

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value) {
  return norm(value)
    .split(" ")
    .filter((word) => word.length >= 3);
}

function percentY(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  if (n > 1) {
    return n / 100;
  }
  return n;
}

function itemCenterY(item) {
  const height = item && item.h > 0 ? item.h : 0.012;
  return (item ? item.y : 0) + height / 2;
}

function linesOf(items) {
  const sorted = (items || [])
    .filter((item) => item && String(item.t || "").trim())
    .slice()
    .sort((a, b) => itemCenterY(a) - itemCenterY(b) || a.x - b.x);
  const lines = [];
  sorted.forEach((item) => {
    const height = item.h > 0 ? item.h : 0.012;
    const cy = itemCenterY(item);
    const open = lines.length ? lines[lines.length - 1] : null;
    const tolerance = Math.min(
      0.007,
      Math.max(0.0035, (open ? open.h : height) * 0.55)
    );
    if (open && Math.abs(cy - open.cy) <= tolerance) {
      open.items.push(item);
      open.h = Math.max(open.h, height);
      open.cy =
        open.items.reduce((sum, entry) => sum + itemCenterY(entry), 0) /
        open.items.length;
      open.y = Math.min(open.y, item.y);
      return;
    }
    lines.push({ y: item.y, cy, h: height, items: [item] });
  });
  lines.forEach((line) => {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((item) => item.t).join(" ");
  });
  return lines;
}

function scoreLabel(lineText, label) {
  const line = norm(lineText);
  const wanted = norm(label);
  if (!line || !wanted) {
    return 0;
  }
  const foldedLine = fold(line);
  const foldedWanted = fold(wanted);
  if (foldedLine.includes(foldedWanted) || foldedWanted.includes(foldedLine)) {
    const shorter = Math.min(foldedLine.length, foldedWanted.length);
    if (shorter >= 8) {
      return 0.92;
    }
  }
  const gluedLine = foldedLine.replace(/ /g, "");
  const gluedWanted = foldedWanted.replace(/ /g, "");
  if (gluedLine.length >= 4 && gluedLine === gluedWanted) {
    return 0.95;
  }
  if (
    !/\d/.test(gluedLine) &&
    !/\d/.test(gluedWanted) &&
    gluedLine.length >= 8 &&
    gluedWanted.length >= 8 &&
    editDistance(gluedLine, gluedWanted) <= 2
  ) {
    return 0.9;
  }
  const lineTokens = new Set(tokens(line));
  const wantedTokens = tokens(wanted);
  if (!wantedTokens.length || !lineTokens.size) {
    return 0;
  }
  let hits = 0;
  wantedTokens.forEach((word) => {
    if (lineTokens.has(word)) {
      hits += 1;
    }
  });
  if (hits < 2) {
    return 0;
  }
  const coverage = hits / Math.min(lineTokens.size, wantedTokens.length);
  const recall = hits / wantedTokens.length;
  return coverage * 0.7 + recall * 0.3;
}

function labelNumber(label) {
  const match = norm(label).match(/^(.*?)(\d+)$/);
  if (!match || !match[2]) {
    return null;
  }
  return { prefix: match[1].trim(), number: Number(match[2]) };
}

function decodeDigits(token) {
  return String(token || "")
    .replace(/[Il|Jj]/g, "1")
    .replace(/[Oo]/g, "0");
}

function lineNumber(text) {
  const parts = String(text || "")
    .trim()
    .split(/\s+/);
  const last = parts[parts.length - 1] || "";
  const decoded = decodeDigits(last);
  if (/^\d{1,3}$/.test(decoded)) {
    return Number(decoded);
  }
  const end = last.match(/(\d{1,3})$/);
  return end ? Number(end[1]) : null;
}

function editDistance(leftText, rightText) {
  const left = String(leftText || "");
  const right = String(rightText || "");
  const row = [];
  for (let j = 0; j <= right.length; j += 1) {
    row[j] = j;
  }
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const next = row[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + cost);
      diagonal = next;
    }
  }
  return row[right.length];
}

function prefixLike(text, prefix) {
  const body = norm(text).replace(/\d+$/g, "").replace(/ /g, "");
  const want = String(prefix || "").replace(/ /g, "");
  if (!body || !want) {
    return false;
  }
  if (body === want) {
    return true;
  }
  if (want.includes(body) && body.length >= 4) {
    return true;
  }
  if (body.includes(want) && body.length <= want.length + 2) {
    return true;
  }
  if (
    want.length >= 4 &&
    body.endsWith(want.slice(-4)) &&
    Math.abs(body.length - want.length) <= 2
  ) {
    return true;
  }
  return (
    Math.abs(body.length - want.length) <= 2 && editDistance(body, want) <= 2
  );
}

function fillSeries(entries) {
  const used = new Set();
  entries.forEach((entry) => {
    if (entry.num != null && !used.has(entry.num)) {
      used.add(entry.num);
      entry.locked = true;
      return;
    }
    entry.num = null;
  });
  entries.forEach((entry, index) => {
    if (entry.locked) {
      return;
    }
    let prev = null;
    let next = null;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (entries[i].locked) {
        prev = entries[i].num;
        break;
      }
    }
    for (let i = index + 1; i < entries.length; i += 1) {
      if (entries[i].locked) {
        next = entries[i].num;
        break;
      }
    }
    let guess = (prev == null ? 0 : prev) + 1;
    while (used.has(guess)) {
      guess += 1;
    }
    if (next != null && guess >= next) {
      return;
    }
    entry.num = guess;
    entry.locked = true;
    used.add(guess);
  });
}

function numberedLine(lines, label) {
  const wanted = labelNumber(label);
  if (!wanted) {
    return null;
  }
  const tagged = (lines || []).map((line) => ({
    line,
    num: lineNumber(line.text),
    like: prefixLike(line.text, wanted.prefix),
    x: line.items.length ? line.items[0].x : line.y
  }));
  const anchors = tagged.filter((entry) => entry.like);
  if (!anchors.length) {
    return null;
  }
  const anchorX = anchors.reduce((edge, entry) => Math.min(edge, entry.x), 1);
  const column = tagged
    .filter((entry) => {
      const inBand = entry.x <= anchorX + 0.15 && entry.x >= anchorX - 0.02;
      if (!inBand) {
        return false;
      }
      if (entry.like) {
        return true;
      }
      if (entry.num == null) {
        return false;
      }
      const body = norm(entry.line.text).replace(/\d+$/g, "").replace(/ /g, "");
      return /\d/.test(body);
    })
    .sort((a, b) => a.line.y - b.line.y);
  fillSeries(column);
  const found = column.find((entry) => entry.num === wanted.number);
  return found ? found.line : null;
}

function bestLine(lines, label, positionPercent) {
  const hint = percentY(positionPercent);
  let best = null;
  lines.forEach((line) => {
    const score = scoreLabel(line.text, label);
    if (score < 0.45) {
      return;
    }
    const distance = hint == null ? 0 : Math.abs(line.y - hint);
    if (
      !best ||
      score > best.score + 0.05 ||
      (Math.abs(score - best.score) <= 0.05 && distance < best.distance)
    ) {
      best = { line, score, distance };
    }
  });
  return best ? best.line : null;
}

function itemHasWord(item, word) {
  const text = norm(item && item.t);
  if (!text) {
    return false;
  }
  if (text === word) {
    return true;
  }
  return text.split(" ").includes(word);
}

function findPhrase(items, phrase) {
  const words = norm(phrase).split(" ").filter(Boolean);
  if (!words.length) {
    return null;
  }
  const sorted = (items || []).slice().sort((a, b) => a.x - b.x);
  for (const item of sorted) {
    const text = norm(item.t);
    if (
      text === words.join(" ") ||
      text.split(" ").slice(0, words.length).join(" ") === words.join(" ")
    ) {
      return item;
    }
  }
  if (words.length < 2) {
    return sorted.find((item) => itemHasWord(item, words[0])) || null;
  }
  for (let i = 0; i < sorted.length; i += 1) {
    let last = null;
    let matched = true;
    for (let w = 0; w < words.length; w += 1) {
      const item = sorted[i + w];
      if (!item || !itemHasWord(item, words[w])) {
        matched = false;
        break;
      }
      if (last && item.x - (last.x + (last.w || 0)) > 0.08) {
        matched = false;
        break;
      }
      last = item;
    }
    if (matched && last) {
      const first = sorted[i];
      return {
        t: phrase,
        x: first.x,
        y: first.y,
        h: first.h,
        w: last.x + (last.w || 0) - first.x,
        f: first.f
      };
    }
  }
  return null;
}

function lineCenter(line) {
  if (line && typeof line.cy === "number") {
    return line.cy;
  }
  return line ? line.y + (line.h || 0.012) / 2 : 0;
}

function rowItems(lines, line) {
  const band = Math.min(0.009, Math.max(0.0045, (line.h || 0.012) * 0.8));
  const y = lineCenter(line);
  const items = [];
  lines.forEach((candidate) => {
    if (Math.abs(lineCenter(candidate) - y) <= band) {
      candidate.items.forEach((item) => items.push(item));
    }
  });
  return items;
}

function optionHit(items, group) {
  const phrases = (group === "attention" ? ATT_PHRASES : OK_PHRASES)
    .slice()
    .sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    const hit = findPhrase(items, phrase);
    if (hit) {
      return hit;
    }
  }
  return null;
}

function bracketCenters(items) {
  const glyphs = [];
  (items || []).forEach((item) => {
    const chars = Array.from(String(item.t || ""));
    const count = Math.max(chars.length, 1);
    chars.forEach((ch, index) => {
      glyphs.push({
        ch,
        x: item.x + ((item.w || 0) * (index + 0.5)) / count,
        y: item.y + (item.h || 0.012) / 2
      });
    });
  });
  glyphs.sort((a, b) => a.x - b.x);
  const stack = [];
  const pairs = [];
  glyphs.forEach((glyph) => {
    if (BOX_CHARS.has(glyph.ch)) {
      pairs.push({ x: glyph.x, y: glyph.y });
      return;
    }
    if (OPEN_TO_CLOSE[glyph.ch]) {
      stack.push(glyph);
      return;
    }
    if (
      !stack.length ||
      OPEN_TO_CLOSE[stack[stack.length - 1].ch] !== glyph.ch
    ) {
      return;
    }
    const open = stack.pop();
    pairs.push({ x: (open.x + glyph.x) / 2, y: (open.y + glyph.y) / 2 });
  });
  return pairs;
}

function nearestPair(pairs, word) {
  const wordX = word.x + (word.w || 0) / 2;
  let best = null;
  pairs.forEach((pair) => {
    const distance = Math.abs(pair.x - wordX);
    if (distance > 0.16) {
      return;
    }
    if (!best || distance < best.distance) {
      best = { pair, distance };
    }
  });
  return best ? best.pair : null;
}

function clamp(value) {
  if (value < 0) {
    return 0;
  }
  if (value > 0.98) {
    return 0.98;
  }
  return value;
}

function topLeft(centerX, centerY, boxW, boxH) {
  return {
    x: clamp(centerX - boxW / 2),
    y: clamp(centerY - boxH / 2)
  };
}

function tickAt(centerX, centerY, wordHeight, aspect) {
  const size = Math.min(0.02, Math.max(0.012, (wordHeight || 0.014) * 0.95));
  const safeAspect = aspect > 0.2 ? aspect : 0.707;
  const origin = topLeft(centerX, centerY, size / safeAspect, size);
  return { kind: "stamp", x: origin.x, y: origin.y, size };
}

function numberAt(centerX, centerY, text, rowHeight, aspect) {
  const fontSize = Math.min(0.016, Math.max(0.01, (rowHeight || 0.014) * 0.85));
  const safeAspect = aspect > 0.2 ? aspect : 0.707;
  const boxW = (fontSize / safeAspect) * 0.55 * String(text).length;
  const origin = topLeft(centerX, centerY, boxW, fontSize);
  return {
    kind: "text",
    text: String(text),
    x: origin.x,
    y: origin.y,
    fontSize
  };
}

function placeOption(lines, line, group, aspect) {
  const items = rowItems(lines, line);
  const word = optionHit(items, group);
  if (!word) {
    return null;
  }
  const rowY = itemCenterY(word);
  if (word.f) {
    return tickAt(word.x + (word.w || 0) / 2, rowY, word.h, aspect);
  }
  const pair = nearestPair(bracketCenters(items), word);
  if (pair && Math.abs(pair.y - rowY) <= Math.max(0.008, word.h || 0.012)) {
    return tickAt(pair.x, rowY, word.h, aspect);
  }
  return tickAt(Math.max(0.01, word.x - 0.02), rowY, word.h, aspect);
}

function headerMatch(item, header) {
  const text = norm(item && item.t);
  const wanted = norm(header);
  if (!text || !wanted) {
    return false;
  }
  if (text === wanted || text.startsWith(wanted + " ")) {
    return true;
  }
  const itemTokens = tokens(text);
  const wantedTokens = tokens(wanted);
  if (!wantedTokens.length) {
    return false;
  }
  return wantedTokens.every((word) => itemTokens.includes(word));
}

function fold(value) {
  return norm(value).replace(/[i1]/g, "l").replace(/0/g, "o");
}

function tokenNear(wanted, hay) {
  if (!wanted || !hay) {
    return false;
  }
  if (hay.includes(wanted)) {
    return true;
  }
  if (
    wanted.length >= 6 &&
    hay.length >= Math.max(5, wanted.length - 4) &&
    wanted.includes(hay)
  ) {
    return true;
  }
  if (wanted.length < 6) {
    return false;
  }
  const min = Math.max(5, wanted.length - 4);
  for (let size = wanted.length; size >= min; size -= 1) {
    for (let index = 0; index + size <= wanted.length; index += 1) {
      if (hay.includes(wanted.slice(index, index + size))) {
        return true;
      }
    }
  }
  return false;
}

function headerScore(text, header) {
  if (headerMatch({ t: text }, header)) {
    return 1;
  }
  const hay = fold(text);
  const wanted = fold(header)
    .split(" ")
    .filter((word) => word.length >= 3);
  if (!hay || !wanted.length) {
    return 0;
  }
  let hits = 0;
  wanted.forEach((word) => {
    if (tokenNear(word, hay)) {
      hits += 1;
    }
  });
  return hits / wanted.length;
}

function windowBox(items) {
  const minX = items.reduce((edge, item) => Math.min(edge, item.x), 1);
  const maxX = items.reduce(
    (edge, item) => Math.max(edge, item.x + (item.w || 0)),
    0
  );
  return { x: (minX + maxX) / 2, width: Math.max(0, maxX - minX) };
}

function headerCenter(lines, columnHeader, centerY) {
  let best = null;
  lines.forEach((candidate) => {
    if (lineCenter(candidate) > centerY + 0.006) {
      return;
    }
    const items = candidate.items;
    for (let start = 0; start < items.length; start += 1) {
      for (let end = start; end < items.length; end += 1) {
        const span = items.slice(start, end + 1);
        const score = headerScore(
          span.map((item) => item.t).join(" "),
          columnHeader
        );
        if (score < 0.6) {
          continue;
        }
        const box = windowBox(span);
        const closer =
          !best ||
          score > best.score + 0.05 ||
          (Math.abs(score - best.score) <= 0.05 && span.length < best.length) ||
          (Math.abs(score - best.score) <= 0.05 &&
            span.length === best.length &&
            box.width < best.width);
        if (closer) {
          best = { x: box.x, score, length: span.length, width: box.width };
        }
      }
    }
  });
  return best ? best.x : null;
}

function placeMeasure(lines, line, columnHeader, measureText, aspect) {
  const centerY = lineCenter(line);
  const labelEnd = line.items.reduce(
    (end, item) => Math.max(end, item.x + (item.w || 0)),
    0
  );
  let centerX = null;
  if (columnHeader) {
    centerX = headerCenter(lines, columnHeader, centerY);
    if (centerX == null) {
      return null;
    }
  } else {
    centerX = labelEnd + 0.03;
  }
  return numberAt(centerX, centerY, measureText, line.h, aspect);
}

function locateChecklistMark(items, spec, aspect) {
  const request = spec || {};
  const pageItems = Array.isArray(items) ? items : [];
  if (!pageItems.length) {
    return null;
  }
  const table = request.isTableCell === true;
  const measure =
    request.measureText == null ? "" : String(request.measureText).trim();
  if (table) {
    if (!measure) {
      return null;
    }
    const lines = linesOf(pageItems);
    const rowLabel = request.rowHeader || request.componentName;
    const line =
      numberedLine(lines, rowLabel) ||
      bestLine(lines, rowLabel, request.positionPercent);
    if (!line) {
      return null;
    }
    return placeMeasure(lines, line, request.columnHeader, measure, aspect);
  }
  const status = norm(request.status);
  const group =
    status === "ok" ? "ok" : status === "attention" ? "attention" : null;
  if (!group) {
    return null;
  }
  const lines = linesOf(pageItems);
  const line = bestLine(
    lines,
    request.componentName || request.rowHeader,
    request.positionPercent
  );
  if (!line) {
    return null;
  }
  return placeOption(lines, line, group, aspect);
}

/**
 * Kiosk additions. Boxes a whole text line as page fractions (0..1, top-left origin).
 * Uses the numbered-row match first, then the fuzzy best line (positionPercent breaks ties).
 */
function locateLabelLine(items, label, positionPercent) {
  const lines = linesOf(items);
  if (!lines.length || !String(label || "").trim()) {
    return null;
  }
  const hint =
    typeof positionPercent === "string"
      ? positionPercent.replace("%", "").trim()
      : positionPercent;
  const line =
    numberedLine(lines, label) ||
    bestLine(lines, label, hint === "" ? null : hint);
  if (!line || !line.items.length) {
    return null;
  }
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  line.items.forEach((item) => {
    const w = item.w > 0 ? item.w : 0;
    const h = item.h > 0 ? item.h : 0.012;
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + w);
    maxY = Math.max(maxY, item.y + h);
  });
  return {
    x: minX,
    y: minY,
    w: Math.max(0, maxX - minX),
    h: Math.max(0, maxY - minY)
  };
}

/** "Wheel Tread - Flange Wear" -> { row: "Wheel Tread", column: "Flange Wear" }. Split at the LAST " - ". */
function splitTableComponent(componentName) {
  const text = String(componentName || "");
  const at = text.lastIndexOf(" - ");
  if (at < 0) {
    return { row: text.trim(), column: null };
  }
  return {
    row: text.slice(0, at).trim(),
    column: text.slice(at + 3).trim() || null
  };
}

export { locateChecklistMark, locateLabelLine, splitTableComponent };
