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
    table.string("hash", 32).primary();
    table.binary("payload").notNullable();
    table.timestamp("expires_time").notNullable();
    table.integer("object_type").notNullable();
    table.string("from");
  });
}
