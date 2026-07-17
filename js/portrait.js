// portrait.js — turn a photo into a pointillist portrait cloud.
//
// Quality strategy (v2):
//  • density  — weighted sampling favors dark regions AND edges (Sobel), so
//    glasses rims, hair outline, and shirt folds get the most points;
//  • brightness — each point carries the photo's luminance (`lums`), which the
//    shader maps to point brightness + size → the cloud reads like a photo;
//  • relief — darker features sit slightly forward in z, so mouse parallax
//    gives the face gentle 3D volume.
// Falls back to a shaded parametric silhouette if the image can't be read.

const SAMPLE_MAX = 400; // longest edge of the analysis bitmap

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed: " + url));
    img.src = url;
  });
}

/**
 * @returns {Promise<{positions: Float32Array, lums: Float32Array, ok: boolean}>}
 *  positions: count*3, centered, ~3.2 units tall. lums: count, 0..1 photo luminance.
 */
export async function sampleFacePoints(url, count) {
  try {
    const img = await loadImage(url);
    const scale = SAMPLE_MAX / Math.max(img.width, img.height);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data; // throws if tainted

    // pass 1: luminance grid + subject mask
    const lumGrid = new Float32Array(w * h).fill(1); // bg = white
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const p = i * 4;
      const a = data[p + 3] / 255;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (a < 0.12) continue;                          // transparent bg
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      if (l > 0.9 && sat < 0.12) continue;             // near-white bg
      mask[i] = 1;
      lumGrid[i] = l;
    }

    // pass 2: Sobel edge magnitude on the luminance grid
    const edge = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx =
          -lumGrid[i - w - 1] - 2 * lumGrid[i - 1] - lumGrid[i + w - 1]
          + lumGrid[i - w + 1] + 2 * lumGrid[i + 1] + lumGrid[i + w + 1];
        const gy =
          -lumGrid[i - w - 1] - 2 * lumGrid[i - w] - lumGrid[i - w + 1]
          + lumGrid[i + w - 1] + 2 * lumGrid[i + w] + lumGrid[i + w + 1];
        edge[i] = Math.min(Math.hypot(gx, gy), 2.0);
      }
    }

    // subject bounding box first (needed to locate the face band)
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }

    // pass 3: weighted candidates. The face lives in the top of the subject —
    // bias sampling toward it so a dark shirt can't hog the points, and let
    // edges (glasses, hairline, features) carve the detail.
    const faceCut = minY + (maxY - minY) * 0.45;
    const cands = [];
    const cumul = [];
    let total = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        const l = lumGrid[i];
        let wgt = 0.14 + 0.5 * (1 - l) + 2.5 * edge[i];
        wgt *= y < faceCut ? 2.1 : 0.8;
        cands.push(i);
        total += wgt;
        cumul.push(total);
      }
    }
    if (cands.length < 60) throw new Error("too few subject pixels");

    const TARGET_H = 3.7;
    const bh = maxY - minY || 1;
    const unit = TARGET_H / bh;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    const positions = new Float32Array(count * 3);
    const lums = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = Math.random() * total;
      let lo = 0, hi = cumul.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cumul[mid] < r) lo = mid + 1; else hi = mid;
      }
      const idx = cands[lo];
      const px = idx % w, py = (idx / w) | 0;
      const l = lumGrid[idx];
      const o = i * 3;
      positions[o]     = (px + (Math.random() - 0.5) - cx) * unit;
      positions[o + 1] = -(py + (Math.random() - 0.5) - cy) * unit;
      // relief: dark features (glasses, hair, brows) sit slightly forward
      positions[o + 2] = (0.5 - l) * 0.34 + (Math.random() - 0.5) * 0.10;
      // gamma deepens midtones so sunlit faces keep their modeling
      lums[i] = Math.pow(l, 1.45);
    }
    return { positions, lums, ok: true };
  } catch (err) {
    console.warn("[portrait] falling back to silhouette:", err.message);
    return silhouette(count);
  }
}

// Descriptive parametric portrait so the finale reads as a person even
// before the real photo lands: hair, round glasses, brows, eyes, nose,
// smile, neck, collar, shirt folds, and rim-lit edges.
function silhouette(count) {
  const positions = new Float32Array(count * 3);
  const lums = new Float32Array(count);
  const TAU = Math.PI * 2;
  const R = (a, b) => a + Math.random() * (b - a);
  // head ellipse: center (0, 0.60), rx 0.60, ry 0.80
  const HX = 0.60, HY = 0.80, HCY = 0.60;

  // each region: [weight, sampler -> [x, y, z, lum]]
  const regions = [
    [0.17, () => {                                     // hair cap + sides
      for (;;) {
        const a = Math.random() * TAU, r = Math.sqrt(Math.random());
        const x = Math.cos(a) * HX * 1.05 * r, dy = Math.sin(a) * HY * 1.05 * r;
        if (dy > 0.34 * HY || (Math.abs(x) > 0.74 * HX && dy > -0.1))
          return [x, HCY + dy, R(-0.04, 0.10), R(0.16, 0.34)];
      }
    }],
    [0.17, () => {                                     // face fill, lit from the left
      for (;;) {
        const a = Math.random() * TAU, r = Math.sqrt(Math.random());
        const x = Math.cos(a) * HX * 0.94 * r, dy = Math.sin(a) * HY * 0.94 * r;
        if (dy <= 0.34 * HY)
          return [x, HCY + dy, R(-0.05, 0.05), 0.52 - x * 0.28 + R(-0.06, 0.10)];
      }
    }],
    [0.10, () => {                                     // round glasses rims (bright!)
      const side = Math.random() < 0.5 ? -1 : 1;
      const a = Math.random() * TAU;
      const rr = 0.185 + R(-0.018, 0.018);
      return [side * 0.26 + Math.cos(a) * rr, 0.52 + Math.sin(a) * rr * 0.95,
              0.14, R(0.82, 1.0)];
    }],
    [0.02, () => {                                     // bridge + temple arms
      if (Math.random() < 0.5) return [R(-0.075, 0.075), 0.545 + R(-0.012, 0.012), 0.14, 0.9];
      const side = Math.random() < 0.5 ? -1 : 1;
      const t = Math.random();
      return [side * (0.445 + t * 0.14), 0.545 + t * 0.02, 0.10, 0.85];
    }],
    [0.03, () => {                                     // eyebrows
      const side = Math.random() < 0.5 ? -1 : 1;
      const t = R(-1, 1);
      return [side * 0.26 + t * 0.14, 0.745 - t * t * 0.05, 0.09, R(0.28, 0.4)];
    }],
    [0.02, () => {                                     // eyes behind the lenses
      const side = Math.random() < 0.5 ? -1 : 1;
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 0.05;
      return [side * 0.26 + Math.cos(a) * r, 0.51 + Math.sin(a) * r, 0.08, R(0.2, 0.34)];
    }],
    [0.015, () => {                                    // nose line + base
      const t = Math.random();
      return [R(-0.02, 0.02) + t * 0.015, 0.48 - t * 0.22, 0.10, R(0.4, 0.55)];
    }],
    [0.02, () => {                                     // smile
      const t = R(-1, 1);
      return [t * 0.17, 0.175 + (1 - t * t) * 0.035 + R(-0.012, 0.012), 0.09, R(0.55, 0.7)];
    }],
    [0.04, () => {                                     // neck (jaw shadow at top)
      const y = R(-0.14, 0.20);
      return [R(-0.17, 0.17), y, R(-0.04, 0.04), y > 0.06 ? R(0.2, 0.34) : R(0.36, 0.5)];
    }],
    [0.31, () => {                                     // shoulders + shirt folds
      for (;;) {
        const x = R(-1.2, 1.2), y = R(-1.05, -0.05);
        const half = 0.34 + (-y - 0.05) * 0.95;        // widening trapezoid
        if (Math.abs(x) > half) continue;
        if (Math.abs(x) < 0.16 && y > -0.32) continue; // collar V notch
        const fold = Math.sin(x * 9.0) * 0.10;
        return [x, y, R(-0.07, 0.07), 0.40 - x * 0.16 + fold + R(-0.05, 0.08)];
      }
    }],
    [0.045, () => {                                    // rim light on head edge
      const a = Math.random() * TAU;
      return [Math.cos(a) * HX * 1.06, HCY + Math.sin(a) * HY * 1.06, R(0, 0.08), R(0.7, 0.95)];
    }],
    [0.02, () => {                                     // shoulder top edge
      const x = R(-1.15, 1.15);
      return [x, -0.05 - Math.abs(x) * 0.28 + R(-0.02, 0.02), 0.05, R(0.6, 0.85)];
    }],
  ];

  // normalize weights → cumulative
  const totalW = regions.reduce((s, r) => s + r[0], 0);
  let acc = 0;
  const cum = regions.map(([w]) => (acc += w / totalW));

  // content spans y ∈ [-1.05, 1.45] → scale to ~3.45 world units tall
  const S = 3.45 / 2.5, CY = 0.2;
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    let k = 0;
    while (cum[k] < r) k++;
    const [x, y, z, l] = regions[k][1]();
    const o = i * 3;
    positions[o]     = x * S + R(-0.008, 0.008);
    positions[o + 1] = (y - CY) * S + R(-0.008, 0.008);
    positions[o + 2] = z + R(-0.03, 0.03);
    lums[i] = Math.max(0.1, Math.min(1, l));
  }
  return { positions, lums, ok: false };
}
