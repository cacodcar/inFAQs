"""Generate and independently verify the explorer's explicit mpQP solution.

Run: python3 _app/tools/generate.py
Build dependencies: ppopt, numpy, scipy, cvxopt, quadprog.
The browser only needs the exported model.json, not these packages.
"""

import json
from importlib.metadata import version
from pathlib import Path

import numpy as np
from ppopt.mp_solvers.solve_mpqp import mpqp_algorithm, solve_mpqp
from ppopt.mpqp_program import MPQP_Program
from ppopt.solver import Solver
from scipy.optimize import minimize

ROOT = Path(__file__).resolve().parents[1]
A = np.array([[-1, 0], [0, -1], [1, 0], [0, 1], [1, 1]], dtype=float)
B = np.array([0, 0, 1.4, 1.2, 2.0])
LOW, HIGH = -0.6, 2.0


def clip(vertices, normal, bound):
    """Intersect a convex polygon with a half-plane."""
    result = []
    for start, end in zip(vertices, vertices[1:] + vertices[:1]):
        s = float(np.dot(normal, start) - bound)
        e = float(np.dot(normal, end) - bound)
        if s <= 1e-10:
            result.append(start)
        if (s < -1e-10 and e > 1e-10) or (e < -1e-10 and s > 1e-10):
            result.append((np.array(start) + s / (s - e) * (np.array(end) - start)).tolist())
    unique = []
    for point in result:
        if not unique or np.linalg.norm(np.array(point) - unique[-1]) > 1e-9:
            unique.append(point)
    if len(unique) > 1 and np.linalg.norm(np.array(unique[0]) - unique[-1]) < 1e-9:
        unique.pop()
    return unique


def clean(value):
    array = np.asarray(value, dtype=float)
    array[np.abs(array) < 1e-12] = 0
    return np.round(array, 12).tolist()


def project_reference(theta):
    """Independent geometric projection onto all five feasible edges."""
    if np.all(A @ theta <= B + 1e-12):
        return theta.copy()
    vertices = np.array([[0, 0], [1.4, 0], [1.4, 0.6], [0.8, 1.2], [0, 1.2]])
    candidates = []
    for start, end in zip(vertices, np.roll(vertices, -1, axis=0)):
        edge = end - start
        scale = np.clip(np.dot(theta - start, edge) / np.dot(edge, edge), 0, 1)
        candidates.append(start + scale * edge)
    return min(candidates, key=lambda x: np.linalg.norm(x - theta))


def validate(model):
    """Check coverage, boundary agreement, feasibility, and optimality."""
    rng = np.random.default_rng(20261120)
    points = rng.uniform(LOW, HIGH, (3000, 2)).tolist()
    points += [[x, y] for x in np.linspace(LOW, HIGH, 31) for y in np.linspace(LOW, HIGH, 31)]
    for region in model['regions']:
        vertices = region['vertices']
        points.extend(vertices)
        for start, end in zip(vertices, vertices[1:] + vertices[:1]):
            midpoint = (np.array(start) + end) / 2
            points.append(midpoint.tolist())
            for offset in ([1e-7, 0], [-1e-7, 0], [0, 1e-7], [0, -1e-7]):
                points.append(np.clip(midpoint + offset, LOW, HIGH).tolist())
    worst = 0.0
    boundary_count = 0
    for coordinates in points:
        theta = np.array(coordinates)
        matches = [r for r in model['regions'] if np.all(np.array(r['E']) @ theta <= np.array(r['f']) + 1e-9)]
        assert matches, f'Uncovered point: {theta}'
        reference = project_reference(theta)
        if len(matches) > 1:
            boundary_count += 1
        for region in matches:
            x = np.array(region['F']) @ theta + region['g']
            error = float(np.max(np.abs(x - reference)))
            worst = max(worst, error)
            assert error < 1e-7, (theta, region['id'], x, reference)
            assert np.max(A @ x - B) < 1e-8
    # Separate optimizer check: SLSQP on the original objective and constraints.
    for theta in rng.uniform(LOW, HIGH, (200, 2)):
        result = minimize(lambda x: 0.5 * np.sum((x - theta) ** 2), [0.5, 0.5],
                          jac=lambda x: x - theta, method='SLSQP',
                          constraints={'type': 'ineq', 'fun': lambda x: B - A @ x,
                                       'jac': lambda x: -A},
                          options={'ftol': 1e-12, 'maxiter': 100})
        assert result.success, result.message
        assert np.max(np.abs(result.x - project_reference(theta))) < 1e-7
    return {'checked_points': len(points), 'shared_boundary_points': boundary_count,
            'direct_qp_checks': 200, 'max_decision_error': worst}


def main():
    parameter_a = np.array([[1, 0], [-1, 0], [0, 1], [0, -1]], dtype=float)
    parameter_b = np.array([HIGH, -LOW, HIGH, -LOW]).reshape(-1, 1)
    program = MPQP_Program(
        A, B.reshape(-1, 1), np.zeros((2, 1)), -np.eye(2), np.eye(2),
        parameter_a, parameter_b, np.zeros((5, 2)), Q_t=np.eye(2),
        solver=Solver({'lp': 'glpk', 'qp': 'quadprog', 'milp': 'gurobi', 'miqp': 'gurobi'}),
        post_process=False,
    )
    solution = solve_mpqp(program, mpqp_algorithm.combinatorial)
    regions = []
    for index, region in enumerate(sorted(solution.critical_regions, key=lambda r: (len(r.active_set), tuple(r.active_set)))):
        vertices = [[LOW, LOW], [HIGH, LOW], [HIGH, HIGH], [LOW, HIGH]]
        for normal, bound in zip(region.E, region.f.ravel()):
            vertices = clip(vertices, normal, bound)
        assert len(vertices) >= 3
        regions.append({'id': index + 1, 'active': list(map(int, region.active_set)),
                        'E': clean(region.E), 'f': clean(region.f.ravel()),
                        'F': clean(region.A), 'g': clean(region.b.ravel()),
                        'vertices': clean(vertices), 'label': clean(np.mean(vertices, axis=0))})
    model = {'schema_version': 1, 'title': 'Two targets, one shared limit',
             'generator': {'package': 'PPOPT', 'version': version('ppopt'), 'algorithm': 'combinatorial'},
             'domain': [[LOW, HIGH], [LOW, HIGH]], 'initial': [1.45, 1.25],
             'A': clean(A), 'b': clean(B),
             'constraints': ['x₁ ≥ 0', 'x₂ ≥ 0', 'x₁ ≤ 1.4', 'x₂ ≤ 1.2', 'x₁ + x₂ ≤ 2'],
             'regions': regions}
    report = validate(model)
    (ROOT / 'model.json').write_text(json.dumps(model, indent=2) + '\n')
    (ROOT / 'tools' / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'regions': len(regions), **report}, indent=2))


if __name__ == '__main__':
    main()
