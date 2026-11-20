/** Evaluate an exported explicit LP solution. No solver runs in the browser. */
export const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

export function evaluate(model, theta, tolerance = 1e-8) {
  if (!Array.isArray(theta) || theta.length !== 2 || theta.some((v, i) => !Number.isFinite(v) ||
      v < model.domain[i][0] - tolerance || v > model.domain[i][1] + tolerance)) return null;
  const regions = model.regions.filter(r => r.E.every((row, i) => dot(row, theta) <= r.f[i] + tolerance));
  const waterRequired = model.water_per_hydrogen * theta[0];
  if (!regions.length) return {feasible:false, waterRequired, waterDeficit:Math.max(0,waterRequired-theta[1])};
  const region = regions[0];
  const x = region.F.map((row, i) => dot(row, theta) + region.g[i]);
  const slacks = model.A.map((row, i) => model.b[i] + dot(model.B[i],theta) - dot(row,x));
  return {feasible:true, region, regions, x, slacks, waterRequired,
    active:slacks.flatMap((slack,i)=>Math.abs(slack)<=tolerance?[i]:[]),
    hydrogen:model.hydrogen_yield*(x[0]+x[1]), water:model.water_per_power*(x[0]+x[1]),
    objective:dot(model.c,x)};
}

export function affineText(row, constant, digits = 3, symbols = ['D', 'W']) {
  const terms = [...row.map((v, i) => [v, symbols[i]]), [constant, '']];
  let text = '';
  for (const [value, variable] of terms) {
    if (Math.abs(value) < 1e-10) continue;
    const magnitude = Math.abs(value);
    const number = variable && Math.abs(magnitude - 1) < 1e-10 ? '' : Number(magnitude.toFixed(digits)).toString();
    text += `${text ? (value < 0 ? ' − ' : ' + ') : (value < 0 ? '−' : '')}${number}${variable}`;
  }
  return text || '0';
}
