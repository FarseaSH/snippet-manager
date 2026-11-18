import { Annotation, ChangeSet, Compartment, EditorState, Transaction, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, redo } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, foldService, HighlightStyle, indentOnInput, indentUnit, LanguageDescription, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { search, searchKeymap } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { indentationMarkers } from '@replit/codemirror-indentation-markers';

const externalChange = Annotation.define<boolean>();
const configurations = new WeakMap<EditorView, { language: Compartment; readonly: Compartment; revision: number }>();
const aliases: Record<string, string> = {
  py: 'python', python3: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', tsx: 'tsx', shell: 'shell', sh: 'shell', bash: 'shell', shellscript: 'shell', zsh: 'shell',
  cpp: 'c++', cxx: 'c++', cc: 'c++', golang: 'go', rs: 'rust', rb: 'ruby', yml: 'yaml', md: 'markdown',
  html5: 'html', htm: 'html', css3: 'css', docker: 'dockerfile', gql: 'graphql', postgres: 'postgresql', pgsql: 'postgresql',
  text: 'plain text', plaintext: 'plain text',
};

export function editorLanguage(language: string) {
  const key = language.trim().toLowerCase();
  return Object.hasOwn(aliases, key) ? aliases[key] : key;
}

// Stream modes have no syntax-tree folding. Supply indentation folding for them and plain text.
const indentationFolding = foldService.of((state, _start, end) => {
  const first = state.doc.lineAt(end);
  if (!first.text.trim()) return null;
  const indentation = (text: string) => {
    let column = 0;
    for (const char of text) {
      if (char === ' ') column++;
      else if (char === '\t') column += state.tabSize - column % state.tabSize;
      else break;
    }
    return column;
  };
  const base = indentation(first.text);
  let to = end;
  for (let number = first.number + 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number);
    if (!line.text.trim()) continue;
    if (indentation(line.text) <= base) break;
    to = line.to;
  }
  return to > end ? { from: end, to } : null;
});

// Follow the document's indentation so two-space snippets get guides at each level too.
const documentIndentation = indentUnit.compute(['doc'], state => {
  let spaces = 0;
  for (let number = 1; number <= Math.min(state.doc.lines, 200); number++) {
    const text = state.doc.line(number).text;
    if (!text.trim()) continue;
    const leading = /^\s*/.exec(text)![0];
    if (leading.includes('\t')) return '\t';
    if (leading.length && leading.length <= 8) spaces = spaces ? Math.min(spaces, leading.length) : leading.length;
  }
  return ' '.repeat(spaces || 4);
});

const tomorrow = [
  EditorView.theme({
    '&': { height: '100%', backgroundColor: '#fff', color: '#4d4d4c', fontSize: '13px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--font-code)', lineHeight: '22px', overflow: 'auto', fontVariantLigatures: 'none' },
    '.cm-content': { padding: '16px 0', caretColor: '#4d4d4c', '--cm-token-color': '#4d4d4c' },
    '.cm-line': { padding: '0 16px 0 2px' },
    // The marker plugin adds half a character to every guide's background position.
    // Cancel that offset so guides start at the left edge of each indent column.
    '.cm-indent-markers::before': { zIndex: '0', left: 'calc(2px - 0.5ch)' },
    '&:not(.cm-focused)': { '--indent-marker-active-bg-color': 'var(--indent-marker-bg-color)' },
    '.cm-gutters': { backgroundColor: '#fff', color: '#8e908c', border: 'none' },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '3ch', padding: '0 8px 0 4px' },
    '.cm-foldGutter .cm-gutterElement': { padding: '0 3px', cursor: 'pointer' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
    '&.cm-focused[data-has-selection="false"] .cm-activeLine': { backgroundColor: '#f8f8f8' },
    '&.cm-focused[data-has-selection="false"] .cm-activeLineGutter': { color: '#4d4d4c' },
    '.cm-selectionLayer .cm-selectionBackground': { backgroundColor: '#ececec' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': { backgroundColor: '#fbe8de' },
    '.cm-content::selection, .cm-content ::selection': { backgroundColor: 'transparent', color: 'var(--cm-token-color)' },
    '.cm-matchingBracket': { backgroundColor: '#efefef', outline: '1px solid #d1d1d1' },
    '.cm-foldPlaceholder': { backgroundColor: '#f3f4f4', color: '#71717a', border: '1px solid #d1d1d1', borderRadius: '3px', padding: '0 4px' },
    '.cm-panels': { backgroundColor: '#f8f8f9', color: '#4d4d4c' },
    '.cm-search': { fontFamily: 'var(--font-ui)', fontSize: '12px' },
    '.cm-textfield': { backgroundColor: '#fff', color: '#4d4d4c', border: '1px solid #6f7987', borderRadius: '3px' },
    '.cm-button': { backgroundImage: 'none', backgroundColor: '#fff', color: '#4d4d4c', border: '1px solid #d1d1d1', borderRadius: '3px' },
    '.cm-searchMatch': { backgroundColor: '#fff3bf' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#ffd8a8' },
  }),
  syntaxHighlighting(HighlightStyle.define([
    { tag: tags.comment, color: '#8e908c' },
    { tag: [tags.keyword, tags.modifier], color: '#8959a8' },
    { tag: [tags.operator, tags.operatorKeyword], color: '#3e999f' },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: '#f5871f' },
    { tag: [tags.string, tags.regexp], color: '#718c00' },
    { tag: [tags.typeName, tags.className], color: '#c99e00' },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#4271ae' },
    { tag: [tags.tagName, tags.attributeName], color: '#c82829' },
    { tag: tags.heading, color: '#4271ae', fontWeight: 'bold' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strong, fontWeight: 'bold' },
    { tag: tags.link, color: '#3e999f', textDecoration: 'underline' },
  ].map(style => ({ ...style, ...('color' in style ? { '--cm-token-color': style.color } : {}) })))),
];

export function createEditor(parent: HTMLElement, code: string, editable: boolean, onChange: (code: string) => void) {
  const language = new Compartment();
  const readonly = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: code.replace(/\r\n?/g, '\n'),
      extensions: [
        tomorrow, lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(),
        history(), indentOnInput(), documentIndentation, EditorState.tabSize.of(4), bracketMatching(),
        EditorState.allowMultipleSelections.of(true),
        foldGutter({ markerDOM(open) {
          const marker = document.createElement('span');
          marker.className = 'editor-fold-toggle';
          marker.dataset.fold = open ? 'open' : 'closed';
          marker.setAttribute('role', 'button');
          marker.setAttribute('aria-label', open ? '折叠代码' : '展开折叠代码');
          marker.setAttribute('aria-expanded', String(open));
          // CSS draws the chevron, avoiding icon fonts and their loading races.
          return marker;
        } }),
        indentationMarkers({ highlightActiveBlock: true, hideFirstIndent: false, thickness: 1, activeThickness: 1, colors: { light: '#e8e8e8', activeLight: '#999999' } }),
        search({ top: true }), keymap.of([{ key: 'Mod-Shift-z', run: redo, preventDefault: true }, ...searchKeymap, ...foldKeymap, ...defaultKeymap, ...historyKeymap]),
        readonly.of(EditorState.readOnly.of(!editable)), language.of(indentationFolding),
        EditorView.editorAttributes.of(view => ({ 'data-has-selection': String(view.state.selection.ranges.some(range => !range.empty)) })),
        EditorView.contentAttributes.of({ role: 'textbox', 'aria-multiline': 'true', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !update.transactions.every(transaction => transaction.annotation(externalChange))) onChange(update.state.doc.toString());
        }),
      ],
    }),
  });
  configurations.set(view, { language, readonly, revision: 0 });
  return view;
}

export async function setLanguage(view: EditorView, language: string) {
  const config = configurations.get(view);
  if (!config) return;
  const revision = ++config.revision;
  const description = LanguageDescription.matchLanguageName(languages, editorLanguage(language), false);
  const support = description ? await description.load() : undefined;
  if (!configurations.has(view) || config.revision !== revision) return;
  const extensions: Extension[] = support ? [support] : [];
  if (!support || support.language instanceof StreamLanguage) extensions.push(indentationFolding);
  view.dispatch({ effects: config.language.reconfigure(extensions) });
}

export function setEditable(view: EditorView, editable: boolean) {
  if (view.state.readOnly !== !editable) view.dispatch({ effects: configurations.get(view)!.readonly.reconfigure(EditorState.readOnly.of(!editable)) });
}

export function destroyEditor(view: EditorView) {
  configurations.delete(view);
  view.destroy();
}

function changedRange(current: string, next: string) {
  if (current === next) return undefined;
  let start = 0, end = 0;
  while (start < current.length && start < next.length && current[start] === next[start]) start++;
  while (end < current.length - start && end < next.length - start && current[current.length - end - 1] === next[next.length - end - 1]) end++;
  return { from: start, to: current.length - end, insert: next.slice(start, next.length - end) };
}

export function replaceCode(view: EditorView, code: string) {
  const changes = changedRange(view.state.doc.toString(), code.replace(/\r\n?/g, '\n'));
  if (!changes) return;
  view.dispatch({
    changes,
    annotations: [externalChange.of(true), Transaction.addToHistory.of(false)],
    effects: view.scrollSnapshot(),
  });
}

export function saveViewState(view: EditorView) {
  const snapshot = view.scrollSnapshot();
  const selection = view.state.selection;
  const doc = view.state.doc;
  return () => {
    if (!configurations.has(view)) return;
    const change = doc === view.state.doc ? undefined : changedRange(doc.toString(), view.state.doc.toString());
    const changes = change ? ChangeSet.of(change, doc.length) : undefined;
    view.dispatch({ selection: changes ? selection.map(changes) : selection, effects: changes ? snapshot.map(changes) : snapshot });
    view.requestMeasure();
  };
}
