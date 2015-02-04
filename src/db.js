import * as knex from "knex";
import {config} from "./util";

export function initDb() {
  console.log(knex);
  console.log(config);
}
