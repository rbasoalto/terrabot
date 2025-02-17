export interface LedgerEntry {
  comment?: string;
  faction?: string;
  commands?: string;
}

export interface ActionRequired {
  player?: string;
  faction?: string;
  type?: string;
}

export interface GameMetadata {
  /**
   * String-encoded float. Appears to be seconds since the last action.
   */
  time_since_update: string;
  finished: number;
  aborted: number;
}

export interface Player {
  /**
   * Username in the service.
   */
  username: string;

  /**
   * Seems to be == username.
   */
  displayname: string;

  /**
   * Some index, doesn't necessarily match position in the array. Maybe playing order?
   */
  index: number;

  /**
   * Seems to be the same as index, in string form.
   */
  name: string;
}

export interface Faction {
  /**
   * Faction display name.
   */
  display: string;
  /**
   * Display name of player playing this faction.
   */
  player: string;
  /**
   * Username of the player playing this faction.
   */
  username: string;
  /**
   * Victory points
   */
  VP: number;
  /**
   * VP projection. Sometimes present.
   */
  vp_projection?: VPProjection;
}

export interface VPProjection {
  total: number;
}

export interface GameState {
  ledger: Array<LedgerEntry>;
  action_required: Array<ActionRequired>;
  metadata: GameMetadata;
  finished: number;
  aborted: number;
  round: string;
  turn: number;
  players: Array<Player>;
  factions: Record<string, Faction>;
}
