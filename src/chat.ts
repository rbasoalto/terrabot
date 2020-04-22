import {chat_v1} from 'googleapis';
import {Game} from './game';
import { GameState, Faction, ActionRequired, Player } from './types/terra';

export type Message = chat_v1.Schema$Message;
type Card = chat_v1.Schema$Card;
type CardHeader = chat_v1.Schema$CardHeader;
type Section = chat_v1.Schema$Section;
type Widget = chat_v1.Schema$WidgetMarkup;
type TextParagraph = chat_v1.Schema$TextParagraph;
type KeyValue = chat_v1.Schema$KeyValue;

export const buildMessage = (game: Game): Message => {
  const msgMaker = new MessageMaker(game);
  return msgMaker.make();
};

class MessageMaker {
  private game_id: string;
  /**
   * All of the game state. Some fields will be denormalized below too.
   */
  private game_state: GameState;
  private factions: Record<string, Faction>;
  private players: Player[];
  private action_requireds: ActionRequired[];

  constructor(game: Game) {
    if (!game.game_state) {
      throw new Error("Can't build a message for a game with no state.");
    }
    this.game_id = game.game_id;
    this.game_state = game.game_state;
    this.factions = game.game_state.factions;
    this.players = game.game_state.players;
    this.action_requireds = game.game_state.action_required;
  }

  public make(): Message {
    const round = this.game_state.round;
    const turn = this.game_state.turn;
    const card: Card = {
      header: {
        title: this.game_id,
        subtitle: `Round ${round}, turn ${turn}`,
        imageUrl: 'https://storage.googleapis.com/rbw-bots-static/tmspade.png',
        imageStyle: 'IMAGE',
      },
      sections: [],
    };
    const summary = this.fillGameCardAndGetSummary(card);
    card.sections?.push({
      widgets: [
        {
          buttons: [
            {
              textButton: {
                text: 'VIEW GAME',
                onClick: {
                  openLink: {
                    url: `https://terra.snellman.net/game/${this.game_id}/`,
                  },
                },
              },
            },
          ],
        },
      ],
    });
    return {
      text: summary,
      cards: [card],
    };
  }

  private fillGameCardAndGetSummary(card: Card): string {
    const players_with_actions = new Set<string>();
    // Actions required
    const actions_required: Section = {
      header: 'Actions Required',
      widgets: [],
    };
    this.game_state.action_required.forEach(action => {
      const playerDisplayName = this.getPlayerOrFactionDisplayName(
        action.player,
        action.faction
      );
      players_with_actions.add(playerDisplayName);
      actions_required.widgets?.push({
        keyValue: {
          topLabel: playerDisplayName,
          content: action.type,
          button: {
            textButton: {
              text: 'PLAY',
              onClick: {
                openLink: {
                  url: `https://terra.snellman.net/faction/${this.game_id}/${action.faction}/`,
                },
              },
            },
          },
        },
      });
    });
    card.sections?.push(actions_required);
    // Last moves
    const last_moves: Section = {
      header: 'Last Moves (latest first)',
      widgets: [],
    };
    const ledger_length = this.game_state.ledger.length;
    this.game_state.ledger
      .slice(Math.max(0, ledger_length - 5))
      .reverse()
      .forEach(entry => {
        if (entry.faction) {
          last_moves.widgets?.push({
            keyValue: {
              topLabel: this.getPlayerOrFactionDisplayName(
                undefined,
                entry.faction
              ),
              content: entry.commands || entry.comment || '?',
            },
          });
        }
      });
    card.sections?.push(last_moves);
    return (
      'Waiting for ' + Array.from(players_with_actions).sort().join(', ') + '.'
    );
  }

  private getPlayerOrFactionDisplayName(
    player?: string,
    faction?: string
  ): string {
    if (player) {
      const playerObj = this.players.find(
        (candidatePlayer: Player) => candidatePlayer.username === player
      );
      return playerObj?.displayname || player;
    } else if (faction) {
      const factionObj = this.factions[faction];
      return `${factionObj?.display} (${factionObj?.player})`;
    } else {
      return 'Unknown';
    }
  }
}
