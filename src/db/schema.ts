import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";

// Auth.js (NextAuth v5) Drizzle adapter tables - schema shape is dictated by
// the adapter contract (see https://authjs.dev/getting-started/adapters/drizzle),
// not by us. `id` is text (not native uuid) because the adapter generates it
// via crypto.randomUUID() itself.
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// A user's connected Yahoo Fantasy account - separate from the `accounts`
// table above, which is Auth.js's own identity-provider table (Google, used
// for site sign-in). This is a data-access connection, not a login method:
// one Yahoo Fantasy account linked per user, used purely to call the Yahoo
// Fantasy Sports API on their behalf (read their own league's rosters/free
// agents). Reconnecting overwrites the existing row.
export const yahooConnections = pgTable("yahoo_connections", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // e.g. "477.l.121129" - which of the user's leagues (there can be several)
  // Drop & Replace and the Unowned toggle should read from. Null until they
  // pick one, or right after connecting with just one league to auto-pick.
  activeLeagueKey: text("active_league_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// A shared, durable cache of Yahoo's full NHL player-eligibility list
// (src/lib/yahoo-fantasy-client.ts's getAllPlayerEligibility) - global game
// data, not tied to any user or league, so one row is enough for everyone.
// This exists specifically because an in-memory-only cache resets on every
// Vercel cold start/deploy, which in practice meant most requests paid the
// real ~80-request Yahoo pagination cost (~8s) instead of hitting a cache -
// a DB row survives cold starts and is instant to read.
export const yahooPlayerEligibilityCache = pgTable("yahoo_player_eligibility_cache", {
  id: text("id").primaryKey(), // always "nhl" - singleton row
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// App data. One row per draft, owned by a user. `state` mirrors the
// DraftStoreState shape from src/lib/types.ts as an opaque JSON blob -
// see the "Accounts + Multi-Draft Foundation" plan for why this isn't
// normalized into relational tables.
export const drafts = pgTable("drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  state: jsonb("state").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
