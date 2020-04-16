import express, { Request, Response, NextFunction } from "express";
import exphbs from "express-handlebars";
import session from "express-session";
import fetch from "node-fetch";
import { URLSearchParams } from "url";
import { Datastore } from "@google-cloud/datastore";
import connect_datastore from "@google-cloud/connect-datastore";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

import { UserId, User } from "./user";
import { Game } from "./game";

import secrets from "../secrets.json";
import { eventNames } from "cluster";
import { runInNewContext } from "vm";

const DatastoreSessionStore = connect_datastore(session);
const datastore = new Datastore({
  namespace: 'terrabot',
});
const app = express();
app.enable('trust proxy');

app.use(express.json());
app.use(express.urlencoded());
app.use(session({
  store: new DatastoreSessionStore({
    kind: "express-sessions",
    expirationMs: 24 * 60 * 60 * 1000,  // 1d in ms
    dataset: datastore,
  }),
  secret: 'who cares',
}));
app.use(passport.initialize());
app.use(passport.session());

app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');
app.set('views', './src/views');

const BASE_URL = process.env.BASE_URL;

passport.use(new GoogleStrategy({
  clientID: secrets.auth.google.client_id,
  clientSecret: secrets.auth.google.client_secret,
  callbackURL: `${BASE_URL}/auth/google/callback`,
}, (access_token, refresh_token, profile, done) => {
  const user_id: UserId = { provider: profile.provider, id: profile.id };
  const user = new User({
    user_id: user_id,
    name: profile.displayName,
    email: profile.emails[0].value,
  });
  User.findOrInsert(user).then(found_user => {
    done(null, found_user);
  }).catch(error => {
    done(error);
  })
}));

const apiAuthenticationRequired = (req: Request, res: Response, next: NextFunction) => {
  const user: User = <User>req.user;
  if (user && user.is_admin) {
    next();
  } else {
    res.status(401).json({ status: "Authorization Required" });
  }
};

const isUserAuthenticated = (redirect?: string) => ((req: Request, res: Response, next: NextFunction) => {
  const user: User = <User>req.user;
  if (user && user.is_admin) {
    next();
  } else {
    req.session.auth_redirect = redirect;
    res.redirect('/login');
  }
});

// Used to stuff a piece of information into a cookie
passport.serializeUser((user: User, done) => {
  done(null, user.user_id);
});

// Used to decode the received cookie and persist session
passport.deserializeUser((user_id: UserId, done) => {
  User.find(user_id).then(user => {
    done(null, user);
  }).catch(error => {
    done(new Error(`Error deserializing session user: ${error}`));
  })
});

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

const getGames = async (limit?: number) => {
  let query = datastore
    .createQuery('game')
    .order('created_at', { descending: true });
  if (limit) {
    query.limit(limit);
  }
  return datastore.runQuery(query);
}

const getGame = async (game_id: string): Promise<Game> => {
  const [game] = await datastore.get(datastore.key(['game', game_id]));
  return game
}

const deleteGame = (game_id: string) => {
  return datastore.delete(datastore.key(['game', game_id]));
}

const subtractSeconds = (base: Date, delta_seconds: number): Date => {
  let result = base;
  result.setSeconds(result.getSeconds() - delta_seconds);
  return result;
}

const sendMessage = async (game: Game, game_state: any) => {
  const action_required = game_state.action_required;
  const msg = action_required.map((action: any) => `${action.faction || action.player} => ${action.type}`).join('\n');  
  return await fetch(game.webhook_url, {
    method: 'POST',
    body: JSON.stringify({ text: msg }),
    headers: { 'Content-Type': 'application/json' }
  });
}

const updateGamePolledAt = async (game: Game, now: Date) => {
  let updated_game = game;
  updated_game.last_polled_at = now;
  return await datastore.update({
    key: datastore.key(['game', game.game_id]),
    data: updated_game,
  });
}

const pollGame = async (game: Game): Promise<number> => {
  const game_url = 'https://terra.snellman.net/app/view-game/';
  let game_req_params = new URLSearchParams();
  game_req_params.append('game', game.game_id);
  const now = new Date();
  const game_state  = await fetch(game_url, { method: 'POST', body: game_req_params }).then(data => data.json());
  const game_seconds_since_update = parseFloat(game_state.metadata.time_since_update);
  const updated_at = subtractSeconds(now, game_seconds_since_update + 5 /*slop*/)
  if (!game.last_polled_at || game.last_polled_at < updated_at) {
    await Promise.all([
      sendMessage(game, game_state),
      updateGamePolledAt(game, now),
    ]);
    return 1;
  }
  return 0;
}

app.get('/api/v1/games', async (req, res, next) => {
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

app.get('/api/v1/games/:id', async (req, res, next) => {
  try {
    const game_id = req.params.id;
    const game = await getGame(game_id);
    res.status(200).json(game).end();
  } catch (error) {
    next(error);
  }
});

app.delete('/api/v1/games/:id', apiAuthenticationRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const game_id = req.params.id;
    await deleteGame(game_id);
    res.status(200).json({ status: "OK" });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/games', apiAuthenticationRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const game = req.body;
    insertGame(game.game_id, game.webhook_url).then(value => {
      res.status(200).json({ status: "OK" });
    }).catch(error => { throw error; });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/run', async (req, res, next) => {
  try {
    const [games] = await getGames();
    const poll_results = await Promise.all(games.map(game => pollGame(game)));
    const num_updated_games = poll_results.reduce((acc, cur) => (acc + cur));
    res.status(200).json({ status: "OK", num_games: num_updated_games });
  } catch (error) {
    next(error);
  }
});


app.get('/', async (req, res, next) => {
  res.render('index', { user: req.user });
});

app.get('/login', async (req, res, next) => {
  res.render('login');
});

app.get('/auth/google', passport.authenticate('google', { scope: ['openid', 'email', 'profile'] }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
  const auth_redirect = req.session.auth_redirect || '/';
  delete req.session.auth_redirect;
  res.redirect(auth_redirect);
});

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