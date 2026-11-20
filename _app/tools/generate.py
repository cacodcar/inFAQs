"""Solve the original Energia hydrogen case and export its two dispatch regimes."""
import json
from importlib.metadata import version
from pathlib import Path
import numpy as np
from scipy.optimize import linprog
from source_model import build_model

ROOT = Path(__file__).resolve().parents[1]
SOURCE_COMMIT = 'ea42c1a5df65451df664827ca6a67d9793329bcb'
DOMAIN = np.array([[0.5, 2.5], [6.0, 28.0]])
A = np.array([[-1,0],[0,-1],[1,0],[0,1],[-.019,-.019],[.1753,.1753]])
B = np.array([[0,0],[0,0],[0,0],[0,0],[-1,0],[0,1]])
b = np.array([0,0,75,85,0,0])
c = np.array([567+.001*.1753,990+.001*.1753])

def clip(vertices, normal, bound):
    result=[]
    for start,end in zip(vertices,vertices[1:]+vertices[:1]):
        s=float(np.dot(normal,start)-bound); e=float(np.dot(normal,end)-bound)
        if s<=1e-10: result.append(start)
        if (s < -1e-10 and e > 1e-10) or (e < -1e-10 and s > 1e-10):
            result.append((np.array(start)+s/(s-e)*(np.array(end)-start)).tolist())
    unique=[]
    for point in result:
        if not unique or np.linalg.norm(np.array(point)-unique[-1])>1e-8: unique.append(point)
    if len(unique)>1 and np.linalg.norm(np.array(unique[0])-unique[-1])<1e-8: unique.pop()
    return unique

def rectangle():
    return [[.5,6],[2.5,6],[2.5,28],[.5,28]]

def clean(value):
    array=np.asarray(value,dtype=float).copy()
    array[np.abs(array)<1e-10]=0
    return np.round(array,12).tolist()

def polygon_key(vertices):
    return tuple(sorted(tuple(np.round(v,8)) for v in vertices))

def area(vertices):
    return abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(vertices,vertices[1:]+vertices[:1])))/2

def validate(model, solution, columns):
    rng=np.random.default_rng(20261120)
    points=rng.uniform(DOMAIN[:,0],DOMAIN[:,1],(1600,2)).tolist()
    points += [[x,y] for x in np.linspace(.5,2.5,41) for y in np.linspace(6,28,41)]
    points += [[1.425,w] for w in np.linspace(14,28,41)]
    for demand in np.linspace(6*.019/.1753,2.5,101):
        for epsilon in [-1e-5,0,1e-5]:
            points.append([demand, max(6,demand*.1753/.019+epsilon)])
    for r in model['regions']:
        points.extend(r['vertices'])
        points.extend(((np.array(a)+z)/2).tolist() for a,z in zip(r['vertices'],r['vertices'][1:]+r['vertices'][:1]))
    full=solution.program
    eq=list(full.equality_indices)
    ub=[i for i in range(full.A.shape[0]) if i not in eq]
    worst=worst_cost=0.; feasible=0; infeasible=0; boundary=0
    for coords in points:
        theta=np.array(coords)
        matches=[r for r in model['regions'] if np.all(np.array(r['E'])@theta<=np.array(r['f'])+1e-8)]
        rhs=(full.b+full.F@theta.reshape(-1,1)).ravel()
        cost=(full.c+full.H@theta.reshape(-1,1)).ravel()
        direct=linprog(cost,A_ub=full.A[ub],b_ub=rhs[ub],A_eq=full.A[eq],b_eq=rhs[eq],
                       bounds=[(None,None)]*full.A.shape[1],method='highs',
                       options={'primal_feasibility_tolerance':1e-9,'dual_feasibility_tolerance':1e-9})
        assert bool(matches)==direct.success,(theta,direct.message)
        if not matches:
            assert direct.status==2,(theta,direct.message)
            assert theta[1] < theta[0]*.1753/.019+1e-8
            infeasible+=1
            continue
        feasible+=1
        boundary+=len(matches)>1
        for r in matches:
            x=np.array(r['F'])@theta+np.array(r['g'])
            error=float(np.max(np.abs(x-direct.x[columns])))
            cost_error=abs(float(c@x)-direct.fun)
            worst=max(worst,error);worst_cost=max(worst_cost,cost_error)
            assert error<1e-7,(theta,x,direct.x[columns])
            assert cost_error<1e-5,(theta,cost_error)
            assert np.max(A@x-b-B@theta)<1e-8
            assert abs(.019*sum(x)-theta[0])<1e-8
    total_area=sum(area(r['vertices']) for r in model['regions']+model['infeasible'])
    assert abs(total_area-44)<1e-8,total_area
    return {'checked_points':len(points),'direct_full_model_lp_checks':len(points),
            'feasible_points':feasible,'infeasible_points':infeasible,'shared_boundary_points':boundary,
            'max_dispatch_error':worst,'max_cost_error':worst_cost,'parameter_domain_area':total_area,
            'reference_solver':'SciPy HiGHS; full 19-variable Energia/Gana formulation',
            'source_commit':SOURCE_COMMIT}

def main():
    m=build_model();m.solve()
    solution=m.program.solution
    variables=list(m.program.variables)
    columns=[next(i for i,v in enumerate(variables) if v is target) for target in (m.pv.operate.V()[0],m.wind_farm.operate.V()[0])]
    assert solution.program.A.shape[1]==len(variables)
    regions=[]
    seen=set()
    for raw in solution.critical_regions:
        vertices=rectangle()
        for normal,bound in zip(raw.E,raw.f.ravel()): vertices=clip(vertices,normal,bound)
        if len(vertices)<3 or area(vertices)<1e-8: continue
        key=polygon_key(vertices)
        F=clean(raw.A[columns]);g=clean(raw.b[columns].ravel())
        if key in seen:
            existing=next(r for r in regions if polygon_key(r['vertices'])==key)
            assert np.allclose(existing['F'],F,atol=1e-9) and np.allclose(existing['g'],g,atol=1e-9)
            continue
        seen.add(key)
        regions.append({'E':clean(raw.E),'f':clean(raw.f.ravel()),'F':F,'g':g,'vertices':clean(vertices),
                        'label':clean(np.mean(vertices,axis=0))})
    regions.sort(key=lambda r:-r['F'][0][0])
    assert len(regions)==2
    for i,r in enumerate(regions):
        r['id']=i+1
        r['name']=['Solar only','Solar + wind'][i]
        r['description']=['Solar meets the hydrogen request. Wind stays idle.','Solar is at its limit; wind supplies the additional electricity.'][i]
        theta=np.array(r['label']); x=np.array(r['F'])@theta+r['g']
        r['active']=np.where(np.abs(b+B@theta-A@x)<1e-8)[0].tolist()
    unavailable=clip(rectangle(),[-.1753/.019,1],0)
    model={'schema_version':2,'title':'Hydrogen production under demand and water uncertainty',
           'source':{'repository':'TAMUparametric/energiapy','commit':SOURCE_COMMIT,'path':'docs/examples/case_studies/parametric_hydrogen.ipynb'},
           'generator':{'packages':{p:version(p) for p in ['energiapy','gana','ppopt']},'algorithm':'combinatorial',
                        'raw_regions':len(solution.critical_regions),'deduplicated_regions':len(regions),
                        'note':'Coincident regions with identical solar/wind rules are deduplicated.'},
           'units':'Original study units; source does not specify physical units. Illustrative cost coefficients.',
           'domain':DOMAIN.tolist(),'initial':[2,22],'hydrogen_yield':.019,'water_per_power':.1753,
           'water_per_hydrogen':.1753/.019,'A':clean(A),'b':clean(b),'B':clean(B),'c':clean(c),
           'constraints':['Solar ≥ 0','Wind ≥ 0','Solar ≤ 75','Wind ≤ 85','Hydrogen ≥ demand','Water used ≤ available'],
           'regions':regions,'infeasible':[{'vertices':clean(unavailable),'label':clean(np.mean(unavailable,axis=0))}]}
    report=validate(model,solution,columns)
    (ROOT/'model.json').write_text(json.dumps(model,indent=2)+'\n')
    (ROOT/'tools'/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'critical_regions':len(regions),**report},indent=2))

if __name__=='__main__': main()
