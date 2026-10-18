import { describe, expect, it } from 'vitest';
import { signalsDistress } from './canvasCare';

describe('signalsDistress', () => {
  it.each([
    'I want to kill myself',
    'Some days I think about ending my life.',
    'I don’t want to live anymore',
    "I don't want to be alive anymore",
    'I keep having thoughts of suicide',
    'I wish I was dead',
    'There is no reason to go on',
    'My family would be better off without me',
    'I have been thinking about hurting myself',
    'I am struggling with self-harm again',
    'He hits me when he is angry',
    'She abuses me and I have nowhere to go',
    'I am afraid for my life',
    'I am scared to go home',
    "It isn't safe, I'm not safe at home",
    'I WANT TO DIE',
  ])('puts help in view for: %s', (text) => {
    expect(signalsDistress(text)).toBe(true);
  });

  it.each([
    'This deadline is killing me',
    'I’m dying to see my friend',
    'My phone died and I lost everything',
    'It hit me that I was lonely',
    'That beats me, honestly',
    'It hurts me that he forgot my birthday',
    'I’m cutting myself some slack today',
    'I was so angry at God I wanted to scream',
    'I am grieving my mother, who died last year',
    'I want to understand why this happened',
    'She hit me up on Facebook last night',
    'He beats me at chess every time',
    'I could not end the meeting fast enough',
    'I feel overwhelmed and numb and I do not know why',
    '',
  ])('stays quiet for ordinary hard feelings and idioms: %s', (text) => {
    expect(signalsDistress(text)).toBe(false);
  });

  it('reads across several texts and ignores values that are not text', () => {
    expect(signalsDistress('A quiet day', undefined, null, 'I want to die')).toBe(true);
    expect(signalsDistress(undefined, null, 42)).toBe(false);
    expect(signalsDistress()).toBe(false);
  });
});
