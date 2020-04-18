import {chat_v1} from 'googleapis';
import {Game} from './game';

export type Message = chat_v1.Schema$Message;
type Card = chat_v1.Schema$Card;
type CardHeader = chat_v1.Schema$CardHeader;
type Section = chat_v1.Schema$Section;
type Widget = chat_v1.Schema$WidgetMarkup;
type TextParagraph = chat_v1.Schema$TextParagraph;
type KeyValue = chat_v1.Schema$KeyValue;

const fillGameCard = (game: Game, card: Card): void => {
  const actions_required: Section = {
    header: 'Actions Required',
    widgets: [],
  };
  game.game_state?.action_required.forEach(action => {
    actions_required.widgets?.push({
      keyValue: {
        topLabel: action.player || action.faction,
        content: action.type,
      },
    });
  });
  card.sections?.push(actions_required);
};

export const buildMessage = (game: Game): Message => {
  const round = game.game_state?.round;
  const turn = game.game_state?.turn;
  const card: Card = {
    header: {
      title: `TerraBot for game ${game.game_id}`,
      subtitle: `Round ${round}, turn ${turn}`,
      imageUrl: 'https://storage.googleapis.com/rbw-bots-static/tmspade.png',
      imageStyle: 'IMAGE',
    },
    sections: [],
  };
  if (game.game_state) {
    fillGameCard(game, card);
  } else {
    card.sections?.push({
      widgets: [{textParagraph: {text: 'Game is not initialized yet.'}}],
    });
  }
  card.sections?.push({
    widgets: [
      {
        buttons: [
          {
            textButton: {
              text: 'VIEW GAME',
              onClick: {
                openLink: {
                  url: `https://terra.snellman.net/game/${game.game_id}/`,
                },
              },
            },
          },
        ],
      },
    ],
  });
  return {
    cards: [card],
  };
};
