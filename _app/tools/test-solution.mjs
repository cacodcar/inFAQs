import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluate, affineText} from '../solution.mjs';

const model = JSON.parse(await readFile(new URL('../model.json',import.meta.url)));
const vertices = [[0,0],[1.4,0],[1.4,.6],[.8,1.2],[0,1.2]];
const reference = theta => {
  if(theta[0]>=0 && theta[1]>=0 && theta[0]<=1.4 && theta[1]<=1.2 && theta[0]+theta[1]<=2) return theta;
  const candidates = vertices.map((a,i)=>{
    const b=vertices[(i+1)%vertices.length],d=b.map((v,j)=>v-a[j]);
    const t=Math.max(0,Math.min(1,d.reduce((s,v,j)=>s+v*(theta[j]-a[j]),0)/d.reduce((s,v)=>s+v*v,0)));
    return a.map((v,j)=>v+t*d[j]);
  });
  return candidates.sort((a,b)=>a.reduce((s,v,j)=>s+(v-theta[j])**2,0)-b.reduce((s,v,j)=>s+(v-theta[j])**2,0))[0];
};
let count=0,worst=0,seed=20261120;
const check=theta=>{
  const answer=evaluate(model,theta);
  assert.ok(answer,`Uncovered ${theta}`);
  const expected=reference(theta);
  answer.x.forEach((v,i)=>{const error=Math.abs(v-expected[i]);worst=Math.max(worst,error);assert.ok(error<1e-8);});
  assert.ok(answer.slacks.every(v=>v>=-1e-8));
  for(const region of answer.regions) region.F.forEach((row,i)=>assert.ok(Math.abs(row[0]*theta[0]+row[1]*theta[1]+region.g[i]-expected[i])<1e-8));
  count++;
};
for(let i=0;i<5000;i++) check([0,0].map(()=>{seed=(seed*16807)%2147483647;return -.6+2.6*seed/2147483647;}));
for(const r of model.regions) {
  r.vertices.forEach(check);
  r.vertices.forEach((v,i)=>check(v.map((x,j)=>(x+r.vertices[(i+1)%r.vertices.length][j])/2)));
}
assert.equal(model.regions.length,11);
const area=model.regions.reduce((sum,r)=>sum+Math.abs(r.vertices.reduce((a,v,i)=>{const w=r.vertices[(i+1)%r.vertices.length];return a+v[0]*w[1]-v[1]*w[0];},0))/2,0);
assert.ok(Math.abs(area-2.6**2)<1e-10);
assert.deepEqual(evaluate(model,[1.45,1.25]).x,[1.1,.9]);
assert.deepEqual(evaluate(model,[0,0]).active,[0,1]);
assert.ok(evaluate(model,[1,1]).regions.length>1);
for(const theta of [[NaN,0],[Infinity,0],[-.7,0],[2.1,0],[0],[0,0,0]]) assert.equal(evaluate(model,theta),null);
assert.equal(affineText([.5,-.5],1),'0.5θ₁ − 0.5θ₂ + 1');
console.log(JSON.stringify({checked_points:count,regions:model.regions.length,max_decision_error:worst,area},null,2));
