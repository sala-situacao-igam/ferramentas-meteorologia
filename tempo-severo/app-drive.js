/* Código da ferramenta para a versão Apps Script (carregado de fora para o Apps Script não interferir).
   Gerado a partir de tempo-severo/index.html. Depende de window.BASE_DADOS, definido na página. */

const LEVELS=[
 {id:'Nivel0',label:'Tempestades não severas',rank:0,fill:'#D2F7CB',opacity:1,stroke:'#5BCB59'},
 {id:'Nivel1',label:'Nível 1',rank:1,fill:'#FFFF00',opacity:1,stroke:'#b8b800'},
 {id:'Nivel2',label:'Nível 2',rank:2,fill:'#FFA500',opacity:1,stroke:'#e39000'},
 {id:'Nivel3',label:'Nível 3',rank:3,fill:'#EE0000',opacity:1,stroke:'#c60000'},
 {id:'Nivel4',label:'Nível 4',rank:4,fill:'#FF00FF',opacity:1,stroke:'#b400b4'}
];
let selected=LEVELS[0];
const map=L.map('map',{zoomControl:true,attributionControl:false,minZoom:5,maxZoom:12});
// Limite de MG obtido diretamente da camada de estados já carregada.
// Isso elimina uma união geométrica pesada na abertura sem simplificar o contorno.
const MG_MASK=((window.BRASIL_ESTADOS&&BRASIL_ESTADOS.features)||[]).find(f=>f.properties.UF==='MG') || turf.union(turf.featureCollection(MESO.features));
let microData=null;
let microLoadPromise=null;
let microBBoxes=null;
function ensureMicroLoaded(){
  if(microData) return Promise.resolve(microData);
  if(microLoadPromise) return microLoadPromise;
  microLoadPromise=new Promise((resolve,reject)=>{
    const sc=document.createElement('script');
    sc.src=window.BASE_DADOS+'tempo-severo/data/microrregioes.js';
    sc.onload=()=>{
      microData=window.MICRORREGIOES;
      if(!microData){reject(new Error('Camada de microrregiões não foi carregada.'));return;}
      microBBoxes=microData.features.map(f=>turf.bbox(f));
      resolve(microData);
    };
    sc.onerror=()=>reject(new Error('Falha ao carregar data/microrregioes.js'));
    document.head.appendChild(sc);
  });
  return microLoadPromise;
}
const drawnItems=new L.FeatureGroup().addTo(map);
const mesoDisplay=L.geoJSON(MESO,{style:{color:'#4b5563',weight:1.15,fillOpacity:0}}).addTo(map);
map.fitBounds(mesoDisplay.getBounds(),{padding:[25,25]});
L.geoJSON(CIDADES,{pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:2.4,color:'#111',weight:1,fillColor:'#fff',fillOpacity:1}),onEachFeature:(f,l)=>{const n=f.properties.NM_LOCAL_1||f.properties.NM_MUNICIP;l.bindTooltip(n,{permanent:true,direction:'right',offset:[3,0],className:'city-label'});}}).addTo(map);
const microPriorityLayer={clearLayers(){},addData(){}}; // microrregiões ficam somente para cálculo textual
function styleFor(lv){return {color:lv.stroke,weight:2,fillColor:lv.fill,fillOpacity:lv.opacity};}
function levelById(id){return LEVELS.find(x=>x.id===id)||LEVELS[0];}
function clipFeatureToMG(f){
  try{
    const clipped=turf.intersect(turf.featureCollection([f,MG_MASK]));
    if(!clipped)return null;
    clipped.properties={...(f.properties||{})};
    return clipped;
  }catch(err){console.warn('Falha ao recortar geometria:',err);return f;}
}
function clippedDrawnFeatures(){return drawnFeatures().map(clipFeatureToMG).filter(Boolean);}
function refreshZOrder(){
  // Menos severo embaixo, mais severo por cima. Como o preenchimento é opaco,
  // as cores não se misturam nas sobreposições.
  LEVELS.slice().sort((a,b)=>a.rank-b.rank).forEach(lv=>{
    drawnItems.eachLayer(l=>{if(l._severity===lv.id&&l.bringToFront)l.bringToFront();});
  });
  if(mesoDisplay.bringToFront)mesoDisplay.bringToFront();
}
function addClippedFeatureToMap(feature,levelId){
  const clipped=clipFeatureToMG(feature);if(!clipped)return [];
  const lv=levelById(levelId);const added=[];
  L.geoJSON(clipped,{style:styleFor(lv),onEachFeature:(f,l)=>{l._severity=lv.id;drawnItems.addLayer(l);attachPopup(l);added.push(l);}});
  refreshZOrder();return added;
}
function renderLevels(){const el=document.getElementById('levels');el.innerHTML='';LEVELS.forEach(lv=>{const b=document.createElement('button');b.className='level'+(lv.id===selected.id?' active':'');b.innerHTML=`<span class="swatch" style="background:${lv.fill}"></span>${lv.label}`;b.onclick=()=>{selected=lv;document.getElementById('currentLabel').textContent=lv.label;renderLevels();};el.appendChild(b)});document.getElementById('legend').innerHTML=LEVELS.map(l=>`<div><span class="swatch" style="background:${l.fill}"></span>${l.label}</div>`).join('');}
renderLevels();
let drawControl=new L.Draw.Polygon(map,{allowIntersection:false,showArea:false,shapeOptions:styleFor(selected)});
document.getElementById('drawBtn').onclick=()=>{drawControl=new L.Draw.Polygon(map,{allowIntersection:false,showArea:false,shapeOptions:styleFor(selected)});drawControl.enable();setStatus('Desenhando '+selected.label+'...');};
map.on(L.Draw.Event.CREATED,e=>{
  const f=e.layer.toGeoJSON();f.properties={level:selected.id};
  const added=addClippedFeatureToMap(f,selected.id);
  recalc();
  setStatus(added.length?'Área de '+selected.label+' criada e recortada no limite de Minas Gerais.':'O desenho ficou fora de Minas Gerais e não foi adicionado.');
});
map.on(L.Draw.Event.EDITED,()=>{reclipAllLayers();recalc();});
function reclipAllLayers(){
  const fs=drawnFeatures();drawnItems.clearLayers();
  fs.forEach(f=>addClippedFeatureToMap(f,f.properties.level));
  refreshZOrder();
}

function attachPopup(layer){layer.bindPopup(()=>{const lv=levelById(layer._severity);const wrap=document.createElement('div');wrap.innerHTML=`<b>${lv.label}</b><br><button id="editThis">Editar</button> <button id="delThis">Excluir</button>`;setTimeout(()=>{const d=document.getElementById('delThis');if(d)d.onclick=()=>{drawnItems.removeLayer(layer);map.closePopup();recalc();};const ed=document.getElementById('editThis');if(ed)ed.onclick=()=>{layer.editing.enable();setStatus('Editando '+lv.label+'. Clique no mapa quando terminar e depois use “Salvar neste navegador”.');};},0);return wrap;});}
function drawnFeatures(){const arr=[];drawnItems.eachLayer(l=>{const f=l.toGeoJSON();f.properties={level:l._severity};arr.push(f)});return arr;}
async function computeAssignments(){
 const data=await ensureMicroLoaded();
 const draw=clippedDrawnFeatures();
 const assignments={};
 if(!draw.length) return assignments;
 const drawWithBBox=draw.map(pf=>({pf,bbox:turf.bbox(pf),lv:levelById(pf.properties.level)}));
 const boxesOverlap=(a,b)=>!(a[2]<b[0]||a[0]>b[2]||a[3]<b[1]||a[1]>b[3]);
 for(let i=0;i<data.features.length;i++){
   const mf=data.features[i];
   const mb=microBBoxes[i];
   let best=null;
   for(const item of drawWithBBox){
     if(!boxesOverlap(mb,item.bbox)) continue;
     try{
       if(turf.booleanIntersects(mf,item.pf)){
         if(!best||item.lv.rank>best.rank) best=item.lv;
       }
     }catch(e){}
   }
   if(best) assignments[mf.properties.nm_micro]=best.id;
 }
 return assignments;
}
function groupedFromAssignments(assignments){
 const grouped={}; LEVELS.forEach(l=>grouped[l.id]=[]);
 Object.entries(assignments).forEach(([n,id])=>grouped[id].push(n));
 for(const k of Object.keys(grouped)) grouped[k].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 return grouped;
}
async function recalc(){
 if(!drawnFeatures().length){
   const grouped={}; LEVELS.forEach(l=>grouped[l.id]=[]);
   renderLists(grouped);
   window._groups=grouped; window._assignments={};
   return;
 }
 setStatus('Calculando microrregiões...');
 try{
   const assignments=await computeAssignments();
   const grouped=groupedFromAssignments(assignments);
   renderLists(grouped);
   window._groups=grouped;
   window._assignments=assignments;
   setStatus('Microrregiões atualizadas.');
 }catch(err){
   console.error(err);
   setStatus('Erro ao carregar/calcular microrregiões.');
 }
}
function pretty(n){return String(n).toLocaleLowerCase('pt-BR').replace(/(^|[\s/-])\p{L}/gu,m=>m.toLocaleUpperCase('pt-BR'));}
function renderLists(g){const el=document.getElementById('microLists');const cards=[];LEVELS.slice().reverse().forEach(l=>{if(g[l.id]?.length)cards.push(`<div class="list-card"><b><span class="swatch" style="background:${l.fill}"></span>${l.label} (${g[l.id].length})</b><p>${g[l.id].map(pretty).join(', ')}</p></div>`)});el.innerHTML=cards.join('')||'<div class="small">Nenhuma área desenhada.</div>';}
function setStatus(s){document.getElementById('status').textContent=s;}
renderLists(Object.fromEntries(LEVELS.map(l=>[l.id,[]])));
if('requestIdleCallback' in window){requestIdleCallback(()=>ensureMicroLoaded().catch(()=>{}),{timeout:5000});}
else{setTimeout(()=>ensureMicroLoaded().catch(()=>{}),2500);}
document.getElementById('saveBtn').onclick=()=>{localStorage.setItem('simge-tempo-severo-v012',JSON.stringify(clippedDrawnFeatures()));setStatus('Previsão salva neste navegador.');};
(function load(){try{const a=JSON.parse(localStorage.getItem('simge-tempo-severo-v012')||'[]');a.forEach(f=>addClippedFeatureToMap(f,f.properties.level));if(a.length){recalc();setStatus('Previsão salva anteriormente foi carregada.');}}catch(e){}})();
document.getElementById('clearBtn').onclick=()=>{if(confirm('Apagar todos os polígonos desta previsão?')){drawnItems.clearLayers();localStorage.removeItem('simge-tempo-severo-v012');recalc();setStatus('Previsão limpa.');}};
document.getElementById('copyBtn').onclick=async()=>{const g=window._groups||{};const lines=[];LEVELS.slice().reverse().forEach(l=>{if(g[l.id]?.length)lines.push(`${l.label}: ${g[l.id].map(pretty).join(', ')}.`)});await navigator.clipboard.writeText(lines.join('\n'));setStatus('Listas de microrregiões copiadas.');};
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function ringCoords(coords){return coords.map(c=>`${c[0]},${c[1]},0`).join(' ')}
function polygonKml(coords){const rings=[];rings.push(`<outerBoundaryIs><LinearRing><coordinates>${ringCoords(coords[0])}</coordinates></LinearRing></outerBoundaryIs>`);for(let i=1;i<coords.length;i++)rings.push(`<innerBoundaryIs><LinearRing><coordinates>${ringCoords(coords[i])}</coordinates></LinearRing></innerBoundaryIs>`);return `<Polygon>${rings.join('')}</Polygon>`;}

function isoToday(){const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`;}
(function initDates(){const fd=document.getElementById('forecastDate');const vu=document.getElementById('validUntil');fd.value=isoToday();const d=new Date();d.setDate(d.getDate()+1);d.setHours(10,0,0,0);const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'),h=String(d.getHours()).padStart(2,'0');vu.value=`${y}-${m}-${day}T${h}:00`;})();
function brDate(v){if(!v)return '';const [y,m,d]=v.split('-');return `${d}/${m}/${y}`;}
function brDateTime(v){if(!v)return '';const dt=new Date(v);return dt.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',','');}
function allCoords(geom,out=[]){if(!geom)return out;if(geom.type==='Polygon'){for(const ring of geom.coordinates)for(const c of ring)out.push(c);}else if(geom.type==='MultiPolygon'){for(const p of geom.coordinates)for(const ring of p)for(const c of ring)out.push(c);}return out;}
function projectFactory(w,h,pad=42){const minx=-52.5,maxx=-37.5,miny=-23.0,maxy=-14.0;const sx=(w-2*pad)/(maxx-minx),sy=(h-2*pad)/(maxy-miny),s=Math.min(sx,sy);const ox=(w-(maxx-minx)*s)/2-minx*s,oy=(h-(maxy-miny)*s)/2+maxy*s;return c=>[c[0]*s+ox,oy-c[1]*s];}
function drawGeom(ctx,geom,proj,style){ctx.save();ctx.beginPath();const polys=geom.type==='Polygon'?[geom.coordinates]:geom.coordinates;for(const poly of polys){for(const ring of poly){ring.forEach((c,i)=>{const [x,y]=proj(c);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.closePath();}}ctx.fillStyle=style.fill;ctx.globalAlpha=style.fillOpacity??1;ctx.fill('evenodd');ctx.globalAlpha=1;ctx.strokeStyle=style.stroke;ctx.lineWidth=style.width??1;ctx.stroke();ctx.restore();}
function drawNeighborLabels(ctx,proj){
  const labels=[
    {txt:'GO',coord:[-50.05,-16.65]},{txt:'BA',coord:[-41.2,-15.15]},{txt:'ES',coord:[-40.65,-19.25]},
    {txt:'RJ',coord:[-42.45,-22.05]},{txt:'SP',coord:[-49.25,-21.75]}
  ];
  ctx.save();ctx.font='bold 22px Arial';ctx.fillStyle='#111';
  labels.forEach(l=>{const [x,y]=proj(l.coord);ctx.fillText(l.txt,x,y);});
  ctx.restore();
}
function drawMapFrame(ctx,w,h){
  // Moldura cartográfica interna: deixa as coordenadas do lado de fora,
  // como no produto oficial, sem alterar a geometria das camadas.
  const m=30;
  ctx.save();
  ctx.strokeStyle='#222';
  ctx.lineWidth=1.6;
  ctx.strokeRect(m,m,w-2*m,h-2*m);
  ctx.restore();
}
function drawGraticuleLabels(ctx,proj,w,h){
  const topLons=[-52.5,-51,-49.5,-48,-46.5,-45,-43.5,-42,-40.5,-39,-37.5];
  const sideLats=[-15,-16.5,-18,-19.5,-21,-22.5];
  const frame=30;
  ctx.save();ctx.font='15px Arial';ctx.fillStyle='#111';
  ctx.textBaseline='middle';
  // Longitude acima e abaixo da moldura cartográfica.
  topLons.forEach(lon=>{
    const [x,_]=proj([lon,-14.55]);
    const txt=formatLon(lon);
    const tw=ctx.measureText(txt).width;
    ctx.fillText(txt,x-tw/2,frame/2-1);
    ctx.fillText(txt,x-tw/2,h-frame/2+1);
  });
  // Latitude à esquerda e à direita da moldura cartográfica.
  sideLats.forEach(lat=>{
    const [_,y]=proj([-52.45,lat]);
    const txt=formatLat(lat);
    ctx.save();ctx.translate(frame/2,y);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.fillText(txt,0,0);ctx.restore();
    ctx.save();ctx.translate(w-frame/2,y);ctx.rotate(Math.PI/2);ctx.textAlign='center';ctx.fillText(txt,0,0);ctx.restore();
  });
  ctx.restore();
}
function formatLon(v){const deg=Math.abs(v);const d=Math.floor(deg);const m=(deg-d)*60;return `${d}°${String(Math.round(m)).padStart(2,'0')}'00"W`;}
function formatLat(v){const deg=Math.abs(v);const d=Math.floor(deg);const m=(deg-d)*60;return `${d}°${String(Math.round(m)).padStart(2,'0')}'00"S`;}
function drawScaleBar(ctx){
  ctx.save();ctx.strokeStyle='#111';ctx.fillStyle='#111';ctx.lineWidth=1.8;ctx.font='16px Arial';
  const x=58,y=ctx.canvas.height-62,w=80;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.stroke();
  [0,w/2,w].forEach(dx=>{ctx.beginPath();ctx.moveTo(x+dx,y-8);ctx.lineTo(x+dx,y+8);ctx.stroke();});
  ctx.fillText('0',x-4,y-22);ctx.fillText('50',x+30,y-22);ctx.fillText('100 km',x+64,y-22);
  // seta norte acima da escala
  const nx=x+2, ny=y-62;
  ctx.beginPath();ctx.moveTo(nx,ny-30);ctx.lineTo(nx-12,ny+8);ctx.lineTo(nx,ny-2);ctx.lineTo(nx+12,ny+8);ctx.closePath();ctx.stroke();
  ctx.restore();
}
function drawStatesBackground(ctx,proj){
  const states=(window.BRASIL_ESTADOS&&BRASIL_ESTADOS.features)||[];
  states.filter(f=>f.properties.UF!=='MG').forEach(f=>drawGeom(ctx,f.geometry,proj,{fill:'#ffffff',fillOpacity:1,stroke:'#b8b8b8',width:1}));
  const mg=states.find(f=>f.properties.UF==='MG');
  if(mg) drawGeom(ctx,mg.geometry,proj,{fill:'#ffffff',fillOpacity:1,stroke:'#333',width:1.2});
}

async function generatePNG(){
  const sheet=document.getElementById('printSheet');
  const canvas=document.getElementById('printCanvas');
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  const proj=projectFactory(canvas.width,canvas.height,48);
  // A geração do PNG não depende do cálculo das microrregiões.

  // base cartográfica com estados vizinhos
  drawStatesBackground(ctx,proj);
  drawNeighborLabels(ctx,proj);

  // polígonos meteorológicos recortados em MG; nível mais crítico por cima
  clippedDrawnFeatures()
    .sort((a,b)=>levelById(a.properties.level).rank-levelById(b.properties.level).rank)
    .forEach(f=>{const lv=levelById(f.properties.level); drawGeom(ctx,f.geometry,proj,{fill:lv.fill,fillOpacity:1,stroke:lv.stroke,width:1.5});});

  // contornos das MESORREGIÕES: apenas linhas, sem preenchimento
  MESO.features.forEach(f=>drawGeom(ctx,f.geometry,proj,{fill:'#000000',fillOpacity:0,stroke:'#444',width:1.15}));

  // contorno de MG por cima
  drawGeom(ctx,MG_MASK.geometry,proj,{fill:'#000000',fillOpacity:0,stroke:'#222',width:1.4});

  // cidades de destaque
  ctx.font='16px Arial';
  for(const f of CIDADES.features){
    const c=f.geometry.coordinates; const [x,y]=proj(c); const n=f.properties.NM_LOCAL_1||f.properties.NM_MUNICIP||'';
    ctx.beginPath(); ctx.arc(x,y,6.5,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=2; ctx.stroke();
    ctx.strokeStyle='#fff'; ctx.lineWidth=4; ctx.strokeText(n,x+10,y-8); ctx.fillStyle='#111'; ctx.fillText(n,x+10,y-8);
  }

  drawMapFrame(ctx,canvas.width,canvas.height);
  drawGraticuleLabels(ctx,proj,canvas.width,canvas.height);
  drawScaleBar(ctx);

  const fd=document.getElementById('forecastDate').value;
  document.getElementById('printTitle').textContent=`Previsão Probabilística de Tempo Severo - ${brDate(fd)}*`;
  const used=LEVELS.filter(l=>clippedDrawnFeatures().some(f=>f.properties.level===l.id)).sort((a,b)=>b.rank-a.rank);
  document.getElementById('printLegend').innerHTML='<b style="font-size:20px">Legenda</b><br>'+used.map(l=>`<div><span style="display:inline-block;width:24px;height:18px;background:${l.fill};border:1px solid #555;margin-right:10px;vertical-align:-3px"></span>${l.label}</div>`).join('')+'<div><span style="display:inline-block;width:24px;height:18px;background:#fff;border:1px solid #555;margin-right:10px;vertical-align:-3px"></span>Sem Tempestades</div>';
  const vu=document.getElementById('validUntil').value;
  const dt=vu?new Date(vu):null;
  let validity='';
  if(dt){const hh=String(dt.getHours()).padStart(2,'0'); const dd=String(dt.getDate()).padStart(2,'0'); const mm=String(dt.getMonth()+1).padStart(2,'0'); const yy=dt.getFullYear(); validity=`*Válido até às ${hh}h do dia ${dd}/${mm}/${yy}.`;}
  document.getElementById('printValidity').textContent=validity;
  document.getElementById('printCredits').innerHTML='Projeção: Latitude/Longitude - Datum SIRGAS2000<br>MESORREGIÕES/MG - IGAM, 2009<br>Previsão Probabilística de Tempo Severo - SIMGE/IGAM, 2026';
  sheet.style.display='block';
  await new Promise(r=>setTimeout(r,100));
  const out=await html2canvas(sheet,{backgroundColor:'#fff',scale:1,useCORS:true});
  sheet.style.display='none';
  const a=document.createElement('a');
  a.download=`tempo_severo_${(fd||isoToday()).replaceAll('-','')}.png`;
  a.href=out.toDataURL('image/png');
  a.click();
  setStatus('Mapa PNG gerado com polígonos meteorológicos, contornos das mesorregiões e lista por microrregiões.');
}
document.getElementById('pngBtn').onclick=generatePNG;

function hexToKmlColor(hex,alpha='ff'){
  const h=hex.replace('#','');
  const r=h.slice(0,2),g=h.slice(2,4),b=h.slice(4,6);
  return `${alpha}${b}${g}${r}`.toLowerCase();
}
function unionFeatures(features){
  if(!features.length)return null;
  if(features.length===1)return features[0];
  try{return turf.union(turf.featureCollection(features));}catch(e){
    let acc=features[0];
    for(let i=1;i<features.length;i++){
      try{acc=turf.union(turf.featureCollection([acc,features[i]]));}catch(_){}
    }
    return acc;
  }
}
function visibleFeaturesForKml(){
  const source=clippedDrawnFeatures();
  const out=[];
  let higherMask=null;
  const ordered=LEVELS.slice().sort((a,b)=>b.rank-a.rank);
  for(const lv of ordered){
    const same=source.filter(f=>f.properties.level===lv.id);
    if(!same.length)continue;
    for(const f of same){
      let visible=f;
      if(higherMask){
        try{visible=turf.difference(turf.featureCollection([f,higherMask]));}catch(e){console.warn('Falha ao remover sobreposição no KML:',e);}
      }
      if(visible){visible.properties={...(f.properties||{}),level:lv.id};out.push(visible);}
    }
    const thisMask=unionFeatures(same);
    if(thisMask){higherMask=higherMask?unionFeatures([higherMask,thisMask]):thisMask;}
  }
  return out.sort((a,b)=>levelById(a.properties.level).rank-levelById(b.properties.level).rank);
}

// Estilos escritos no mesmo padrão do KML operacional usado hoje.
// KML usa AABBGGRR (alpha, blue, green, red), não #RRGGBB.
const KML_STYLE_BY_LEVEL={
  Nivel0:{id:'style1',poly:'ff6dea82'}, // verde - RGB #82EA6D
  Nivel1:{id:'style2',poly:'ff00ffff'}, // amarelo
  Nivel2:{id:'style3',poly:'ff00a5ff'}, // laranja
  Nivel3:{id:'style4',poly:'ff0000e6'}, // vermelho
  Nivel4:{id:'style5',poly:'ffff00ff'}  // magenta
};
function kmlStylesDocument(){
  return Object.entries(KML_STYLE_BY_LEVEL).map(([level,st])=>`<Style id="${st.id}"><LineStyle><color>40000000</color><width>3</width></LineStyle><PolyStyle><color>${st.poly}</color><fill>1</fill><outline>1</outline></PolyStyle></Style>`).join('');
}
function polygonKmlCompat(coords){
  const makeRing=(ring)=>`<LinearRing><tessellate>1</tessellate><coordinates>${ring.map(c=>`${c[0]},${c[1]},0.000`).join(' ')}</coordinates></LinearRing>`;
  let x=`<outerBoundaryIs>${makeRing(coords[0])}</outerBoundaryIs>`;
  for(let i=1;i<coords.length;i++) x+=`<innerBoundaryIs>${makeRing(coords[i])}</innerBoundaryIs>`;
  return `<Polygon>${x}</Polygon>`;
}

document.getElementById('kmlBtn').onclick=()=>{
  const fs=visibleFeaturesForKml();
  let placemarks=[];
  let seq=1;
  for(const f of fs){
    const lv=levelById(f.properties.level);
    const st=KML_STYLE_BY_LEVEL[lv.id];
    let geom='';
    if(f.geometry.type==='Polygon')geom=polygonKmlCompat(f.geometry.coordinates);
    else if(f.geometry.type==='MultiPolygon')geom='<MultiGeometry>'+f.geometry.coordinates.map(polygonKmlCompat).join('')+'</MultiGeometry>';
    placemarks.push(`<Placemark><name>${seq++}</name><description><![CDATA[<p>cor: ${lv.id}<br/>nivel: ${lv.label}</p>]]></description><ExtendedData><Data name="cor"><displayName>cor</displayName><value><![CDATA[${lv.id}]]></value></Data><Data name="nivel"><displayName>nivel</displayName><value><![CDATA[${lv.label}]]></value></Data></ExtendedData><styleUrl>#${st.id}</styleUrl>${geom}</Placemark>`);
  }
  const k=`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://earth.google.com/kml/2.2"><Document><name>Tempo Severo</name>${kmlStylesDocument()}${placemarks.join('')}</Document></kml>`;
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([k],{type:'application/vnd.google-earth.kml+xml'}));
  a.download='tempo_severo_poligonos.kml';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  setStatus('KML gerado no mesmo padrão de estilos do arquivo operacional de referência.');
};
document.getElementById('modelBtn').onclick=()=>document.getElementById('modelModal').classList.add('open');document.getElementById('closeModel').onclick=()=>document.getElementById('modelModal').classList.remove('open');
