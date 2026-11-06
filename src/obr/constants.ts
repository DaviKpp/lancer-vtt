// Reverse-domain prefix for every metadata key and broadcast channel, per the
// Owlbear Rodeo metadata guidelines (metadata is shared between extensions).
export const ID = "com.lancer-vtt";

/** Room metadata key prefix for one combatant's live state: `${COMBATANT_PREFIX}${id}` */
export const COMBATANT_PREFIX = `${ID}/c/`;
/** Room metadata key for the current encounter. */
export const ENCOUNTER_KEY = `${ID}/encounter`;
/** Item metadata key placed on linked tokens: { id: combatantId } */
export const LINK_KEY = `${ID}/link`;

export const SHEET_CHANNEL = `${ID}/sheets`;
export const ROLL_CHANNEL = `${ID}/roll`;
export const OPEN_CHANNEL = `${ID}/open`;
export const ANNOUNCE_CHANNEL = `${ID}/announce`;

export const CONTEXT_LINK_ID = `${ID}/context-link`;
export const CONTEXT_OPEN_ID = `${ID}/context-open`;
export const CONTEXT_TURN_ID = `${ID}/context-turn`;
export const LINK_MODAL_ID = `${ID}/link-modal`;
/** Metadata key on local HUD items drawn over linked tokens. */
export const HUD_KEY = `${ID}/hud`;
