import {GameState} from './types/terra';
import {datastore} from './storage/datastore';

export interface IncompleteGame {
  game_id?: string;
  created_at?: Date;
  updated_at?: Date;
  webhook_url?: string;
  game_state?: GameState | string;
}

interface SerializedGame extends IncompleteGame {
  game_id: string;
  created_at: Date;
  updated_at: Date;
  webhook_url: string;
  game_state?: string;
}

export class Game implements IncompleteGame {
  game_id: string;
  created_at: Date;
  updated_at: Date;
  webhook_url: string;
  game_state?: GameState;

  constructor(igame: IncompleteGame) {
    this.game_id = igame.game_id || '';
    this.created_at = igame.created_at || new Date();
    this.updated_at = igame.updated_at || this.created_at;
    this.webhook_url = igame.webhook_url || '';
    if (typeof igame.game_state !== 'string') {
      this.game_state = igame.game_state;
    }
  }

  public static async insertGame(
    game_id: string,
    webhook_url: string
  ): Promise<void> {
    const game = new Game({
      game_id: game_id,
      webhook_url: webhook_url,
    });
    const game_with_serialized_state = {
      ...game,
      game_state: JSON.stringify(game.game_state || {}),
    };
    console.log(JSON.stringify(game));

    await datastore
      .save({
        key: datastore.key(['game', game.game_id]),
        excludeFromIndexes: ['game_state'],
        data: game_with_serialized_state,
      })
      .catch(err => {
        console.log(`failed to save game: ${err}`);
        throw err;
      });
  }
  public static async get(game_id: string): Promise<Game> {
    const [game_with_serialized_state] = await datastore.get(
      datastore.key(['game', game_id])
    );
    const game = this.deserializeGameState(game_with_serialized_state);
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
    const [games_with_serialized_states] = await datastore.runQuery(query);
    const games = games_with_serialized_states.map(this.deserializeGameState);
    return games;
  }
  public static async updateGame(game_to_update: Game) {
    const game: Game = {...game_to_update, updated_at: new Date()};
    const game_with_serialized_state = {
      ...game,
      game_state: JSON.stringify(game.game_state || {}),
    };
    console.log(`Will try to update ${JSON.stringify(game.game_id)}`);
    try {
      const update_result = await datastore.update({
        key: datastore.key(['game', game.game_id]),
        excludeFromIndexes: ['game_state'],
        data: game_with_serialized_state,
      });
      console.log(
        `Game ${game.game_id} updated in Datastore: ${JSON.stringify(
          update_result
        )}`
      );
      return update_result;
    } catch (error) {
      console.log(`Error updating game ${game.game_id} in Datastore: ${error}`);
      throw error;
    }
  }

  private static deserializeGameState(
    game_with_serialized_state: SerializedGame
  ): Game {
    return {
      ...game_with_serialized_state,
      game_state: game_with_serialized_state.game_state
        ? JSON.parse(game_with_serialized_state.game_state)
        : {},
    };
  }
}
