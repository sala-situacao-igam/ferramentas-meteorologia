/*
 * Layout do mapa final — o MESMO desenho da Previsão diária (previsao/app-drive.js v1.10,
 * modelo QGIS layout_mapas_icones_v3.6), compartilhado por Chuva, Tendência e Tempo Severo.
 *
 * A folha inteira é um SVG em milímetros (297 × 222,75 mm). As medidas, cores, fontes,
 * cabeçalho, moldura, grade, norte, escala, legenda, validade, créditos e rodapé foram
 * copiados da Previsão sem alteração. Só o miolo do mapa muda: áreas coloridas em vez de ícones.
 * O PNG sai em 3508 × 2631 px (300 dpi), igual ao da Previsão.
 *
 * Depende de previsao/data/geo.js (GEO e DEFAULT_LOGOS), carregado antes deste arquivo.
 *
 * Uso:
 *   LayoutMapa.svg(op)        -> texto do SVG
 *   LayoutMapa.png(op)        -> Promise<Blob> (PNG 300 dpi)
 *   LayoutMapa.previa(op)     -> abre a prévia na tela
 *   op = { titulo, validade:{date:'AAAA-MM-DD', time:'HH:MM'}, credito,
 *          areas:[{geometry, fill, stroke}], legenda:[{fill, label}],
 *          cidades:[{nome, lon, lat}], municipios:false }
 */
(function () {
  'use strict';
  if (typeof GEO === 'undefined' || typeof DEFAULT_LOGOS === 'undefined') {
    console.error('layout-mapa.js: previsao/data/geo.js não foi carregado.');
    return;
  }

  /* ===== constantes do modelo QGIS (iguais às da Previsão) ===== */
  var PAGE = { w: 297, h: 222.75 };
  var MAP = { x: 6.86137, y: 19.8108, w: 287.879, h: 171.968,
    xmin: -51.37697910145185887, xmax: -35.90814406617541721, ymin: -23.17966841410345324, ymax: -13.93919886637183225 };
  var K = MAP.w / (MAP.xmax - MAP.xmin);
  var PT = 25.4 / 72;
  var NAVY = '#092b6a';
  var FONT = "Arial, 'Liberation Sans', Helvetica, sans-serif";
  var RODAPE = 'Iniciativa realizada com recursos do Acordo de Reparação\ndo Rio Doce, firmado em decorrência do rompimento da\nBarragem de Fundão, da Samarco S.A. O rompimento, ocorrido\nem 5 de novembro de 2015, tirou a vida de 19 pessoas.';
  var CREDITOS_FIXOS = ['Limites municipais e mesorregiões - IBGE', 'Base cartográfica: IBGE', 'Projeção: Latitude/Longitude - Datum SIRGAS 2000'];
  var LOGO_SLOTS = ['igam', 'simge', 'appa', 'riodoce'];
  var LOGO_Y = 202.9, LOGO_H = 15.5, LOGO_X0 = 10.5, LOGO_X1 = 196.4;
  var STATE_LABELS = [['MT', -51.18, -14.494], ['GO', -49.744, -16.279], ['DF', -47.797, -15.7755], ['BA', -40.865, -14.794], ['MS', -51.198, -19.86],
    ['SP', -48.785, -21.709], ['RJ', -42.536, -22.359], ['ES', -40.361, -19.342]];
  var NORTH_ARROW = '<g transform="translate(-1.438 30.744)"><path d="m32-9.453l28.938 73.826-29-29-29 29z" fill="#000" stroke="#fff" stroke-width="3"/><path d="m32-9.453l29 73.45-29-29-29 29z" fill="none" stroke="#fff" stroke-linecap="square"/><text fill="#000" font-family="' + FONT + '" font-size="26" x="22.71" y="-10.854">N</text></g><g fill="none" stroke="#fff" stroke-width=".25" transform="translate(0 -3.829)"><path d="m4 92.82l6.74-3.891M4.603 90.7l10.397-6M3 95.17l4-2.309M5.442 88.45l13.856-8M12 72.26l18.686-10.812M14.593 65.45l16.09-9.291M15.343 63.24l15.343-8.858M16.877 60.58l13.809-7.972M17.511 58.45l13.174-7.606M18.412 56.15l12.274-7.087M19 54.04l11.427-6.597M20 51.757l10.822-6.311M20.826 49.45l9.86-5.693M21.48 47.3l9.206-5.315M23 44.647l7.686-4.437M23.744 42.45l6.928-4M24.549 40.21l6.137-3.543M25 38.18l5.686-3.283M26.663 35.446l4.02-2.323M27.617 33.12l3.069-1.772M28 31.13l2.686-1.551M29.15 28.694l1.534-.886M13 69.909l17.686-10.211M9.206 79.19l21.48-12.402M8.36 81.45l22.326-12.89M7.671 83.62l19.946-11.516M6.137 86.27l17.02-9.827M10 76.956l20.686-11.943M11.279 74.45l19.407-11.205M14 67.56l16.686-9.634"/><path d="m30.562 69.573v-43.566"/></g>';
  var ASC = .905, DESC = .212, LH = 1.117;

  /* ===== utilidades (iguais às da Previsão) ===== */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function f2(n) { return (Math.round(n * 100) / 100).toString(); }
  function proj(lon, lat) { return [MAP.x + (lon - MAP.xmin) * K, MAP.y + (MAP.ymax - lat) * K]; }
  var measureCtx = document.createElement('canvas').getContext('2d');
  function textW(text, sizeMM, weight) { measureCtx.font = (weight || 400) + ' 100px ' + FONT; return measureCtx.measureText(text).width * sizeMM / 100; }
  function fitSize(lines, sizeMM, maxW, weight) {
    var w = Math.max.apply(null, lines.map(function (l) { return textW(l, sizeMM, weight); }));
    return w > maxW ? sizeMM * maxW / w : sizeMM;
  }
  function textBlock(o) {
    var total = o.lines.length * o.size * LH - (LH - (ASC + DESC)) * o.size;
    var y = o.yTop + (o.h - total) / 2 + ASC * o.size;
    return o.lines.map(function (l, i) {
      return '<text x="' + f2(o.x) + '" y="' + f2(y + i * o.size * LH) + '" font-family="' + FONT + '" font-size="' + f2(o.size) +
        '" font-weight="' + (o.weight || 400) + '" fill="' + o.fill + '" text-anchor="' + (o.anchor || 'start') + '">' + esc(l) + '</text>';
    }).join('');
  }
  function dms(v, pos, neg) {
    var h = v < 0 ? neg : pos; v = Math.abs(v);
    var d = Math.floor(v), m = Math.floor((v - d) * 60 + 1e-9), s = Math.round(((v - d) * 60 - m) * 60);
    if (s === 60) { s = 0; m++; } if (m === 60) { m = 0; d++; }
    return d + '°' + String(m).padStart(2, '0') + "'" + String(s).padStart(2, '0') + '"' + h;
  }
  function fmtDateBR(iso) { return iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : ''; }
  function validadeTexto(v) {
    if (!v || !v.date || !v.time) return '';
    var p = v.time.split(':');
    return 'Válido até às ' + (+p[0]) + 'h' + (p[1] && p[1] !== '00' ? p[1] : '') + ' do dia ' + fmtDateBR(v.date);
  }
  function logoLayout() {
    var GAP = 6.5, avail = LOGO_X1 - LOGO_X0, H = 12.5;
    var items = LOGO_SLOTS.map(function (k) { var L = DEFAULT_LOGOS[k] || null; return { L: L, ratio: L ? L.w / L.h : 2.6 }; });
    var need = function (H) { return items.reduce(function (a, it) { return a + H * it.ratio; }, 0) + GAP * (items.length - 1); };
    if (need(H) > avail) H *= (avail - GAP * (items.length - 1)) / (need(H) - GAP * (items.length - 1));
    items.forEach(function (it) { it.h = Math.min(LOGO_H, H); it.w = it.h * it.ratio; });
    var total = items.reduce(function (a, it) { return a + it.w; }, 0);
    var gap = Math.min(22, (avail - total) / (items.length - 1));
    var x = LOGO_X0 + (avail - total - gap * (items.length - 1)) / 2, out = [];
    items.forEach(function (it, i) { it.x = x; out.push(it); x += it.w; if (i < items.length - 1) { out.push({ sep: x + gap / 2 - 0.14 }); x += gap; } });
    return out;
  }

  /* GeoJSON (lon/lat) -> caminho SVG em mm, relativo ao canto do mapa */
  function caminho(geom) {
    if (!geom) return '';
    var polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    var d = [];
    polys.forEach(function (poly) {
      poly.forEach(function (ring) {
        ring.forEach(function (c, i) {
          d.push((i ? 'L' : 'M') + f2((c[0] - MAP.xmin) * K) + ' ' + f2((MAP.ymax - c[1]) * K));
        });
        d.push('Z');
      });
    });
    return d.join('');
  }

  /* ===== a folha ===== */
  function svg(op) {
    op = op || {};
    var o = [], navy = NAVY;
    o.push('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + PAGE.w + 'mm" height="' + PAGE.h + 'mm" viewBox="0 0 ' + PAGE.w + ' ' + PAGE.h + '">');
    o.push('<defs><clipPath id="mapclip"><rect x="0" y="0" width="' + MAP.w + '" height="' + MAP.h + '"/></clipPath>' +
      '<clipPath id="mgclip"><path d="' + GEO.mg + '" clip-rule="evenodd"/></clipPath></defs>');
    o.push('<rect width="' + PAGE.w + '" height="' + PAGE.h + '" fill="#f7fcff"/>');

    /* ---- cabeçalho ---- */
    [[4.10221, 2.0511, 291.257, 14.9731, 4.10221], [4.30732, 2.25622, 290.847, 14.5628, 3.8971], [4.51243, 2.46133, 290.436, 14.1526, 3.69199], [4.30732, 2.66644, 290.436, 13.7424, 3.48688]]
      .forEach(function (r) { o.push('<rect x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '" rx="' + r[4] + '" fill="rgb(49,142,206)" fill-opacity=".02"/>'); });
    o.push('<rect x="4.92265" y="2.87155" width="289.616" height="13.1271" rx="3.28177" fill="#fff" stroke="rgb(135,196,239)" stroke-width="0.287155"/>');
    o.push('<svg x="250.619" y="2.87155" width="44.7141" height="13.1271" viewBox="0 0 218 64" preserveAspectRatio="none"><path d="M42 0H218V46Q218 64 202 64H0Z" fill="#006cbf"/><path d="M42 0H83L40 64H0Z" fill="#a9e0f4"/><path d="M83 0H121L78 64H40Z" fill="#078fd2"/></svg>');
    o.push('<rect x="199.778" y="5.53798" width="0.348688" height="7.58909" fill="' + navy + '"/>');
    o.push('<svg x="277.515" y="4.10221" width="12.7169" height="10.0504" viewBox="0 0 70 55"><g fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M41 10V3M55 14L60 9M59 28H67M54 40L60 45M27 10L23 5"/><path d="M30 19A14 14 0 0 1 50 36"/><path d="M12 35C12 22 29 18 35 31C47 29 54 43 46 50H12C1 50 0 38 12 35Z"/></g></svg>');
    var title = op.titulo || 'Mapa';
    o.push(textBlock({ lines: [title], x: 11.6913 + 182.343 / 2, yTop: 4.10221, h: 11.2811, size: fitSize([title], 24.4195 * PT, 182.343, 700), weight: 700, fill: navy, anchor: 'middle' }));
    var region = 'Minas Gerais';
    o.push(textBlock({ lines: [region], x: 204.905, yTop: 5.33287, h: 9.22997, size: fitSize([region], 16.8611 * PT, 46, 400), fill: navy }));

    /* ---- mapa ---- */
    o.push('<g transform="translate(' + MAP.x + ' ' + MAP.y + ')"><g clip-path="url(#mapclip)">');
    o.push('<rect width="' + MAP.w + '" height="' + MAP.h + '" fill="#ffffff"/>');
    o.push('<path d="' + GEO.states + '" fill="none" stroke="#000" stroke-width="0.22" stroke-linejoin="round"/>');
    o.push('<path d="' + GEO.mg + '" fill="#ffffff" stroke="none"/>');
    // áreas desenhadas, recortadas exatamente no contorno de MG usado no mapa
    o.push('<g clip-path="url(#mgclip)">');
    (op.areas || []).forEach(function (a) {
      var d = caminho(a.geometry); if (!d) return;
      o.push('<path d="' + d + '" fill="' + a.fill + '" fill-rule="evenodd" stroke="' + (a.stroke || a.fill) + '" stroke-width="0.2" stroke-linejoin="round"/>');
    });
    o.push('</g>');
    if (op.municipios) o.push('<path d="' + GEO.munLines + '" fill="none" stroke="#c9d6dc" stroke-width="0.09" stroke-linejoin="round"/>');
    o.push('<path d="' + GEO.mesoLines + '" fill="none" stroke="#000" stroke-width="0.5" stroke-linejoin="round"/>');
    o.push('<path d="' + GEO.mg + '" fill="none" stroke="#000" stroke-width="0.6" stroke-linejoin="round"/>');
    STATE_LABELS.forEach(function (s) {
      var p = proj(s[1], s[2]), fz = s[0] === 'DF' ? 2.7 : 3.2;
      o.push('<text x="' + f2(p[0] - MAP.x) + '" y="' + f2(p[1] - MAP.y + (ASC - DESC) / 2 * fz) + '" font-family="' + FONT + '" font-size="' + fz + '" font-weight="700" fill="#2f3640" text-anchor="middle" stroke="#fff" stroke-width=".5" stroke-linejoin="round" paint-order="stroke">' + esc(s[0]) + '</text>');
    });
    // cidades de referência: ponto e nome (nome no estilo dos municípios da Previsão, menor)
    var ns = 2.6;
    (op.cidades || []).forEach(function (c) {
      if (!isFinite(c.lon) || !isFinite(c.lat)) return;
      var p = proj(c.lon, c.lat), x = p[0] - MAP.x, y = p[1] - MAP.y;
      o.push('<circle cx="' + f2(x) + '" cy="' + f2(y) + '" r="0.75" fill="#fff" stroke="#000" stroke-width="0.3"/>');
      o.push('<text x="' + f2(x + 1.3) + '" y="' + f2(y + (ASC - DESC) / 2 * ns) + '" font-family="' + FONT + '" font-size="' + ns + '" font-weight="700" fill="' + navy + '" stroke="#fff" stroke-width="' + f2(ns * 0.3) + '" stroke-linejoin="round" paint-order="stroke">' + esc(c.nome) + '</text>');
    });
    o.push('</g>');
    o.push('<rect width="' + MAP.w + '" height="' + MAP.h + '" fill="none" stroke="rgb(86,123,154)" stroke-width="0.307666"/>');
    o.push('</g>');
    // grade (1,5°, fora da moldura: esquerda e base)
    var gs = 8.43053 * PT, gc = 'rgb(39,71,129)', lat, lon;
    for (lat = Math.ceil(MAP.ymin / 1.5) * 1.5; lat <= MAP.ymax; lat += 1.5) {
      var py = proj(MAP.xmin, lat)[1];
      o.push('<text transform="translate(' + f2(MAP.x - 2.46133) + ' ' + f2(py) + ') rotate(-90)" font-family="' + FONT + '" font-size="' + f2(gs) + '" fill="' + gc + '" text-anchor="middle">' + dms(lat, 'N', 'S') + '</text>');
    }
    for (lon = Math.ceil(MAP.xmin / 1.5) * 1.5; lon <= MAP.xmax; lon += 1.5) {
      var px = proj(lon, MAP.ymin)[0], lbl = dms(lon, 'E', 'W');
      if (px + textW(lbl, gs) / 2 > PAGE.w - 0.5) continue;
      o.push('<text x="' + f2(px) + '" y="' + f2(MAP.y + MAP.h + 2.46133 + ASC * gs) + '" font-family="' + FONT + '" font-size="' + f2(gs) + '" fill="' + gc + '" text-anchor="middle">' + lbl + '</text>');
    }
    // seta norte e escala gráfica
    o.push('<svg x="19.3411" y="167.133" width="7.7942" height="9.08866" viewBox="0 0 61.06 96.62">' + NORTH_ARROW + '</svg>');
    (function () {
      var seg = 8.35894, ss = 9 * PT, bx = 11.6913 + 1 + textW('0', ss) / 2, by = 184.8, ly = by - 1.6 - DESC * ss;
      o.push('<rect x="' + f2(bx) + '" y="' + by + '" width="' + seg + '" height="3" fill="#000" stroke="#000" stroke-width=".3"/>');
      o.push('<rect x="' + f2(bx + seg) + '" y="' + by + '" width="' + seg + '" height="3" fill="#fff" stroke="#000" stroke-width=".3"/>');
      [['0', 0], ['50', seg], ['100', 2 * seg]].forEach(function (t) { o.push('<text x="' + f2(bx + t[1]) + '" y="' + f2(ly) + '" font-family="' + FONT + '" font-size="' + f2(ss) + '" fill="#000" text-anchor="middle">' + t[0] + '</text>'); });
      o.push('<text x="' + f2(bx + 2 * seg + textW('100', ss) / 2 + 1) + '" y="' + f2(ly) + '" font-family="' + FONT + '" font-size="' + f2(ss) + '" fill="#000">km</text>');
    })();

    /* ---- legenda (mesma área e título da Previsão; chave de cor no lugar do ícone) ---- */
    o.push(textBlock({ lines: ['Legenda'], x: 230.723 + 55.5338 / 2, yTop: 22.7706, h: 6.78946, size: 16 * PT, weight: 700, fill: navy, anchor: 'middle' }));
    o.push('<rect x="231.954" y="34.1727" width="55.9197" height="0.266644" fill="rgb(138,187,228)"/>');
    (function () {
      var itens = op.legenda || [];
      if (!itens.length) return;
      var top = 36.6, bottom = 157.8, cx = 230.723 + 55.5338 / 2, maxW = 61.5;
      var rh = Math.min(10, (bottom - top) / itens.length);
      var sw = 9, sh = Math.min(6, rh - 1.6), gap = 2.6;
      var labels = itens.map(function (i) { return i.label; });
      var fs = fitSize(labels, 10 * PT, maxW - sw - gap, 400);
      var blockW = sw + gap + Math.max.apply(null, labels.map(function (l) { return textW(l, fs); }));
      var x0 = cx - blockW / 2, tx0 = x0 + sw + gap, y = top;
      itens.forEach(function (it) {
        var cy = y + rh / 2;
        o.push('<rect x="' + f2(x0) + '" y="' + f2(cy - sh / 2) + '" width="' + sw + '" height="' + f2(sh) + '" fill="' + it.fill + '" stroke="#555" stroke-width="0.2"/>');
        o.push('<text x="' + f2(tx0) + '" y="' + f2(cy + (ASC - DESC) / 2 * fs) + '" font-family="' + FONT + '" font-size="' + f2(fs) + '" fill="#000">' + esc(it.label) + '</text>');
        y += rh;
      });
    })();
    o.push('<rect x="232.338" y="159.499" width="51.2776" height="0.256388" fill="rgb(138,187,228)"/>');
    var vt = validadeTexto(op.validade), val = vt || 'Validade não informada';
    o.push(textBlock({ lines: [val], x: 223.857 + 67.7588 / 2, yTop: 160.906, h: 8.28892, size: fitSize([val], 10 * PT, 67.7, 400), fill: vt ? navy : '#8a97a8', anchor: 'middle' }));
    o.push('<rect x="232.338" y="170.345" width="51.2776" height="0.256388" fill="rgb(138,187,228)"/>');
    var cred = [op.credito || 'SIMGE/IGAM'].concat(CREDITOS_FIXOS);
    o.push(textBlock({ lines: cred, x: 228.723 + 59.3284 / 2, yTop: 172.909, h: 13.3322, size: fitSize(cred, 6.68628 * PT, 62, 400), fill: navy, anchor: 'middle' }));

    /* ---- rodapé ---- */
    [[4.30732, 200.393, 289.001, 20.511, 3.28177], [4.51243, 200.598, 288.59, 20.1008, 3.07666], [4.71754, 200.803, 288.18, 19.6906, 2.87155]]
      .forEach(function (r) { o.push('<rect x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '" rx="' + r[4] + '" fill="rgb(57,152,207)" fill-opacity=".02"/>'); });
    o.push('<rect x="4.92265" y="201.008" width="287.77" height="19.2804" rx="2.46133" fill="rgb(249,252,255)" stroke="rgb(135,196,239)" stroke-width="0.307666"/>');
    logoLayout().forEach(function (it) {
      if (it.sep != null) { o.push('<rect x="' + f2(it.sep) + '" y="205.931" width="0.276899" height="10.0504" fill="rgb(32,153,234)"/>'); return; }
      if (!it.L) return;
      var cy = LOGO_Y + LOGO_H / 2;
      o.push('<image href="' + it.L.src + '" xlink:href="' + it.L.src + '" x="' + f2(it.x) + '" y="' + f2(cy - it.h / 2) + '" width="' + f2(it.w) + '" height="' + f2(it.h) + '"/>');
    });
    var foot = RODAPE.split('\n');
    o.push(textBlock({ lines: foot, x: 200.624, yTop: 203.265, h: 15.1782, size: fitSize(foot, 9 * PT, 91.5, 400), fill: navy }));
    o.push('</svg>');
    return o.join('');
  }

  /* ===== PNG 300 dpi (mesmo processo da Previsão) ===== */
  function canvas(op, dpi) {
    dpi = dpi || 300;
    return new Promise(function (res, rej) {
      var W = Math.round(PAGE.w / 25.4 * dpi), H = Math.round(PAGE.h / 25.4 * dpi);
      var texto = svg(op).replace('width="' + PAGE.w + 'mm" height="' + PAGE.h + 'mm"', 'width="' + W + '" height="' + H + '"');
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = W; c.height = H;
        var g = c.getContext('2d'); g.fillStyle = '#f7fcff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H); res(c);
      };
      img.onerror = function () { rej(new Error('O navegador não conseguiu desenhar o mapa.')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(texto);
    });
  }
  function crc32(buf) { var c, crc = 0xFFFFFFFF; for (var n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
  function comDpi(blob, dpi) {
    return blob.arrayBuffer().then(function (ab) {
      var src = new Uint8Array(ab), ppm = Math.round(dpi / 0.0254);
      var chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
      dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
      dv.setUint32(17, crc32(chunk.subarray(4, 17)));
      var at = 33, out = new Uint8Array(src.length + 21);
      out.set(src.subarray(0, at)); out.set(chunk, at); out.set(src.subarray(at), at + 21);
      return new Blob([out], { type: 'image/png' });
    });
  }
  function png(op) {
    return canvas(op, 300).then(function (c) {
      return new Promise(function (r) { c.toBlob(r, 'image/png'); });
    }).then(function (b) { return comDpi(b, 300); });
  }

  /* ===== prévia na tela ===== */
  function previa(op) {
    var m = document.getElementById('layoutMapaPrevia');
    if (!m) {
      m = document.createElement('div');
      m.id = 'layoutMapaPrevia';
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-label', 'Prévia do mapa final');
      m.style.cssText = 'position:fixed;inset:0;z-index:99990;background:rgba(9,43,106,.45);display:flex;align-items:center;justify-content:center;padding:16px';
      m.innerHTML = '<div style="background:#fff;border-radius:12px;padding:14px;width:min(1200px,96vw);max-height:94vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.3)">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font:600 15px Barlow,Arial,sans-serif;color:#092b6a">' +
        '<span style="flex:1">Prévia do mapa final (297 × 222,75 mm · PNG 3508 × 2631 px)</span>' +
        '<button type="button" data-fechar style="border:1px solid #c9d8ea;background:#fff;border-radius:8px;padding:5px 12px;font:600 13px Barlow,Arial,sans-serif;color:#092b6a;cursor:pointer">Fechar</button></div>' +
        '<div data-folha style="line-height:0"></div></div>';
      m.addEventListener('click', function (e) { if (e.target === m || e.target.hasAttribute('data-fechar')) m.style.display = 'none'; });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') m.style.display = 'none'; });
      document.body.appendChild(m);
    }
    var folha = m.querySelector('[data-folha]');
    folha.innerHTML = svg(op);
    var s = folha.querySelector('svg'); s.setAttribute('width', '100%'); s.removeAttribute('height');
    m.style.display = 'flex';
  }

  window.LayoutMapa = { svg: svg, png: png, previa: previa, canvas: canvas, validadeTexto: validadeTexto, fmtDateBR: fmtDateBR };
})();
