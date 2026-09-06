/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-empty */
import { useEffect, useRef, useState } from 'react';
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx, rootAttrsCtx, editorViewCtx, editorViewOptionsCtx } from '@milkdown/kit/core';
import { useLanguageStore } from '@/stores/languageStore';
import {
  commonmark, toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand,
  wrapInHeadingCommand, wrapInBulletListCommand, wrapInOrderedListCommand,
  wrapInBlockquoteCommand, createCodeBlockCommand, insertHrCommand,
  toggleLinkCommand, insertImageCommand,
} from '@milkdown/kit/preset/commonmark';
import {
  gfm, toggleStrikethroughCommand, insertTableCommand,
  setAlignCommand, deleteSelectedCellsCommand,
  selectRowCommand, selectColCommand, selectTableCommand,
} from '@milkdown/kit/preset/gfm';
import { columnResizingPlugin } from '@milkdown/preset-gfm';
import { history } from '@milkdown/kit/plugin/history';
import { keymap as proseKeymap } from '@milkdown/prose/keymap';
import { replaceAll, callCommand } from '@milkdown/kit/utils';
import { isInTable } from 'prosemirror-tables';
import { $prose, $mark } from '@milkdown/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
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
_regLang('python', python);         _regLang('py', python);
_regLang('bash', bash);             _regLang('sh', bash);
_regLang('json', json);
_regLang('css', css);
_regLang('sql', sql);
_regLang('xml', xml);               _regLang('html', xml);

const HL_KEY = new PluginKey('hl');

// ─── Custom marks: text color + background highlight ───
const textColorMark = $mark('textColor', () => ({
  attrs: { color: {} },
  parseDOM: [{ style: 'color', getAttrs: (v: string) => v ? { color: v } : null }],
  toDOM: (mark: any) => ['span', { style: `color:${mark.attrs.color || '#ef4444'}` }, 0],
  toMarkdown: { match: (_m: any) => false, write: () => '' } as any,
  parseMarkdown: { match: (_n: any) => false, runner: (_s: any, _n: any, _m: any) => {} } as any,
}));

const highlightMark = $mark('highlight', () => ({
  attrs: { color: {} },
  parseDOM: [{ style: 'background-color', getAttrs: (v: string) => v ? { color: v } : null }],
  toDOM: (mark: any) => ['span', { style: `background-color:${mark.attrs.color || '#fecaca'}` }, 0],
  toMarkdown: { match: (_m: any) => false, write: () => '' } as any,
  parseMarkdown: { match: (_n: any) => false, runner: (_s: any, _n: any, _m: any) => {} } as any,
}));

// ─── Parse highlight.js HTML → token positions ───
const _hlDiv = typeof document !== 'undefined' ? document.createElement('div') : null;
function parseTokens(html: string): Array<{ from: number; to: number; cls: string }> {
  const tokens: Array<{ from: number; to: number; cls: string }> = [];
  if (!_hlDiv) return tokens;
  _hlDiv.innerHTML = html;
  let p = 0;
  (function walk(n: ChildNode, c: string) {
    if (n.nodeType === 3) { const l = (n.textContent || '').length; if (c && l) tokens.push({ from: p, to: p + l, cls: c }); p += l; }
    else if (n.nodeType === 1) { const el = n as HTMLElement; const nc = el.className && el.className !== 'hljs' ? el.className : c; for (let i = 0; i < el.childNodes.length; i++) walk(el.childNodes[i], nc); }
  })(_hlDiv, '');
  return tokens;
}

function buildHLDecos(doc: any): DecorationSet {
  const decos: any[] = [];
  try {
    doc.descendants((node: any, pos: number) => {
      if (node.type.name !== 'code_block') return;
      const code = node.textContent || '';
      if (!code) return;
      const lang = node.attrs?.language || '';
      let html: string;
      try {
        html = (lang && hljs.getLanguage(lang))
          ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
          : hljs.highlightAuto(code).value;
      } catch { return; }
      const tokens = parseTokens(html);
      const start = pos + 1;
      const maxPos = pos + node.nodeSize - 1;
      for (const t of tokens) {
        const fromPos = start + t.from, toPos = start + t.to;
        if (t.from < t.to && fromPos >= start && toPos <= maxPos) {
          decos.push(Decoration.inline(fromPos, toPos, { class: t.cls }));
        }
      }
    });
  } catch {}
  return DecorationSet.create(doc, decos);
}

// ─── Props & Tools ───────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  height?: string;
}

interface Tool {
  label: string;
  title: string;
  cmd?: any; cmdArg?: any;
  blockCmd?: any; blockCmdArg?: any;
  insert?: string; insertAfter?: string;
}

function getTools(): Tool[] {
  return [
    { label: 'B',  title: 'Bold', cmd: toggleStrongCommand },
    { label: 'I',  title: 'Italic', cmd: toggleEmphasisCommand },
    { label: 'S',  title: 'Strikethrough', cmd: toggleStrikethroughCommand },
    { label: '`',  title: 'Inline Code', cmd: toggleInlineCodeCommand },
    { label: 'H1', title: 'Heading 1', blockCmd: wrapInHeadingCommand, blockCmdArg: 1 },
    { label: 'H2', title: 'Heading 2', blockCmd: wrapInHeadingCommand, blockCmdArg: 2 },
    { label: 'H3', title: 'Heading 3', blockCmd: wrapInHeadingCommand, blockCmdArg: 3 },
    { label: '•',  title: 'Bullet List', blockCmd: wrapInBulletListCommand },
    { label: '1.', title: 'Numbered List', blockCmd: wrapInOrderedListCommand },
    { label: '"',  title: 'Blockquote', blockCmd: wrapInBlockquoteCommand },
    { label: '</>', title: 'Code Block', blockCmd: createCodeBlockCommand },
    { label: '🔗', title: 'Link' },
    { label: '📷', title: 'Image' },
    { label: 'A',  title: 'Text Color' },
    { label: '█',  title: 'Highlight' },
    { label: '⊞',  title: 'Insert Table' },
    { label: '―',  title: 'Horizontal Rule', blockCmd: insertHrCommand },
    { label: '☑',  title: 'Task List', insert: '\n- [ ] ' },
  ];
}

function getTableTools(): Tool[] {
  return [
    { label: '+↥', title: 'Add Row Above' },
    { label: '+↧', title: 'Add Row Below' },
    { label: '+⇤', title: 'Add Column Left' },
    { label: '+⇥', title: 'Add Column Right' },
    { label: '⌫R', title: 'Delete Row' },
    { label: '⌫C', title: 'Delete Column' },
    { label: '⛶', title: 'Delete Table' },
    { label: '⟵', title: 'Align Left', blockCmd: setAlignCommand, blockCmdArg: 'left' },
    { label: '⟺', title: 'Align Center', blockCmd: setAlignCommand, blockCmdArg: 'center' },
    { label: '⟶', title: 'Align Right', blockCmd: setAlignCommand, blockCmdArg: 'right' },
  ];
}

const TEXT_COLORS = [
  { hex: '#ef4444', label: 'Red' }, { hex: '#f97316', label: 'Orange' },
  { hex: '#eab308', label: 'Yellow' }, { hex: '#22c55e', label: 'Green' },
  { hex: '#3b82f6', label: 'Blue' }, { hex: '#a855f7', label: 'Purple' },
  { hex: '#ec4899', label: 'Pink' }, { hex: '#6b7280', label: 'Gray' },
  { hex: '#ffffff', label: 'White' }, { hex: '#1e293b', label: 'Black' },
];
const HIGHLIGHT_COLORS = [
  { hex: '#fecaca', label: 'Red' }, { hex: '#fed7aa', label: 'Orange' },
  { hex: '#fef08a', label: 'Yellow' }, { hex: '#bbf7d0', label: 'Green' },
  { hex: '#bfdbfe', label: 'Blue' }, { hex: '#e9d5ff', label: 'Purple' },
  { hex: '#fbcfe8', label: 'Pink' }, { hex: '#e2e8f0', label: 'Gray' },
  { hex: '#ffffff', label: 'White' }, { hex: '#e2e8f0', label: 'Slate' },
];

// ─── Serialization helpers (color-aware markdown output) ─────────────────────

function colorGetMarkdown(editor: any): string {
  return editor.action((ctx: any) => {
    const view = ctx.get(editorViewCtx);
    if (!view) return '';
    const doc = view.state.doc;
    const result: string[] = [];
    doc.forEach((block: any) => {
      const blockText = serializeBlock(block);
      if (blockText) result.push(blockText);
    });
    return result.join('\n\n');
  });
}

function serializeBlock(node: any): string {
  if (!node) return '';
  const type = node.type.name;
  if (type === 'hr' || type === 'horizontal_rule') return '---';
  if (type === 'code_block') {
    const lang = node.attrs?.language || '';
    return '```' + lang + '\n' + (node.textContent || '') + '\n```';
  }
  if (type === 'bullet_list' || type === 'ordered_list') return serializeList(node);
  if (type === 'blockquote') {
    const lines: string[] = [];
    node.forEach((child: any) => {
      const s = serializeBlock(child);
      if (s) s.split('\n').forEach((line: string) => lines.push(line ? '> ' + line : '>'));
    });
    return lines.join('\n');
  }
  if (type === 'table') return serializeTable(node);
  if (node.isTextblock) {
    let prefix = '';
    if (type === 'heading') prefix = '#'.repeat(node.attrs.level || 1) + ' ';
    const line: string[] = [];
    node.forEach((child: any) => {
      if (child.isText) line.push(serializeInline(child));
      else if (child.type.name === 'image') line.push(`![${child.attrs.alt || ''}](${child.attrs.src || ''})`);
      else if (child.type.name === 'hard_break') line.push('\n');
      else if (child.isInline) line.push(child.textContent || '');
    });
    return prefix + line.join('');
  }
  const fallback: string[] = [];
  node.forEach((child: any) => {
    const s = serializeBlock(child);
    if (s) fallback.push(s);
  });
  return fallback.join('\n');
}

function serializeList(node: any): string {
  const items: string[] = [];
  const ordered = node.type.name === 'ordered_list';
  let idx = node.attrs?.start || 1;
  node.forEach((item: any) => {
    const lines: string[] = [];
    item.forEach((child: any) => {
      const serialized = serializeBlock(child);
      if (serialized) lines.push(serialized);
    });
    const prefix = ordered ? `${idx++}. ` : '- ';
    items.push(lines.join('\n').split('\n').map((l, i) => i === 0 ? prefix + l : '  ' + l).join('\n'));
  });
  return items.join('\n');
}

function serializeTable(node: any): string {
  const rows: string[] = [];
  let headerAlignments: string[] = [];
  node.forEach((row: any, _o: number, ri: number) => {
    const cells: string[] = [];
    row.forEach((cell: any) => {
      let text = '';
      cell.forEach((child: any) => {
        if (child.isText) text += serializeInline(child);
        else text += child.textContent || '';
      });
      cells.push(text.replace(/\|/g, '\\|').replace(/\n/g, '<br>'));
      if (ri === 0) headerAlignments.push(cell.attrs?.alignment || cell.attrs?.align || 'left');
    });
    rows.push('| ' + cells.join(' | ') + ' |');
    if (ri === 0) {
      const sep = headerAlignments.map(a => a === 'center' ? ':---:' : a === 'right' ? '---:' : ':---').join('|');
      rows.push('| ' + sep + ' |');
    }
  });
  return rows.join('\n');
}

function serializeInline(node: any): string {
  let text = node.text || '';
  const marks = node.marks || [];
  let styleStr = '';
  let isStrong = false, isEm = false, isCode = false, isStrike = false, linkHref = '';
  for (const mark of marks) {
    if (mark.type.name === 'textColor') styleStr += `color:${mark.attrs.color};`;
    else if (mark.type.name === 'highlight') styleStr += `background-color:${mark.attrs.color};`;
    else if (mark.type.name === 'strong') isStrong = true;
    else if (mark.type.name === 'em') isEm = true;
    else if (mark.type.name === 'code') isCode = true;
    else if (mark.type.name === 'strikethrough') isStrike = true;
    else if (mark.type.name === 'link') linkHref = mark.attrs?.href || '';
  }
  if (styleStr) text = `<span style="${styleStr}">${text}</span>`;
  if (isCode) text = '`' + text + '`';
  if (isStrike) text = `~~${text}~~`;
  if (isEm) text = `*${text}*`;
  if (isStrong) text = `**${text}**`;
  if (linkHref) text = `[${text}](${linkHref})`;
  return text;
}

// ─── Cell NodeView (preserves alignment) ─────────────────────────────────────

class CellNodeView {
  dom: HTMLElement; contentDOM: HTMLElement; node: any;
  constructor(node: any, isHeader: boolean) {
    this.node = node;
    this.dom = document.createElement(isHeader ? 'th' : 'td');
    this.contentDOM = this.dom;
    this.updateStyle(node);
  }
  updateStyle(node: any) {
    const align = node.attrs?.alignment || node.attrs?.align || 'left';
    this.dom.style.setProperty('text-align', align, 'important');
    this.dom.setAttribute('align', align);
  }
  update(node: any) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.updateStyle(node);
    return true;
  }
}

// ─── Inner editor component ──────────────────────────────────────────────────

function MilkdownInner({ value, onChange, readOnly }: Props) {
  const lang = useLanguageStore(s => s.lang);

  useEditor((root: HTMLElement) => {
    root.style.height = '100%';
    root.style.outline = 'none';
    const ed = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value || '');
        ctx.set(rootAttrsCtx, { spellcheck: 'false', translate: 'no', class: 'milkdown-editor' });
        ctx.set(editorViewOptionsCtx, {
          editable: () => !readOnly,
          handleDOMEvents: {
            paste: (_view: any, event: ClipboardEvent) => {
              // Strip HTML when pasting rich text — prevent raw <span>/<div> in markdown
              const html = event.clipboardData?.getData('text/html');
              if (html) {
                event.preventDefault();
                const text = event.clipboardData?.getData('text/plain') || html.replace(/<[^>]*>/g, '');
                _view.dispatch(_view.state.tr.replaceSelectionWith(
                  _view.state.schema.text(text)
                ));
                return true;
              }
              return false;
            },
            keydown: (_view: any, event: KeyboardEvent) => {
              if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Backspace' || event.key === 'Delete') {
                const st = _view.state;
                if (isInTable(st)) { }
              }
              return false;
            },
          },
        });
      })
      .use(commonmark)
      .use($prose(() => proseKeymap({
        'Enter': (state: any, dispatch: any) => {
          if (!isInTable(state)) return false;
          if (dispatch) dispatch(state.tr.insertText('\n', state.selection.from));
          return true;
        },
      })))
      .use(gfm)
      .use(columnResizingPlugin)
      // Cell NodeView
      .use($prose(() => new Plugin({
        props: {
          nodeViews: {
            table_cell: (node: any) => new CellNodeView(node, false),
            table_header: (node: any) => new CellNodeView(node, true),
          },
        },
      })))
      // Row resize via bottom border drag
      .use($prose(() => new Plugin({
        view(editorView: any) {
          let _startY = 0, _startHeights: number[] = [], _cells: HTMLElement[] = [];
          const onMove = (e: MouseEvent) => {
            const cell = (e.target as HTMLElement).closest('td,th') as HTMLElement | null;
            if (!cell) { editorView.dom.style.cursor = ''; return; }
            const r = cell.getBoundingClientRect();
            if (e.clientY > r.bottom - 6) { editorView.dom.style.cursor = 'row-resize'; return; }
            if (editorView.dom.style.cursor === 'row-resize') editorView.dom.style.cursor = '';
          };
          const onDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            const cell = (e.target as HTMLElement).closest('td,th') as HTMLElement | null;
            if (!cell) return;
            const r = cell.getBoundingClientRect();
            if (e.clientY > r.bottom - 6) {
              e.preventDefault(); e.stopPropagation();
              const row = cell.closest('tr') as HTMLElement;
              _cells = Array.from(row.querySelectorAll('td,th'));
              _startHeights = _cells.map(c => c.getBoundingClientRect().height);
              _startY = e.clientY;
              editorView.setProps({ editable: () => false });
              const onUp = () => {
                document.removeEventListener('mousemove', onDrag);
                document.removeEventListener('mouseup', onUp);
                editorView.setProps({ editable: () => true });
              };
              const onDrag = (ev: MouseEvent) => {
                const delta = ev.clientY - _startY;
                _cells.forEach((c, i) => c.style.setProperty('height', Math.max(20, _startHeights[i] + delta) + 'px', 'important'));
              };
              document.addEventListener('mousemove', onDrag);
              document.addEventListener('mouseup', onUp);
            }
          };
          editorView.dom.addEventListener('mousemove', onMove);
          editorView.dom.addEventListener('mousedown', onDown, true);
          return { destroy() { editorView.dom.removeEventListener('mousemove', onMove); editorView.dom.removeEventListener('mousedown', onDown, true); } };
        },
      })))
      .use(textColorMark)
      .use(highlightMark)
      .use(history)
      .use($prose(() => new Plugin({
        key: new PluginKey('tableActiveTracker'),
        view() { return { update(v: any) { setTableActive(isInTable(v.state)); } }; },
      })))
      .use($prose(() => new Plugin({
        key: HL_KEY,
        state: {
          init() { return DecorationSet.empty; },
          apply(tr, old) {
            const meta = tr.getMeta(HL_KEY);
            if (meta?.decos) return meta.decos;
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: { decorations(s: any) { return this.getState(s); } },
      })))
      .use($prose(() => proseKeymap({
        'Shift-Enter': (state: any, dispatch: any) => {
          const { $from } = state.selection;
          if ($from.parent.type.name === 'code_block') {
            if (dispatch) dispatch(state.tr.insertText('\n', $from.pos).scrollIntoView());
            return true;
          }
          return false;
        },
      })));
    return ed;
  }, []);

  const [loading, getInstance] = useInstance();
  const editor = getInstance();
  const lastMdRef = useRef(value);
  const lastExternalValueRef = useRef(value);
  const [promptState, setPromptState] = useState<{ type: 'link' | 'image'; label: string } | null>(null);
  const [colorPicker, setColorPicker] = useState<{ type: 'text' | 'bg'; label: string } | null>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const savedSelRef = useRef<{ from: number; to: number } | null>(null);
  const [tableActive, setTableActive] = useState(false);

  // Sync editable state
  useEffect(() => {
    if (editor && !loading) {
      try {
        editor.action((ctx: any) => {
          const view = ctx.get(editorViewCtx);
          if (view) view.setProps({ editable: () => !readOnly });
        });
      } catch {}
    }
  }, [readOnly, editor, loading]);

  // Highlight.js decorations
  useEffect(() => {
    if (!editor || loading) return;
    const refresh = () => {
      editor.action((ctx: any) => {
        const view = ctx.get(editorViewCtx);
        if (!view) return;
        view.dispatch(view.state.tr.setMeta(HL_KEY, { decos: buildHLDecos(view.state.doc) }));
      });
    };
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => clearInterval(iv);
  }, [editor, loading]);

  // Poll for content changes
  useEffect(() => {
    if (!editor || loading || !onChange) return;
    const iv = setInterval(() => {
      if (readOnly) return;
      try {
        const md = colorGetMarkdown(editor) || '';
        if (md !== lastMdRef.current) { lastMdRef.current = md; onChange(md); }
      } catch {}
    }, 300);
    return () => clearInterval(iv);
  }, [editor, loading, onChange, readOnly]);

  // Sync external value changes
  useEffect(() => {
    if (editor && !loading && value !== undefined) {
      if (value === lastMdRef.current) return;
      if (value === lastExternalValueRef.current) return;
      try {
        const cur = colorGetMarkdown(editor) || '';
        if (cur !== value) {
          let focused = false;
          editor.action((ctx: any) => {
            const view = ctx.get(editorViewCtx);
            if (view?.hasFocus()) focused = true;
          });
          if (focused) return;
          lastExternalValueRef.current = value;
          lastMdRef.current = value;
          editor.action(replaceAll(value || ''));
        }
      } catch {}
    }
  }, [value, editor, loading]);

  // ─── Color ───
  const applyColor = (color: string, type: 'text' | 'bg') => {
    if (!editor) return;
    editor.action((ctx: any) => {
      const view = ctx.get(editorViewCtx);
      if (!view) return;
      const state = view.state;
      const { from, to } = state.selection;
      const markType = type === 'text' ? state.schema.marks.textColor : state.schema.marks.highlight;
      if (from !== to) {
        const mark = markType.create({ color });
        view.dispatch(state.tr.addMark(from, to, mark));
      }
      view.focus();
    });
    setColorPicker(null);
    const md = colorGetMarkdown(editor) || '';
    lastMdRef.current = md;
    onChange?.(md);
  };

  // ─── Link/Image prompt ───
  const submitPrompt = (url: string) => {
    if (!promptState || !editor) return;
    editor.action((ctx: any) => {
      const view = ctx.get(editorViewCtx);
      if (!view) return;
      const s = savedSelRef.current;
      if (s && s.from !== s.to) {
        const $from = view.state.doc.resolve(s.from);
        const $to = view.state.doc.resolve(s.to);
        view.dispatch(view.state.tr.setSelection(new TextSelection($from, $to)));
      }
      savedSelRef.current = null;
      if (promptState.type === 'link') {
        callCommand(toggleLinkCommand.key, { href: url })(ctx);
      } else {
        let selText = '';
        try { const f = s ? s.from : view.state.selection.from; const t = s ? s.to : view.state.selection.to; if (f !== t) selText = view.state.doc.textBetween(f, t); } catch {}
        callCommand(insertImageCommand.key, { src: url, alt: selText })(ctx);
      }
      view.focus();
    });
    const md = colorGetMarkdown(editor) || '';
    lastMdRef.current = md;
    onChange?.(md);
    setPromptState(null);
  };

  const pickLocalFile = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => submitPrompt(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // ─── Tool execution ───
  function execTableCmd(ed: any, t: Tool) {
    ed.action((ctx: any) => {
      const view = ctx.get(editorViewCtx);
      if (!view || !isInTable(view.state)) return;
      const { state } = view;
      const sel = state.selection;
      const $head = sel.$head;

      let tablePos = -1;
      let tableNode: any = null;
      for (let d = $head.depth; d >= 0; d--) {
        if ($head.node(d).type.name === 'table') { tablePos = $head.start(d); tableNode = $head.node(d); break; }
      }
      if (!tableNode) return;

      if (t.label === '+↥') {
        if ($head.node($head.depth - 2)?.type?.name !== 'table_header_row') callCommand('AddRowBefore')(ctx);
      } else if (t.label === '+↧') { callCommand('AddRowAfter')(ctx); }
      else if (t.label === '+⇤') { callCommand('AddColBefore')(ctx); }
      else if (t.label === '+⇥') { callCommand('AddColAfter')(ctx); }
      else if (t.label === '⌫R') {
        const dom = view.domAtPos($head.pos);
        const trEl = (dom.node as HTMLElement).closest?.('tr') as HTMLElement | null;
        if (!trEl || tablePos < 0 || tableNode.childCount <= 1) return;
        if (tableNode.childCount <= 2) {
          callCommand(selectTableCommand.key)(ctx);
          callCommand(deleteSelectedCellsCommand.key)(ctx);
          return;
        }
        const rowIdx = Array.from(trEl.parentElement!.children).indexOf(trEl);
        callCommand(selectRowCommand.key, { pos: tablePos, index: rowIdx })(ctx);
        callCommand(deleteSelectedCellsCommand.key)(ctx);
      } else if (t.label === '⌫C') {
        const dom = view.domAtPos($head.pos);
        const cell = (dom.node as HTMLElement).closest?.('th,td') as HTMLElement | null;
        if (!cell || tablePos < 0 || tableNode.child(0).childCount <= 1) return;
        const colIdx = Array.from(cell.parentElement!.children).indexOf(cell);
        callCommand(selectColCommand.key, { pos: tablePos, index: colIdx })(ctx);
        callCommand(deleteSelectedCellsCommand.key)(ctx);
      } else if (t.label === '⟵' || t.label === '⟺' || t.label === '⟶') {
        const align = t.label === '⟵' ? 'left' : t.label === '⟺' ? 'center' : 'right';
        let cellDepth = -1;
        for (let d = $head.depth; d >= 0; d--) {
          const typeName = $head.node(d).type.name;
          if (typeName === 'table_cell' || typeName === 'table_header') { cellDepth = d; break; }
        }
        if (cellDepth >= 0) {
          const cellPos = $head.before(cellDepth);
          const cellNode = $head.node(cellDepth);
          let tr = state.tr;
          const colIdx = $head.index(cellDepth - 1);
          let hdrPos = tablePos + 1;
          const hdrRow = tableNode.child(0);
          for (let c = 0; c < colIdx; c++) hdrPos += hdrRow.child(c).nodeSize;
          tr.setNodeMarkup(hdrPos, null, { ...hdrRow.child(colIdx).attrs, alignment: align, align });
          tr.setNodeMarkup(cellPos, null, { ...cellNode.attrs, alignment: align, align });
          view.dispatch(tr);
        }
      } else if (t.label === '⛶') {
        callCommand(selectTableCommand.key)(ctx);
        callCommand(deleteSelectedCellsCommand.key)(ctx);
      }
      view.focus();
    });
    syncMd(ed);
  }

  function syncMd(ed: any) {
    const md = colorGetMarkdown(ed) || '';
    lastMdRef.current = md;
    onChange?.(md);
  }

  function toggleMark(editor: any, cmd: any, arg?: any) {
    editor.action((ctx: any) => {
      if (arg !== undefined) callCommand(cmd.key, arg)(ctx);
      else callCommand(cmd.key)(ctx);
    });
  }

  function execBlockCmd(_ed: any, cmd: any, arg?: any) {
    arg !== undefined ? cmd.run(arg) : cmd.run();
  }

  function insertBlock(editor: any, before: string, after: string) {
    editor.action((ctx: any) => {
      const view = ctx.get(editorViewCtx);
      if (!view) return;
      const state = view.state;
      const { from, to } = state.selection;
      const sel = state.doc.textBetween(from, to);
      const tr = state.tr.insertText(before + sel + after, from, to);
      tr.setSelection(TextSelection.create(tr.doc, from + before.length + sel.length + after.length));
      view.dispatch(tr);
      view.focus();
    });
  }

  const handleTool = (t: Tool) => {
    if (!editor || loading) return;
    try {
      if (t.label === '📷' || t.label === '🔗') {
        editor.action((ctx: any) => {
          const v = ctx.get(editorViewCtx);
          if (v) savedSelRef.current = { from: v.state.selection.from, to: v.state.selection.to };
        });
        setPromptState(t.label === '📷' ? { type: 'image', label: '📷 Image URL:' } : { type: 'link', label: '🔗 Link URL:' });
        return;
      } else if (t.label === 'A') { setColorPicker({ type: 'text', label: 'Text Color' }); return; }
      else if (t.label === '█') { setColorPicker({ type: 'bg', label: 'Highlight' }); return; }
      else if (t.label.startsWith('+') || t.label.startsWith('⌫') || t.label === '⛶' || t.label === '⟵' || t.label === '⟺' || t.label === '⟶') {
        execTableCmd(editor, t); return;
      } else if (t.label === '⊞') {
        // Insert table with 1 header + 3 data rows (Milkdown default is 2)
        insertTableCommand.run({ row: 4, col: 3 });
      } else if (t.cmd) { toggleMark(editor, t.cmd, t.cmdArg); }
      else if (t.blockCmd) { execBlockCmd(editor, t.blockCmd, t.blockCmdArg); }
      else { insertBlock(editor, t.insert || '', t.insertAfter || ''); }
      syncMd(editor);
    } catch {}
  };

  const tools = getTools();
  const tableTools = getTableTools();

  return (
    <>
      {!readOnly && (
        <>
          <div className="md-tbar">
            {tools.map((t, i) => (
              <span key={t.label} style={{ display: 'contents' }}>
                {(i === 4 || i === 7 || i === 11 || i === 13 || i === 15) && <span className="md-sep" />}
                <button onMouseDown={e => { e.preventDefault(); handleTool(t); }} title={t.title}
                  style={t.label === 'A' ? { color: '#ef4444', fontWeight: 700 } : t.label === '█' ? { color: '#f59e0b', fontWeight: 700 } : undefined}
                >{t.label}</button>
              </span>
            ))}
          </div>
          <div className="md-hint">{lang === 'zh' ? 'Ctrl+Enter to exit code block' : 'Ctrl+Enter to exit code block'}</div>
          {tableActive && (
            <div className="md-tbar md-tbar-table">
              <span className="md-table-label">TABLE</span>
              {tableTools.map((t, i) => (
                <span key={t.label} style={{ display: 'contents' }}>
                  {(i === 4 || i === 7) && <span className="md-sep" />}
                  <button onMouseDown={e => { e.preventDefault(); handleTool(t); }} title={t.title}>{t.label}</button>
                </span>
              ))}
            </div>
          )}
        </>
      )}
      {/* Link/Image prompt */}
      {promptState && (
        <div className="md-overlay" onClick={() => setPromptState(null)}>
          <div className="md-popup" onClick={e => e.stopPropagation()}>
            <div className="md-popup-title">{promptState.label}</div>
            <input ref={promptInputRef} className="md-popup-input" placeholder="https://"
              onKeyDown={e => { if (e.key === 'Enter') submitPrompt((e.target as HTMLInputElement).value); if (e.key === 'Escape') setPromptState(null); }} autoFocus />
            <div className="md-popup-actions">
              {promptState.type === 'image' && <button className="btn-ghost btn-xs" onClick={pickLocalFile}>📁 Local file</button>}
              <button className="btn-ghost btn-xs" onClick={() => setPromptState(null)}>Cancel</button>
              <button className="btn-brand btn-xs" onClick={() => { if (promptInputRef.current) submitPrompt(promptInputRef.current.value); }}>OK</button>
            </div>
          </div>
        </div>
      )}
      {/* Color picker */}
      {colorPicker && (
        <div className="md-overlay" onClick={() => setColorPicker(null)}>
          <div className="md-popup" onClick={e => e.stopPropagation()}>
            <div className="md-popup-title">{colorPicker.label}</div>
            <div className="md-color-grid">
              {(colorPicker.type === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS).map(c => (
                <button key={c.hex} title={c.label} onClick={() => applyColor(c.hex, colorPicker.type)}
                  className="md-color-btn" style={{ background: c.hex, borderColor: c.hex === '#ffffff' ? 'hsl(var(--edge-default))' : 'transparent' }} />
              ))}
            </div>
            <div className="md-popup-actions">
              <button className="btn-ghost btn-xs" onClick={() => {
                if (!editor) return;
                editor.action((ctx: any) => {
                  const view = ctx.get(editorViewCtx);
                  if (!view) return;
                  const { state } = view;
                  const { from, to } = state.selection;
                  if (from !== to) {
                    const markType = colorPicker.type === 'text' ? state.schema.marks.textColor : state.schema.marks.highlight;
                    view.dispatch(state.tr.removeMark(from, to, markType));
                  }
                  view.focus();
                });
                setColorPicker(null);
                syncMd(editor);
              }}>Reset</button>
              <button className="btn-ghost btn-xs" onClick={() => setColorPicker(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <Milkdown />
    </>
  );
}

// ═══════════════ EXPORT ═══════════════

export function MarkdownEditor({ value, onChange, readOnly, height }: Props) {
  return (
    <div className="md-container" style={{ height: height || '400px', minHeight: '250px' }}>
      <MilkdownProvider>
        <MilkdownInner value={value} onChange={onChange} readOnly={readOnly} />
      </MilkdownProvider>
    </div>
  );
}
