// People come to this canvas to be honest, and some will write something that is
// more than a hard day. This is the backstop for that: a small, deliberately
// specific phrase check that the page uses to put real help in front of someone,
// and that the server uses to stop the AI treating their words as a puzzle.
//
// It is NOT a screen. It will miss indirect language and it cannot understand
// context, so it only ever adds help; it never blocks, hides or judges anything.
// Phrases are specific on purpose ("kill myself", not "killing me") so ordinary
// idioms ("this deadline is killing me", "I'm dying to see them") stay quiet.
// Wording is matched case-insensitively with curly apostrophes folded to straight.

const PHRASES = [
  /\bsuicid/,
  /\bkill(?:ing)? myself\b/,
  /\bend(?:ing)? (?:my own life|my life|it all)\b/,
  /\btake my own life\b/,
  /\btaking my own life\b/,
  /\bwant(?:ed)? to die\b/,
  /\bwish i (?:was|were) dead\b/,
  /\bwish i (?:would|could) (?:just )?(?:not wake up|disappear)\b/,
  /\b(?:don't|do not|didn't) want to (?:be alive|live|be here|go on) anymore\b/,
  /\bno reason to (?:live|go on|be alive)\b/,
  /\b(?:better|best) off (?:dead|without me)\b/,
  /\b(?:hurt|hurting|harm|harming) myself\b/,
  /\bself[- ]?harm/,
  /\babus(?:es|ing|ed) me\b/,
  /\b(?:he|she) (?:hits|hit|beats|beat) me\b(?! (?:up|at|to|in|on|out)\b)/,
  /\b(?:afraid|scared) (?:for my (?:life|safety)|to go home)\b/,
  /\bnot safe (?:at home|with him|with her|with them)\b/,
];

/** True when any of the texts contains language that calls for putting help in view. */
export function signalsDistress(...texts) {
  const joined = texts.filter((t) => typeof t === 'string').join('\n').toLowerCase().replace(/[’‘]/g, "'");
  return PHRASES.some((pattern) => pattern.test(joined));
}
