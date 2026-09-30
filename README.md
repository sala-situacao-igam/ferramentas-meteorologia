# Ferramentas de Meteorologia — SIMGE/IGAM

Site publicado pelo GitHub Pages: https://sala-situacao-igam.github.io/ferramentas-meteorologia/

| Pasta | Ferramenta | Versão |
|---|---|---|
| `tempo-severo/` | Editor de Tempo Severo | v0.17 |
| `chuva/` | Chuva + Tendência 48h | v0.3 |
| `alertas/` | Alertas por município | v6 |

## Como atualizar uma ferramenta
1. Substitua os arquivos da pasta da ferramenta pelos da nova versão (mantendo `index.html`, `data/` e `assets/`).
2. Faça o commit. O GitHub Pages republica sozinho em poucos minutos.
3. Teste: desenhar um polígono, gerar PNG (e KML/lista de microrregiões no Tempo Severo).

Observação: `tempo-severo/data/microrregioes.js` teve as coordenadas arredondadas para 5 casas decimais (~1 m) para ficar abaixo do limite de 25 MB do upload pelo navegador.
