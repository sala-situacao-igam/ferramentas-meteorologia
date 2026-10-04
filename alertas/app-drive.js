/* Alertas e passagem de plantão — código da página (v3.0.1).
   Fica no GitHub Pages, fora do Apps Script, como o app-drive.js das outras ferramentas:
   o Apps Script altera código JavaScript longo escrito dentro do HTML e quebrava a página.
   Depende de: window.BASE_DADOS, window.VERSAO_APP, window.alertasDados e window.alertasJsPdf
   (definidos no Alertas.html), municipios.js e mesorregioes.js. */
window.alertasDados.then(iniciarAlertas,function(e){
  document.getElementById('topinfo').innerHTML='<b>Não foi possível carregar os municípios.</b> Verifique se alertas/data/municipios.js está publicado no GitHub Pages e recarregue (Ctrl+F5).';
  window.diagFaixa(e.message);
});
function iniciarAlertas(){
const $=id=>document.getElementById(id);
const GEO=window.MUNICIPIOS_MG;
if(!GEO){
  $('topinfo').innerHTML='<b>Não foi possível carregar os municípios.</b> Verifique se alertas/data/municipios.js está publicado no GitHub Pages.';
  throw new Error('municipios.js não carregou');
}
const MESO=window.MESORREGIOES_MG||null;   // opcional: sem ele, o mapa funciona sem os limites de mesorregião
$('topinfo').innerHTML='<b>Minas Gerais</b> • '+GEO.features.length+' municípios';

const BOUNDS={minx:-50.969359935283485,miny:-22.92052499999994,maxx:-39.85806369332265,maxy:-14.232372130922181};
const state={mode:'click',selected:new Set(),active:[],dailyRows:[],plantaoId:'',meuEmail:'',pastaUrl:'',drawing:false,drawPts:[],view:{x:0,y:0,w:1000,h:760}};
const featureByName=new Map(GEO.features.map(f=>[f.properties.nome,f]));
const pathByName=new Map();
const svg=$('mapSvg'),layer=$('munLayer'),mesoLayer=$('mesoLayer'),labels=$('labelLayer'),
      irLayer=$('irLayer'),visLayer=$('visLayer'),glmLayer=$('glmLayer'),
      tooltip=$('tooltip'),drawLine=$('drawLine');
const PAD=28,W=1000,H=760;
const CHAVE_RASCUNHO='simge-plantao-rascunho-v2';
const temServidor=!!(window.google&&google.script&&google.script.run);

/* ---------------- salvar no PC (além do Drive) ---------------- */
const CHAVE_PC='ferramentas-meteorologia:baixar-no-pc';
function querPc(){try{const v=localStorage.getItem(CHAVE_PC+':alertas');return v===null?true:v==='1';}catch(e){return true;}}   // padrão nos Alertas: ligado (cópia local do KML, como antes)
$('baixarPc').checked=querPc();
$('baixarPc').onchange=()=>{try{localStorage.setItem(CHAVE_PC+':alertas',$('baixarPc').checked?'1':'0');}catch(e){}};
function baixarLocal(nome,blob){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=nome;a.setAttribute('data-local','1');document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
let avisoT=0;
function aviso(html,erro,acoes){
  const el=$('aviso');el.className=erro?'erro':'';
  el.innerHTML='<button type="button" class="x" aria-label="Fechar aviso">&times;</button>'+html;
  el.querySelector('.x').onclick=()=>el.style.display='none';
  (acoes||[]).forEach(([rotulo,fn])=>{const b=document.createElement('button');b.type='button';b.className='pc';b.textContent=rotulo;b.onclick=fn;el.appendChild(document.createElement('br'));el.appendChild(b);});
  el.style.display='block';clearTimeout(avisoT);if(!erro)avisoT=setTimeout(()=>el.style.display='none',20000);
}

/* ---------------- mapa ---------------- */
function xy(lon,lat){
  const sx=(W-2*PAD)/(BOUNDS.maxx-BOUNDS.minx),sy=(H-2*PAD)/(BOUNDS.maxy-BOUNDS.miny),s=Math.min(sx,sy);
  const mapW=(BOUNDS.maxx-BOUNDS.minx)*s,mapH=(BOUNDS.maxy-BOUNDS.miny)*s,ox=(W-mapW)/2,oy=(H-mapH)/2;
  return [ox+(lon-BOUNDS.minx)*s,oy+(BOUNDS.maxy-lat)*s];
}
function ringsOf(f){
  const g=f.geometry;
  if(g.type==='Polygon')return [g.coordinates[0]];
  if(g.type==='MultiPolygon')return g.coordinates.map(p=>p[0]);
  return [];
}
function ringPath(ring){
  let d='';ring.forEach((p,i)=>{const q=xy(p[0],p[1]);d+=(i?'L':'M')+q[0].toFixed(2)+','+q[1].toFixed(2);});return d+'Z';
}
function pathFor(f){return ringsOf(f).map(ringPath).join('');}
function mesoPathFor(f){
  const g=f.geometry,polys=g.type==='Polygon'?[g.coordinates]:(g.type==='MultiPolygon'?g.coordinates:[]);
  return polys.map(poly=>poly.map(ringPath).join('')).join('');
}
function renderMeso(){
  if(!MESO)return;
  const frag=document.createDocumentFragment();
  MESO.features.forEach(f=>{
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',mesoPathFor(f));p.setAttribute('class','mesoregiao');p.dataset.meso=f.properties.nome||'';
    frag.appendChild(p);
  });
  mesoLayer.appendChild(frag);
}

let dragged=false;
function render(){
  const fg=document.createDocumentFragment(),fl=document.createDocumentFragment(),fd=document.createDocumentFragment();
  GEO.features.forEach((f,idx)=>{
    const d=pathFor(f);
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',d);p.setAttribute('class','municipio');p.dataset.name=f.properties.nome;
    p.addEventListener('click',()=>{if(state.mode==='click'&&!dragged)toggleCity(f.properties.nome);});
    p.addEventListener('mousemove',ev=>showTip(ev,f.properties.nome));
    p.addEventListener('mouseleave',()=>tooltip.style.display='none');
    fg.appendChild(p);pathByName.set(f.properties.nome,p);
    const clip=document.createElementNS('http://www.w3.org/2000/svg','clipPath');
    clip.setAttribute('id','clipMun'+idx);
    const cp=document.createElementNS('http://www.w3.org/2000/svg','path');cp.setAttribute('d',d);clip.appendChild(cp);fd.appendChild(clip);
    const t=document.createElementNS('http://www.w3.org/2000/svg','text');
    const q=xy(f.properties.label_lon,f.properties.label_lat);
    t.setAttribute('x',q[0]);t.setAttribute('y',q[1]);t.setAttribute('class','label');
    t.setAttribute('clip-path',`url(#clipMun${idx})`);t.textContent=f.properties.nome;fl.appendChild(t);
  });
  $('clipDefs').appendChild(fd);layer.appendChild(fg);labels.appendChild(fl);
}

/* ---------------- camadas meteorológicas (RealEarth / SSEC) ---------------- */
const WX={
  irBase:'https://realearth.ssec.wisc.edu/cgi-bin/mapserv?map=G19-ABI-FD-BAND13-GRAD.map&version=1.3',
  visBase:'https://realearth.ssec.wisc.edu/cgi-bin/mapserv?map=G19-ABI-FD-BAND01.map&version=1.3',
  glmBase:'https://realearth.ssec.wisc.edu/cgi-bin/mapserv?map=glmgroupdensity.map&version=1.3',
  irOn:false,visOn:false,glmOn:false,satOpacity:.78,glmOpacity:.68
};
function imageBox(){const tl=xy(BOUNDS.minx,BOUNDS.maxy),br=xy(BOUNDS.maxx,BOUNDS.miny);return {x:tl[0],y:tl[1],w:br[0]-tl[0],h:br[1]-tl[1]};}
function setImagePlacement(el){const b=imageBox();el.setAttribute('x',b.x);el.setAttribute('y',b.y);el.setAttribute('width',b.w);el.setAttribute('height',b.h);}
function buildWmsUrl(base){
  const bbox=`${BOUNDS.miny},${BOUNDS.minx},${BOUNDS.maxy},${BOUNDS.maxx}`; // WMS 1.3 EPSG:4326: lat,lon
  return base+'&service=WMS&request=GetMap&version=1.3.0&layers=latest&styles=default'+
    '&format=image/png&transparent=true&crs=EPSG:4326&width=1600&height=1200&bbox='+encodeURIComponent(bbox)+'&_t='+Date.now();
}
function setLayer(el,on,base){
  if(on){const u=buildWmsUrl(base);el.setAttributeNS('http://www.w3.org/1999/xlink','href',u);el.setAttribute('href',u);el.style.display='';}
  else el.style.display='none';
}
function refreshWeatherLayers(){
  [irLayer,visLayer,glmLayer].forEach(setImagePlacement);
  setLayer(irLayer,WX.irOn,WX.irBase);setLayer(visLayer,WX.visOn,WX.visBase);setLayer(glmLayer,WX.glmOn,WX.glmBase);
  irLayer.style.opacity=WX.satOpacity;visLayer.style.opacity=WX.satOpacity;glmLayer.style.opacity=WX.glmOpacity;
  $('toggleIR').classList.toggle('active',WX.irOn);$('toggleVIS').classList.toggle('active',WX.visOn);$('toggleGLM').classList.toggle('active',WX.glmOn);
}
$('toggleIR').onclick=()=>{WX.irOn=!WX.irOn;if(WX.irOn)WX.visOn=false;refreshWeatherLayers();};
$('toggleVIS').onclick=()=>{WX.visOn=!WX.visOn;if(WX.visOn)WX.irOn=false;refreshWeatherLayers();};
$('toggleGLM').onclick=()=>{WX.glmOn=!WX.glmOn;refreshWeatherLayers();};
$('refreshWx').onclick=refreshWeatherLayers;
setInterval(()=>{if(WX.irOn||WX.visOn||WX.glmOn)refreshWeatherLayers();},10*60*1000);   // atualiza a cada 10 min

render();renderMeso();[irLayer,visLayer,glmLayer].forEach(setImagePlacement);

/* ---------------- zoom e arraste ---------------- */
function applyView(){
  const v=state.view;svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.w} ${v.h}`);
  svg.classList.toggle('labels-visible',1000/v.w>=8.5);
}
function zoomAt(factor,cx=state.view.x+state.view.w/2,cy=state.view.y+state.view.h/2){
  const v=state.view,nw=Math.max(55,Math.min(1000,v.w*factor)),nh=nw*0.76;
  const rx=(cx-v.x)/v.w,ry=(cy-v.y)/v.h;
  v.x=cx-rx*nw;v.y=cy-ry*nh;v.w=nw;v.h=nh;clampView();applyView();
}
function clampView(){
  const v=state.view;
  if(v.w>=1000){v.x=0;v.y=0;v.w=1000;v.h=760;return;}
  v.x=Math.max(0,Math.min(1000-v.w,v.x));v.y=Math.max(0,Math.min(760-v.h,v.y));
}
function screenToSvg(evt){
  const pt=svg.createSVGPoint();pt.x=evt.clientX;pt.y=evt.clientY;
  const q=pt.matrixTransform(svg.getScreenCTM().inverse());return [q.x,q.y];
}
$('zoomIn').onclick=()=>zoomAt(.72);
$('zoomOut').onclick=()=>zoomAt(1.38);
$('zoomReset').onclick=$('showAll').onclick=()=>{state.view={x:0,y:0,w:1000,h:760};applyView();};
svg.addEventListener('wheel',e=>{e.preventDefault();const p=screenToSvg(e);zoomAt(e.deltaY<0?.78:1.28,p[0],p[1]);},{passive:false});

function setMode(m){
  state.mode=m;
  ['toolClick','toolDraw'].forEach(id=>$(id).classList.remove('active'));
  $(m==='draw'?'toolDraw':'toolClick').classList.add('active');
}
$('toolClick').onclick=()=>setMode('click');
$('toolDraw').onclick=()=>setMode('draw');

let pointerDown=null;
svg.addEventListener('mousedown',e=>{
  if(state.mode==='draw'){
    state.drawing=true;state.drawPts=[screenToSvg(e)];drawLine.style.display='block';
    drawLine.setAttribute('points',state.drawPts.map(x=>x.join(',')).join(' '));return;
  }
  pointerDown={clientX:e.clientX,clientY:e.clientY,view:{...state.view}};
  dragged=false;svg.classList.add('panning');
});
svg.addEventListener('mousemove',e=>{
  if(state.drawing){
    const p=screenToSvg(e),last=state.drawPts.at(-1);
    if(Math.hypot(p[0]-last[0],p[1]-last[1])>2){
      state.drawPts.push(p);
      const closed=state.drawPts.length>2?[...state.drawPts,state.drawPts[0]]:state.drawPts;
      drawLine.setAttribute('points',closed.map(x=>x.join(',')).join(' '));
    }
    return;
  }
  if(pointerDown){
    const dx=e.clientX-pointerDown.clientX,dy=e.clientY-pointerDown.clientY;
    if(Math.hypot(dx,dy)>5)dragged=true;
    if(dragged){
      const r=svg.getBoundingClientRect();
      state.view.x=pointerDown.view.x-dx*pointerDown.view.w/r.width;
      state.view.y=pointerDown.view.y-dy*pointerDown.view.h/r.height;
      clampView();applyView();
    }
  }
});
window.addEventListener('mouseup',()=>{
  if(pointerDown){pointerDown=null;svg.classList.remove('panning');setTimeout(()=>{dragged=false;},0);}
  if(state.drawing){
    state.drawing=false;
    if(state.drawPts.length>=3){
      const a=state.drawPts[0],b=state.drawPts.at(-1);
      if(a[0]!==b[0]||a[1]!==b[1])state.drawPts.push(a);
      drawLine.setAttribute('points',state.drawPts.map(x=>x.join(',')).join(' '));
      GEO.features.forEach(f=>{if(featureIntersectsDraw(f,state.drawPts))state.selected.add(f.properties.nome);});
      updateSelection();
    }else drawLine.style.display='none';
    dragged=true;setMode('click');setTimeout(()=>{dragged=false;},50);
  }
});

function pointInPoly(p,poly){
  let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];
  if(((a[1]>p[1])!=(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]))c=!c;}return c;
}
function ccw(a,b,c){return(c[1]-a[1])*(b[0]-a[0])>(b[1]-a[1])*(c[0]-a[0]);}
function segInt(a,b,c,d){return ccw(a,c,d)!=ccw(b,c,d)&&ccw(a,b,c)!=ccw(a,b,d);}
function featureIntersectsDraw(f,draw){
  for(const ringLL of ringsOf(f)){
    const ring=ringLL.map(p=>xy(p[0],p[1]));
    for(const p of draw)if(pointInPoly(p,ring))return true;
    for(let i=0;i<ring.length;i+=Math.max(1,Math.floor(ring.length/30)))if(pointInPoly(ring[i],draw))return true;
    for(let i=0;i<draw.length-1;i++)for(let j=0;j<ring.length-1;j++)if(segInt(draw[i],draw[i+1],ring[j],ring[j+1]))return true;
  } return false;
}

/* ---------------- seleção e cores (vigente / perto de vencer / vencido) ---------------- */
function durationMinutes(dur){const[h,m]=dur.split(':').map(Number);return h*60+m;}
function expiryTimestamp(start,dur){
  const n=new Date(),[h,m]=start.split(':').map(Number);
  const s=new Date(n.getFullYear(),n.getMonth(),n.getDate(),h,m,0,0);
  if(s.getTime()<n.getTime()-12*60*60*1000)s.setDate(s.getDate()+1);
  return s.getTime()+durationMinutes(dur)*60*1000;
}
function classeDoAlerta(a,nowTs){
  if(!a.expiresAt)return 'alerted';
  const r=a.expiresAt-nowTs;
  return r<=0?'expired':(r<=30*60*1000?'expiring':'alerted');
}
const RANK={alerted:1,expiring:2,expired:3};
function pintarMapa(){
  const nowTs=Date.now(),cls=new Map();
  state.active.forEach(a=>{const c=classeDoAlerta(a,nowTs);a.cities.forEach(n=>{if(!cls.has(n)||RANK[c]>RANK[cls.get(n)])cls.set(n,c);});});
  pathByName.forEach((p,n)=>{
    p.classList.remove('selected','alerted','expiring','expired');
    if(state.selected.has(n))p.classList.add('selected');
    else if(cls.has(n))p.classList.add(cls.get(n));
  });
}
function atualizarCards(){
  const nowTs=Date.now();
  state.active.forEach(a=>{
    if(!a.cardEl)return;
    const c=classeDoAlerta(a,nowTs);
    a.cardEl.classList.toggle('expiring',c==='expiring');a.cardEl.classList.toggle('expired',c==='expired');
    const s=a.cardEl.querySelector('.alert-status');
    if(s)s.textContent=c==='expired'?'Prazo vencido':(c==='expiring'?'Perto de vencer':'Vigente');
  });
}
setInterval(()=>{pintarMapa();atualizarCards();},30000);

function toggleCity(name){state.selected.has(name)?state.selected.delete(name):state.selected.add(name);updateSelection();}
function updateSelection(){
  pintarMapa();
  const arr=[...state.selected].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  $('selCount').textContent=arr.length;
  $('selectedNames').textContent=arr.length?arr.join(', ')+'.':'Nenhum município selecionado.';
  $('create').disabled=!arr.length;
}
$('clear').onclick=()=>{state.selected.clear();drawLine.style.display='none';updateSelection();};
$('novo').onclick=()=>{state.selected.clear();drawLine.style.display='none';setMode('click');updateSelection();mostrarAba('mapa');};

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function showTip(ev,name){
  const a=state.active.find(x=>x.cities.includes(name));
  const f=featureByName.get(name),meso=f&&f.properties.meso?'<br>'+esc(f.properties.meso):'';
  tooltip.style.display='block';tooltip.style.left=(ev.clientX+12)+'px';tooltip.style.top=(ev.clientY+12)+'px';
  tooltip.innerHTML=a?`<b>${esc(name)}</b>${meso}<br>${esc(a.type)}<br>${esc(a.start)}–${esc(a.end)}<br>Responsável: ${esc(a.owner)}`:`<b>${esc(name)}</b>${meso}`;
}
function now(){const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function hojeLocal(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function dataBR(s){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');return m?m[3]+'/'+m[2]+'/'+m[1]:(s||'');}
function dateBr(){const d=new Date();return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getFullYear()).slice(-2);}
function endTime(start,dur){const[h,m]=start.split(':').map(Number),[dh,dm]=dur.split(':').map(Number),z=(h*60+m+dh*60+dm)%1440;return String(Math.floor(z/60)).padStart(2,'0')+':'+String(z%60).padStart(2,'0');}
function relogio(){$('clock').textContent=new Date().toLocaleDateString('pt-BR')+' '+now();}
relogio();setInterval(relogio,1000);

/* ---------------- janela do alerta ---------------- */
function textList(arr){if(arr.length===1)return arr[0];if(arr.length===2)return arr[0]+' e '+arr[1];return arr.slice(0,-1).join(', ')+' e '+arr.at(-1);}
function fenomenos(){return [...document.querySelectorAll('.phen:checked')].map(x=>x.value);}
function applyAlertPreset(){
  const type=$('type').value,boxes=[...document.querySelectorAll('.phen')];
  const vals=type==='Tempestade Severa'?['granizo','vendaval','chuva forte']:(type==='Tempestade'?['rajadas de vento','chuva moderada a forte']:[]);
  boxes.forEach(b=>b.checked=vals.includes(b.value));
  buildMessage();
}
function buildMessage(){
  const type=$('type').value,t=$('time').value,dur=$('duration').value,ph=fenomenos();
  const cities=[...state.selected].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  $('message').value=`Alerta de ${type}${ph.length?' com '+textList(ph):''} às ${t}h com duração de ${dur}h. Cidades: ${textList(cities)}. FONTE: SIMGE/IGAM`;
}
function emitStatus(texto,tipo){$('emitStatus').className='st'+(tipo?' '+tipo:'');$('emitStatus').textContent=texto;}
function openModal(){
  if(!state.selected.size)return;
  $('time').value=now();
  $('owner').value=$('pResp').value.trim();
  $('chips').innerHTML=[...state.selected].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(x=>`<span class="chip">${esc(x)}</span>`).join('');
  emitStatus('Ao emitir, o KML é salvo no Drive e o alerta entra na planilha.');
  $('kmlStatus').textContent='Sem preenchimento e com contorno vermelho fino, como o QGIS.';
  applyAlertPreset();$('modalback').style.display='flex';
}
$('create').onclick=openModal;
$('cancel').onclick=()=>$('modalback').style.display='none';
$('type').addEventListener('change',applyAlertPreset);
['duration','time'].forEach(id=>$(id).addEventListener('change',buildMessage));
document.querySelectorAll('.phen').forEach(x=>x.addEventListener('change',buildMessage));
$('copy').onclick=async()=>{
  try{await navigator.clipboard.writeText($('message').value);$('copy').textContent='Copiado!';}
  catch(e){$('message').select();$('copy').textContent='Selecionado, use Ctrl+C';}
  setTimeout(()=>$('copy').textContent='Copiar mensagem',1500);
};

/* ---------------- KML (contorno vermelho fino, sem preenchimento) ---------------- */
function escXml(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}
function coordString(ring){return ring.map(p=>`${p[0].toFixed(8)},${p[1].toFixed(8)}`).join(' ');}
function featureKml(f){
  const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  return polys.map(poly=>`<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordString(poly[0])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`).join('');
}
function kmlStamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return p(d.getHours())+'_'+p(d.getMinutes())+'_'+p(d.getSeconds());}
function montarKml(cities,folder){
  const placemarks=cities.map(name=>{
    const f=featureByName.get(name);
    return `<Placemark><name>${escXml(name)}</name><Style><LineStyle><color>ff0000ff</color><width>1</width></LineStyle><PolyStyle><fill>0</fill><outline>1</outline></PolyStyle></Style><MultiGeometry>${featureKml(f)}</MultiGeometry></Placemark>`;
  }).join('');
  const PI='<'+String.fromCharCode(63);   // escrito assim de propósito: o Apps Script lê menor-que + interrogação como código de modelo
  return `${PI}xml version="1.0" encoding="utf-8" ${String.fromCharCode(63)}><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><name>${folder}</name>${placemarks}</Folder></Document></kml>`;
}
function baixarKml(cities,folder){
  folder=folder||kmlStamp();
  const blob=new Blob([montarKml(cities,folder)],{type:'application/vnd.google-earth.kml+xml'});
  baixarLocal(folder+'.kml',blob);
  return blob.size;
}
$('downloadKml').onclick=()=>{
  const cities=[...state.selected].sort((a,b)=>a.localeCompare(b,'pt-BR'));if(!cities.length)return;
  const size=baixarKml(cities);
  $('kmlStatus').textContent=`KML baixado no PC • ${Math.max(1,Math.round(size/1024))} KB • contorno vermelho sem preenchimento`;
};

/* ---------------- registro diário (.txt) ---------------- */
$('downloadTxt').onclick=()=>{
  if(!state.dailyRows.length){alert('Ainda não há alertas emitidos neste plantão.');return;}
  const today=dateBr();
  const rows=state.dailyRows.filter(r=>r.date===today).map(r=>[r.date,r.time,r.duration,r.city].join('\t'));
  if(!rows.length){alert('Não há alertas registrados para hoje.');return;}
  baixarLocal('alertas_'+today.replaceAll('/','')+'.txt',new Blob([rows.join('\r\n')+'\r\n'],{type:'text/plain;charset=utf-8'}));
};

/* ---------------- emitir alerta: salva KML no Drive + linhas na planilha ---------------- */
$('emit').onclick=()=>{
  const cities=[...state.selected].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const start=$('time').value.trim(),dur=$('duration').value;
  if(!cities.length)return;
  if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test(start)){
    emitStatus('Horário inválido. Use o formato HH:MM, por exemplo 15:40.','erro');$('time').focus();return;
  }
  const folder=kmlStamp();
  const a={id:'',kmlUrl:'',type:$('type').value,owner:$('owner').value.trim()||$('pResp').value.trim()||'Sem identificação',
    start,end:endTime(start,dur),duration:dur,cities,phen:fenomenos(),message:$('message').value,folder};
  const payload={
    data:$('pData').value||hojeLocal(),horario:a.start,duracao:a.duration,fim:a.end,tipo:a.type,
    fenomenos:a.phen,responsavel:a.owner,mensagem:a.message,
    municipios:cities.map(n=>{const p=featureByName.get(n).properties;return{nome:n,meso:p.meso||'',lat:p.label_lat,lon:p.label_lon};}),
    kml:montarKml(cities,folder)
  };
  $('emit').disabled=true;emitStatus('Salvando o KML no Drive e o alerta na planilha…');
  google.script.run
    .withSuccessHandler(r=>{
      $('emit').disabled=false;
      a.id=(r&&r.id)||('local_'+Date.now());a.kmlUrl=(r&&r.kmlUrl)||'';
      a.meu=true;a.emitidoEm=Date.now();if(r&&r.plantaoId)state.plantaoId=r.plantaoId;
      a.expiresAt=expiryTimestamp(a.start,a.duration);
      a.linha=`${a.start}–${a.end} ${a.type}${a.phen.length?' ('+a.phen.join(', ')+')':''}: ${a.cities.join(', ')}`;
      if(r&&r.plantaoId)carregarContexto();
      state.active.unshift(a);
      const date=dateBr();
      cities.forEach(city=>state.dailyRows.push({alertId:a.id,date,time:a.start,duration:a.duration,city}));
      $('pAlertas').value=($('pAlertas').value.trim()?$('pAlertas').value.trim()+'\n':'')+a.linha;
      if(querPc())baixarKml(cities,folder);   // cópia local, como no att_alerta (opção "Baixar também no PC")
      state.selected.clear();drawLine.style.display='none';
      desenharAlertas();updateSelection();salvarRascunho();
      $('modalback').style.display='none';
      sincronizarAlertas();
    })
    .withFailureHandler(err=>{
      $('emit').disabled=false;
      emitStatus('Não foi possível emitir: '+(err&&err.message?err.message:err)+' O alerta não foi registrado na planilha.','erro');
      const b=document.createElement('button');b.type='button';b.className='btn small';b.textContent='Baixar o KML no PC mesmo assim';
      b.onclick=()=>{baixarKml(cities,folder);b.textContent='KML baixado';b.disabled=true;};
      $('emitStatus').appendChild(document.createElement('br'));$('emitStatus').appendChild(b);
    })
    .registrarAlerta(payload);
};

/* ---------------- cards dos alertas ---------------- */
function desenharAlertas(){
  const box=$('activeList');box.innerHTML='';
  if(!state.active.length)box.innerHTML='<p class="hint" style="margin:0">Nenhum alerta neste plantão.</p>';
  state.active.forEach(a=>{
    const card=document.createElement('div');card.className='alert-card';
    const meu=podeExcluir(a);
    card.innerHTML=`<b>${esc(a.type)}</b><div>${esc(a.start)}–${esc(a.end)} • ${esc(a.owner)}${meu?'':' (outro plantonista)'}</div><div class="alert-status">Vigente</div>`+
      `<div>${a.cities.length} município(s): ${esc(a.cities.join(', '))}</div>`+
      (/^https:\/\//.test(a.kmlUrl||'')?`<div><a href="${esc(a.kmlUrl)}" target="_blank" rel="noopener">Abrir KML no Drive</a></div>`:'')+
      `<div class="r"><button type="button" class="btn small download-kml">Baixar KML no PC</button>`+(meu?`<button type="button" class="btn small ghost delete-alert" style="color:var(--err)">Excluir alerta</button>`:'')+`</div>`;
    card.querySelector('.download-kml').onclick=()=>baixarKml(a.cities,a.folder);
    if(meu)card.querySelector('.delete-alert').onclick=()=>{if(confirmarExclusao(a))deleteAlert(a);};
    a.cardEl=card;box.appendChild(card);
  });
  $('activeCount').textContent=state.active.length;
  atualizarCards();
  agendarRelatorio(true);
}
function confirmarExclusao(a){
  return confirm(`Excluir o alerta emitido às ${a.start}?\n\n`+
    `Ele é apagado da planilha (aba Alertas), o KML vai para a lixeira do Drive (recuperável por 30 dias) `+
    `e ele sai do mapa, da lista, do .txt, do campo "Alertas gerados" e do mapa do relatório em PDF.`);
}
/* Tira o alerta só desta tela (mapa, lista, .txt, "Alertas gerados" e rascunho). */
function removerAlertaDaTela(a){
  const idx=state.active.indexOf(a);if(idx===-1)return;
  state.active.splice(idx,1);
  if(a.id)state.dailyRows=state.dailyRows.filter(r=>r.alertId!==a.id);
  if(a.linha)$('pAlertas').value=$('pAlertas').value.split('\n').filter(l=>l.trim()!==a.linha).join('\n');
  desenharAlertas();updateSelection();salvarRascunho();
}
/* Exclui na planilha e no Drive (excluirAlerta no Apps Script) e, se der certo, na tela. */
function deleteAlert(a){
  if(!a.id||/^local_/.test(a.id)){removerAlertaDaTela(a);return;}   // nunca chegou à planilha
  const btn=a.cardEl&&a.cardEl.querySelector('.delete-alert');
  if(btn){btn.disabled=true;btn.textContent='Excluindo…';}
  google.script.run
    .withSuccessHandler(r=>{
      removerAlertaDaTela(a);sincronizarAlertas();
      if(r&&!r.kmlNaLixeira)alert('Alerta excluído da planilha, mas o KML não pôde ir para a lixeira. Se precisar, apague-o na pasta de alertas do Drive.');
    })
    .withFailureHandler(err=>{
      if(btn){btn.disabled=false;btn.textContent='Excluir alerta';}
      const msg=err&&err.message?err.message:err;
      if(confirm('Não foi possível excluir na planilha: '+msg+'\n\nQuer remover o alerta só desta tela?'))removerAlertaDaTela(a);
    })
    .excluirAlerta(a.id);
}
$('undoLastAlert').onclick=()=>{
  if(!state.active.length){alert('Não há alertas emitidos para desfazer.');return;}
  const last=state.active.find(podeExcluir);
  if(!last){alert('Não há alertas seus para desfazer. Alertas de outros plantonistas só podem ser excluídos por quem emitiu.');return;}
  if(confirmarExclusao(last))deleteAlert(last);
};

$('findCity').onclick=()=>{
  const q=$('searchCity').value.trim().toLocaleLowerCase('pt-BR');if(!q)return;
  const f=GEO.features.find(x=>x.properties.nome.toLocaleLowerCase('pt-BR').includes(q));
  if(!f){$('searchCity').setCustomValidity('Município não encontrado.');$('searchCity').reportValidity();setTimeout(()=>$('searchCity').setCustomValidity(''),1500);return;}
  state.selected.add(f.properties.nome);updateSelection();
  const c=xy(f.properties.label_lon,f.properties.label_lat);state.view={x:Math.max(0,c[0]-120),y:Math.max(0,c[1]-91),w:240,h:182.4};clampView();applyView();
};
$('searchCity').addEventListener('keydown',e=>{if(e.key==='Enter')$('findCity').click();});

/* ---------------- transparências ---------------- */
function aplicarLimites(){const v=Number($('boundaryOpacity').value)/100;pathByName.forEach(p=>p.style.strokeOpacity=v);}
$('boundaryOpacity').addEventListener('input',()=>{$('boundaryOpacityVal').textContent=$('boundaryOpacity').value+'%';aplicarLimites();});
$('satOpacity').addEventListener('input',()=>{
  WX.satOpacity=Number($('satOpacity').value)/100;$('satOpacityVal').textContent=$('satOpacity').value+'%';
  irLayer.style.opacity=WX.satOpacity;visLayer.style.opacity=WX.satOpacity;
});
$('glmOpacity').addEventListener('input',()=>{
  WX.glmOpacity=Number($('glmOpacity').value)/100;$('glmOpacityVal').textContent=$('glmOpacity').value+'%';
  glmLayer.style.opacity=WX.glmOpacity;
});

/* ---------------- abas ---------------- */
function mostrarAba(qual){
  const mapa=qual==='mapa';
  $('abaMapa').setAttribute('aria-selected',mapa);$('abaPlantao').setAttribute('aria-selected',!mapa);
  $('viewMapa').hidden=!mapa;$('viewPlantao').hidden=mapa;
  document.querySelectorAll('.actions [data-view]').forEach(b=>b.hidden=b.dataset.view!==qual);
  tooltip.style.display='none';
  if(!mapa)agendarRelatorio(true);
  try{sessionStorage.setItem('alertas:aba',qual);}catch(e){}
}
$('abaMapa').onclick=()=>mostrarAba('mapa');
$('abaPlantao').onclick=()=>mostrarAba('plantao');
document.querySelector('.tabs').addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const to=$('viewPlantao').hidden?'plantao':'mapa';mostrarAba(to);$(to==='mapa'?'abaMapa':'abaPlantao').focus();}});

/* ---------------- Mapa de Previsões (imagem do formulário) ---------------- */
let mapaPrevisoesB64='',mapaPrev={url:'',w:0,h:0};
function limparMapaPrevisoes(){mapaPrevisoesB64='';mapaPrev={url:'',w:0,h:0};$('pMapaPrev').value='';$('pMapaPrevInfo').textContent='Sai no relatório em PDF, embaixo do mapa de alertas.';agendarRelatorio();}
$('pMapaPrev').onchange=()=>{
  const f=$('pMapaPrev').files[0];mapaPrevisoesB64='';mapaPrev={url:'',w:0,h:0};
  if(!f){limparMapaPrevisoes();return;}
  if(f.type!=='image/png'&&!/\.png$/i.test(f.name)){limparMapaPrevisoes();$('pMapaPrevInfo').textContent='Envie uma imagem PNG.';return;}
  if(f.size>8*1024*1024){limparMapaPrevisoes();$('pMapaPrevInfo').textContent='Imagem grande demais (máximo de 8 MB).';return;}
  const r=new FileReader();
  r.onload=()=>{
    const url=String(r.result);mapaPrevisoesB64=url.split(',')[1]||'';
    const img=new Image();
    img.onload=()=>{mapaPrev={url,w:img.naturalWidth,h:img.naturalHeight};$('pMapaPrevInfo').textContent='Imagem pronta: '+f.name+' ('+Math.round(f.size/1024)+' KB).';agendarRelatorio();};
    img.onerror=()=>{limparMapaPrevisoes();$('pMapaPrevInfo').textContent='Não foi possível ler a imagem.';};
    img.src=url;
  };
  r.onerror=()=>{limparMapaPrevisoes();$('pMapaPrevInfo').textContent='Não foi possível ler a imagem.';};
  r.readAsDataURL(f);
};

/* ---------------- plantão ---------------- */
const CAMPOS_PLANTAO={responsavel:'pResp',data:'pData',inicio:'pInicio',fim:'pFim',intercorrencias:'pInter',alertas:'pAlertas',ferramentas:'pFerr',passagem:'pPassagem'};

function salvarRascunho(){
  try{
    const active=state.active.map(a=>{const c={...a};delete c.cardEl;return c;});
    const r={campos:{},active,dailyRows:state.dailyRows,plantaoId:state.plantaoId,salvoEm:new Date().toISOString()};
    Object.entries(CAMPOS_PLANTAO).forEach(([k,id])=>r.campos[k]=$(id).value);
    localStorage.setItem(CHAVE_RASCUNHO,JSON.stringify(r));
    $('rascunhoInfo').textContent='Rascunho guardado neste navegador às '+now()+'.';
  }catch(e){}
}
function carregarRascunho(){
  try{
    const r=JSON.parse(localStorage.getItem(CHAVE_RASCUNHO)||'null');if(!r)return false;
    Object.entries(CAMPOS_PLANTAO).forEach(([k,id])=>{if(r.campos&&r.campos[k]!=null)$(id).value=r.campos[k];});
    if(Array.isArray(r.active))state.active=r.active.filter(a=>a&&Array.isArray(a.cities));
    if(Array.isArray(r.dailyRows))state.dailyRows=r.dailyRows;
    if(r.plantaoId)state.plantaoId=r.plantaoId;
    $('rascunhoInfo').textContent='Rascunho recuperado deste navegador.';
    return true;
  }catch(e){return false;}
}
function apagarRascunho(){try{localStorage.removeItem(CHAVE_RASCUNHO);}catch(e){}$('rascunhoInfo').textContent='';}
Object.values(CAMPOS_PLANTAO).forEach(id=>$(id).addEventListener('input',()=>{clearTimeout(window._tRasc);window._tRasc=setTimeout(salvarRascunho,600);agendarRelatorio();}));
$('pResp').addEventListener('change',()=>{$('quem').textContent=$('pResp').value.trim()||$('quem').dataset.email||'';});

function mostrarAnterior(u){
  const box=$('anterior');box.innerHTML='';
  if(!u){box.innerHTML='<p class="meta2">Nenhuma passagem de plantão salva ainda.</p>';return;}
  let meta=(u.responsavel||'Responsável não informado')+', '+dataBR(u.data);
  if(u.inicio||u.fim)meta+=', das '+(u.inicio||'?')+' às '+(u.fim||'?');
  box.innerHTML=`<p class="meta2">${esc(meta)}</p><div class="passagem"><strong>Áreas suscetíveis e pendências</strong>${esc(u.passagem||'Nada registrado.')}</div>`;
  const det=document.createElement('details');
  det.innerHTML='<summary>Ver o resto do plantão anterior</summary>'+
    [['Intercorrências',u.intercorrencias],['Alertas gerados',u.alertas],['Ferramentas usadas',u.ferramentas]]
      .filter(x=>x[1]).map(x=>`<b>${x[0]}</b><p>${esc(x[1])}</p>`).join('');
  if(det.querySelector('b'))box.appendChild(det);
}
function mostrarIdPlantao(p){
  const el=$('idPlantao');
  if(p&&p.id){el.innerHTML='ID do plantão em andamento: <b>'+esc(p.id)+'</b>'+(p.iniciadoEm?'<br>Iniciado em '+esc(p.iniciadoEm):'');}
  else{el.textContent='Novo plantão. O ID é criado no primeiro alerta ou na passagem salva, e liga tudo na planilha.';}
  agendarRelatorio();
}
function status(texto,tipo){const el=$('statusPlantao');el.className='st'+(tipo?' '+tipo:'');el.textContent=texto;}

/* ===================== RELATÓRIO DO PLANTÃO EM PDF (A4) =====================
 * Mesmo conteúdo do relatório anterior (Google Docs), agora montado no navegador
 * como o boletim da Previsão diária: prévia ao vivo à direita e PDF gerado com jsPDF.
 * Conteúdo: título, ID, data de geração, tabela "Dados do Plantão" (campos, contagens
 * e link da pasta), mapa com os municípios alertados e, se enviado, o Mapa de Previsões.
 * Todo o texto sai em preto.
 */
const A4={w:210,h:297,m:14.8};          // 42 pt de margem, como antes
const PT=25.4/72;                         // 1 pt em mm
const REL_COL0=150*PT;                    // 1ª coluna da tabela: 150 pt, como antes
const REL_TEXTO='#000000';
const REL_BORDA='#c9d3dc', REL_DESTAQUE='#eef3f7';

// caracteres que as fontes-padrão do PDF não têm viram equivalentes (como na Previsão)
const WINANSI_EXTRA='€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function pdfSafe(t){
  return String(t==null?'':t).replace(/[   ]/g,' ').replace(/[‐‑‒−]/g,'-').replace(/\r/g,'')
    .replace(/[^\n\x20-\xFF]/g,c=>WINANSI_EXTRA.indexOf(c)>=0?c:'?');
}
let _relDoc=null;const _relCtx=document.createElement('canvas').getContext('2d');
function medidor(){
  if(!_relDoc&&window.jspdf)_relDoc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
  return (txt,pt,bold)=>{
    if(_relDoc){_relDoc.setFont('helvetica',bold?'bold':'normal');_relDoc.setFontSize(pt);return _relDoc.getTextWidth(txt);}
    _relCtx.font=`${bold?700:400} 100px Helvetica, Arial, sans-serif`;return _relCtx.measureText(txt).width*pt*PT/100;
  };
}
/* quebra o texto em linhas que cabem na largura (respeita as quebras de linha do usuário) */
function quebrar(texto,larg,pt,bold,M){
  const out=[];
  pdfSafe(texto).split('\n').forEach(par=>{
    const palavras=par.split(/ +/).filter(Boolean);
    if(!palavras.length){out.push('');return;}
    let cur='';
    palavras.forEach(p=>{
      while(M(p,pt,bold)>larg&&p.length>1){                // palavra maior que a linha: corta
        let n=p.length;while(n>1&&M(p.slice(0,n),pt,bold)>larg)n--;
        if(cur){out.push(cur);cur='';}
        out.push(p.slice(0,n));p=p.slice(n);
      }
      const t=cur?cur+' '+p:p;
      if(cur&&M(t,pt,bold)>larg){out.push(cur);cur=p;}else cur=t;
    });
    out.push(cur);
  });
  while(out.length>1&&out[out.length-1]==='')out.pop();
  return out.length?out:[''];
}
function dataHoraBR(d){const p=n=>String(n).padStart(2,'0');return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes());}
function carimbo(d){const p=n=>String(n).padStart(2,'0');return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds());}

/* dados do relatório a partir do formulário e dos alertas na tela */
function dadosRelatorio(){
  const c={};Object.entries(CAMPOS_PLANTAO).forEach(([k,id])=>c[k]=$(id).value);
  const ids=new Set(state.active.map(a=>a.id).filter(Boolean));
  return {id:state.plantaoId||'',geradoEm:new Date(),campos:c,nAlertas:ids.size,
    nArquivos:1+(mapaPrev.url?1:0),pastaUrl:state.pastaUrl||'',mapa:'',prev:mapaPrev.url?{...mapaPrev}:null};
}
function linhasDaTabela(d){
  const c=d.campos;
  return [
    ['ID do plantão',d.id||'(criado ao salvar)'],
    ['Responsável',c.responsavel],['Data do plantão',dataBR(c.data)],['Início',c.inicio],['Fim',c.fim],
    ['Intercorrências',c.intercorrencias],['Ferramentas usadas',c.ferramentas],['Alertas gerados',c.alertas],
    ['Passagem de plantão (áreas suscetíveis e pendências)',c.passagem],
    ['Nº de alertas',String(d.nAlertas)],['Nº de arquivos',String(d.nArquivos)],
    ['Link de acesso',d.pastaUrl,true]
  ].map(([k,v,link])=>[k,String(v==null?'':v).trim()||'—',!!link&&/^https:\/\//.test(v||'')]);
}
/* monta as páginas: lista de itens {k:'t'|'rect'|'img'|'line'} em milímetros */
function layoutRelatorio(d){
  const M=medidor(),Wt=A4.w-2*A4.m,pages=[[]];
  let pg=pages[0],y=A4.m;
  const nova=()=>{pg=[];pages.push(pg);y=A4.m;};
  const fundo=A4.h-A4.m;
  const texto=(t,pt,b,antes)=>{
    const lh=pt*PT*1.32;y+=antes||0;
    quebrar(t,Wt,pt,b,M).forEach(l=>{if(y+lh>fundo)nova();y+=lh;pg.push({k:'t',t:l,x:A4.m,y:y-lh*0.24,pt,b});});
  };
  const secao=t=>{texto(t,13,true,5);y+=1.2;};
  texto('Relatório do Monitoramento Meteorológico',16,true);
  texto('ID do plantão: '+(d.id||'(criado ao salvar)'),10,true,2);
  texto('Gerado em '+dataHoraBR(d.geradoEm),9,false,0.6);
  secao('Dados do Plantão');
  // tabela chave/valor
  const pt=9,lh=pt*PT*1.25,px=4*PT,py=2*PT,c0=REL_COL0,c1=Wt-c0;
  linhasDaTabela(d).forEach(([k,v,link])=>{
    const l0=quebrar(k,c0-2*px,pt,true,M),l1=quebrar(v,c1-2*px,pt,false,M),n=Math.max(l0.length,l1.length);
    let i=0;
    while(i<n){
      const cabem=Math.floor((fundo-y-2*py)/lh);
      if(cabem<1){nova();continue;}
      const q=Math.min(cabem,n-i),h=q*lh+2*py;
      pg.push({k:'rect',x:A4.m,y,w:c0,h,fill:REL_DESTAQUE});
      pg.push({k:'rect',x:A4.m+c0,y,w:c1,h,fill:null});
      for(let j=0;j<q;j++){
        const by=y+py+(j+1)*lh-lh*0.26;
        if(l0[i+j])pg.push({k:'t',t:l0[i+j],x:A4.m+px,y:by,pt,b:true});
        if(l1[i+j]){
          const it={k:'t',t:l1[i+j],x:A4.m+c0+px,y:by,pt,b:false};
          if(link){it.link=v;it.u=true;}
          pg.push(it);
        }
      }
      y+=h;i+=q;
    }
  });
  // mapa dos alertas
  const mh=Wt*760/1000;
  if(d.mapa){y+=3;if(y+mh>fundo)nova();pg.push({k:'img',src:d.mapa,fmt:'PNG',x:A4.m,y,w:Wt,h:mh});y+=mh;}
  else texto(d.mapaPendente?'Gerando a imagem do mapa…':'Mapa não disponível (não foi possível capturar a imagem do mapa).',10,false,3);
  // Mapa de Previsões
  if(d.prev&&d.prev.url&&d.prev.w&&d.prev.h){
    secao('Mapa de Previsões');
    const maxH=A4.h-2*A4.m-60*PT,k=Math.min(Wt/d.prev.w,maxH/d.prev.h),w=d.prev.w*k,h=d.prev.h*k;
    if(y+h>fundo)nova();
    pg.push({k:'img',src:d.prev.url,fmt:'PNG',x:A4.m+(Wt-w)/2,y,w,h});y+=h;
  }
  return pages;
}
const f2=n=>(Math.round(n*100)/100).toString();
function paginaSvg(page){
  const o=[`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${A4.w} ${A4.h}"><rect width="${A4.w}" height="${A4.h}" fill="#fff"/>`];
  page.forEach(it=>{
    if(it.k==='rect')o.push(`<rect x="${f2(it.x)}" y="${f2(it.y)}" width="${f2(it.w)}" height="${f2(it.h)}" fill="${it.fill||'none'}" stroke="${REL_BORDA}" stroke-width="0.18"/>`);
    else if(it.k==='img')o.push(`<image href="${it.src}" xlink:href="${it.src}" x="${f2(it.x)}" y="${f2(it.y)}" width="${f2(it.w)}" height="${f2(it.h)}" preserveAspectRatio="none"/>`);
    else{
      o.push(`<text x="${f2(it.x)}" y="${f2(it.y)}" font-family="Helvetica, Arial, sans-serif" font-size="${f2(it.pt*PT)}" font-weight="${it.b?700:400}" fill="${REL_TEXTO}"${it.u?' text-decoration="underline"':''}>${esc(it.t)}</text>`);
    }
  });
  o.push('</svg>');return o.join('');
}
function hexRgb(h){const n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255];}
function gerarPdf(d){
  if(!(window.jspdf&&window.jspdf.jsPDF))throw new Error('A biblioteca de PDF (jspdf) ainda não carregou. Aguarde alguns segundos ou recarregue a página.');
  const pages=layoutRelatorio(d);
  const pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  pages.forEach((pg,i)=>{
    if(i)pdf.addPage('a4','portrait');
    pg.forEach(it=>{
      if(it.k==='rect'){
        pdf.setDrawColor(...hexRgb(REL_BORDA));pdf.setLineWidth(0.18);
        if(it.fill){pdf.setFillColor(...hexRgb(it.fill));pdf.rect(it.x,it.y,it.w,it.h,'FD');}else pdf.rect(it.x,it.y,it.w,it.h,'S');
      }else if(it.k==='img')pdf.addImage(it.src,it.fmt||'PNG',it.x,it.y,it.w,it.h,undefined,'FAST');
      else{
        pdf.setFont('helvetica',it.b?'bold':'normal');pdf.setFontSize(it.pt);pdf.setTextColor(0,0,0);
        pdf.text(it.t,it.x,it.y);
        if(it.u){const w=pdf.getTextWidth(it.t);pdf.setDrawColor(0,0,0);pdf.setLineWidth(0.15);pdf.line(it.x,it.y+0.5,it.x+w,it.y+0.5);}
        if(it.link){const w=pdf.getTextWidth(it.t);pdf.link(it.x,it.y-it.pt*PT,w,it.pt*PT*1.3,{url:it.link});}
      }
    });
  });
  pdf.setProperties({title:'Relatório do Monitoramento Meteorológico'+(d.id?' - '+d.id:''),author:'SIMGE/IGAM',creator:'Alertas SIMGE '+(window.VERSAO_APP||'')});
  return {blob:pdf.output('blob'),paginas:pages.length};
}

/* ---- imagem do mapa: Minas inteira, sem seleção nem nomes, municípios alertados em amarelo ---- */
const PROPS_SVG=['fill','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-dasharray',
  'stroke-linejoin','stroke-linecap','opacity','display','visibility','font-family','font-size',
  'font-weight','text-anchor','dominant-baseline','paint-order'];
function fotografarMapa(nomes){
  const L=2000,A=1520;                                   // viewBox 0 0 1000 760, em dobro
  const copia=svg.cloneNode(true);
  copia.removeAttribute('id');copia.setAttribute('viewBox','0 0 1000 760');
  copia.classList.remove('labels-visible','panning');
  [].forEach.call(copia.querySelectorAll('#wxBaseLayer, .drawline'),el=>el.remove());
  [].forEach.call(copia.querySelectorAll('[data-name]'),p=>{
    p.classList.remove('selected','alerted','expiring','expired');
    if(nomes.has(p.getAttribute('data-name')))p.classList.add('alerted');
  });
  const caixa=document.createElement('div');
  caixa.style.cssText='position:fixed;left:-20000px;top:0;width:1000px;height:760px;pointer-events:none';
  caixa.appendChild(copia);document.body.appendChild(caixa);
  let xml;
  try{
    [copia].concat([].slice.call(copia.querySelectorAll('*'))).forEach(el=>{
      const cs=getComputedStyle(el);let txt='';
      PROPS_SVG.forEach(k=>{const v=cs.getPropertyValue(k);if(v)txt+=k+':'+v+';';});
      el.setAttribute('style',txt);
    });
    copia.setAttribute('style','');copia.setAttribute('xmlns','http://www.w3.org/2000/svg');
    copia.setAttribute('width',L);copia.setAttribute('height',A);
    xml=new XMLSerializer().serializeToString(copia);
  }finally{caixa.remove();}
  return new Promise(ok=>{
    const img=new Image(),url=URL.createObjectURL(new Blob([xml],{type:'image/svg+xml'}));
    const fim=v=>{URL.revokeObjectURL(url);ok(v);};
    img.onload=()=>{
      try{const c=document.createElement('canvas');c.width=L;c.height=A;const g=c.getContext('2d');
        g.fillStyle='#ffffff';g.fillRect(0,0,L,A);g.drawImage(img,0,0,L,A);fim(c.toDataURL('image/png'));}
      catch(e){fim('');}
    };
    img.onerror=()=>fim('');
    img.src=url;
  });
}
function municipiosAlertados(){const s=new Set();state.active.forEach(a=>(a.cities||[]).forEach(n=>s.add(n)));return s;}
let mapaCache={chave:null,url:''};
async function mapaDoRelatorio(nomes,forcar){
  const chave=[...nomes].sort().join('|');
  if(mapaCache.chave===chave&&(mapaCache.url||!forcar))return mapaCache.url;
  let url='';
  try{url=await Promise.race([fotografarMapa(nomes),new Promise(ok=>setTimeout(()=>ok(''),20000))]);}catch(e){url='';}
  mapaCache={chave,url};           // guarda também a falha, para a prévia não tentar sem parar
  return url;
}

/* ---- prévia ao vivo ---- */
let relT=0;
function agendarRelatorio(comMapa){
  if($('viewPlantao').hidden)return;
  clearTimeout(relT);
  relT=setTimeout(()=>desenharRelatorio(comMapa),comMapa?250:150);
}
async function desenharRelatorio(){
  const d=dadosRelatorio();
  const nomes=municipiosAlertados(),chave=[...nomes].sort().join('|');
  if(mapaCache.chave===chave)d.mapa=mapaCache.url;
  else{d.mapaPendente=true;mapaDoRelatorio(nomes).then(()=>agendarRelatorio());}
  const pages=layoutRelatorio(d);
  $('relPages').innerHTML=pages.map((p,i)=>`<div class="a4" aria-label="Página ${i+1}">${paginaSvg(p)}</div>${pages.length>1?`<div class="pgnum">Página ${i+1} de ${pages.length}</div>`:''}`).join('');
  $('relInfo').textContent=`210 × 297 mm · ${pages.length} página${pages.length>1?'s':''}. Prévia do PDF que é salvo no Drive ao salvar a passagem.`;
}
function relMsg(tipo,html){const m=$('relMsg');m.className='msg '+tipo;m.innerHTML=html;m.hidden=false;}

/* ---- "Baixar PDF no PC": prévia atual, sem salvar a passagem ---- */
$('baixarRel').onclick=async()=>{
  const btn=$('baixarRel');btn.classList.add('busy');
  try{
    const d=dadosRelatorio();d.mapa=await mapaDoRelatorio(municipiosAlertados(),true);
    await Promise.race([window.alertasJsPdf,new Promise(ok=>setTimeout(ok,15000))]).catch(()=>{});
    const r=gerarPdf(d);
    baixarLocal(carimbo(d.geradoEm)+'_relatorio_plantao_'+(d.id||'previa')+'.pdf',r.blob);
    relMsg('ok','PDF baixado no PC ('+r.paginas+' página'+(r.paginas>1?'s':'')+'). Ele <b>não</b> foi salvo no Drive nem encerra o plantão.');
  }catch(e){relMsg('err','Não foi possível gerar o PDF: '+esc(e&&e.message||e));}
  finally{btn.classList.remove('busy');}
};

/* ---- relatório final: depois de salvar a passagem, gera o PDF, manda para o Drive e (opcional) baixa no PC ---- */
let ultimoRelatorio=null;
async function relatorioFinal(snap,nomesLocais){
  aviso('Gerando o relatório do plantão <b>'+esc(snap.id)+'</b> em PDF…');
  const nomes=new Set(nomesLocais||[]);
  if(temServidor){
    await new Promise(ok=>google.script.run.withSuccessHandler(l=>{(l||[]).forEach(n=>nomes.add(n));ok();}).withFailureHandler(()=>ok()).municipiosDoPlantao(snap.id));
  }
  snap.mapa=await mapaDoRelatorio(nomes,true);
  await Promise.race([window.alertasJsPdf,new Promise(ok=>setTimeout(ok,15000))]).catch(()=>{});
  let r;
  try{r=gerarPdf(snap);}catch(e){aviso('A passagem foi salva, mas o PDF não pôde ser gerado: '+esc(e&&e.message||e),true);return;}
  const nome=carimbo(snap.geradoEm)+'_relatorio_plantao_'+snap.id+'.pdf';
  ultimoRelatorio={nome,blob:r.blob};
  const pc=()=>baixarLocal(nome,r.blob);
  const jaBaixou=querPc();if(jaBaixou)pc();
  const b64=await new Promise((ok,no)=>{const fr=new FileReader();fr.onload=()=>ok(String(fr.result).split(',')[1]||'');fr.onerror=no;fr.readAsDataURL(r.blob);});
  google.script.run
    .withSuccessHandler(s=>{
      const url=/^https:\/\//.test(s&&s.url)?s.url:'#';
      aviso('Relatório salvo no Drive: <a href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(s&&s.nome||nome)+'</a>'+
        (snap.mapa?'':'<br>(sem a imagem do mapa)')+(jaBaixou?'<br>Cópia baixada no PC.':''),false,jaBaixou?[]:[['Baixar no PC',pc]]);
    })
    .withFailureHandler(e=>{
      if(!jaBaixou)pc();
      aviso('A passagem foi salva, mas o relatório não foi para o Drive ('+esc(e&&e.message?e.message:e)+').<br><b>O PDF foi baixado no PC</b> — confira a pasta Downloads.',true,[['Baixar de novo',pc]]);
    })
    .salvarRelatorioPlantao(snap.id,nome,b64,snap.prevB64||'');
}

$('salvarPlantao').onclick=()=>{
  const d={};Object.entries(CAMPOS_PLANTAO).forEach(([k,id])=>d[k]=$(id).value);
  if(!d.responsavel.trim()){status('Preencha o campo "Responsável".','erro');$('pResp').focus();return;}
  if(!d.data){status('Preencha a data do plantão.','erro');$('pData').focus();return;}
  d.alertaIds=state.active.map(a=>a.id).filter(id=>id&&!/^local_/.test(id));
  d.kmls=state.active.map(a=>a.kmlUrl).filter(Boolean);
  const snap=dadosRelatorio();snap.prevB64=mapaPrevisoesB64;     // retrato do formulário antes de limpar
  const nomesLocais=[...municipiosAlertados()];
  $('salvarPlantao').disabled=true;status('Salvando a passagem de plantão…');
  google.script.run
    .withSuccessHandler(r=>{
      $('salvarPlantao').disabled=false;
      snap.id=(r&&r.id)||snap.id;snap.geradoEm=new Date();
      if(r&&r.alertas!=null)snap.nAlertas=r.alertas;
      if(r&&r.arquivos!=null)snap.nArquivos=r.arquivos+1+(snap.prev?1:0);   // + relatório (+ mapa de previsões)
      Object.values(CAMPOS_PLANTAO).forEach(id=>$(id).value='');
      $('pData').value=hojeLocal();
      state.active=[];state.dailyRows=[];state.plantaoId='';state.selected.clear();desenharAlertas();updateSelection();apagarRascunho();
      status('Passagem do plantão '+(snap.id||'')+' salva. O próximo plantonista verá este registro ao abrir.','ok');
      carregarContexto();
      limparMapaPrevisoes();
      relatorioFinal(snap,nomesLocais);
    })
    .withFailureHandler(err=>{
      $('salvarPlantao').disabled=false;
      status('Não foi possível salvar: '+(err&&err.message?err.message:err)+' Seus dados continuam aqui. Se precisar, use “Baixar PDF no PC”.','erro');
    })
    .salvarPlantao(d);
};

function carregarContexto(){
  google.script.run
    .withSuccessHandler(ctx=>{
      $('quem').dataset.email=ctx.email||'';
      $('quem').textContent=$('pResp').value.trim()||ctx.email||'';$('quem2').textContent=ctx.email||'—';
      if(ctx.pastaAlertasUrl)state.pastaUrl=ctx.pastaAlertasUrl;
      mostrarAnterior(ctx.ultimo);
      mostrarIdPlantao(ctx.plantaoAtual);
    })
    .withFailureHandler(err=>{
      $('quem').textContent='';
      $('anterior').innerHTML='<p class="meta2">Não foi possível carregar o plantão anterior: '+esc(err&&err.message?err.message:err)+'</p>';
    })
    .obterContexto();
}

/* ---------------- vários plantonistas no mesmo plantão ---------------- */
function podeExcluir(a){
  if(a.meu)return true;
  return !!(a.email&&state.meuEmail&&a.email===state.meuEmail);
}
function hhmm(s){const m=/(\d{1,2}):(\d{2})/.exec(String(s||''));return m?m[1].padStart(2,'0')+':'+m[2]:'';}
/* Fim do alerta a partir do "Registrado em" (dd/mm/aaaa HH:mm) da planilha. */
function expiraEm(registradoEm,start,dur){
  const m=/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/.exec(String(registradoEm||''));
  if(!m||!start)return start?expiryTimestamp(start,dur):0;
  const reg=new Date(+m[3],m[2]-1,+m[1],+m[4],+m[5]).getTime();
  const[h,mi]=start.split(':').map(Number),d=new Date(+m[3],m[2]-1,+m[1],h,mi,0,0);
  let ini=d.getTime();
  if(ini-reg>12*3600000)ini-=86400000; else if(reg-ini>12*3600000)ini+=86400000;   // alerta perto da meia-noite
  return ini+durationMinutes(dur||'02:00')*60000;
}
let sincronizando=false;
/* Busca na planilha os alertas de toda a equipe no plantão em andamento. */
function sincronizarAlertas(){
  if(sincronizando||!temServidor)return;
  sincronizando=true;
  google.script.run
    .withSuccessHandler(r=>{
      sincronizando=false;if(!r)return;
      if(r.email)state.meuEmail=String(r.email).toLowerCase();
      const antes=state.plantaoId,agora=r.plantaoId||'';
      const locais=new Map(state.active.map(a=>[a.id,a]));
      const lista=(r.alertas||[]).map(sv=>{
        const l=locais.get(sv.id)||{};
        const start=hhmm(sv.start)||l.start||'',duration=hhmm(sv.duration)||l.duration||'02:00';
        return Object.assign({},l,{
          id:sv.id,kmlUrl:sv.kmlUrl||l.kmlUrl||'',type:sv.type||l.type||'',
          owner:sv.owner||l.owner||sv.email||'',email:String(sv.email||'').toLowerCase(),
          start,duration,end:hhmm(sv.end)||l.end||(start?endTime(start,duration):''),
          cities:(sv.cities&&sv.cities.length)?sv.cities:(l.cities||[]),
          phen:l.phen||String(sv.phen||'').split(',').map(x=>x.trim()).filter(Boolean),
          expiresAt:l.expiresAt||expiraEm(sv.registradoEm,start,duration),
          folder:l.folder||'',meu:!!l.meu
        });
      });
      const ids=new Set(lista.map(a=>a.id));
      // Fica na tela o que não está na planilha só se nunca chegou lá ou se acabou de ser emitido.
      const sobras=state.active.filter(a=>!ids.has(a.id));
      const manter=sobras.filter(a=>/^local_/.test(a.id||'')||(a.emitidoEm&&Date.now()-a.emitidoEm<120000));
      const encerradoPorOutro=!!antes&&antes!==agora;
      sobras.filter(a=>manter.indexOf(a)<0&&a.linha).forEach(a=>{
        $('pAlertas').value=$('pAlertas').value.split('\n').filter(x=>x.trim()!==a.linha).join('\n');
      });
      state.active=lista.concat(manter).sort((x,y)=>(y.expiresAt||0)-(x.expiresAt||0));
      state.plantaoId=agora;
      if(antes!==agora)mostrarIdPlantao(agora?{id:agora,iniciadoEm:r.iniciadoEm}:null);
      if(encerradoPorOutro){
        status('O plantão '+antes+' foi encerrado por outro plantonista. Os alertas dele já estão no relatório; '+
          (agora?'os novos alertas entram no plantão '+agora+'.':'o próximo alerta abre um plantão novo.'),'ok');
        carregarContexto();
      }
      desenharAlertas();pintarMapa();salvarRascunho();
    })
    .withFailureHandler(()=>{sincronizando=false;})   // sem conexão: mantém o que está na tela
    .alertasDoPlantaoAtual();
}
setInterval(sincronizarAlertas,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sincronizarAlertas();});

/* ---------------- início ---------------- */
carregarRascunho();
if(!$('pData').value)$('pData').value=hojeLocal();
aplicarLimites();desenharAlertas();updateSelection();applyView();carregarContexto();sincronizarAlertas();
try{if(sessionStorage.getItem('alertas:aba')==='plantao')mostrarAba('plantao');}catch(e){}
window.alertasJsPdf.then(()=>{_relDoc=null;agendarRelatorio();},()=>{});   // refaz a prévia com as medidas do PDF
}
