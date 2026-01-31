import Database from "bun:sqlite";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  role: string | null;
}

interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Account {
  userId: string;
  accountId: string;
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  expiresAt: Date | null;
  password: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Verification {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: Date;
}

export function createBunSQLiteAdapter(db: Database) {
  // Initialize tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE,
      email TEXT UNIQUE,
      emailVerified INTEGER DEFAULT 0 NOT NULL,
      image TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      role TEXT
    );

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      ipAddress TEXT,
      userAgent TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS account (
      userId TEXT NOT NULL,
      accountId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      accessToken TEXT,
      refreshToken TEXT,
      idToken TEXT,
      expiresAt INTEGER,
      password TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      PRIMARY KEY (providerId, accountId),
      FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS user_name_unique ON user(name);
    CREATE UNIQUE INDEX IF NOT EXISTS user_email_unique ON user(email);
    CREATE UNIQUE INDEX IF NOT EXISTS session_token_unique ON session(token);
  `);

  return {
    user: {
      create: (data: User) => {
        const stmt = db.prepare(`
          INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt, role)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          data.id,
          data.name,
          data.email,
          data.emailVerified ? 1 : 0,
          data.image,
          data.createdAt.getTime(),
          data.updatedAt.getTime(),
          data.role
        );
        return data;
      },
      findById: (id: string) => {
        const stmt = db.prepare("SELECT * FROM user WHERE id = ?");
        const row = stmt.get(id) as any;
        if (!row) return null;
        return {
          id: row.id,
          name: row.name,
          email: row.email,
          emailVerified: row.emailVerified === 1,
          image: row.image,
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
          role: row.role,
        };
      },
      findByEmail: (email: string) => {
        const stmt = db.prepare("SELECT * FROM user WHERE email = ?");
        const row = stmt.get(email) as any;
        if (!row) return null;
        return {
          id: row.id,
          name: row.name,
          email: row.email,
          emailVerified: row.emailVerified === 1,
          image: row.image,
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
          role: row.role,
        };
      },
      update: (data: Partial<User> & { id: string }) => {
        const stmt = db.prepare(`
          UPDATE user
          SET name = ?, email = ?, emailVerified = ?, image = ?, updatedAt = ?, role = ?
          WHERE id = ?
        `);
        stmt.run(
          data.name,
          data.email,
          data.emailVerified ? 1 : 0,
          data.image,
          data.updatedAt?.getTime() || Date.now(),
          data.role,
          data.id
        );
        return data;
      },
    },
    session: {
      create: (data: Session) => {
        const stmt = db.prepare(`
          INSERT INTO session (id, userId, expiresAt, token, ipAddress, userAgent, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          data.id,
          data.userId,
          data.expiresAt.getTime(),
          data.token,
          data.ipAddress,
          data.userAgent,
          data.createdAt.getTime(),
          data.updatedAt.getTime()
        );
        return data;
      },
      findById: (id: string) => {
        const stmt = db.prepare("SELECT * FROM session WHERE id = ?");
        const row = stmt.get(id) as any;
        if (!row) return null;
        return {
          id: row.id,
          userId: row.userId,
          expiresAt: new Date(row.expiresAt),
          token: row.token,
          ipAddress: row.ipAddress,
          userAgent: row.userAgent,
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
        };
      },
      findByToken: (token: string) => {
        const stmt = db.prepare("SELECT * FROM session WHERE token = ?");
        const row = stmt.get(token) as any;
        if (!row) return null;
        return {
          id: row.id,
          userId: row.userId,
          expiresAt: new Date(row.expiresAt),
          token: row.token,
          ipAddress: row.ipAddress,
          userAgent: row.userAgent,
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
        };
      },
      delete: (id: string) => {
        const stmt = db.prepare("DELETE FROM session WHERE id = ?");
        stmt.run(id);
      },
      deleteByUserId: (userId: string) => {
        const stmt = db.prepare("DELETE FROM session WHERE userId = ?");
        stmt.run(userId);
      },
    },
    account: {
      create: (data: Account) => {
        const stmt = db.prepare(`
          INSERT INTO account (userId, accountId, providerId, accessToken, refreshToken, idToken, expiresAt, password, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          data.userId,
          data.accountId,
          data.providerId,
          data.accessToken,
          data.refreshToken,
          data.idToken,
          data.expiresAt?.getTime(),
          data.password,
          data.createdAt.getTime(),
          data.updatedAt.getTime()
        );
        return data;
      },
      findByUserId: (userId: string) => {
        const stmt = db.prepare("SELECT * FROM account WHERE userId = ?");
        const rows = stmt.all(userId) as any[];
        return rows.map(row => ({
          userId: row.userId,
          accountId: row.accountId,
          providerId: row.providerId,
          accessToken: row.accessToken,
          refreshToken: row.refreshToken,
          idToken: row.idToken,
          expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
          password: row.password,
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
        }));
      },
      delete: (userId: string, accountId: string, providerId: string) => {
        const stmt = db.prepare("DELETE FROM account WHERE userId = ? AND accountId = ? AND providerId = ?");
        stmt.run(userId, accountId, providerId);
      },
    },
    verification: {
      create: (data: Verification) => {
        const stmt = db.prepare(`
          INSERT INTO verification (id, identifier, value, expiresAt, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(
          data.id,
          data.identifier,
          data.value,
          data.expiresAt.getTime(),
          data.createdAt.getTime()
        );
        return data;
      },
      findById: (id: string) => {
        const stmt = db.prepare("SELECT * FROM verification WHERE id = ?");
        const row = stmt.get(id) as any;
        if (!row) return null;
        return {
          id: row.id,
          identifier: row.identifier,
          value: row.value,
          expiresAt: new Date(row.expiresAt),
          createdAt: new Date(row.createdAt),
        };
      },
      delete: (id: string) => {
        const stmt = db.prepare("DELETE FROM verification WHERE id = ?");
        stmt.run(id);
      },
    },
  };
}
