/**
 * Storage abstraction module. Allows to use various backends with the
 * same API. While for now it provides only SQL backends, this is not
 * mandatory and non-SQL backends may be added in future.
 */
// XXX(Kagami): Think through the API: should we accept parameters only
// via options object?

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
  const has = tbname => knex.schema.hasTable.bind(knex.schema, tbname);
  return has("known_nodes")().then(function(exists) {
    if (exists) { return; }
    return knex.schema.createTable("known_nodes", function(table) {
      table.string("host", 39).notNullable();
      table.integer("port").notNullable();
      table.integer("stream").notNullable();
      table.binary("services").notNullable();
      table.timestamp("last_active").notNullable();
      table.unique(["host", "port", "stream"]);
    });
  }).then(has("inventory")).then(function(exists) {
    if (exists) { return; }
    return knex.schema.createTable("inventory", function(table) {
      table.binary("vector").primary();
      table.binary("payload").notNullable();
      table.dateTime("expires").notNullable();
      table.integer("stream").notNullable().index();
    });
  });
}

/** Start a new transaction. */
export function transaction(cb) {
  return knex.transaction(cb);
}

// Similar to `_.pick`: extract values from object for the given keys.
function extract(keys, obj) {
  return keys.map(function(key) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      throw new Error("Non-consistent objects");
    }
    return obj[key];
  });
}

/** Database-indepent UPSERT. */
const upsert = {
  sqlite: function(tbname, trx, rows) {
    assert(rows.length, "Empty input");
    const keys = Object.keys(rows[0]);
    assert(keys.length, "Empty object");
    const formatter = new trx.client.Formatter();
    // INSERT OR REPLACE INTO t (c1, c2) VALUES (v11, v12), (v21, v22)
    const head = "INSERT OR REPLACE INTO " + formatter.wrap(tbname);
    const cols = "(" + formatter.columnize(keys) + ")";
    const valcol = "(" + formatter.parameterize(keys) + ")";
    const valcols = new Array(rows.length).fill(valcol).join(", ");
    const sql = [head, cols, "VALUES", valcols].join(" ");
    const bindings = [].concat(...rows.map(extract.bind(null, keys)));
    return trx.raw(sql, bindings);
  },

  pg: function() {
    throw new Error("Not implemented yet");
  },
};

const getNodeDups = {
  sqlite: function(trx, nodes) {
    // NOTE(Kagami): We are using UNION to create inline table and then
    // join over it. See for details:
    // <https://stackoverflow.com/a/11171387>.
    const head = "SELECT ? as h, ? as p, ? as s";
    // FIXME(Kagami): This won't work for more than 500 nodes:
    // <https://www.sqlite.org/limits.html#max_compound_select>.
    // Query should be splitted in two queries with 500 selects max.
    const tail = new Array(nodes.length).join(" UNION SELECT ?, ?, ?");
    const sql = "(" + head + tail + ")";
    let bindings = [];
    nodes.forEach(function(n) {
      bindings.push(n.host);
      bindings.push(n.port);
      bindings.push(n.stream);
    });
    const inlineTable = knex.raw(sql, bindings);
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

  pg: function(trx, nodes) {
    const searchList = nodes.map(function(n) {
      return [n.host, n.port, n.stream];
    });
    return trx
      .select()
      .from("known_nodes")
      .whereIn(["host", "port", "stream"], searchList);
  },
};

/**
 * Known nodes storage abstraction.
 */
export const knownNodes = {
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
   * Add or update nodes to the store.
   * @param {Object} trx - Current transaction
   * @param {Object[]} nodes - Nodes
   * @return {Promise}
   */
  upsert: function(trx, nodes) {
    return upsert[conf.get("storage-backend")]("known_nodes", trx, nodes);
  },

  /**
   * Update one or several nodes in the store.
   * @param {?Object} trx - Current transaction
   * @param {Object} query - Query info
   * @param {Object} data - Data to set
   * @return {Promise.<number>} Number of updated nodes
   */
  update: function(trx, query, data) {
    trx = trx || knex;
    return trx("known_nodes")
      .where(query)
      .update(data);
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
   * @param {number} stream - Stream number of the nodes
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
    return getNodeDups[conf.get("storage-backend")](trx, nodes);
  },
};

// Helper for `inventory.getDups`.
function getVectorDups(trx, vectors) {
  return trx
    .select("vector")
    .from("inventory")
    .whereIn("vector", vectors);
}

/**
 * Inventory abstraction.
 */
export const inventory = {
  /**
   * Select all available non-expired vectors for the given stream.
   * @param {?Object} trx - Current transaction
   * @param {number} stream - Stream number of the nodes
   * @return {Promise.<Buffer[]>}
   */
  getVectors: function(trx, stream) {
    trx = trx || knex;
    return trx
      .select("vector")
      .from("inventory")
      .where({stream})
      .where("expires", ">", new Date())
      .then(function(rows) {
        return rows.map(r => r.vector);
      });
  },

  /**
   * Return vectors from the store which are in the given list.
   * @param {?Object} trx - Current transaction
   * @param {Buffer[]} vectors - Vectors to find
   * @return {Promise.<Buffer[]>}
   */
  getDups: function(trx, vectors) {
    trx = trx || knex;
    let vectorGroups = [];
    // NOTE(Kagami): Split input vector list into groups with 999 length
    // each to workaround SQLITE_MAX_VARIABLE_NUMBER (999 by default).
    // TODO(Kagami): We are using the same code for PostgreSQL
    // neverthless it's not mandatory to not abuse the DB. Though if
    // sending 50,000 BLOBs at the same time doesn't hurt PG, this may
    // be changed in future.
    while (vectors.length) {
      vectorGroups.push(vectors.slice(0, 999));
      vectors = vectors.slice(999);
    }
    const qrunner = getVectorDups.bind(null, trx);
    const promises = vectorGroups.map(qrunner);
    return Promise.all(promises).then(function(rowslist) {
      const rows = Array.prototype.concat.apply([], rowslist);
      return rows.map(r => r.vector);
    });
  },

  /**
   * Add new object to the store.
   * @param {?Object} trx - Current transaction
   * @param {Object} object - Object properties
   * @return {Promise}
   */
  add: function(trx, object) {
    trx = trx || knex;
    return trx.insert(object).into("inventory");
  },
};
