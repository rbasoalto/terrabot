import {Datastore} from '@google-cloud/datastore';

export interface UserId {
  provider: string;
  id: string;
}

const NAMESPACE = 'terrabot';
const PROVIDER_KIND = 'UserProvider';
const ID_KIND = 'UserId';

const datastore = new Datastore({
  namespace: NAMESPACE,
});

const userKey = (id: UserId) => {
  return datastore.key([PROVIDER_KIND, id.provider, ID_KIND, id.id]);
};

interface IncompleteUser {
  name?: string;
  user_id?: UserId;
  email?: string;
  is_admin?: boolean;
}

export class User {
  static async findOrInsert(user: User): Promise<User> {
    const key = userKey(user.user_id);
    const transaction = datastore.transaction();
    try {
      await transaction.run();
      const [readUser] = await transaction.get(key);
      if (readUser) {
        transaction.rollback();
        return readUser;
      }
      transaction.save({
        key: key,
        data: user,
      });
      await transaction.commit();
      return user;
    } catch (error) {
      transaction.rollback();
      throw error;
    }
  }

  static async find(id: UserId): Promise<User> {
    const [user] = await datastore.get(userKey(id));
    return user;
  }

  constructor(user_like: IncompleteUser) {
    // TODO get rid of the ||
    this.name = user_like.name || '';
    this.user_id = user_like.user_id || {provider: '', id: ''};
    this.email = user_like.email || '';
    this.is_admin = user_like.is_admin ? true : false;
  }

  name: string;
  user_id: UserId;
  email: string;
  is_admin: boolean;
}
