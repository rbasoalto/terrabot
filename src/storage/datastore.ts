import {Datastore} from '@google-cloud/datastore';

export const datastore = new Datastore({
  namespace: 'terrabot',
});
