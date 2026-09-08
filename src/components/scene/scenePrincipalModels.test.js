import { describe, expect, it } from 'vitest';
import {
  PRINCIPAL_MODELS,
  preferPrincipalModelAliases,
  resolvedPrincipalModelId,
} from './scenePrincipalModels.js';

describe('principal scene models', () => {
  it('keeps the shipped Jesus model when no hero asset is available', () => {
    const fallback = { id: 'legacy' };
    const models = new Map([[PRINCIPAL_MODELS.jesus.runtimeId, fallback]]);

    preferPrincipalModelAliases(models);

    expect(models.get(PRINCIPAL_MODELS.jesus.runtimeId)).toBe(fallback);
    expect(resolvedPrincipalModelId(models, 'jesus')).toBe('human-jesus');
  });

  it('aliases the stable runtime id to the hero asset when it is available', () => {
    const fallback = { id: 'legacy' };
    const hero = { id: 'hero' };
    const models = new Map([
      [PRINCIPAL_MODELS.jesus.runtimeId, fallback],
      [PRINCIPAL_MODELS.jesus.preferredId, hero],
    ]);

    preferPrincipalModelAliases(models);

    expect(models.get(PRINCIPAL_MODELS.jesus.runtimeId)).toBe(hero);
    expect(resolvedPrincipalModelId(models, 'jesus')).toBe('human-jesus-v1');
  });

  it('does nothing when neither principal asset has loaded yet', () => {
    const models = new Map();

    preferPrincipalModelAliases(models);

    expect(models.size).toBe(0);
    expect(resolvedPrincipalModelId(models, 'jesus')).toBeNull();
  });
});
