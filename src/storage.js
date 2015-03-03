/**
 * Storage abstraction module. Allows to use various backends with the
 * same API. While for now it provides only SQL backends, this is not
 * mandatory and non-SQL backends may be added in future.
 */
// XXX(Kagami): Think through the API: should we always use hash for the
// input arguments?

import createKnex from "knex";
import conf from "./config";
import {assert} from "./util";

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
      // NOTE(Kagami): Workaround `count` result as string on
      // node-postgres. See
      // <https://github.com/tgriesser/knex/issues/387> for details.
      let pg = require("pg");
      pg.types.setTypeParser(20, "text", parseInt);
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
  return knex.schema.createTableIfNotExists("inventory", function(table) {
    table.string("vector", 32).primary();
    table.binary("payload").notNullable();  // Message payload data
    table.timestamp("expires").notNullable();
    table.integer("type").notNullable();  // Object type, 0-3 currently
    table.integer("stream").notNullable();
  })
  // NOTE(Kagami): knex doesn't have support for "ON CONFLICT" so we
  // are using raw SQL here. See
  // <https://github.com/tgriesser/knex/issues/694> for details.
  // Beware to not put invalid SQL for PostgreSQL or SQLite.
  .raw(`
    CREATE TABLE IF NOT EXISTS known_nodes (
      host VARCHAR(39) NOT NULL,
      port INTEGER NOT NULL,
      stream INTEGER NOT NULL,
      services BLOB NOT NULL,
      last_active DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(host, port, stream) ON CONFLICT REPLACE
    )`);
}

/** Start a new transaction. */
export function transaction(cb) {
  return knex.transaction(cb);
}

/**
 * Known nodes storage abstraction.
 */
export let knownNodes = {
  /**
   * Return whether known nodes store is empty.
   * @param {?Object} trx - Current transaction
   * @return {Promise.<boolean>}
   */
  isEmpty: function(trx) {
    trx = trx || knex;
    return trx
      .select(trx.raw("1"))
      .from("known_nodes")
      .limit(1)
      .then(function(rows) {
        return !rows.length;
      });
  },

  /**
   * Add one or many nodes to the store.
   * @param {?Object} trx - Current transaction
   * @param {(Object|Object[])} nodes - Node object(s)
   * @return {Promise}
   */
  add: function(trx, nodes) {
    assert(nodes.length, "Empty list");
    trx = trx || knex;
    return trx.insert(nodes).into("known_nodes");
  },

  /**
   * Return random node for the given stream number.
   * @param {?Object} trx - Current transaction
   * @param {number} stream - Stream number of the node
   * @param {(string[])=} excludeHosts - Ignore nodes with this hosts
   * @return {Promise.<Object>}
   */
  getRandom: function(trx, stream, excludeHosts) {
    trx = trx || knex;
    excludeHosts = excludeHosts || [];
    return trx
      .select()
      .from("known_nodes")
      .where({stream})
      .whereNotIn("host", excludeHosts)
      // NOTE(Kagami): Beware that RANDOM() is only valid for PostgreSQL
      // and SQLite. See <https://stackoverflow.com/a/1209946>,
      // <https://stackoverflow.com/a/2279723> for details.
      .orderByRaw("RANDOM()")
      .limit(1)
      .then(function(rows) {
        if (rows.length) {
          return rows[0];
        } else {
          throw new Error("Empty result");
        }
      });
  },

  /**
   * Return current count of the nodes in the store.
   * @param {?Object} trx - Current transaction
   * @return {Promise.<number>}
   */
  count: function(trx) {
    trx = trx || knex;
    return trx("known_nodes").count("* as count").then(function(rows) {
      return rows[0].count;
    });
  },

  /**
   * Select bunch of the known nodes.
   * @param {?Object} trx - Current transaction
   * @param {number[]} stream - Stream number of the nodes
   * @param {Date} after - Nodes shouldn't be older than this time
   * @param {number} limit - Maximum number of resulting nodes
   * @return {Promise.<Object[]>}
   */
  get: function(trx, stream, after, limit) {
    trx = trx || knex;
    return trx
      .select()
      .from("known_nodes")
      .where({stream})
      .where("last_active", ">=", after)
      .limit(limit);
  },

  /**
   * Select nodes with the same host, port and stream values from the
   * store.
   * @param {?Object} trx - Current transaction
   * @param {Object[]} nodes - List of {host, port, stream} objects
   * @return {Promise.<Object[]>}
   */
  getDups: function(trx, nodes) {
    assert(nodes.length, "Empty list");
    trx = trx || knex;
    // NOTE(Kagami): We are using UNION to create inline table and then
    // join over it. See for details:
    // <https://stackoverflow.com/a/11171387>.
    // TODO(Kagami): Use `WHERE (a, b) in ((1, 2), (3, 4))` syntax for
    // PostgreSQL. See for details:
    // <https://stackoverflow.com/q/6672665>.
    let head = "SELECT ? as h, ? as p, ? as s";
    let tail = new Array(nodes.length).join(" UNION SELECT ?, ?, ?");
    let sql = "(" + head + tail + ")";
    let bindings = [];
    nodes.forEach(function(n) {
      bindings.push(n.host);
      bindings.push(n.port);
      bindings.push(n.stream);
    });
    let inlineTable = knex.raw(sql, bindings);
    return trx
      .select()
      .from("known_nodes")
      .innerJoin(inlineTable, function() {
        this
          .on("host", "=", "h")
          .andOn("port", "=", "p")
          .andOn("stream", "=", "s");
      });
  },
};
