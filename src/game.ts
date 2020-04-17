import {LedgerEntry} from './types/terra';
import {datastore} from './storage/datastore';

export interface IncompleteGame {
  game_id?: string;
  created_at?: Date;
  webhook_url?: string;
  last_polled_at?: Date;
  ledger?: Array<LedgerEntry>;
}

export class Game implements IncompleteGame {
  game_id: string;
  created_at: Date;
  webhook_url: string;
  last_polled_at?: Date;
  ledger: Array<LedgerEntry>;

  constructor(igame: IncompleteGame) {
    this.game_id = igame.game_id || '';
    this.created_at = igame.created_at || new Date();
    this.webhook_url = igame.webhook_url || '';
    this.last_polled_at = igame.last_polled_at || new Date(0);
    this.ledger = igame.ledger || [];
  }

  public static async insertGame(
    game_id: string,
    webhook_url: string
  ): Promise<void> {
    const game = new Game({
      game_id: game_id,
      webhook_url: webhook_url,
    });
    console.log(JSON.stringify(game));

    await datastore
      .save({
        key: datastore.key(['game', game.game_id]),
        data: game,
      })
      .catch(err => {
        console.log(`failed to save game: ${err}`);
        throw err;
      });
  }
  public static async get(game_id: string): Promise<Game> {
    const [game] = await datastore.get(datastore.key(['game', game_id]));
    return game;
  }
  public static async delete(game_id: string) {
    return await datastore.delete(datastore.key(['game', game_id]));
  }
  public static async getGames(limit?: number): Promise<Array<Game>> {
    const query = datastore
      .createQuery('game')
      .order('created_at', {descending: true});
    if (limit) {
      query.limit(limit);
    }
    const [games] = await datastore.runQuery(query);
    return games;
  }
  public static async updateGame(game: Game) {
    return await datastore.update({
      key: datastore.key(['game', game.game_id]),
      data: game,
    });
  }
}
