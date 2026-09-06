/**
 * Report export — Excel (.xlsx), Word (.docx), HTML, Markdown.
 * Ported from the TomiLite implementation (markdown → flat rows for
 * xlsx/docx, HTML via marked). SVG chart blocks are stripped in xlsx/docx.
 */
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, WidthType, TextRun } from 'docx';
import { marked } from 'marked';

const safeName = (s: string) => (s || 'report').replace(/[<>:"/\\|?*]/g, '_').slice(0, 80);

/** Remove embedded SVG chart blocks and other non-exportable content. */
function stripSvg(content: string): string {
  return content
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<defs[\s\S]*?<\/defs>/g, '')
    .replace(/^\s*\n/gm, '');
}

/** Inline markdown formatting tokens (used for plain-text cells). */
function inlineText(t: string): string {
  return t
    .replace(/^>\s*/, '')
    .replace(/^[-*]\s*/, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1');
}

/** Parse markdown into flat rows: headings / table rows / paragraphs. */
function mdToRows(content: string): string[][] {
  const rows: string[][] = [];
  const lines = stripSvg(content).split('\n');
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) { i++; continue; }
    if (/^(#{1,4})\s/.test(t)) {
      rows.push([t.replace(/^#+\s*/, '')]);
      i++; continue;
    }
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(t)) { i++; continue; }
    // Markdown table — consume header + separator + body rows
    if (t.startsWith('|') && t.endsWith('|') && i + 1 < lines.length) {
      const next = (lines[i + 1] || '').trim();
      const noPipes = next.replace(/\|/g, '').trim();
      if (noPipes.length > 0 && /^[\s\-:]+$/.test(noPipes)) {
        const parseRow = (l: string) => l.split('|').slice(1, -1).map((c: string) => c.trim());
        rows.push(parseRow(t));
        i += 2;
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          rows.push(parseRow(lines[i].trim()));
          i++;
        }
        continue;
      }
    }
    rows.push([inlineText(t)]);
    i++;
  }
  return rows;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function exportExcel(title: string, content: string) {
  const rows = mdToRows(content);
  const fname = `${safeName(title)}.xlsx`;
  const ws = XLSX.utils.aoa_to_sheet(rows.length ? rows : [[title]]);
  const maxCols = Math.max(...rows.map((r) => r.length), 1);
  ws['!cols'] = Array.from({ length: maxCols }, (_, c) => ({ wch: c === 0 ? 60 : 22 }));
  const border = {
    top: { style: 'thin' as const }, bottom: { style: 'thin' as const },
    left: { style: 'thin' as const }, right: { style: 'thin' as const },
  };
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      const isHeading = rows[R]?.length === 1 && C === 0;
      const isTableHeader = (rows[R]?.length || 0) > 1;
      ws[addr].s = {
        border,
        font: { bold: isHeading || isTableHeader, name: 'Calibri', sz: 11 },
        alignment: { wrapText: true, vertical: 'top' },
      };
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, fname);
}

export async function exportWord(title: string, content: string) {
  const lines = stripSvg(content).split('\n');
  const children: Array<Paragraph | Table> = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) { i++; continue; }
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(t)) { i++; continue; }
    const heading = t.match(/^(#{1,4})\s(.+)$/);
    if (heading) {
      const level = heading[1].length === 1 ? HeadingLevel.HEADING_1
        : heading[1].length === 2 ? HeadingLevel.HEADING_2
        : heading[1].length === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4;
      children.push(new Paragraph({
        heading: level,
        children: [new TextRun({ text: inlineText(heading[2]), bold: true, size: level === HeadingLevel.HEADING_1 ? 32 : 26 })],
      }));
      i++; continue;
    }
    // Markdown table → Word table
    if (t.startsWith('|') && t.endsWith('|') && i + 1 < lines.length) {
      const next = (lines[i + 1] || '').trim();
      const noPipes = next.replace(/\|/g, '').trim();
      if (noPipes.length > 0 && /^[\s\-:]+$/.test(noPipes)) {
        const parseRow = (l: string) => l.split('|').slice(1, -1).map((c: string) => c.trim());
        const headerCells = parseRow(t).map((c: string) => new TableCell({
          width: { size: 100 / Math.max(parseRow(t).length, 1), type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: c, bold: true })] })],
        }));
        const tableRows: TableRow[] = [new TableRow({ children: headerCells, tableHeader: true })];
        i += 2;
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          const cells = parseRow(lines[i].trim()).map((c: string) => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: inlineText(c) })] })],
          }));
          tableRows.push(new TableRow({ children: cells }));
          i++;
        }
        children.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
        continue;
      }
    }
    const text = inlineText(t);
    const isList = /^[-*]\s/.test(t) || /^\d+\.\s/.test(t);
    children.push(new Paragraph({
      bullet: isList && /^[-*]\s/.test(t) ? { level: 0 } : undefined,
      numbering: isList && /^\d+\.\s/.test(t) ? { reference: 'decimal', level: 0 } : undefined,
      children: [new TextRun({ text, size: 22 })],
    }));
    i++;
  }
  if (children.length === 0) children.push(new Paragraph({ children: [new TextRun({ text: title })] }));
  const doc = new Document({
    sections: [{ properties: {}, children: [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, bold: true, size: 40 })] }), ...children] }],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${safeName(title)}.docx`);
}

export function exportHtml(title: string, content: string) {
  const parsed = marked.parse(content);
  // marked may return a Promise in async mode; our usage is synchronous
  const body = typeof parsed === 'string' ? parsed : String(parsed);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; max-width: 900px; margin: 32px auto; padding: 0 24px; color: #1e293b; line-height: 1.7; }
  h1 { font-size: 24px; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; }
  h2 { font-size: 18px; margin-top: 28px; }
  h3 { font-size: 15px; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; }
  th { background: #4f46e5; color: #fff; padding: 8px 12px; text-align: left; font-size: 13px; }
  td { border-bottom: 1px solid #e2e8f0; padding: 7px 12px; font-size: 13px; }
  tr:nth-child(even) td { background: #f8fafc; }
  blockquote { margin: 14px 0; padding: 12px 18px; background: #eef2ff; border-radius: 8px; color: #3730a3; }
  pre { background: #0d1117; color: #c9d1d9; padding: 12px 16px; border-radius: 6px; overflow-x: auto; }
  code { font-family: Consolas, Monaco, monospace; }
  svg { max-width: 100%; height: auto; }
  hr { border: none; height: 2px; background: linear-gradient(90deg, #4f46e5, transparent); margin: 20px 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeName(title)}.html`);
}

export function exportMarkdown(title: string, content: string) {
  downloadBlob(new Blob([content], { type: 'text/markdown;charset=utf-8' }), `${safeName(title)}.md`);
}
