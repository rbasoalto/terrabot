# TerraBot

Web app that can scrape Terra Mystica games off of https://terra.snellman.net/, and send chat messages on Google Chat when it's somebody's turn to play.

Written in TypeScript, runs on Google App Engine, with Google Cloud Datastore for storage, and Google OAuth login for admin authentication (add/delete monitored games). Useful to set up a Google Cloud Scheduler cron job to periodically poll the games for changes.

# Running

- Add a file `secrets.json` in the root dir with this form:

```json
{
  "auth": {
    "google": {
      "client_id": "YOUR GOOGLE OAUTH2 CLIENT ID",
      "client_secret": "YOUR GOOGLE OAUTH2 CLIENT SECRET",
    }
  }
}
```

- Edit `app.yaml` with your base url (for the login redirect)

- Run `npm install`.

- Run `gcloud app deploy` to deploy to App Engine (after you've done all the boring `gcloud auth` stuff, set up your project, etc).
