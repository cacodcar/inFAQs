/** Evaluate an exported explicit solution. No solver runs in the browser. */
export const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

export function evaluate(model, theta, tolerance = 1e-9) {
  if (theta.length !== 2 || theta.some((v, i) => !Number.isFinite(v) ||
      v < model.domain[i][0] - tolerance || v > model.domain[i][1] + tolerance)) return null;
  const regions = model.regions.filter(r => r.E.every((row, i) => dot(row, theta) <= r.f[i] + tolerance));
  if (!regions.length) return null;
  const region = regions[0];
  const x = region.F.map((row, i) => dot(row, theta) + region.g[i]);
  const slacks = model.A.map((row, i) => model.b[i] - dot(row, x));
  return {region, regions, x, slacks,
    active: slacks.flatMap((slack, i) => Math.abs(slack) <= 1e-8 ? [i] : []),
    objective: x.reduce((sum, v, i) => sum + 0.5 * (v - theta[i]) ** 2, 0)};
}

export function affineText(row, constant, digits = 3) {
  const terms = [...row.map((v, i) => [v, ['θ₁', 'θ₂'][i]]), [constant, '']];
  let text = '';
  for (const [value, variable] of terms) {
    if (Math.abs(value) < 1e-10) continue;
    const magnitude = Math.abs(value);
    const number = variable && Math.abs(magnitude - 1) < 1e-10 ? '' : Number(magnitude.toFixed(digits)).toString();
    text += `${text ? (value < 0 ? ' − ' : ' + ') : (value < 0 ? '−' : '')}${number}${variable}`;
  }
  return text || '0';
}
