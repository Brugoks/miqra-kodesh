import { feelingByKey } from '../../../src/lib/canvasFeelings.js';
import { signalsDistress } from '../../../src/lib/canvasCare.js';

// What Scripture-seeking looks like for each feeling. These steer the choice of
// passages and the tone of the explanation toward what the Bible itself does with
// that feeling, so the AI is bound to Scripture's own treatment of it rather than
// to a generic comforting verse. They describe KINDS of passages and never name
// one: naming passages would hand every person with the same feeling the same
// three verses, and the model's own recall of the text is what gets verified
// against the fetched chapter. The keys must match src/lib/canvasFeelings.js.
export const FEELING_ANGLES: Record<string, string> = {
  overwhelmed: 'Look for passages where people reach the end of their strength and are carried, given rest or helped by others, and for passages that make asking for help a normal part of faith.',
  anxious: 'Look for passages that name fear and worry honestly and show God’s care for people in the middle of them. Avoid a bare "do not be anxious" cut off from the care around it.',
  angry: 'Look for honest anger in Scripture, including lament and protest brought to God, and for passages about what anger does and where to take it. Do not shame the anger; let the passage speak to it on its own terms.',
  grieving: 'Look for passages of mourning and lament, and of Jesus’ own grief, where sorrow is given room before comfort is offered. Do not hurry to a silver lining.',
  numb: 'Look for passages of weariness, silence, waiting, and being unable to feel or to pray, where God stays present anyway.',
  ashamed: 'Look for passages on shame, confession and restoration, and keep guilt, shame and what God says about the person distinct. Do not minimize real wrongdoing and do not condemn.',
  lonely: 'Look for passages about isolation and belonging: people who felt alone, God’s nearness, and the call to community.',
  doubting: 'Look for honest questioning and doubt in Scripture and for how God meets people who doubt. Do not treat doubt as the opposite of faith unless the passage itself does.',
  confused: 'Look for passages where people do not understand what God is doing, including wisdom literature on mystery and trust, without promising an explanation.',
  grateful: 'Look for passages of thanksgiving and of remembering what God has done, and ones that help gratitude deepen rather than stay a passing mood.',
  hopeful: 'Look for passages of hope rooted in what God has said and done, and that stay honest about what is still unresolved.',
  joyful: 'Look for passages of rejoicing and celebration, and for how joy is shared and remembered.',
};

// Always applied: the canvas is a place to be unguarded, so every glimpse is read
// as possibly raw. Strictly about handling what is said, and about staying inside
// what the text says.
export const PASTORAL_RULES = 'The glimpse may be raw, unfiltered emotion. Treat honesty as welcome: never correct, minimize or spiritualize it away, and never imply that a feeling is sin or a lack of faith unless the passage itself says that of that very thing. Let Scripture meet the person where they are. Stay inside what the passage actually says, including what it does not say, and never promise that feelings or circumstances will change.';

const CARE_RULES = 'The reader’s words may signal serious distress or danger. Do not offer Scripture as a cure or a quick answer, choose nothing that could be read as endorsing self-harm, keep every explanation short, gentle and honest, and do not suggest they face this alone; the app is already showing them where to get immediate help.';

export const isKnownFeeling = (key: unknown) => typeof key === 'string' && !!feelingByKey(key) && key in FEELING_ANGLES;

/** The extra instructions for one request: always the pastoral rules, plus whatever this feeling and this text call for. */
export function guidanceFor(input: { glimpse: string; focus: string; feeling?: string }) {
  const feeling = input.feeling ? feelingByKey(input.feeling) : null;
  return [
    PASTORAL_RULES,
    feeling && `The reader says they feel ${feeling.label.toLowerCase()}. ${FEELING_ANGLES[feeling.key]}`,
    signalsDistress(input.glimpse, input.focus) && CARE_RULES,
  ].filter(Boolean).join(' ');
}
