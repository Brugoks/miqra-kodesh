/** The class list for a card, from what it is and how the board is being used. */
export const cardClasses = (data, selected) => ['lc-card', `lc-card--${data.kind}`, selected && 'is-selected', data.connectSource && 'is-source', data.connecting && !data.connectSource && 'is-target-candidate'].filter(Boolean).join(' ');
