/* Código da ferramenta para a versão Apps Script (carregado de fora para o Apps Script não interferir).
   Gerado a partir de chuva/index.html. Depende de window.BASE_DADOS, definido na página.
   2026.10.05.2: mapa final no layout da Previsão diária (assets/layout-mapa.js); validade da Tendência
   = 2º dia + 1; datas padrão no horário local.
   2026.10.06.1: título da Tendência com os dois dias da tendência (ex.: "07 e 08/10/2026");
   datas padrão pelo horário de Brasília (Minas Gerais), não pelo relógio do computador. */

const LEVELS=[
{id:'nao_significativa',rank:0,fill:'#BFEAF2',stroke:'#8FCBD6',label:'Chuva Não Significativa'},
{id:'baixo',rank:1,fill:'#28E3F0',stroke:'#20B7C0',label:'20–40 mm'},
{id:'medio',rank:2,fill:'#21ADF3',stroke:'#178BC4',label:'40–60 mm'},
{id:'alto',rank:3,fill:'#0E6DFA',stroke:'#0B57C8',label:'60–80 mm'},
{id:'muitoalto',rank:4,fill:'#191EB4',stroke:'#111579',label:'Acima de 80 mm'}];
let selected=LEVELS[0], product='chuva';
const MG_MASK=((window.BRASIL_ESTADOS&&BRASIL_ESTADOS.features)||[]).find(f=>f.properties.UF==='MG')||turf.union(turf.featureCollection(MESO.features));
const map=L.map('map',{zoomControl:true,attributionControl:false,minZoom:5,maxZoom:12});
const drawnItems=new L.FeatureGroup().addTo(map);
L.geoJSON(BRASIL_ESTADOS,{style:f=>({color:f.properties.UF==='MG'?'#777':'#c8c8c8',weight:f.properties.UF==='MG'?0.5:1,fillColor:'#fff',fillOpacity:1})}).addTo(map);
const mesoDisplay=L.geoJSON(MESO,{style:{color:'#454545',weight:1.15,fillOpacity:0}}).addTo(map); map.fitBounds(mesoDisplay.getBounds(),{padding:[25,25]});
L.geoJSON(CIDADES,{pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:3.1,color:'#111',weight:1.4,fillColor:'#fff',fillOpacity:1}),onEachFeature:(f,l)=>{const n=f.properties.NM_LOCAL_1||f.properties.NM_MUNICIP||f.properties.nome||'';l.bindTooltip(n,{permanent:true,direction:'right',offset:[5,-3],className:'city-label'});}}).addTo(map);
function levelById(id){return LEVELS.find(x=>x.id===id)||LEVELS[0]} function styleFor(l){return {color:l.stroke,weight:1.5,fillColor:l.fill,fillOpacity:1}}
function renderLevels(){const el=document.getElementById('levels');el.innerHTML='';LEVELS.forEach(l=>{const b=document.createElement('button');b.className='level'+(l.id===selected.id?' active':'');b.innerHTML=`<span class="swatch" style="background:${l.fill}"></span>${l.label}`;b.onclick=()=>{selected=l;document.getElementById('currentLabel').textContent=l.label;renderLevels()};el.appendChild(b)});renderLegend();}
function renderLegend(){document.getElementById('legend').innerHTML=LEVELS.slice().reverse().map(l=>`<div><span class="swatch" style="background:${l.fill}"></span>${l.label}</div>`).join('')+'<div><span class="swatch" style="background:#fff"></span>Sem Previsão de Chuvas</div>'}
function renderLabelEditor(){const el=document.getElementById('labelEditor');el.innerHTML='';LEVELS.forEach(l=>{const r=document.createElement('div');r.className='labelrow';r.innerHTML=`<span class="swatch" style="background:${l.fill}"></span><input value="${l.label}" data-id="${l.id}">`;r.querySelector('input').oninput=e=>{l.label=e.target.value; if(selected.id===l.id)document.getElementById('currentLabel').textContent=l.label;renderLevels()};el.appendChild(r)})}
renderLabelEditor();renderLevels();
function setStatus(s){document.getElementById('status').textContent=s}
function clipFeature(f){try{return turf.intersect(turf.featureCollection([f,MG_MASK]))}catch(e){return null}}
function addFeature(f,id){const cl=clipFeature(f);if(!cl)return;const lv=levelById(id);L.geoJSON(cl,{style:styleFor(lv),onEachFeature:(ff,l)=>{l._level=id;drawnItems.addLayer(l);l.bindPopup(`<b>${lv.label}</b><br><button onclick="window.delLayer(${L.Util.stamp(l)})">Excluir</button>`);}});refreshZ()}
window.delLayer=id=>{drawnItems.eachLayer(l=>{if(L.Util.stamp(l)===id)drawnItems.removeLayer(l)});refreshZ()}
function refreshZ(){LEVELS.forEach(lv=>drawnItems.eachLayer(l=>{if(l._level===lv.id&&l.bringToFront)l.bringToFront()}))}
let drawControl;document.getElementById('drawBtn').onclick=()=>{drawControl=new L.Draw.Polygon(map,{allowIntersection:false,showArea:false,shapeOptions:styleFor(selected)});drawControl.enable();setStatus('Desenhando '+selected.label+'...')};
map.on(L.Draw.Event.CREATED,e=>{const f=e.layer.toGeoJSON();addFeature(f,selected.id);setStatus('Área criada e recortada no limite de Minas Gerais.')});
function features(){const a=[];drawnItems.eachLayer(l=>{const f=l.toGeoJSON();f.properties={level:l._level};a.push(f)});return a}
document.getElementById('clearBtn').onclick=()=>{if(confirm('Apagar todas as áreas deste produto?')){drawnItems.clearLayers();localStorage.removeItem('simge-chuva-tend-v02-'+product);setStatus('Áreas apagadas.')}};
document.getElementById('saveBtn').onclick=()=>{localStorage.setItem('simge-chuva-tend-v02-'+product,JSON.stringify(features()));setStatus('Produto salvo neste navegador.')};
function loadProduct(){drawnItems.clearLayers();try{const arr=JSON.parse(localStorage.getItem('simge-chuva-tend-v02-'+product)||'[]');arr.forEach(f=>addFeature(f,f.properties.level));}catch(e){}}
function switchProduct(p){product=p;document.getElementById('tabChuva').classList.toggle('active',p==='chuva');document.getElementById('tabTend').classList.toggle('active',p==='tendencia');document.getElementById('trendDates').style.display=p==='tendencia'?'block':'none';loadProduct();ajustarValidade();setStatus(p==='chuva'?'Modo Previsão de Chuva.':'Modo Tendência 48h.')}
document.getElementById('tabChuva').onclick=()=>switchProduct('chuva');document.getElementById('tabTend').onclick=()=>switchProduct('tendencia');
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};// "Hoje" no horário de Brasília (America/Sao_Paulo), qualquer que seja o fuso do computador.
function hojeMG(){const o={};new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).forEach(p=>o[p.type]=p.value);return o.year+'-'+o.month+'-'+o.day}
function somaDias(v,n){const d=new Date(v+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)}
function initDates(){const h=hojeMG();forecastDate.value=h;trendDate1.value=somaDias(h,1);trendDate2.value=somaDias(h,2);validUntil.value=`${somaDias(h,1)}T10:00`}initDates();loadProduct();
function brDate(v){if(!v)return '';const [y,m,d]=v.split('-');return `${d}/${m}/${y}`}
function union(fs){if(!fs.length)return null;if(fs.length===1)return fs[0];try{return turf.union(turf.featureCollection(fs))}catch(e){return fs[0]}}
function visibleFeatures(){const src=features().map(f=>{const c=clipFeature(f);if(c)c.properties=f.properties;return c}).filter(Boolean),out=[];let high=null;for(const lv of LEVELS.slice().sort((a,b)=>b.rank-a.rank)){const same=src.filter(f=>f.properties.level===lv.id);for(const f of same){let v=f;if(high){try{v=turf.difference(turf.featureCollection([f,high]))}catch(e){}}if(v){v.properties={level:lv.id};out.push(v)}}const m=union(same);if(m)high=high?union([high,m]):m}return out.sort((a,b)=>levelById(a.properties.level).rank-levelById(b.properties.level).rank)}
/* ===== mapa final no layout da Previsão diária (assets/layout-mapa.js) ===== */
function addDaysIso(v,n){if(!v)return '';const d=new Date(v+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)}
function horaValidade(){return ((validUntil.value||'').split('T')[1]||'').slice(0,5)||'10:00'}
// Previsão de Chuva: válido até o dia seguinte à previsão.
// Tendência: válido até o dia seguinte ao 2º dia da tendência (ex.: 05 -> 06 e 07 -> válido até 08).
// A hora escolhida é mantida (10h se estiver vazia).
function ajustarValidade(){
  let dia='';
  if(product==='tendencia')dia=addDaysIso(trendDate2.value||addDaysIso(trendDate1.value,1)||addDaysIso(forecastDate.value,2),1);
  else dia=addDaysIso(forecastDate.value,1);
  if(dia)validUntil.value=dia+'T'+horaValidade();
}
['forecastDate','trendDate1','trendDate2'].forEach(id=>document.getElementById(id).addEventListener('change',ajustarValidade));
ajustarValidade();
// Título da Tendência: os dois dias da tendência.
// 07 e 08/10/2026 | 31/10 e 01/11/2026 | 31/12/2026 e 01/01/2027
function datasTendencia(d1,d2){
  if(!d1||!d2)return 'data pendente';
  const [y1,m1,a1]=d1.split('-'),[y2,m2,a2]=d2.split('-');
  if(y1!==y2)return `${a1}/${m1}/${y1} e ${a2}/${m2}/${y2}`;
  if(m1!==m2)return `${a1}/${m1} e ${a2}/${m2}/${y2}`;
  return `${a1} e ${a2}/${m2}/${y2}`;
}
function opcoesMapa(){
  const fd=forecastDate.value,ano=(fd||iso(new Date())).slice(0,4);
  const nome=product==='chuva'?'Previsão de Chuva':'Tendência de Chuva';
  const fs=visibleFeatures();
  const usados=LEVELS.filter(l=>fs.some(f=>f.properties.level===l.id)).sort((a,b)=>b.rank-a.rank);
  const [vd,vt]=(validUntil.value||'').split('T');
  return {
    titulo:nome+' - '+(product==='tendencia'?datasTendencia(trendDate1.value,trendDate2.value):(fd?brDate(fd):'data pendente')),
    validade:vd?{date:vd,time:(vt||'10:00').slice(0,5)}:null,
    credito:nome+' - SIMGE/IGAM, '+ano,
    areas:fs.map(f=>{const lv=levelById(f.properties.level);return {geometry:f.geometry,fill:lv.fill,stroke:lv.stroke}}),
    legenda:usados.map(l=>({fill:l.fill,label:l.label})).concat([{fill:'#ffffff',label:'Sem Previsão de Chuvas'}]),
    cidades:CIDADES.features.map(f=>({nome:f.properties.NM_LOCAL_1||f.properties.NM_MUNICIP||f.properties.nome||'',lon:f.geometry.coordinates[0],lat:f.geometry.coordinates[1]}))
  };
}
// Carrega o layout se a página ainda não trouxe (ex.: Apps Script antigo com o GitHub já atualizado).
function garantirLayoutMapa(){
  if(window.LayoutMapa)return Promise.resolve();
  const carregar=src=>new Promise((ok,erro)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>erro(new Error('Falha ao carregar '+src));document.head.appendChild(s);});
  const base=window.BASE_DADOS||'';
  return (typeof GEO==='undefined'?carregar(base+'previsao/data/geo.js'):Promise.resolve())
    .then(()=>carregar(base+'assets/layout-mapa.js'))
    .then(()=>{if(!window.LayoutMapa)throw new Error('layout do mapa indisponível');});
}
async function generatePNG(){
  setStatus('Gerando o mapa…');
  try{
    await garantirLayoutMapa();
    const blob=await LayoutMapa.png(opcoesMapa());
    const fd=forecastDate.value;
    const a=document.createElement('a');
    a.download=(product==='chuva'?'chuva_':'tendencia_')+(fd||'mapa').replaceAll('-','')+'.png';
    a.href=URL.createObjectURL(blob);
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),60000);
    setStatus('PNG gerado (3508 × 2631 px, 300 dpi).');
  }catch(e){console.error(e);setStatus('O navegador não conseguiu gerar o mapa. Tente novamente.')}
}
pngBtn.onclick=generatePNG;
{const pb=document.getElementById('previewBtn');if(pb)pb.onclick=()=>garantirLayoutMapa().then(()=>LayoutMapa.previa(opcoesMapa())).catch(()=>setStatus('Não foi possível carregar o layout do mapa. Recarregue a página.'))}
