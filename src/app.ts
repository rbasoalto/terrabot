import express from "express";
import { Datastore } from "@google-cloud/datastore";

const app = express();
app.enable('trust proxy');

app.use(express.json());
app.use(express.urlencoded());

const datastore = new Datastore();

const fetch = require('node-fetch');
const {URLSearchParams} = require('url');

const insertGame = (game_id: string, webhook_url: string) => {
  return datastore.save({
    key: datastore.key(['game', game_id]),
    data: {
      game_id: game_id,
      created_at: new Date(),
      webhook_url: webhook_url,
      last_polled_at: null,
    },
  });
};

const getGames = () => {
  const query = datastore
    .createQuery('game')
    .order('created_at', {descending: true});
  return datastore.runQuery(query);
}

const getGame = (game_id: string) => {
  return datastore.get(datastore.key(['game', game_id]));
}

const deleteGame = (game_id: string) => {
  return datastore.delete(datastore.key(['game', game_id]));
}

const pollGame = async (game: any) => {
  const game_url = 'https://terra.snellman.net/app/view-game/';
  let game_req_params = new URLSearchParams();
  game_req_params.append('game', game.game_id);
  await fetch(game_url, {method: 'POST', body: game_req_params})
    .then((res: any) => res.json())
    .then((game_state: any) => {
      const action_required = game_state.action_required;
      console.log(action_required);
      const msg = action_required
        .map((action: any) => `${action.faction || action.player} => ${action.type}`)
        .join('\n');
      return fetch(game.webhook_url, {method: 'POST', body: JSON.stringify({text: msg}), headers: {'Content-Type': 'application/json'}});
    }).catch((error: Error) => {
      console.log(error)
      throw error
    });
}

app.get('/games', async (req, res, next) => {
  try {
    const [games] = await getGames();
    res
      .status(200)
      .json(games)
      .end();
  } catch (error) {
    next(error);
  }
});

app.get('/games/:id', async (req, res, next) => {
  try {
    const game_id = req.params.id;
    const game = await getGame(game_id);
    res.status(200).json(game).end();
  } catch (error) {
    next(error);
  }
});

app.delete('/games/:id', async (req, res, next) => {
  try {
    const game_id = req.params.id;
    await deleteGame(game_id);
    res.status(200).end();
  } catch (error) {
    next(error);
  }
});

app.post('/games', async (req, res, next) => {
  try {
    const game = req.body;
    await insertGame(game.game_id, game.webhook_url);
    res.status(200).end();
  } catch (error) {
    next(error);
  }
});

app.post('/run', async (req, res, next) => {
  try {
    const [games] = await getGames();
    Promise.all(games.map(async game => {
      pollGame(game);
    }))
      .then(results => {
        res.status(200).end();
      })
      .catch(error => {throw error;});
  } catch (error) {
    next(error);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});

export default app;