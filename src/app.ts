import * as express from 'express';
import * as exphbs from 'express-handlebars';
import * as session from 'express-session';
import fetch from 'node-fetch';
import {URLSearchParams} from 'url';
import * as connect_datastore from '@google-cloud/connect-datastore';
import * as passport from 'passport';
import {Strategy as GoogleStrategy} from 'passport-google-oauth20';

import {UserId, User} from './user';
import {Game} from './game';
import {buildMessage} from './chat';

import * as secrets from '../secrets.json';
import {GameState} from './types/terra';
import {datastore} from './storage/datastore';

const DatastoreSessionStore = connect_datastore(session);
const app = express();
app.enable('trust proxy');

app.use(express.json());
app.use(express.urlencoded());
app.use(
  session({
    store: new DatastoreSessionStore({
      kind: 'express-sessions',
      expirationMs: 24 * 60 * 60 * 1000, // 1d in ms
      dataset: datastore,
    }),
    secret: 'who cares',
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');
app.set('views', './src/views');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const APP_VERSION = process.env.GAE_VERSION || 'dev';

passport.use(
  new GoogleStrategy(
    {
      clientID: secrets.auth.google.client_id,
      clientSecret: secrets.auth.google.client_secret,
      callbackURL: `${BASE_URL}/auth/google/callback`,
    },
    (access_token, refresh_token, profile, done) => {
      const user_id: UserId = {provider: profile.provider, id: profile.id};
      const user = new User({
        user_id: user_id,
        name: profile.displayName,
        email: profile.emails ? profile.emails[0].value : undefined,
      });
      User.findOrInsert(user)
        .then(found_user => {
          done(undefined, found_user);
        })
        .catch(error => {
          done(error);
        });
    }
  )
);

const apiAuthenticationRequired = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const user = req.user as User;
  if (user && user.is_admin) {
    next();
  } else {
    res.status(401).json({status: 'Authorization Required'});
  }
};

// Used to stuff a piece of information into a cookie
passport.serializeUser((user: User, done) => {
  done(null, user.user_id);
});

// Used to decode the received cookie and persist session
passport.deserializeUser((user_id: UserId, done) => {
  User.find(user_id)
    .then(user => {
      done(null, user);
    })
    .catch(error => {
      done(new Error(`Error deserializing session user: ${error}`));
    });
});

const sendMessage = async (game: Game) => {
  const msg = buildMessage(game);
  return await fetch(game.webhook_url, {
    method: 'POST',
    body: JSON.stringify(msg),
    headers: {'Content-Type': 'application/json'},
  });
};

const hasGameChanged = (stored_game: Game, game_state: GameState): boolean => {
  if (stored_game.game_state?.ledger?.length !== game_state.ledger.length) {
    return true;
  } else {
    return false;
  }
};

const pollGame = async (game: Game, force_update = false): Promise<number> => {
  const game_url = 'https://terra.snellman.net/app/view-game/';
  const game_req_params = new URLSearchParams();
  game_req_params.append('game', game.game_id);
  const game_state: GameState = await fetch(game_url, {
    method: 'POST',
    body: game_req_params,
  })
    .then(data => data.json())
    .catch(error => {
      throw error;
    });
  console.log(`Game ${game.game_id} polled OK.`);
  if (hasGameChanged(game, game_state) || force_update) {
    const updated_game: Game = {...game, game_state: game_state};
    await Promise.all([
      sendMessage(updated_game),
      Game.updateGame(updated_game),
    ]);
    return 1;
  }
  return 0;
};

app.get('/api/v1/games', async (req, res, next) => {
  try {
    const games = await Game.getGames();
    res.status(200).json(games).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/games/:id', async (req, res, next) => {
  try {
    const game_id = req.params.id;
    const game = await Game.get(game_id);
    res.status(200).json(game).end();
  } catch (error) {
    next(error);
  }
});

app.delete(
  '/api/v1/games/:id',
  apiAuthenticationRequired,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    try {
      const game_id = req.params.id;
      await Game.delete(game_id);
      res.status(200).json({status: 'OK'});
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  '/api/v1/games/:id/poll',
  apiAuthenticationRequired,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const force_update = req.body.force_update || false;
    try {
      const game_id = req.params.id;
      const game = await Game.get(game_id);
      const updated = await pollGame(game, force_update);
      res.status(200).json({status: 'OK', num_games: updated});
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  '/api/v1/games',
  apiAuthenticationRequired,
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    try {
      const game = req.body;
      Game.insertGame(game.game_id, game.webhook_url)
        .then(() => {
          res.status(200).json({status: 'OK'});
        })
        .catch(error => {
          throw error;
        });
    } catch (error) {
      next(error);
    }
  }
);

app.post('/api/v1/run', async (req, res, next) => {
  try {
    const games = await Game.getGames();
    const poll_results = await Promise.all(games.map(game => pollGame(game)));
    const num_updated_games = poll_results.reduce((acc, cur) => acc + cur, 0);
    res.status(200).json({status: 'OK', num_games: num_updated_games});
  } catch (error) {
    next(error);
  }
});

app.get('/', async (req, res) => {
  res.render('index', {user: req.user, app_version: APP_VERSION});
});

app.get('/login', async (req, res) => {
  res.render('login');
});

app.get(
  '/auth/google',
  passport.authenticate('google', {scope: ['openid', 'email', 'profile']})
);

app.get(
  '/auth/google/callback',
  passport.authenticate('google', {failureRedirect: '/login'}),
  (req, res) => {
    let auth_redirect: string;
    if (req.session) {
      auth_redirect = req.session.auth_redirect || '/';
      delete req.session.auth_redirect;
    } else {
      auth_redirect = '/';
    }
    res.redirect(auth_redirect);
  }
);

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});

export default app;
