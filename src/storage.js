/**
 * Storage abstraction module. Allows to use various backends with the
 * same API. While for now it provides only SQL backends, this is not
 * mandatory and non-SQL backends may be added in future.
 */

import createKnex from "knex";
import conf from "./config";

// Knex DB reference.
let knex;

export function init() {
  return new Promise(function(resolve) {
    let backend = conf.get("storage-backend");
    if (backend === "sqlite") {
      knex = createKnex({
        client: "sqlite3",
        debug: conf.get("debug"),
        connection: {
          filename: conf.get("sqlite-db-path"),
        },
      });
    } else if (backend === "pg") {
      knex = createKnex({
        client: "pg",
        debug: conf.get("debug"),
        connection: {
          host: conf.get("pg-host"),
          user: conf.get("pg-user"),
          password: conf.get("pg-password"),
          database: conf.get("pg-database"),
        },
      });
    } else {
      // NOTE(Kagami): This should never happen because options should
      // be validated before this function is called.
      throw new Error("Unknown backend");
    }

    resolve(initSchema());
  });
}

function initSchema() {
  return knex.schema.hasTable("inventory").then(function(exists) {
    if (exists) { return; }
    return knex.schema.createTable("inventory", function(table) {
      table.string("vector", 32).primary();
      table.binary("payload").notNullable();  // Message payload data
      table.timestamp("expires").notNullable();
      table.integer("type").notNullable();  // Object type, 0-3 currently
      table.integer("stream").notNullable();
      table.string("from");  // Sender's BM address
    });
  }).then(function() {
    return knex.schema.hasTable("known_nodes");
  }).then(function(exists) {
    if (exists) { return; }
    // XXX(Kagami): knex doesn't have support for "ON CONFLICT" so we
    // are using raw SQL here.
    return knex.schema.raw(`
      CREATE TABLE known_nodes (
        host VARCHAR(39) NOT NULL,
        port INTEGER NOT NULL,
        stream INTEGER NOT NULL,
        services BLOB NOT NULL,
        last_active DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(host, port, stream) ON CONFLICT REPLACE
      )
    `);
  });
}

/** Start a new transaction. */
export function transaction(cb) {
  return knex.transaction(cb);
}

/**
 * Known nodes storage abstraction.
 */
export let knownNodes = {
  /** Return whether there are any known nodes. */
  isEmpty: function(trx) {
    return trx
      .select(trx.raw("1"))
      .from("known_nodes")
      .limit(1)
      .then(function(rows) {
        return !rows.length;
      });
  },

  /** Insert one or many nodes into the table. */
  insert: function(trx, nodes) {
    return trx.insert(nodes).into("known_nodes");
  },
};
