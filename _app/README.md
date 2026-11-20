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

With solar electricity S, wind electricity V, hydrogen H, and water use U:

- Minimize `567 S + 990 V + .001 U`.
- `H = .019 (S + V) >= D`.
- `U = .1753 (S + V) <= W`.
- `0 <= S <= 75`, `0 <= V <= 85`.
- `D in [.5, 2.5]`, `W in [6, 28]`.

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
