import { tCount } from '../../core/i18n/i18n';
import {
  BoardContent, Box, Stroke, anchorBoxes, connectorLine, contentBox, noteBox, strokeBox, textBox, union
} from './whiteboard.model';

/** The colours of the current theme, already resolved to values a canvas understands. */
export interface ExportColors {
  background: string;
  frameLine: string;
  frameLabel: string;
  connector: string;
  labelBack: string;
  labelText: string;
  noteInk: string;
  noteShadow: string;
  /** A sticky's paper, from its saved colour. */
  paper(color: string): string;
  /** Ink, shapes and handwriting, from the saved colour. */
  ink(color: string): string;
}

const MARGIN = 40;
/** Upper bound for the picture, in pixels (about 4000 x 3000). */
const MAX_PIXELS = 12_000_000;

const FONT_UI = "'Inter', system-ui, sans-serif";
const FONT_SERIF = "'Instrument Serif', serif";
const FONT_HAND = "'Caveat', cursive";

/**
 * The direction a text reads in, as `dir="auto"` decides it on the page: that of its
 * first letter. Arabic and Hebrew letters read right to left.
 */
function readsRightToLeft(text: string): boolean {
  const first = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/.exec(text)?.[0];
  return !!first && /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/.test(first);
}

/**
 * Draws a line of text in a box of the given width, starting at the edge its own
 * direction starts from: the left for "Notes", the right for "ملاحظات". `x` is the
 * box's left edge. The picture itself never mirrors, whatever the page's direction.
 */
function fillLine(ctx: CanvasRenderingContext2D, line: string, x: number, y: number, width: number, rtl: boolean): void {
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  ctx.fillText(line, rtl ? x + width : x, y);
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
}

function roundedRect(ctx: CanvasRenderingContext2D, box: Box, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, radius);
}

/** Breaks a text into lines no wider than `width`, keeping the writer's own line breaks. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Runs `draw` turned by `degrees` around the middle of `box`. */
function turned(ctx: CanvasRenderingContext2D, box: Box, degrees: number | undefined, draw: () => void): void {
  ctx.save();
  ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
  ctx.rotate(((degrees ?? 0) * Math.PI) / 180);
  ctx.translate(-box.w / 2, -box.h / 2);
  draw();
  ctx.restore();
}

/**
 * The whole board as a picture, for "Download as PNG". Null when there is nothing on it.
 * `paintStroke` draws one stroke of ink: the page already knows how (pen and eraser).
 */
export function renderBoard(
  content: BoardContent,
  colors: ExportColors,
  paintStroke: (ctx: CanvasRenderingContext2D, stroke: Stroke) => void
): HTMLCanvasElement | null {
  // Erased strokes still count for the size, so nothing shifts between the page and the picture.
  const area = union([contentBox(content), ...content.strokes.map(strokeBox)].filter((box): box is Box => !!box));
  if (!area) return null;

  const width = area.w + MARGIN * 2;
  const height = area.h + MARGIN * 2;
  const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (width * height)));

  const layer = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(scale, 0, 0, scale, (MARGIN - area.x) * scale, (MARGIN - area.y) * scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // A canvas takes the page's direction, which would start every text from the right in Arabic.
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    return { canvas, ctx };
  };

  const { canvas, ctx } = layer();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  for (const frame of content.frames) {
    roundedRect(ctx, frame, 14);
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.frameLine;
    ctx.stroke();
    ctx.fillStyle = colors.frameLabel;
    ctx.font = `20px ${FONT_SERIF}`;
    ctx.textBaseline = 'top';
    fillLine(ctx, frame.label, frame.x, frame.y - 28, ctx.measureText(frame.label).width, readsRightToLeft(frame.label));
  }

  for (const shape of content.shapes) {
    const color = colors.ink(shape.color);
    ctx.beginPath();
    if (shape.kind === 'ellipse') {
      ctx.ellipse(shape.x + shape.w / 2, shape.y + shape.h / 2, shape.w / 2, shape.h / 2, 0, 0, Math.PI * 2);
    } else if (shape.kind === 'diamond') {
      ctx.moveTo(shape.x + shape.w / 2, shape.y);
      ctx.lineTo(shape.x + shape.w, shape.y + shape.h / 2);
      ctx.lineTo(shape.x + shape.w / 2, shape.y + shape.h);
      ctx.lineTo(shape.x, shape.y + shape.h / 2);
      ctx.closePath();
    } else {
      ctx.roundRect(shape.x, shape.y, shape.w, shape.h, 8);
    }
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.12;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  // Ink is painted on a layer of its own: the eraser rubs out ink, not what is under it.
  const ink = layer();
  for (const stroke of content.strokes) paintStroke(ink.ctx, stroke);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(ink.canvas, 0, 0);
  ctx.restore();

  const boxes = anchorBoxes(content);
  for (const connector of content.connectors) {
    const line = connectorLine(connector, boxes);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = colors.connector;
    ctx.setLineDash([5, 5]);
    ctx.stroke(new Path2D(line.d));
    ctx.setLineDash([]);
    ctx.stroke(new Path2D(line.arrow));

    if (connector.label) {
      ctx.font = `600 11.5px ${FONT_UI}`;
      const labelWidth = ctx.measureText(connector.label).width + 16;
      const chip = { x: line.mid.x - labelWidth / 2, y: line.mid.y, w: labelWidth, h: 20 };
      roundedRect(ctx, chip, 6);
      ctx.fillStyle = colors.labelBack;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.frameLine;
      ctx.stroke();
      ctx.fillStyle = colors.labelText;
      ctx.textBaseline = 'middle';
      fillLine(ctx, connector.label, chip.x + 8, chip.y + 10.5, labelWidth - 16, readsRightToLeft(connector.label));
    }
  }

  for (const text of content.texts) {
    const box = textBox(text);
    turned(ctx, box, text.rot, () => {
      ctx.font = `600 24px ${FONT_HAND}`;
      ctx.fillStyle = colors.ink(text.color);
      ctx.textBaseline = 'top';
      const rtl = readsRightToLeft(text.text);
      text.text.split('\n').forEach((line, index) => fillLine(ctx, line, 0, index * 30 + 2, box.w, rtl));
    });
  }

  for (const note of content.notes) {
    const box = noteBox(note);
    turned(ctx, box, note.rot, () => {
      ctx.save();
      ctx.shadowColor = colors.noteShadow;
      ctx.shadowBlur = 22 * scale;
      ctx.shadowOffsetY = 10 * scale;
      ctx.fillStyle = colors.paper(note.color);
      roundedRect(ctx, { x: 0, y: 0, w: box.w, h: box.h }, 4);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = colors.noteInk;
      ctx.textBaseline = 'top';
      ctx.font = `600 14px ${FONT_UI}`;
      const room = Math.max(1, Math.floor((box.h - 44) / 18.2));
      const rtl = readsRightToLeft(note.text);
      wrap(ctx, note.text, box.w - 24).slice(0, room)
        .forEach((line, index) => fillLine(ctx, line, 12, 13 + index * 18.2, box.w - 24, rtl));

      ctx.textBaseline = 'alphabetic';
      if (note.votes) {
        const votes = tCount(note.votes, '{n} vote', '{n} votes');
        ctx.font = `700 11px ${FONT_UI}`;
        roundedRect(ctx, { x: 12, y: box.h - 26, w: ctx.measureText(votes).width + 14, h: 17 }, 8.5);
        ctx.globalAlpha = 0.1;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillText(votes, 19, box.h - 13);
      }
      if (note.by) {
        ctx.font = `600 10.5px ${FONT_UI}`;
        ctx.globalAlpha = 0.78;
        ctx.fillText(note.by, box.w - 12 - ctx.measureText(note.by).width, box.h - 13);
        ctx.globalAlpha = 1;
      }
    });
  }

  return canvas;
}
