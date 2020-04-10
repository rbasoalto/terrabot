'use strict';

const express = require('express');
const crypto = require('crypto');

const app = express();
app.enable('trust proxy');

app.use(express.json());
app.use(express.urlencoded());

const {Datastore} = require('@google-cloud/datastore');
const datastore = new Datastore();

const insertGame = (game_id) => {
  return datastore.save({
    key: datastore.key(['game', game_id]),
    data: {
      game_id: game_id,
      created_at: new Date(),
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

const getGame = (game_id) => {
  return datastore.get(datastore.key(['game', game_id]));
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

app.post('/games', async (req, res, next) => {
  try {
    const game = req.body;
    await insertGame(game.game_id);
    res.status(200).end();
  } catch (error) {
    next(error);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});

module.exports = app;
