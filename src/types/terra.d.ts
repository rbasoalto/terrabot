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
   * Some index, doesn't necessarily match position in the array.
   */
  index: number;

  /**
   * Seems to be the same as index, in string form.
   */
  name: string;
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
}
