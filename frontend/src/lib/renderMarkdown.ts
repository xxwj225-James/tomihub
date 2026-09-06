/**
 * Markdown → HTML renderer with GFM table support (alignment, header styling).
 * Replaces the `marked` library which doesn't handle table alignment well.
 */
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml';

function _regLang(name: string, mod: any) {
  if (!hljs.getLanguage(name)) hljs.registerLanguage(name, mod);
}
_regLang('javascript', javascript); _regLang('js', javascript);
_regLang('typescript', typescript); _regLang('ts', typescript);
_regLang('python', python); _regLang('py', python);
_regLang('bash', bash); _regLang('sh', bash);
_regLang('json', json);
_regLang('css', css);
_regLang('sql', sql);
_regLang('xml', xml); _regLang('html', xml);

export function renderMarkdown(md: string): string {
  if (!md) return '';

  // Protect raw HTML blocks (e.g. <svg> charts embedded in reports) BEFORE
  // escaping — they must pass through to the sanitizer as real HTML, not be
  // shown as escaped source text. SVG blocks are matched as whole pairs.
  const htmlBlocks: string[] = [];
  md = md.replace(/<svg[\s\S]*?<\/svg>/g, (block) => {
    htmlBlocks.push(block);
    return `\x00HB${htmlBlocks.length - 1}\x00`;
  });

  let h = md
    .replace(/\\([*_~`#+\-.!|{}\[\]()\\])/g, '$1')
    .replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Extract code blocks to protect newlines inside
  const codeBlocks: string[] = [];
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    let highlighted = code;
    try { highlighted = lang ? hljs.highlight(code, { language: lang }).value : hljs.highlightAuto(code).value; } catch {}
    codeBlocks.push(`<pre><code class="hljs language-${lang || 'auto'}">${highlighted}</code></pre>`);
    return `\x00CB${codeBlocks.length - 1}\x00`;
  });

  // Inline formatting
  h = h
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;max-height:400px">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Block elements — line-by-line
  const lines = h.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block placeholder
    if (line.startsWith('\x00CB')) { out.push(line); i++; continue; }

    // Raw HTML block placeholder (svg charts etc.) — emit as-is
    if (line.startsWith('\x00HB')) { out.push(line); i++; continue; }

    // Headings
    let m = line.match(/^(#{1,6}) (.+)$/);
    if (m) { out.push(`<h${m[1].length}>${m[2]}</h${m[1].length}>`); i++; continue; }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    // Blockquote
    m = line.match(/^&gt; (.+)$/);
    if (m) {
      const bqLines: string[] = [];
      while (i < lines.length) {
        const bm = lines[i].match(/^&gt; (.+)$/);
        if (!bm) break;
        bqLines.push(bm[1]);
        i++;
      }
      out.push(`<blockquote>${bqLines.join('<br>')}</blockquote>`);
      continue;
    }

    // Task list
    m = line.match(/^- \[(x| )\] (.+)$/i);
    if (m) {
      const items: string[] = [];
      while (i < lines.length) {
        const tm = lines[i].match(/^- \[(x| )\] (.+)$/i);
        if (!tm) break;
        const checked = tm[1].toLowerCase() === 'x' ? ' checked' : '';
        items.push(`<li><input type="checkbox"${checked} disabled> ${tm[2]}</li>`);
        i++;
      }
      out.push('<ul class="task-list">' + items.join('') + '</ul>');
      continue;
    }

    // Ordered list
    m = line.match(/^\d+\. (.+)$/);
    if (m) {
      const items: string[] = [];
      while (i < lines.length) {
        const om = lines[i].match(/^\d+\. (.+)$/);
        if (!om) break;
        items.push('<li>' + om[1] + '</li>');
        i++;
      }
      out.push('<ol>' + items.join('') + '</ol>');
      continue;
    }

    // Unordered list
    m = line.match(/^[\-\*] (.+)$/);
    if (m) {
      const items: string[] = [];
      while (i < lines.length) {
        const um = lines[i].match(/^[\-\*] (.+)$/);
        if (!um) break;
        items.push('<li>' + um[1] + '</li>');
        i++;
      }
      out.push('<ul>' + items.join('') + '</ul>');
      continue;
    }

    // Table rows (GFM pipe-delimited with leading/trailing pipes)
    if (line.includes('|') && /^\|.+\|$/.test(line.trim())) {
      const tableRows: string[] = [];
      let sepIdx = -1;
      while (i < lines.length && lines[i].includes('|') && /^\|.+\|$/.test(lines[i].trim())) {
        const rowText = lines[i].trim();
        const withoutPipes = rowText.replace(/\|/g, '').trim();
        if (withoutPipes.length > 0 && /^[\s\-:]+$/.test(withoutPipes)) sepIdx = tableRows.length;
        tableRows.push(rowText);
        i++;
      }
      if (tableRows.length >= 2 && sepIdx >= 0) {
        const aligns: string[] = [];
        const sepCells = tableRows[sepIdx].split('|').filter(c => c.trim() !== '');
        for (const c of sepCells) {
          const t = c.trim();
          if (t.startsWith(':') && t.endsWith(':')) aligns.push('center');
          else if (t.endsWith(':')) aligns.push('right');
          else aligns.push('left');
        }
        let t = '<table>';
        tableRows.forEach((row, ri) => {
          if (ri === sepIdx) return;
          t += '<tr>';
          const cells = row.split('|').filter(c => c.trim() !== '');
          cells.forEach((cell, ci) => {
            const align = aligns[ci] ? ` style="text-align:${aligns[ci]}"` : '';
            if (ri === 0 || (sepIdx < 0 && ri === 0)) {
              t += '<th' + align + '>' + cell.trim() + '</th>';
            } else {
              t += '<td' + align + '>' + cell.trim() + '</td>';
            }
          });
          t += '</tr>';
        });
        out.push(t + '</table>');
        continue;
      }
      i -= tableRows.length;
    }

    // Empty line
    if (line.trim() === '') { i++; continue; }

    // Paragraph
    const para: string[] = [];
    while (i < lines.length &&
           lines[i].trim() !== '' &&
           !/^(#{1,6} |[-*_]{3,}\s*$|&gt; |- \[[ x]\] |[\-\*] |\d+\. )/.test(lines[i]) &&
           !lines[i].startsWith('\x00CB')) {
      para.push(lines[i]);
      i++;
    }
    if (para.length > 0) out.push('<p>' + para.join('<br>') + '</p>');
    else i++;
  }

  h = out.join('\n');
  h = h.replace(/\x00CB(\d+)\x00/g, (_m, idx) => codeBlocks[parseInt(idx)]);
  h = h.replace(/\x00HB(\d+)\x00/g, (_m, idx) => htmlBlocks[parseInt(idx)]);
  return h;
}
