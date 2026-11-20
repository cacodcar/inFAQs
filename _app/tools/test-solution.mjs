import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluate,affineText,dot} from '../solution.mjs';
const model=JSON.parse(await readFile(new URL('../model.json',import.meta.url)));

// Independently solve the displayed LP by enumerating every pair of constraints.
function reference(theta) {
  const rhs=model.b.map((v,i)=>v+dot(model.B[i],theta)),candidates=[];
  for(let i=0;i<model.A.length;i++)for(let j=i+1;j<model.A.length;j++) {
    const a=model.A[i],b=model.A[j],det=a[0]*b[1]-a[1]*b[0];
    if(Math.abs(det)<1e-12)continue;
    const x=[(rhs[i]*b[1]-a[1]*rhs[j])/det,(a[0]*rhs[j]-rhs[i]*b[0])/det];
    if(model.A.every((row,k)=>dot(row,x)<=rhs[k]+1e-9))candidates.push(x);
  }
  return candidates.sort((a,b)=>dot(model.c,a)-dot(model.c,b))[0]??null;
}
let count=0,infeasible=0,worst=0,seed=20261120;
function check(theta) {
  const result=evaluate(model,theta),expected=reference(theta);
  assert.ok(result);
  assert.equal(result.feasible,Boolean(expected),`Feasibility at ${theta}`);
  if(expected) {
    result.x.forEach((x,i)=>{const error=Math.abs(x-expected[i]);worst=Math.max(worst,error);assert.ok(error<1e-7);});
    assert.ok(result.slacks.every(x=>x>=-1e-8));
    assert.ok(Math.abs(result.objective-dot(model.c,expected))<1e-5);
    assert.ok(Math.abs(result.hydrogen-theta[0])<1e-8);
    for(const region of result.regions)region.F.forEach((row,i)=>assert.ok(Math.abs(dot(row,theta)+region.g[i]-expected[i])<1e-7));
  } else {infeasible++;assert.ok(result.waterDeficit>0);assert.equal(result.x,undefined);assert.equal(result.objective,undefined);}
  count++;
}
for(let i=0;i<5000;i++)check(model.domain.map(([lo,hi])=>{seed=seed*16807%2147483647;return lo+(hi-lo)*seed/2147483647;}));
for(const r of model.regions) {
  r.vertices.forEach(check);
  r.vertices.forEach((v,i)=>check(v.map((x,j)=>(x+r.vertices[(i+1)%r.vertices.length][j])/2)));
}
for(let d=.7;d<=2.5;d+=.03)for(const offset of [-1e-5,0,1e-5])check([d,d*model.water_per_hydrogen+offset]);
check([1.425,20]);check([1.425-1e-6,20]);check([1.425+1e-6,20]);
const boundary=evaluate(model,[1.425,20]);
assert.equal(boundary.regions.length,2);
assert.deepEqual(boundary.active,[1,2,4]);
assert.ok(evaluate(model,[2,2*model.water_per_hydrogen]).active.includes(5));
assert.equal(evaluate(model,[2,12]).feasible,false);
assert.ok(Math.abs(evaluate(model,[.75,9]).x[0]-.75/.019)<1e-8);
assert.equal(evaluate(model,[.75,9]).x[1],0);
const initial=evaluate(model,model.initial);
assert.ok(Math.abs(initial.x[0]-75)<1e-8);
assert.ok(Math.abs(initial.x[1]-(2/.019-75))<1e-8);
assert.equal(model.regions.length,2);
const area=model.regions.concat(model.infeasible).reduce((sum,r)=>sum+Math.abs(r.vertices.reduce((a,v,i)=>{const w=r.vertices[(i+1)%r.vertices.length];return a+v[0]*w[1]-v[1]*w[0];},0))/2,0);
assert.ok(Math.abs(area-44)<1e-8);
for(const theta of [null,{},[NaN,10],[Infinity,10],[.49,10],[2.51,10],[1,5.9],[1,28.1],[1],[1,2,3]])assert.equal(evaluate(model,theta),null);
assert.equal(affineText([1/.019,0],-75),'52.632D − 75');
console.log(JSON.stringify({checked_points:count,infeasible_points:infeasible,regions:model.regions.length,max_dispatch_error:worst,area},null,2));
