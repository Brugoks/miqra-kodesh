// Principal biblical characters can graduate to dedicated hero assets without
// making an existing scene wait for those larger files to exist. Tableaux keep
// their stable runtime ids (for example `human-jesus`) and this module aliases
// that id to a preferred hero asset only when the preferred model has actually
// loaded and passed the caller's rig validation.

export const PRINCIPAL_MODELS = Object.freeze({
  jesus: Object.freeze({
    runtimeId: 'human-jesus',
    preferredId: 'human-jesus-v1',
  }),
});

export function preferPrincipalModelAliases(models) {
  if (!models?.get || !models?.set) return models;
  for (const spec of Object.values(PRINCIPAL_MODELS)) {
    const preferred = models.get(spec.preferredId);
    if (preferred) models.set(spec.runtimeId, preferred);
  }
  return models;
}

export function resolvedPrincipalModelId(models, name) {
  const spec = PRINCIPAL_MODELS[name];
  if (!spec || !models?.has) return null;
  return models.has(spec.preferredId) ? spec.preferredId
    : models.has(spec.runtimeId) ? spec.runtimeId : null;
}
