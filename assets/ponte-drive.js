/*
 * Ponte para o Drive — usada pelas versões Apps Script do Tempo Severo e da Chuva.
 *
 * As ferramentas geram PNG e KML criando um link de download e chamando .click().
 * Esta ponte intercepta esse clique e manda o arquivo para o Drive via google.script.run.
 * Fora do Apps Script (sem google.script.run), o download normal continua funcionando.
 *
 * Depende de window.FERRAMENTA ('tempo-severo' ou 'chuva'), definido na página.
 */
(function () {
  var temAppsScript = !!(window.google && google.script && google.script.run);
  var FERRAMENTA = window.FERRAMENTA || '';

  var estilo = document.createElement('style');
  estilo.textContent =
    '#ponteAviso{position:fixed;right:16px;bottom:16px;z-index:99999;max-width:380px;background:#12384f;color:#fff;' +
    'padding:12px 14px;border-radius:8px;font:14px/1.4 "Segoe UI",Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);display:none}' +
    '#ponteAviso a{color:#9fd8ff;font-weight:700}#ponteAviso.erro{background:#8a2025}' +
    '#ponteAviso button{margin-left:8px;background:none;border:0;color:#fff;cursor:pointer;font-size:16px}' +
    '#ponteSelo{position:fixed;right:10px;top:8px;z-index:99998;background:#e8f4ec;color:#1d5c37;border:1px solid #b9dcc6;' +
    'border-radius:12px;padding:2px 9px;font:12px "Segoe UI",Arial,sans-serif}';
  document.head.appendChild(estilo);

  var aviso = document.createElement('div');
  aviso.id = 'ponteAviso';
  aviso.setAttribute('role', 'status');
  aviso.setAttribute('aria-live', 'polite');
  document.body.appendChild(aviso);

  if (temAppsScript) {
    var selo = document.createElement('div');
    selo.id = 'ponteSelo';
    selo.textContent = 'PNG e KML são salvos no Drive';
    document.body.appendChild(selo);
  }

  var timer = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function mostrar(html, erro, fixo) {
    aviso.className = erro ? 'erro' : '';
    aviso.innerHTML = html + ' <button type="button" aria-label="Fechar aviso">&times;</button>';
    aviso.querySelector('button').onclick = function () { aviso.style.display = 'none'; };
    aviso.style.display = 'block';
    clearTimeout(timer);
    if (!fixo) timer = setTimeout(function () { aviso.style.display = 'none'; }, 10000);
  }

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
        return paraBase64(blob).then(function (b64) { return { b64: b64, mime: blob.type }; });
      })
      .then(function (x) {
        google.script.run
          .withSuccessHandler(function (r) {
            var url = /^https:\/\//.test(r.url) ? r.url : '#';
            mostrar('Salvo no Drive: <a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(r.nome) + '</a>');
          })
          .withFailureHandler(function (e) {
            mostrar('Não foi possível salvar no Drive: ' + esc(e && e.message ? e.message : e), true, true);
          })
          .salvarArquivo(FERRAMENTA, nome, x.mime, x.b64);
      })
      .catch(function (e) {
        mostrar('Não foi possível ler o arquivo gerado: ' + esc(e && e.message ? e.message : e), true, true);
      });
  }

  if (!temAppsScript) return;

  var clickOriginal = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download') && /^(blob:|data:)/.test(this.href || '')) {
      enviar(this.getAttribute('download') || 'arquivo', this.href);
      return;
    }
    return clickOriginal.apply(this, arguments);
  };
})();
