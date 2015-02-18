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
        connection: {
          filename: conf.get("sqlite-db-path"),
        },
      });
    } else if (backend === "pg") {
      knex = createKnex({
        client: "pg",
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
  return knex.schema.createTableIfNotExists("inventory", function(table) {
    table.string("vector", 32).primary();
    table.binary("payload").notNullable();  // Message payload data
    table.timestamp("expires").notNullable();
    table.integer("type").notNullable();  // Object type, 0-3 currently
    table.integer("stream").notNullable();
    table.string("from");  // Sender's BM address if we have deciphered object
  }).createTableIfNotExists("known_nodes", function(table) {
    table.string("host", 39).notNullable();  // IPv4/IPv6 address
    table.integer("port").notNullable();
    table.integer("stream").notNullable();
    table.binary("services").notNullable();
    table.timestamp("last_active").notNullable().defaultTo(knex.fn.now());
    table.unique(["host", "port", "stream"]);
  });
}
