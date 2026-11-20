"""Original Energia parametric_hydrogen formulation, with coefficients unchanged.

Source revision: ea42c1a5df65451df664827ca6a67d9793329bcb
Path: docs/examples/case_studies/parametric_hydrogen.ipynb
"""

from energia import Model, Process, Resource
from gana import T, inf


def build_model():
    m = Model("parametric_hydrogen")
    m.declare(Resource, ["sun", "wind", "power", "water", "hydrogen", "oxygen"])
    _ = m.sun.consume <= 100
    _ = m.wind.consume <= 100
    water = m.water.consume
    _ = water >= 0
    delivered = m.hydrogen.release
    _ = delivered >= 0
    _ = m.oxygen.release >= 0
    
    m.pv = Process(m.power == -(1 / 0.75) * m.sun)
    m.wind_farm = Process(m.power == -(1 / 0.85) * m.wind)
    m.electrolyzer = Process(
        m.hydrogen == -(1 / 0.019) * m.power - (0.1753 / 0.019) * m.water
        + (0.7632 / 0.019) * m.oxygen
    )
    for plant in (m.pv, m.wind_farm, m.electrolyzer):
        _ = plant.operate >= 0
        plant.locate()
    
    m.program.demand = T(_=(0.5, 2.5))
    m.program.water_supply = T(_=(6, 28))
    m.program.meet_demand = delivered.V()[0] >= m.program.demand[0]
    m.program.water_limit = water.V()[0] <= m.program.water_supply[0]
    m.program.cost = inf(567 * m.pv.operate.V()[0] + 990 * m.wind_farm.operate.V()[0] + 0.001 * water.V()[0])
    return m
