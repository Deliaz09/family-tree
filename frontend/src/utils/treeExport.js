const SVGNS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';

const CSS_STYLES = `<style>
    text { font-family: Arial, Helvetica, sans-serif; }
    .node-name    { font-size: 14px; font-weight: 600; fill: #2d2438; }
    .avatar-text  { font-size: 30px; font-weight: 700; fill: #fff; }
    .deceased-mark{ font-size: 13px; fill: #e05c5c; }
    .node-bg      { fill: #f8f6ff; stroke: #c8b8e8; stroke-width: 1; }
    .male   .node-bg { fill: #e8f0fc; stroke: #378add; }
    .female .node-bg { fill: #fce8f0; stroke: #d4537e; }
    .avatar-square        { fill: #7c6b9e; }
    .male   .avatar-square { fill: #378add; }
    .female .avatar-square { fill: #d4537e; }
    .photo-border { fill: none; stroke-width: 2.5; stroke: #c8b8e8; }
    .male   .photo-border { stroke: #378add; }
    .female .photo-border { stroke: #d4537e; }
    .node-selected-ring { fill: none; stroke: #7c6b9e; stroke-width: 2; }
    .link-partner { stroke: #d4537e; stroke-width: 2; stroke-dasharray: 6 3; fill: none; }
    .node-bg-ghost { fill:#f4f4f5; stroke:#c4c4cc; stroke-width:1; stroke-dasharray:5 3; }
    .tree-node-ghost { opacity:.8; }
    .avatar-ghost { fill:#e4e4e7; }
    .avatar-ghost-text { font-size:14px; font-weight:700; fill:#9ca3af; }
    .node-name-ghost { font-size:13px; font-weight:600; fill:#9ca3af; font-style:italic; }
    .ghost-reltag { font-size:10px; fill:#b0b0b8; }
    .bowtie-link { fill:none; stroke-width:1.6; }
    .bowtie-link.bowtie-anc { stroke:#b08968; }
    .bowtie-link.bowtie-desc { stroke:#6b8e9e; }
    .bowtie-link.bowtie-partner { stroke:#7c6b9e; stroke-width:2.4; }
    .node-name-compact { font-family:Arial,Helvetica,sans-serif; font-size:12px; font-weight:600; fill:#2d2438; }
  </style>`;

function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collectTree() {
  const svgEl = document.querySelector('svg.tree-canvas');
  if (!svgEl) throw new Error('Arborele nu este vizibil pentru export.');
  const gEl = svgEl.querySelector('g');
  if (!gEl) throw new Error('Arborele nu este vizibil pentru export.');

  let bbox;
  try { bbox = gEl.getBBox(); }
  catch { throw new Error('Nu s-a putut calcula dimensiunea arborelui.'); }
  if (!bbox || !bbox.width || !bbox.height) {
    throw new Error('Arborele pare gol.');
  }

  const pad = Math.max(120, Math.round(Math.max(bbox.width, bbox.height) * 0.06));
  return {
    gEl, bbox, pad,
    vbX: bbox.x - pad,
    vbY: bbox.y - pad,
    vbW: bbox.width + pad * 2,
    vbH: bbox.height + pad * 2,
  };
}

function fetchAsDataURL(url) {
  return fetch(url, { mode: 'cors', credentials: 'omit' })
    .then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.blob(); })
    .then((blob) => new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('citire poză eșuată'));
      fr.readAsDataURL(blob);
    }));
}

async function embedImages(rootEl) {
  const imgs = Array.from(rootEl.querySelectorAll('image'));
  const byUrl = new Map();
  for (const img of imgs) {
    const href = img.getAttribute('href') || img.getAttributeNS(XLINK, 'href');
    if (!href || href.startsWith('data:')) continue;
    if (!byUrl.has(href)) byUrl.set(href, []);
    byUrl.get(href).push(img);
  }

  await Promise.all(Array.from(byUrl.entries()).map(async ([url, els]) => {
    let dataUrl = null;
    try { dataUrl = await fetchAsDataURL(url); } catch { dataUrl = null; }
    for (const img of els) {
      if (dataUrl) {
        img.setAttribute('href', dataUrl);
        img.removeAttributeNS(XLINK, 'href');
      } else {
        const rect = document.createElementNS(SVGNS, 'rect');
        rect.setAttribute('x', img.getAttribute('x') || 0);
        rect.setAttribute('y', img.getAttribute('y') || 0);
        rect.setAttribute('width', img.getAttribute('width') || 0);
        rect.setAttribute('height', img.getAttribute('height') || 0);
        rect.setAttribute('rx', '6');
        rect.setAttribute('fill', '#ececf2');
        img.replaceWith(rect);
      }
    }
  }));
}

async function serializeTreeContent(gEl) {
  const clone = gEl.cloneNode(true);
  clone.removeAttribute('transform');
  await embedImages(clone);
  const str = new XMLSerializer().serializeToString(clone);
  return str.replace(/^<g[^>]*>/, '').replace(/<\/g>$/, '');
}

function headerMarkup(title, subtitle) {
  if (!title && !subtitle) return '';
  const t = title ? `<text x="0" y="0" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#4a3a6e">${xmlEscape(title)}</text>` : '';
  const s = subtitle ? `<text x="0" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#7a6f93">${xmlEscape(subtitle)}</text>` : '';
  return t + s;
}

const LEGEND_ITEMS = [
  { swatch: '#e8f0fc', stroke: '#378add', label: 'Bărbat' },
  { swatch: '#fce8f0', stroke: '#d4537e', label: 'Femeie' },
  { mark: '✝', label: 'Decedat' },
];

function legendMarkup() {
  let x = 12;
  const parts = [];
  for (const it of LEGEND_ITEMS) {
    if (it.mark) {
      parts.push(`<text x="${x}" y="5" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#e05c5c">${it.mark}</text>`);
      x += 16;
    } else {
      parts.push(`<rect x="${x}" y="-9" width="16" height="16" rx="3" fill="${it.swatch}" stroke="${it.stroke}" stroke-width="1.5"/>`);
      x += 22;
    }
    parts.push(`<text x="${x}" y="4" font-family="Arial,sans-serif" font-size="13" fill="#4a3a6e">${xmlEscape(it.label)}</text>`);
    x += it.label.length * 7 + 18;
  }
  const width = x;
  const pill = `<rect x="0" y="-15" width="${width}" height="28" rx="14" fill="#ffffff" fill-opacity="0.88" stroke="#e0d8ec" stroke-width="1"/>`;
  return { markup: pill + parts.join(''), width };
}

function interactiveScript(geom) {
  const { vbX, vbY, vbW, vbH } = geom;
  return `
    (function() {
      var svg = document.querySelector('svg');
      var controls = document.getElementById('controls');
      var header = document.getElementById('header');
      var legend = document.getElementById('legend');
      var init = { x: ${vbX}, y: ${vbY}, w: ${vbW}, h: ${vbH} };
      var vb = { x: init.x, y: init.y, w: init.w, h: init.h };
      var MIN_W = init.w / 25, MAX_W = init.w * 10;

      function rect() { return svg.getBoundingClientRect(); }
      function unitsPerPixel() { var r = rect(); return Math.max(vb.w / r.width, vb.h / r.height); }
      function toUser(cx, cy) {
        var r = rect(), upp = unitsPerPixel();
        var offX = (r.width  - vb.w / upp) / 2;
        var offY = (r.height - vb.h / upp) / 2;
        return { x: vb.x + (cx - r.left - offX) * upp, y: vb.y + (cy - r.top - offY) * upp };
      }
      function placeOverlays() {
        var upp = unitsPerPixel();
        var tl = toUser(rect().left, rect().top);
        if (controls) controls.setAttribute('transform', 'translate(' + (tl.x + 14 * upp) + ',' + (tl.y + 14 * upp) + ') scale(' + upp + ')');
        if (header) {
          var tr = toUser(rect().right, rect().top);
          header.setAttribute('transform', 'translate(' + ((tl.x + tr.x) / 2) + ',' + (tl.y + 30 * upp) + ') scale(' + upp + ')');
        }
        if (legend) {
          var bl = toUser(rect().left, rect().bottom);
          legend.setAttribute('transform', 'translate(' + (bl.x + 14 * upp) + ',' + (bl.y - 24 * upp) + ') scale(' + upp + ')');
        }
      }
      function render() { svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h); placeOverlays(); }

      function zoomAt(cx, cy, factor) {
        var newW = vb.w * factor;
        if (newW < MIN_W) factor = MIN_W / vb.w;
        if (newW > MAX_W) factor = MAX_W / vb.w;
        var p = toUser(cx, cy);
        var fx = (p.x - vb.x) / vb.w, fy = (p.y - vb.y) / vb.h;
        vb.w *= factor; vb.h *= factor;
        vb.x = p.x - fx * vb.w; vb.y = p.y - fy * vb.h;
        render();
      }
      function center() { var r = rect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      function reset() { vb.x = init.x; vb.y = init.y; vb.w = init.w; vb.h = init.h; render(); }

      svg.addEventListener('wheel', function(e) {
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.12 : 0.89);
      }, { passive: false });

      var dragging = false, lastX = 0, lastY = 0;
      svg.addEventListener('mousedown', function(e) { dragging = true; lastX = e.clientX; lastY = e.clientY; svg.style.cursor = 'grabbing'; });
      window.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        var upp = unitsPerPixel();
        vb.x -= (e.clientX - lastX) * upp; vb.y -= (e.clientY - lastY) * upp;
        lastX = e.clientX; lastY = e.clientY; render();
      });
      window.addEventListener('mouseup', function() { dragging = false; svg.style.cursor = 'grab'; });
      svg.addEventListener('dblclick', function() { reset(); });

      var ltd = 0;
      svg.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) { dragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
        if (e.touches.length === 2) {
          var dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
          ltd = Math.sqrt(dx * dx + dy * dy);
        }
      }, { passive: true });
      svg.addEventListener('touchmove', function(e) {
        e.preventDefault();
        if (e.touches.length === 1 && dragging) {
          var upp = unitsPerPixel();
          vb.x -= (e.touches[0].clientX - lastX) * upp; vb.y -= (e.touches[0].clientY - lastY) * upp;
          lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; render();
        }
        if (e.touches.length === 2) {
          var dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
          var d = Math.sqrt(dx * dx + dy * dy);
          var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2, my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          if (ltd && d) zoomAt(mx, my, ltd / d);
          ltd = d;
        }
      }, { passive: false });
      svg.addEventListener('touchend', function() { dragging = false; ltd = 0; });

      function bind(id, fn) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('mousedown', function(e) { e.stopPropagation(); });
        el.addEventListener('click', function(e) { e.stopPropagation(); fn(); });
      }
      bind('btn-in',  function() { var c = center(); zoomAt(c.x, c.y, 0.8); });
      bind('btn-out', function() { var c = center(); zoomAt(c.x, c.y, 1.25); });
      bind('btn-fit', reset);

      window.addEventListener('resize', placeOverlays);
      window.addEventListener('load', render);
      render();
    })();
  `;
}

const CONTROLS_MARKUP = `  <g id="controls" style="cursor:pointer;">
    <g id="btn-in"><title>Mărește</title><rect width="36" height="36" rx="8" fill="#fff" stroke="#c8b8e8" stroke-width="1.5"/><text x="18" y="25" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#5e35b1">+</text></g>
    <g id="btn-out" transform="translate(0,42)"><title>Micșorează</title><rect width="36" height="36" rx="8" fill="#fff" stroke="#c8b8e8" stroke-width="1.5"/><text x="18" y="26" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#5e35b1">−</text></g>
    <g id="btn-fit" transform="translate(0,84)"><title>Încadrează tot arborele</title><rect width="36" height="36" rx="8" fill="#fff" stroke="#c8b8e8" stroke-width="1.5"/><text x="18" y="25" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#5e35b1">⤢</text></g>
  </g>`;

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

export async function exportTreeSVG({ title = 'Arbore Genealogic', subtitle = '', legend = true } = {}) {
  const geom = collectTree();
  const content = await serializeTreeContent(geom.gEl);

  const head = headerMarkup(title, subtitle);
  const headerG = head ? `  <g id="header">${head}</g>` : '';
  let legendG = '';
  if (legend) {
    const lg = legendMarkup();
    legendG = `  <g id="legend">${lg.markup}</g>`;
  }

  const svgOutput = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"',
    '  viewBox="' + geom.vbX + ' ' + geom.vbY + ' ' + geom.vbW + ' ' + geom.vbH + '"',
    '  preserveAspectRatio="xMidYMid meet"',
    '  width="100%" height="100%"',
    '  style="background:#f8f6f0;cursor:grab;width:100%;height:100%;display:block;">',
    `  <title>${xmlEscape(title)}</title>`,
    CSS_STYLES,
    '  <g id="zoomable">',
    content,
    '  </g>',
    CONTROLS_MARKUP,
    headerG,
    legendG,
    '  <script type="text/javascript"><![CDATA[',
    interactiveScript(geom),
    '  ]]></script>',
    '</svg>',
  ].join('\n');

  const blob = new Blob([svgOutput], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, `arbore_genealogic_${dateStamp()}.svg`);
}

function buildStaticSvg(geom, content, { title, subtitle, legend }) {
  const { vbX, vbY, vbW, vbH, bbox, pad } = geom;
  const head = headerMarkup(title, subtitle);
  const headerG = head
    ? `  <g transform="translate(${bbox.x + bbox.width / 2},${vbY + Math.min(40, pad * 0.32)})">${head}</g>`
    : '';
  let legendG = '';
  if (legend) {
    const lg = legendMarkup();
    legendG = `  <g transform="translate(${vbX + 20},${vbY + vbH - Math.min(26, pad * 0.22)})">${lg.markup}</g>`;
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"',
    `  viewBox="${vbX} ${vbY} ${vbW} ${vbH}"`,
    `  width="${vbW}" height="${vbH}"`,
    '  style="background:#f8f6f0;">',
    CSS_STYLES,
    `  <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#f8f6f0"/>`,
    content,
    headerG,
    legendG,
    '</svg>',
  ].join('\n');
}

function svgStringToImage(svgString) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Randarea SVG a eșuat.')); };
    img.src = url;
  });
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pdfDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function buildPdfWithJpeg(jpegBytes, imgW, imgH, pageW, pageH, title) {
  const enc = new TextEncoder();
  const chunks = [];
  let pos = 0;
  const offsets = {};
  const out = (data) => {
    const u8 = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(u8);
    pos += u8.length;
  };
  const obj = (n, body) => { offsets[n] = pos; out(`${n} 0 obj\n`); out(body); out('\nendobj\n'); };

  out('%PDF-1.4\n');

  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);

  offsets[4] = pos;
  out(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  out(jpegBytes);
  out('\nendstream\nendobj\n');

  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}endstream`);

  obj(6, `<< /Title (${pdfEscape(title)}) /Producer (Arbore Genealogic) /CreationDate (${pdfDate(new Date())}) >>`);

  const xrefPos = pos;
  const count = 7;
  out('xref\n');
  out(`0 ${count}\n`);
  out('0000000000 65535 f \n');
  for (let i = 1; i < count; i++) {
    out(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  }
  out(`trailer\n<< /Size ${count} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

  return new Blob(chunks, { type: 'application/pdf' });
}

function pdfEscape(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export async function exportTreePDF({ title = 'Arbore Genealogic', subtitle = '', legend = true } = {}) {
  const geom = collectTree();
  const content = await serializeTreeContent(geom.gEl);
  const staticSvg = buildStaticSvg(geom, content, { title, subtitle, legend });

  const img = await svgStringToImage(staticSvg);

  const maxDim = Math.max(geom.vbW, geom.vbH);
  const scale = Math.min(4, Math.max(0.5, 4000 / maxDim));
  const canvasW = Math.max(1, Math.round(geom.vbW * scale));
  const canvasH = Math.max(1, Math.round(geom.vbH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f8f6f0';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.drawImage(img, 0, 0, canvasW, canvasH);

  let jpegDataUrl;
  try {
    jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    throw new Error('Nu s-a putut genera imaginea (poze blocate de browser).');
  }
  const jpegBytes = dataUrlToBytes(jpegDataUrl);

  const DPI = 150;
  const pageW = (canvasW * 72 / DPI).toFixed(2);
  const pageH = (canvasH * 72 / DPI).toFixed(2);

  const pdfBlob = buildPdfWithJpeg(jpegBytes, canvasW, canvasH, pageW, pageH, title);
  triggerDownload(pdfBlob, `arbore_genealogic_${dateStamp()}.pdf`);
}
