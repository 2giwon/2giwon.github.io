// 원문 md 를 h2 섹션으로 나누고, 그림 데이터의 섹션과 맞춘다(문서 화면이 이 결과를 그린다).
// 원문 속 HTML 은 실행하지 않고 글자로 낸다 — 토큰이 같은 localStorage 에 있으므로 스크립트가 돌면 안 된다.

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 섹션 제목 비교용: 이모지와 변형 선택자를 빼고, 공백을 하나로 모은다. */
export function normalizeHeading(h) {
  return String(h ?? '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 문서 속 링크를 안전한 주소로 바꾼다. 같은 repo 의 md 는 작업노트 안 주소, http(s) 와 mailto 는 그대로,
 * 나머지(javascript:, data:, 앵커만, repo 밖)는 null(링크 없이 글자만).
 */
export function resolveDocLink({ repo, path }, href) {
  const h = String(href ?? '').trim();
  if (/^https?:\/\//i.test(h) || /^mailto:/i.test(h)) return h;
  if (/^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith('#') || h.startsWith('/') || !h) return null;
  const target = h.split('#')[0];
  if (!/\.md$/i.test(target)) return null;
  const parts = path.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else {
      try {
        parts.push(decodeURIComponent(seg));
      } catch {
        parts.push(seg);
      }
    }
  }
  return `#/doc/${repo}/${parts.join('/')}`;
}

/** 안전한 md → HTML 함수를 만든다. Marked 는 vendor/marked.esm.js 의 클래스. */
export function createRenderer(Marked, ctx) {
  const md = new Marked({
    gfm: true,
    renderer: {
      html({ text, block }) {
        return block ? `<p>${esc(text)}</p>` : esc(text);
      },
      image({ text }) {
        return text ? `<span class="img-alt">[그림: ${esc(text)}]</span>` : '';
      },
      link({ href, tokens }) {
        const label = this.parser.parseInline(tokens);
        const safe = resolveDocLink(ctx, href);
        if (!safe) return label;
        const outside = /^https?:/i.test(safe);
        return `<a href="${esc(safe)}"${outside ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
      },
    },
  });
  return (text) => md.parse(text);
}

function stripFrontmatter(text) {
  return text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '');
}

/**
 * 각 줄이 코드 블록 안인지 표시한다. 여는 줄과 닫는 줄도 안으로 본다.
 * 닫는 줄은 여는 줄과 같은 글자(` 또는 ~)이고 길이가 같거나 길며 뒤에 다른 글자가 없어야 한다
 * (```` 블록 안의 ``` 예시가 블록을 닫지 않게, codex P2 11-09).
 */
function fenceMask(lines) {
  let open = null; // { ch, len }
  return lines.map((line) => {
    const f = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!open) {
      if (f && !(f[1][0] === '`' && f[2].includes('`'))) {
        open = { ch: f[1][0], len: f[1].length };
        return true;
      }
      return false;
    }
    if (f && f[1][0] === open.ch && f[1].length >= open.len && f[2].trim() === '') open = null;
    return true;
  });
}

/** 코드 블록 밖의 `## ` 줄에서 나눈다. */
function splitSections(body) {
  const sections = [{ heading: null, lines: [] }];
  const lines = body.split(/\r?\n/);
  const inFence = fenceMask(lines);
  for (const [i, line] of lines.entries()) {
    const h2 = !inFence[i] && line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (h2) sections.push({ heading: h2[1], lines: [] });
    else sections[sections.length - 1].lines.push(line);
  }
  if (sections[0].lines.join('').trim() === '' && sections.length > 1) sections.shift();
  return sections;
}

/**
 * @param {string} md 원문
 * @param {object|null} figures parseFigures 의 data
 * @param {(md:string)=>string} render createRenderer 결과
 * @param {string} fileName h1 이 없을 때 제목
 */
export function buildDocView(md, figures, render, fileName) {
  const lines = stripFrontmatter(String(md ?? '')).split(/\r?\n/);
  const inFence = fenceMask(lines);
  // 제목 = 코드 블록 밖의 첫 h1 (코드 속 `# 주석` 을 제목으로 잡지 않는다)
  let title = fileName;
  const h1At = lines.findIndex((l, i) => !inFence[i] && /^#\s+\S/.test(l));
  if (h1At >= 0) {
    title = lines[h1At].replace(/^#\s+/, '').replace(/\s*#*\s*$/, '');
    lines.splice(h1At, 1);
    inFence.splice(h1At, 1);
  }
  const body = lines.join('\n');
  // 참조 링크 정의(`[이름]: 주소`)는 문서 전체에 걸린다 — 섹션마다 따로 그려도 링크가 되게 각 섹션 뒤에 붙인다
  const refs = lines.filter((l, i) => !inFence[i] && /^ {0,3}\[[^\]]+\]:\s*\S/.test(l)).join('\n');

  const byHeading = new Map();
  for (const s of figures?.sections ?? []) byHeading.set(normalizeHeading(s.heading), s);

  const sections = splitSections(body).map(({ heading, lines }) => {
    const key = normalizeHeading(heading);
    const fig = byHeading.get(key);
    byHeading.delete(key);
    return {
      heading,
      html: render(refs ? `${lines.join('\n')}\n\n${refs}\n` : lines.join('\n')),
      keyPoints: fig?.keyPoints ?? [],
      figures: fig?.figures ?? [],
    };
  });

  const orphanFigures = [...byHeading.values()].flatMap((s) => s.figures);
  return { title, summary: figures?.summary ?? null, sections, orphanFigures };
}
