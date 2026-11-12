import { Injectable } from '@angular/core';

export interface ImagePalette {
  /** Most-covered colour in the image, saturation-corrected for use as a wash. */
  dominant: string;
  /** Two supporting colours, distinct in hue from the dominant where possible. */
  accents: [string, string];
  /** Ready-to-use CSS for a banner behind light text. */
  gradient: string;
}

interface Rgb { r: number; g: number; b: number; }

/** Sampling grid. 32×32 is ~1k pixels: plenty for a palette, trivial to scan. */
const SAMPLE = 32;
/** Colour channels are bucketed to this many levels before counting. */
const BUCKETS = 6;

@Injectable({ providedIn: 'root' })
export class ImagePaletteService {
  private cache = new Map<string, ImagePalette | null>();

  /**
   * Derives a colour palette from an image, entirely in the browser.
   *
   * Deliberately hand-rolled rather than pulling in color-thief or
   * node-vibrant: the useful part of those libraries is ~40 lines of bucketing,
   * and avoiding the dependency keeps the bundle down and sidesteps their
   * canvas/worker assumptions.
   *
   * Returns null rather than throwing whenever the palette cannot be read —
   * an unreachable image, or a host that serves no CORS headers, which taints
   * the canvas and makes getImageData a SecurityError. Callers are expected to
   * have a fallback; a profile banner must not depend on this succeeding.
   */
  async extract(url: string | null | undefined): Promise<ImagePalette | null> {
    if (!url) return null;
    if (this.cache.has(url)) return this.cache.get(url)!;

    let palette: ImagePalette | null = null;
    try {
      const image = await this.load(url);
      palette = this.analyse(image);
    } catch {
      palette = null;
    }

    this.cache.set(url, palette);
    return palette;
  }

  /**
   * Loads the image for *reading*, on its own element.
   *
   * Never reuse the element that is actually displayed: `crossOrigin` changes
   * how the request is made, and against a host that returns no
   * Access-Control-Allow-Origin the image fails to load altogether. Keeping
   * this separate means a storage account without CORS costs us the palette,
   * not the user's avatar.
   */
  private load(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      // Google's avatar CDN rejects requests carrying an unexpected Referer.
      image.referrerPolicy = 'no-referrer';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('image could not be loaded for sampling'));
      image.src = url;
    });
  }

  private analyse(image: HTMLImageElement): ImagePalette | null {
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, SAMPLE, SAMPLE);

    // Throws a SecurityError on a tainted canvas — that is the CORS case.
    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);

    // Bucket colours coarsely and count coverage. Exact RGB values almost never
    // repeat in a photograph, so counting them directly finds nothing.
    const counts = new Map<string, { count: number; sum: Rgb }>();

    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 128) continue;

      const { s, l } = this.toHsl(r, g, b);
      // Near-white and near-black dominate most photographs (backgrounds,
      // shadows) without saying anything about their colour.
      if (l < 0.12 || l > 0.93) continue;
      // Greys carry no hue to build a gradient from.
      if (s < 0.12) continue;

      const key = [r, g, b].map(c => Math.round((c / 255) * (BUCKETS - 1))).join(',');
      const bucket = counts.get(key);
      if (bucket) {
        bucket.count++;
        bucket.sum.r += r; bucket.sum.g += g; bucket.sum.b += b;
      } else {
        counts.set(key, { count: 1, sum: { r, g, b } });
      }
    }

    if (!counts.size) return null;

    // Average each bucket back to a real colour, most-covered first.
    const ranked = [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .map(({ count, sum }) => ({
        count,
        rgb: {
          r: Math.round(sum.r / count),
          g: Math.round(sum.g / count),
          b: Math.round(sum.b / count)
        }
      }));

    const dominant = ranked[0].rgb;
    const accents = this.pickAccents(ranked, dominant);

    // The banner sits behind white text, so every stop is darkened to a
    // predictable lightness rather than used raw — otherwise a pale photo
    // produces a banner the name cannot be read against.
    const stops = [dominant, accents[0], accents[1]].map((c, i) =>
      this.shift(c, { l: 0.24 - i * 0.05, s: 0.45 }));

    return {
      dominant: this.toHex(dominant),
      accents: [this.toHex(accents[0]), this.toHex(accents[1])],
      gradient:
        `linear-gradient(120deg, ${stops[0]} 0%, ${stops[1]} 55%, ${stops[2]} 100%)`
    };
  }

  /** Prefers colours that differ in hue from the dominant, so the gradient moves. */
  private pickAccents(ranked: { rgb: Rgb }[], dominant: Rgb): [Rgb, Rgb] {
    const dominantHue = this.toHsl(dominant.r, dominant.g, dominant.b).h;
    const distinct = ranked
      .slice(1)
      .map(entry => ({
        rgb: entry.rgb,
        distance: this.hueDistance(this.toHsl(entry.rgb.r, entry.rgb.g, entry.rgb.b).h, dominantHue)
      }))
      .sort((a, b) => b.distance - a.distance);

    // A single-colour image is legitimate — fall back to shifting the dominant.
    const first = distinct[0]?.rgb ?? this.rotate(dominant, 30);
    const second = distinct[1]?.rgb ?? this.rotate(dominant, 60);
    return [first, second];
  }

  private hueDistance(a: number, b: number): number {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
  }

  private rotate(c: Rgb, degrees: number): Rgb {
    const { h, s, l } = this.toHsl(c.r, c.g, c.b);
    return this.fromHsl((h + degrees) % 360, s, l);
  }

  /** Rebuilds a colour at a target lightness, with saturation floored. */
  private shift(c: Rgb, target: { l: number; s: number }): string {
    const { h, s } = this.toHsl(c.r, c.g, c.b);
    return this.toHex(this.fromHsl(h, Math.max(s, target.s), target.l));
  }

  private toHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const delta = max - min;

    if (delta === 0) return { h: 0, s: 0, l };

    const s = delta / (1 - Math.abs(2 * l - 1));
    let h: number;
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;

    return { h: (h * 60 + 360) % 360, s, l };
  }

  private fromHsl(h: number, s: number, l: number): Rgb {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    const [r, g, b] =
      h < 60 ? [c, x, 0] :
      h < 120 ? [x, c, 0] :
      h < 180 ? [0, c, x] :
      h < 240 ? [0, x, c] :
      h < 300 ? [x, 0, c] : [c, 0, x];

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  private toHex({ r, g, b }: Rgb): string {
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  }
}
