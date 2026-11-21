import {evaluate, affineText} from './solution.mjs';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.get('embed') === '1') document.documentElement.classList.add('embed');
if (params.get('transparent') === '1') document.documentElement.classList.add('transparent');
const colors = ['#93a9c2','#b48ba8'];
const svgElement = (name, attributes, parent, text) => {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  parent.append(element);
  return element;
};
const format = (n, digits = 3) => (Math.abs(n) < 0.5 * 10 ** -digits ? 0 : n).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
let seed = 37;
for (let i = 0; i < 70; i++) {
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const star = document.createElement('i');
  star.className = 'star';
  star.style.left = `${random() * 100}%`;
  star.style.top = `${random() * 100}%`;
  star.style.opacity = String(0.07 + random() * 0.2);
  $('stars').append(star);
}

async function start() {
  const response = await fetch(new URL('model.json', import.meta.url));
  if (!response.ok) throw new Error('Solution data could not be loaded.');
  const model = await response.json();
  if (model.schema_version !== 2 || !model.regions?.length) throw new Error('Unsupported solution data.');
  let theta = [...model.initial], dragging = false, animation = null;
  const map = $('map');
  const range = model.domain.map(([min,max])=>max-min);
  const sx = x => 64 + (x-model.domain[0][0])/range[0]*510;
  const sy = y => 534 - (y-model.domain[1][0])/range[1]*510;
  const clamp = (value,axis)=>Math.max(model.domain[axis][0],Math.min(model.domain[axis][1],value));
  const polygons = new Map();
  const polygonPoints = vertices=>vertices.map(([x,y])=>`${sx(x)},${sy(y)}`).join(' ');
  for (const region of model.infeasible) {
    const points=polygonPoints(region.vertices);
    svgElement('polygon',{points,fill:'#a67e83','fill-opacity':'.07'},$('infeasible-regions'));
    svgElement('polygon',{points,fill:'url(#infeasible-hatch)'},$('infeasible-regions'));
    svgElement('text',{x:sx(region.label[0]),y:sy(region.label[1]),'text-anchor':'middle',class:'unavailable-label'},$('labels'),'Insufficient water');
  }
  for (const region of model.regions) {
    const points=polygonPoints(region.vertices);
    const fill=svgElement('polygon',{points,fill:colors[region.id-1],class:'region-fill'},$('regions'));
    svgElement('title',{},fill,`Region ${region.id}: ${region.name}`);
    const sheen=svgElement('polygon',{points,class:'region-sheen'},$('regions'));
    polygons.set(region.id,[fill,sheen]);
    const label=svgElement('text',{x:sx(region.label[0]),y:sy(region.label[1]),'text-anchor':'middle',class:'region-label'},$('labels'),`R${region.id}`);
    svgElement('tspan',{x:sx(region.label[0]),dy:28,class:'regime-label'},label,region.name);
  }
  for(const value of [.5,1,1.5,2,2.5]) {
    svgElement('path',{d:`M${sx(value)},24 V534`,class:'grid-line'},$('grid'));
    svgElement('text',{x:sx(value),y:555,'text-anchor':'middle',class:'tick'},$('axes'),String(value));
  }
  for(const value of [6,10,15,20,25,28]) {
    svgElement('path',{d:`M64,${sy(value)} H574`,class:'grid-line'},$('grid'));
    svgElement('text',{x:52,y:sy(value)+5,'text-anchor':'end',class:'tick'},$('axes'),String(value));
  }
  svgElement('path',{d:'M64,18 V534 H581',fill:'none',stroke:'#bdc9d8','stroke-width':1},$('axes'));
  const demandAxis=svgElement('text',{x:319,y:590,'text-anchor':'middle',class:'axis-label'},$('axes'));
  svgElement('tspan',{class:'math-variable'},demandAxis,'d');
  svgElement('tspan',{},demandAxis,' · hydrogen demand');
  svgElement('text',{x:17,y:283,'text-anchor':'middle',class:'axis-label math-variable'},$('axes'),'w');
  $('region-count').textContent=`${model.regions.length} critical regions`;

  function render() {
    const result=evaluate(model,theta);
    if(!result) throw new Error('The selected point is outside the solution domain.');
    for(let i=0;i<2;i++) {
      const slider=$(`theta-${i+1}`), number=$(`value-${i+1}`);
      slider.value=String(theta[i]);
      slider.style.setProperty('--fill',`${(theta[i]-model.domain[i][0])/range[i]*100}%`);
      if(document.activeElement!==number) number.value=theta[i].toFixed(i===0?3:2);
    }
    const id=result.feasible?result.region.id:null;
    for(const [regionId,elements] of polygons) for(const element of elements) element.classList.toggle('active',regionId===id);
    const name=result.feasible?`${result.region.name} · R${id}`:'Infeasible';
    if($('region-name').textContent!==name) $('region-name').textContent=name;
    $('region-name').style.setProperty('--region-color',result.feasible?colors[id-1]:'#a67e83');
    $('rule-info').hidden=!result.feasible;
    $('constraints').hidden=!result.feasible;
    $('boundary-note').hidden=true;
    if(result.feasible) {
      $('region-description').textContent=result.region.description;
      for(let i=0;i<2;i++) {
        $(`decision-${i+1}`).textContent=format(result.x[i]);
        const rest=affineText(result.region.F[i].map(v=>-v),-result.region.g[i],3,['d','w']).replace(/^−/,'− ');
        const equation=`${['s','v'][i]}${rest==='0'?'':rest.startsWith('−')?` ${rest}`:` + ${rest}`} = 0`;
        const line=$(`rule-${i+1}`);
        line.replaceChildren(...equation.split(/([svdw])/).filter(Boolean).map(part=>{
          if(!/^[svdw]$/.test(part))return document.createTextNode(part);
          const symbol=document.createElement('b');symbol.className='math-variable';symbol.textContent=part;return symbol;
        }));
      }
      $('objective').textContent=format(result.objective,2);
      $('balance-summary').textContent=`Hydrogen delivered: ${format(result.hydrogen)}. Water used: ${format(result.water)} of ${format(theta[1],2)} available.`;
      if(result.regions.length>1) {
        $('boundary-note').hidden=false;
        $('boundary-note').textContent='Solar is at capacity. The two region rules give the same dispatch here; higher demand brings wind online.';
      } else if(result.active.includes(5)) {
        $('boundary-note').hidden=false;
        $('boundary-note').textContent='Water is exactly at its limit. Any less water makes this demand infeasible.';
      }
      $('active-count').textContent=`(${result.active.length})`;
      $('constraint-list').replaceChildren();
      model.constraints.forEach((label,i)=>{
        const row=document.createElement('div'); row.className=`constraint-row${result.active.includes(i)?' binding':''}`;
        const name=document.createElement('span'); name.textContent=label;
        const value=document.createElement('span'); value.textContent=result.active.includes(i)?'binding':`slack ${format(result.slacks[i])}`;
        row.append(name,value); $('constraint-list').append(row);
      });
    } else {
      $('region-description').textContent=`This request needs ${format(result.waterRequired)} units of water, ${format(result.waterDeficit)} more than available.`;
      for(const id of ['decision-1','decision-2','objective']) $(id).textContent='—';
      $('balance-summary').textContent=`At this water supply, hydrogen production is limited to ${format(theta[1]/model.water_per_hydrogen)}. Increase water or lower demand.`;
    }
    const x=sx(theta[0]),y=sy(theta[1]);
    for(const id of ['point','point-halo']) { $(id).setAttribute('cx',x);$(id).setAttribute('cy',y); }
    $('guides').setAttribute('d',`M64,${y} H${x} V534`);
  }
  function stopTrace() {
    if(animation!==null) cancelAnimationFrame(animation);
    animation=null; $('trace').textContent='Trace a path'; $('trace').setAttribute('aria-pressed','false');
  }
  function update(coordinates,manual=true) {
    if(manual) stopTrace();
    theta=coordinates.map((value,axis)=>clamp(Number(value.toFixed(axis===0?3:2)),axis));
    render();
  }
  function fromPointer(event) {
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(map.getScreenCTM().inverse());
    update([model.domain[0][0]+(point.x-64)/510*range[0],model.domain[1][0]+(534-point.y)/510*range[1]]);
  }
  map.addEventListener('pointerdown',event=>{if(event.button!==0)return;dragging=true;map.setPointerCapture(event.pointerId);map.focus({preventScroll:true});fromPointer(event);});
  map.addEventListener('pointermove',event=>{if(dragging)fromPointer(event);});
  for(const event of ['pointerup','pointercancel','lostpointercapture']) map.addEventListener(event,()=>{dragging=false;});
  map.addEventListener('keydown',event=>{
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};
    if(!directions[event.key])return;
    event.preventDefault();
    update(theta.map((v,i)=>v+directions[event.key][i]*[.01,.1][i]*(event.shiftKey?10:1)));
  });
  for(let i=0;i<2;i++) {
    const slider=$(`theta-${i+1}`),number=$(`value-${i+1}`);
    slider.addEventListener('input',()=>update(theta.map((v,j)=>i===j?Number(slider.value):v)));
    number.addEventListener('input',()=>{if(Number.isFinite(number.valueAsNumber))update(theta.map((v,j)=>i===j?number.valueAsNumber:v));});
    number.addEventListener('blur',()=>{number.value=theta[i].toFixed(i===0?3:2);});
  }
  $('reset').addEventListener('click',()=>{$('trace-line').setAttribute('visibility','hidden');update([...model.initial]);});
  const waypoints=[[.75,9],[1.2,16],[2,22],[2,12],[1,12],[2.4,26],[2,22]];
  $('trace-line').setAttribute('points',polygonPoints(waypoints));
  $('trace').addEventListener('click',()=>{
    if(animation!==null){stopTrace();return;}
    $('trace-line').setAttribute('visibility','visible');$('trace').textContent='Pause trace';$('trace').setAttribute('aria-pressed','true');
    const begun=performance.now(),duration=18000;
    const frame=now=>{
      const progress=Math.min(1,(now-begun)/duration)*(waypoints.length-1);
      const i=Math.min(waypoints.length-2,Math.floor(progress)),fraction=progress-i;
      update(waypoints[i].map((v,j)=>v+(waypoints[i+1][j]-v)*fraction),false);
      if(progress<waypoints.length-1)animation=requestAnimationFrame(frame);else stopTrace();
    };animation=requestAnimationFrame(frame);
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTrace();});
  render();$('load-status').hidden=true;$('workspace').hidden=false;$('explanation').hidden=false;
}
start().catch(error=>{$('load-status').textContent=`${error.message} Please reload the page to try again.`;$('load-status').setAttribute('role','alert');console.error(error);});
