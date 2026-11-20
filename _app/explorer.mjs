import {evaluate, affineText} from './solution.mjs';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.get('embed') === '1') document.documentElement.classList.add('embed');
if (params.get('transparent') === '1') document.documentElement.classList.add('transparent');
const ns = 'http://www.w3.org/2000/svg';
const colors = ['#9facc4','#7e9cb5','#c8b7a4','#93a9c2','#b69bb4','#b48ba8','#a6b8b4','#beaebc','#9eafbf','#c9b8a2','#a2a4c6'];
const svgElement = (name, attributes, parent, text) => {
  const element = document.createElementNS(ns, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  parent.append(element);
  return element;
};
const format = (n, digits = 3) => (Math.abs(n) < 0.5 * 10 ** -digits ? 0 : n).toFixed(digits);

// A fixed, sparse background keeps motion out of the scientific visualization.
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
  if (model.schema_version !== 1 || !model.regions?.length) throw new Error('Unsupported solution data.');
  let theta = [...model.initial];
  let dragging = false;
  let animation = null;
  let lastRegion = '';
  const map = $('map');
  const range = model.domain.map(([min, max]) => max - min);
  const sx = x => 64 + (x - model.domain[0][0]) / range[0] * 510;
  const sy = y => 534 - (y - model.domain[1][0]) / range[1] * 510;
  const clamp = (value, axis) => Math.max(model.domain[axis][0], Math.min(model.domain[axis][1], value));
  const polygons = new Map();
  for (const region of model.regions) {
    const points = region.vertices.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ');
    const fill = svgElement('polygon', {points, fill: colors[(region.id - 1) % colors.length], class: 'region-fill'}, $('regions'));
    svgElement('title', {}, fill, `Region ${region.id}: ${region.active.length ? region.active.map(i => model.constraints[i]).join(', ') : 'no binding constraints in its interior'}`);
    const sheen = svgElement('polygon', {points, class: 'region-sheen'}, $('regions'));
    polygons.set(region.id, [fill, sheen]);
    svgElement('text', {x:sx(region.label[0]),y:sy(region.label[1]),'text-anchor':'middle','dominant-baseline':'middle',class:'region-label'}, $('labels'), `R${region.id}`);
  }
  const ticks = [-0.6, 0, 0.5, 1, 1.5, 2];
  for (const value of ticks) {
    svgElement('path', {d:`M${sx(value)},24 V534 M64,${sy(value)} H574`,stroke:'#e1e7f0','stroke-opacity':'.06','stroke-width':'.8','pointer-events':'none'},$('grid'));
    svgElement('text',{x:sx(value),y:555,'text-anchor':'middle',class:'tick'},$('axes'),String(value));
    svgElement('text',{x:52,y:sy(value)+5,'text-anchor':'end',class:'tick'},$('axes'),String(value));
  }
  svgElement('path',{d:'M64,18 V534 H581',fill:'none',stroke:'#bdc9d8','stroke-width':'1'},$('axes'));
  svgElement('text',{x:319,y:589,'text-anchor':'middle',class:'axis-label'},$('axes'),'θ₁');
  svgElement('text',{x:17,y:283,'text-anchor':'middle',class:'axis-label'},$('axes'),'θ₂');
  $('region-count').textContent = `${model.regions.length} critical regions`;

  function render() {
    const result = evaluate(model, theta);
    if (!result) throw new Error('The selected point is outside the solution domain.');
    for (let i = 0; i < 2; i++) {
      const slider = $(`theta-${i+1}`);
      slider.value = String(theta[i]);
      slider.style.setProperty('--fill', `${(theta[i] - model.domain[i][0]) / range[i] * 100}%`);
      if (document.activeElement !== $(`value-${i+1}`)) $(`value-${i+1}`).value = format(theta[i], 2);
      $(`decision-${i+1}`).textContent = format(result.x[i]);
      $(`rule-${i+1}`).textContent = affineText(result.region.F[i], result.region.g[i]);
    }
    const id = result.region.id;
    for (const [regionId, elements] of polygons) for (const element of elements) element.classList.toggle('active', regionId === id);
    const name = `Region ${String(id).padStart(2,'0')}`;
    if (name !== lastRegion) { $('region-name').textContent = name; lastRegion = name; }
    $('region-name').style.setProperty('--region-color', colors[(id - 1) % colors.length]);
    $('region-subscript').textContent = String(id);
    $('region-subscript-2').textContent = String(id);
    $('region-description').textContent = result.region.active.length
      ? result.region.active.map(i => model.constraints[i]).join(' · ')
      : 'Both targets can be met exactly.';
    $('boundary-note').hidden = result.regions.length === 1;
    $('boundary-note').textContent = result.regions.length > 1
      ? `Shared boundary: ${result.regions.map(r => `R${r.id}`).join(', ')}. The decision agrees across these regions.` : '';
    $('objective').textContent = format(result.objective, 4);
    $('active-count').textContent = `(${result.active.length})`;
    $('constraint-list').replaceChildren();
    model.constraints.forEach((label, i) => {
      const row = document.createElement('div');
      row.className = `constraint-row${result.active.includes(i) ? ' binding' : ''}`;
      const name = document.createElement('span'); name.textContent = label;
      const value = document.createElement('span'); value.textContent = result.active.includes(i) ? 'binding' : `slack ${format(result.slacks[i])}`;
      row.append(name,value); $('constraint-list').append(row);
    });
    const x = sx(theta[0]), y = sy(theta[1]);
    for (const id of ['point','point-halo']) { $(id).setAttribute('cx',x); $(id).setAttribute('cy',y); }
    $('guides').setAttribute('d',`M64,${y} H${x} V534`);
  }

  function stopTrace() {
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null;
    $('trace').textContent = 'Trace a path'; $('trace').setAttribute('aria-pressed','false');
  }
  function update(coordinates, manual = true) {
    if (manual) stopTrace();
    theta = coordinates.map((value, axis) => clamp(value, axis));
    render();
  }
  function fromPointer(event) {
    const point = new DOMPoint(event.clientX,event.clientY).matrixTransform(map.getScreenCTM().inverse());
    update([model.domain[0][0] + (point.x - 64) / 510 * range[0], model.domain[1][0] + (534 - point.y) / 510 * range[1]]);
  }
  map.addEventListener('pointerdown',event=>{ if(event.button!==0) return; dragging=true; map.setPointerCapture(event.pointerId); map.focus({preventScroll:true}); fromPointer(event); });
  map.addEventListener('pointermove',event=>{if(dragging) fromPointer(event);});
  map.addEventListener('pointerup',()=>{dragging=false;});
  map.addEventListener('pointercancel',()=>{dragging=false;});
  map.addEventListener('lostpointercapture',()=>{dragging=false;});
  map.addEventListener('keydown',event=>{
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};
    if(!directions[event.key]) return;
    event.preventDefault(); const step=event.shiftKey ? 0.1 : 0.01;
    update(theta.map((value,i)=>value+directions[event.key][i]*step));
  });
  for(let i=0;i<2;i++) {
    const slider=$(`theta-${i+1}`), number=$(`value-${i+1}`);
    slider.addEventListener('input',()=>update(theta.map((v,j)=>i===j?Number(slider.value):v)));
    number.addEventListener('input',()=>{
      const value=number.valueAsNumber;
      if(Number.isFinite(value)) update(theta.map((v,j)=>i===j?value:v));
    });
    number.addEventListener('blur',()=>{number.value=format(theta[i],2);});
  }
  $('reset').addEventListener('click',()=>{ $('trace-line').setAttribute('visibility','hidden'); update([...model.initial]); });
  $('show-model').addEventListener('click',()=>{
    const open=$('model-details').hidden;
    $('model-details').hidden=!open; $('show-model').textContent=open?'Hide model':'Show model'; $('show-model').setAttribute('aria-expanded',String(open));
    if(open) $('model-details').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  });
  const waypoints=[[-.35,-.35],[.6,-.35],[1.8,-.35],[1.8,.35],[1.9,.9],[1.55,1.75],[.7,1.8],[-.35,1.8],[-.35,.6],[.6,.6],[1.45,1.25]];
  $('trace-line').setAttribute('points',waypoints.map(([x,y])=>`${sx(x)},${sy(y)}`).join(' '));
  $('trace').addEventListener('click',()=>{
    if(animation!==null){stopTrace();return;}
    $('trace-line').setAttribute('visibility','visible');
    $('trace').textContent='Pause trace'; $('trace').setAttribute('aria-pressed','true');
    const begun=performance.now(), duration=18000;
    const frame=now=>{
      const progress=Math.min(1,(now-begun)/duration)*(waypoints.length-1);
      const i=Math.min(waypoints.length-2,Math.floor(progress)), fraction=progress-i;
      update(waypoints[i].map((v,j)=>v+(waypoints[i+1][j]-v)*fraction),false);
      if(progress<waypoints.length-1) animation=requestAnimationFrame(frame); else stopTrace();
    };
    animation=requestAnimationFrame(frame);
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTrace();});
  render();
  $('load-status').hidden=true; $('workspace').hidden=false; $('explanation').hidden=false;
}

start().catch(error=>{
  $('load-status').textContent = `${error.message} Please reload the page to try again.`;
  $('load-status').setAttribute('role','alert');
  console.error(error);
});
