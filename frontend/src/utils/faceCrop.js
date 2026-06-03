const MAX_OUTPUT = 600;
const FACE_PADDING = 2.4;
const JPEG_QUALITY = 0.9;

let _modelPromise = null;

async function loadFaceModel() {
  if (!_modelPromise) {
    _modelPromise = (async () => {
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();
      const blazeface = await import('@tensorflow-models/blazeface');
      return blazeface.load();
    })().catch((err) => {
      _modelPromise = null;
      throw err;
    });
  }
  return _modelPromise;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Imaginea nu a putut fi citită'));
    img.src = src;
  });
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

async function faceSquare(img) {
  let model;
  try {
    model = await loadFaceModel();
  } catch {
    return null;
  }

  let predictions = [];
  try {
    predictions = await model.estimateFaces(img, false);
  } catch {
    return null;
  }
  if (!predictions || !predictions.length) return null;

  let best = null, bestArea = -1;
  for (const p of predictions) {
    const [x1, y1] = p.topLeft;
    const [x2, y2] = p.bottomRight;
    const area = (x2 - x1) * (y2 - y1);
    if (area > bestArea) { bestArea = area; best = p; }
  }

  const W = img.naturalWidth, H = img.naturalHeight;
  const [fx1, fy1] = best.topLeft;
  const [fx2, fy2] = best.bottomRight;
  const faceW = fx2 - fx1, faceH = fy2 - fy1;
  const faceCx = fx1 + faceW / 2;
  const faceCy = fy1 + faceH / 2;

  let side = Math.max(faceW, faceH) * FACE_PADDING;
  side = clamp(side, Math.min(W, H) * 0.4, Math.min(W, H));

  const cx = faceCx;
  const cy = faceCy - faceH * 0.1;

  const x = clamp(cx - side / 2, 0, W - side);
  const y = clamp(cy - side / 2, 0, H - side);
  return { x, y, side };
}

function heuristicSquare(img) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const side = Math.min(W, H);
  const x = (W - side) / 2;
  const y = (H - side) * 0.2;
  return { x, y, side };
}

function canvasToFile(canvas, baseName) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(null); return; }
      resolve(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', JPEG_QUALITY);
  });
}

export async function cropToFace(file) {
  if (!file || !file.type?.startsWith('image/')) return file;

  let url;
  try {
    url = URL.createObjectURL(file);
    const img = await loadImageElement(url);
    if (!img.naturalWidth || !img.naturalHeight) return file;

    const rect = (await faceSquare(img)) || heuristicSquare(img);
    const out = Math.round(Math.min(rect.side, MAX_OUTPUT));
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, rect.x, rect.y, rect.side, rect.side, 0, 0, out, out);

    const cropped = await canvasToFile(canvas, `face-${Date.now()}`);
    return cropped || file;
  } catch {
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

export function warmUpFaceModel() {
  loadFaceModel().catch(() => {});
}
