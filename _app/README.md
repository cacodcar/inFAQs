# Multiparametric explorer

A static, accessible explorer of an explicit two-parameter quadratic program.
The site uses the existing STIX Two Text font assets. Runtime dependencies are
only the browser's native HTML, CSS, SVG, and JavaScript APIs.

## Hosting

This folder is served by the existing GitHub Pages site. It is deliberately not
linked from the article index or sitemap, and its page requests `noindex`.
The Google Sites page should be hidden from navigation and embed this URL:

`https://cacodcar.github.io/inFAQs/_app/?embed=1`

Hidden navigation is not access control: the page remains available by URL.
Use `&transparent=1` only when the embedding container supplies a suitable dark
background. Otherwise the app supplies its own matching navy background.

## Model

Minimize `0.5 * ||x - theta||²`, subject to `x >= 0`, `x1 <= 1.4`,
`x2 <= 1.2`, and `x1 + x2 <= 2`, for `theta` in `[-0.6, 2]²`.
PPOPT generates 11 critical regions. Each exported record contains half-planes,
vertices, an affine primal rule, and the active-set indices. The browser checks
half-plane membership and evaluates the rule. On shared boundaries it reports
all matching regions, chooses the first deterministic rule, and identifies all
constraints with zero slack at the current decision. The optimal decision is
continuous even when the rule changes.

## Regeneration and validation

```sh
python3 -m pip install -r _app/tools/requirements.txt
python3 _app/tools/generate.py
node _app/tools/test-solution.mjs
```

The Python build uses PPOPT's combinatorial algorithm. GLPK and Quadprog are
selected for the model's LP/QP operations; this PPOPT version also invokes
Gurobi through internal geometry utilities, so regeneration requires a working
Gurobi installation/license. No solver or license is needed to serve or use the
exported explorer.

The Python checks compare region rules against independent geometric projection
at 4,225 points, including boundaries, plus 200 SLSQP solves of the original QP.
The Node checks exercise the actual browser evaluation module on 5,088 points,
invalid inputs, shared boundaries, feasibility, and total polygon area.
`tools/validation.json` records the Python validation result.

Interactions include map drag/tap, arrow keys (Shift for larger steps), sliders,
numeric inputs, reset, an explicitly started animated path, constraint details,
and expandable model documentation. Manual input pauses the path. No animation
starts automatically.
