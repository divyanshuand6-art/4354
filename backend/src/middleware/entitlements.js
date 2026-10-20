const PLAN_RANK = { free: 0, pro: 1, growth: 2 };

export function hasPlan(user, minimumPlan) {
  if (user?.role === 'admin') return true;
  const current = PLAN_RANK[user?.plan] ?? 0;
  const required = PLAN_RANK[minimumPlan] ?? Number.POSITIVE_INFINITY;
  return current >= required;
}

export function requirePlan(minimumPlan, featureName = 'This feature') {
  return (req, res, next) => {
    if (hasPlan(req.user, minimumPlan)) return next();
    const planName = minimumPlan === 'growth' ? 'Growth' : 'Pro';
    return res.status(403).json({
      code: 'PLAN_UPGRADE_REQUIRED',
      requiredPlan: minimumPlan,
      error: `${featureName} requires the ${planName} plan. Upgrade from Plans & billing to unlock it.`
    });
  };
}
