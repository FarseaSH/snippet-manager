import { EditorSelection } from '@codemirror/state';
import { EditorView, layer, RectangleMarker, type LayerMarker, type ViewUpdate } from '@codemirror/view';

const backgroundClass = 'cm-characterSelectionBackground';

// Layers keep these hints out of the document, accessibility tree and clipboard.
class WhitespaceMarker extends RectangleMarker {
  constructor(rect: RectangleMarker, readonly symbol: string) {
    super('cm-selectedWhitespace', rect.left, rect.top, rect.width, rect.height);
  }

  eq(other: RectangleMarker) {
    return other instanceof WhitespaceMarker && other.symbol === this.symbol && super.eq(other);
  }

  draw() {
    const dom = super.draw();
    dom.textContent = this.symbol;
    return dom;
  }

  update(dom: HTMLElement, previous: RectangleMarker) {
    if (!(previous instanceof WhitespaceMarker)) return false;
    super.update(dom, previous);
    dom.textContent = this.symbol;
    return true;
  }
}

function selectionMarkers(view: EditorView, whitespace: boolean): LayerMarker[] {
  if (!view.inView) return [];
  const markers: LayerMarker[] = [];
  const { doc, selection } = view.state;

  // Work only on rendered ranges, including horizontal gaps in very long lines.
  // Splitting selections into closed, single-line ranges prevents CodeMirror
  // from extending the background through the unused remainder of a line.
  for (const selected of selection.ranges) {
    if (selected.empty) continue;
    for (const visible of view.visibleRanges) {
      const from = Math.max(selected.from, visible.from);
      const to = Math.min(selected.to, visible.to);
      if (from >= to) continue;
      for (let pos = from; pos < to;) {
        const line = doc.lineAt(pos);
        const end = Math.min(line.to, to);
        if (pos < end) {
          if (whitespace) {
            const text = doc.sliceString(pos, end);
            for (const match of text.matchAll(/[ \t]/g)) {
              const start = pos + match.index;
              for (const rect of RectangleMarker.forRange(view, '', EditorSelection.range(start, start + 1))) {
                markers.push(new WhitespaceMarker(rect, match[0] === '\t' ? '⇥' : '·'));
              }
            }
          } else {
            for (let start = pos; start < end;) {
              const boundary = view.lineWrapping ? view.moveToLineBoundary(EditorSelection.cursor(start, 1), true, true).head : end;
              const stop = Math.min(end, boundary > start ? boundary : end);
              markers.push(...RectangleMarker.forRange(view, backgroundClass, EditorSelection.range(start, stop)));
              start = stop;
            }
          }
        }
        // A newline has no glyph box of its own. Give only a selected, visible
        // newline one character of space; never invent one at EOF or in a fold.
        if (line.to < to && view.lineBlockAt(line.to).to === line.to) {
          for (const cursor of RectangleMarker.forRange(view, '', EditorSelection.cursor(line.to, -1))) {
            const rect = new RectangleMarker(backgroundClass, cursor.left, cursor.top, view.defaultCharacterWidth, cursor.height);
            markers.push(whitespace ? new WhitespaceMarker(rect, '↵') : rect);
          }
        }
        pos = line.to + 1;
      }
    }
  }
  return markers;
}

const selectionChanged = (update: ViewUpdate) => update.selectionSet || update.docChanged || update.viewportChanged || update.geometryChanged;

export const characterSelection = [
  layer({
    above: false,
    class: 'cm-characterSelectionLayer',
    update: selectionChanged,
    markers: view => selectionMarkers(view, false),
  }),
  layer({
    above: true,
    class: 'cm-selectedWhitespaceLayer',
    update: selectionChanged,
    markers: view => selectionMarkers(view, true),
  }),
  EditorView.theme({
    // Keep drawSelection's cursors and native-selection suppression intact.
    '.cm-selectionLayer .cm-selectionBackground': { display: 'none' },
    '.cm-characterSelectionBackground': { backgroundColor: 'var(--code-selection-inactive)' },
    '&.cm-focused .cm-characterSelectionBackground': { backgroundColor: 'var(--code-selection-active)' },
    '.cm-selectedWhitespace': {
      fontFamily: 'var(--font-code)', fontSize: 'inherit', lineHeight: 'normal',
      color: 'var(--code-whitespace-color)', opacity: '0.6', textAlign: 'center', whiteSpace: 'pre',
      overflow: 'hidden',
    },
  }),
];
