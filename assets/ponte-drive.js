/*
 * Ponte para o Drive — usada pelas versões Apps Script do Tempo Severo, da Chuva e da Previsão diária.
 * v3: além de salvar no Drive, permite baixar no PC.
 *
 * As ferramentas geram PNG, KML, PDF e SVG criando um link de download e chamando .click().
 * Esta ponte intercepta esse clique e:
 *   1) manda o arquivo para o Drive via google.script.run.salvarArquivo;
 *   2) se a opção "Baixar também no PC" estiver marcada, baixa o arquivo na hora;
 *   3) se o Drive falhar, baixa o arquivo no PC automaticamente (nada se perde);
 *   4) o aviso de sucesso tem o botão "Baixar no PC", para baixar depois se quiser.
 * Fora do Apps Script (sem google.script.run), o download normal continua funcionando.
 * Um link com data-local="1" nunca é interceptado (download direto).
 *
 * Depende de window.FERRAMENTA ('tempo-severo', 'chuva' ou 'previsao'), definido na página.
 * Opcional: window.PONTE_SELO troca o texto do selo.
 */
(function () {
  var temAppsScript = !!(window.google && google.script && google.script.run);
  var FERRAMENTA = window.FERRAMENTA || '';
  var CHAVE_PC = 'ferramentas-meteorologia:baixar-no-pc';

  var estilo = document.createElement('style');
  estilo.textContent =
    '#ponteAviso{position:fixed;right:16px;bottom:16px;z-index:99999;max-width:400px;background:#092b6a;color:#fff;' +
    'padding:12px 14px;border-radius:10px;font:14px/1.45 "Barlow",Arial,sans-serif;box-shadow:0 10px 30px rgba(9,43,106,.3);display:none}' +
    '#ponteAviso a{color:#a9e0f4;font-weight:700}#ponteAviso.erro{background:#8a2025}' +
    '#ponteAviso .x{margin-left:8px;background:none;border:0;color:#fff;cursor:pointer;font-size:18px;line-height:1;float:right}' +
    '#ponteAviso .pc{display:inline-block;margin-top:8px;background:#fff;color:#092b6a;border:0;border-radius:7px;padding:5px 11px;font:600 13px "Barlow",Arial,sans-serif;cursor:pointer}' +
    '#ponteSelo{position:fixed;right:10px;top:6px;z-index:99998;display:grid;gap:2px;background:#fff;color:#1d5c37;border:1px solid #b9dcc6;' +
    'border-radius:9px;padding:3px 9px;font:500 12px/1.25 "Barlow",Arial,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.12)}' +
    '#ponteSelo label{display:flex;gap:6px;align-items:center;color:#092b6a;cursor:pointer;font-weight:600}' +
    '#ponteSelo input{width:14px;height:14px;margin:0;accent-color:#006cbf}';
  document.head.appendChild(estilo);

  var aviso = document.createElement('div');
  aviso.id = 'ponteAviso';
  aviso.setAttribute('role', 'status');
  aviso.setAttribute('aria-live', 'polite');
  document.body.appendChild(aviso);

  function querPc() { try { return localStorage.getItem(CHAVE_PC) === '1'; } catch (e) { return false; } }

  if (temAppsScript) {
    var selo = document.createElement('div');
    selo.id = 'ponteSelo';
    selo.innerHTML = '<span></span><label><input type="checkbox"> Baixar também no PC</label>';
    selo.querySelector('span').textContent = window.PONTE_SELO || 'Os arquivos são salvos no Drive';
    var ck = selo.querySelector('input');
    ck.checked = querPc();
    ck.onchange = function () { try { localStorage.setItem(CHAVE_PC, ck.checked ? '1' : '0'); } catch (e) {} };
    document.body.appendChild(selo);
  }

  var timer = null;
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function mostrar(html, erro, fixo, baixar) {
    aviso.className = erro ? 'erro' : '';
    aviso.innerHTML = '<button type="button" class="x" aria-label="Fechar aviso">&times;</button>' + html +
      (baixar ? '<br><button type="button" class="pc">Baixar no PC</button>' : '');
    aviso.querySelector('.x').onclick = function () { aviso.style.display = 'none'; };
    if (baixar) aviso.querySelector('.pc').onclick = baixar;
    aviso.style.display = 'block';
    clearTimeout(timer);
    if (!fixo) timer = setTimeout(function () { aviso.style.display = 'none'; }, 15000);
  }

  var clickOriginal = HTMLAnchorElement.prototype.click;
  function baixarNoPc(nome, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    a.setAttribute('data-local', '1');
    document.body.appendChild(a);
    clickOriginal.call(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  window.ponteBaixarNoPc = baixarNoPc;

  function paraBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { reject(new Error('falha ao ler o arquivo')); };
      r.readAsDataURL(blob);
    });
  }

  function enviar(nome, href) {
    mostrar('Salvando <b>' + esc(nome) + '</b> no Drive…', false, true);
    fetch(href)
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        var jaBaixou = querPc();
        if (jaBaixou) baixarNoPc(nome, blob);
        var pc = function () { baixarNoPc(nome, blob); };
        return paraBase64(blob).then(function (b64) {
          google.script.run
            .withSuccessHandler(function (r) {
              var url = /^https:\/\//.test(r && r.url) ? r.url : '#';
              mostrar('Salvo no Drive: <a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(r && r.nome || nome) + '</a>' +
                (jaBaixou ? '<br>Cópia baixada no PC.' : ''), false, false, jaBaixou ? null : pc);
            })
            .withFailureHandler(function (e) {
              if (!jaBaixou) baixarNoPc(nome, blob);
              mostrar('Não foi possível salvar no Drive (' + esc(e && e.message ? e.message : e) + ').<br>' +
                '<b>O arquivo foi baixado no PC</b> — confira a pasta Downloads.', true, true, pc);
            })
            .salvarArquivo(FERRAMENTA, nome, blob.type, b64);
        });
      })
      .catch(function (e) {
        mostrar('Não foi possível ler o arquivo gerado: ' + esc(e && e.message ? e.message : e), true, true);
      });
  }

  if (!temAppsScript) return;

  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download') && this.getAttribute('data-local') !== '1' && /^(blob:|data:)/.test(this.href || '')) {
      enviar(this.getAttribute('download') || 'arquivo', this.href);
      return;
    }
    return clickOriginal.apply(this, arguments);
  };
})();
