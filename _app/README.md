# Multiparametric hydrogen explorer

Live at https://www.cacodcar.com/_app, hidden from Google Sites navigation.
The page embeds https://cacodcar.github.io/inFAQs/_app/?embed=1. Hidden navigation
is not access control. The app requests noindex and is absent from the article
index and sitemap. Runtime uses HTML, CSS, SVG, JavaScript, and the site's
existing STIX Two Text font assets; there is no solver in the browser.

## Source model

This replaces the initial projection-QP demonstration with Energia's existing
single-period hydrogen-production case study. Its formulation is retained in
`tools/source_model.py`, adapted from the first code cell in
[the source notebook](https://github.com/TAMUparametric/energiapy/blob/ea42c1a5df65451df664827ca6a67d9793329bcb/docs/examples/case_studies/parametric_hydrogen.ipynb).
The source coefficients, demand and water domains, and objective are unchanged.
The notebook is a compact study with illustrative coefficients, not a measured
plant dataset. Physical units are unspecified; the interface preserves study
units and does not invent currency, kWh, or kg labels.

With bold lowercase variables for solar electricity s, wind electricity v,
electrolyzer power e, hydrogen h, water u, and oxygen o, and bold lowercase
parametric variables d (demand) and w (water availability):

- Minimize `567 s + 990 v + .001 u`.
- Resource balances: `e - s - v = 0`, `h - .019 e = 0`,
  `u - .1753 e = 0`, `o - .7632 e = 0`.
- Limits: `d - h <= 0`, `u - w <= 0`, `s - 75 <= 0`, `v - 85 <= 0`.
- Nonnegativity: `-s <= 0`, `-v <= 0`; the balances imply nonnegative e, h, u, o.
- Parametric domain: `.5 - d <= 0`, `d - 2.5 <= 0`, `6 - w <= 0`, `w - 28 <= 0`.

The displayed formulation uses canonical zero-right-hand-side constraints.
Each equality remains one equality, never a pair of inequalities. In the site's
standing convention, fixed symbolic parameters are upright uppercase and
non-bold, sets are calligraphic uppercase, and indices are ordinary lowercase
math. This example displays fixed coefficients numerically and needs no sets.
Native MathML with upright identifiers and STIX bold text implements the
variable convention, including in the RTN, axes, controls, and affine rules.

The input limits of 100 and conversion efficiencies .75/.85 produce the 75/85
electricity bounds. The exporter solves the full Energia/Gana formulation,
then selects the original solar and wind variables from each PPOPT affine rule.
Nine raw regions include coincident regions caused by equivalent active sets;
only geometrically coincident polygons with matching dispatch rules are removed,
leaving two distinct critical regions. No geometry is invented for appearance.
The water-infeasible triangle is explicitly hatched. It shows no optimal dispatch
or cost, and reports the water deficit and maximum water-limited hydrogen output.

## Reproduce and validate

Python 3.12 or later:

```sh
python3 -m pip install -r _app/tools/requirements.txt
python3 _app/tools/generate.py
node _app/tools/test-solution.mjs
```

The build pins Energia's source revision, Gana 1.4.0, and PPOPT 1.6.12. PPOPT's
solver path needs a working Gurobi installation/license. No license is needed
to serve or use the exported site.

Python compares every exported rule and feasibility classification with an
independent HiGHS solve of the full 19-variable Energia/Gana formulation at
3,643 parameter points, including domain edges, shared boundaries, the water
feasibility boundary, and offsets to either side. Dispatch, cost, balances,
constraint slacks, and combined polygon area are checked. Results are in
`tools/validation.json`.

The Node check independently enumerates LP vertices to verify the actual browser
evaluator over 5,000 random points and additional boundary cases. It also checks
invalid inputs and explicitly ensures infeasible points have no dispatch/cost.

The controls support drag/tap, arrows (Shift for larger steps), sliders, numeric
inputs, reset, a guided path, constraint details, and model/source information.
The guided path includes feasible and infeasible requests; manual input pauses
it. No animation starts automatically. Mobile stacks the map and inspector.
`&transparent=1` is available only when an embedding container supplies a suitable
dark background; otherwise the app supplies its own navy background.

## Visible model and resource–task network

The introduction shows a resource–task network (RTN) with all six resources
(sunlight, wind, electricity, water, hydrogen, oxygen) and three tasks (PV,
wind generation, electrolysis). Wide and narrow SVG layouts preserve the same
eight directed connections. Resource circles and task rectangles distinguish
the two node types; bold lowercase d and w identify the explored parameters.

The formulation is always visible, including electricity e - s - v = 0, oxygen
o - .7632 e = 0, all resource balances, bounds, and the parameter domain. These
are the full network balances after eliminating renewable input flows; they
reduce to the LP above. Native MathML preserves selectable, accessible equations
without a third-party renderer. Display changes do not alter the solution.

This notebook is a different example from Kakodkar et al. (2024),
[Robust Scheduling of Energy Systems Under Forecasting Uncertainty – A
Multi-Parametric Optimization Approach](https://doi.org/10.1016/B978-0-443-28824-1.50209-X).
That paper schedules wind generation, a small modular reactor, and lithium-ion
storage over 24 periods. It parameterizes the wind-forecast uncertainty set
with theta and reports six critical regions for the resulting one-parameter
robust scheduling problem. The explorer instead varies demand d and water w
in a one-period deterministic LP and has two feasible critical regions. It
must not be presented as a reproduction of the paper or a robust counterpart.
