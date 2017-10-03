'use strict';
const assert = require('assert');
const error = require('./error');
const check = require('./error').check;
const logger = require('./logger');
const r = require('rethinkdb');
const ReqlConnection = require('./reql_connection').ReqlConnection;
const Collection = require('./metadata/collection').Collection;

const initialize_metadata = (db, conn) =>
  r.branch(r.dbList().contains(db), null, r.dbCreate(db)).run(conn)
    .then(() =>
      Promise.all([ 'hz_collections', 'hz_users_auth', 'hz_groups' ].map((table) =>
        r.branch(r.db(db).tableList().contains(table),
                 { },
                 r.db(db).tableCreate(table))
          .run(conn))))
    .then(() =>
      r.db(db).table('hz_collections').wait({ timeout: 30 }).run(conn));

const create_collection = (db, name, conn) =>
  r.db(db).table('hz_collections').get(name).replace({ id: name }).do((res) =>
    r.branch(
      res('errors').ne(0),
      r.error(res('first_error')),
      res('inserted').eq(1),
      r.db(db).tableCreate(name),
      res
    )
  ).run(conn);

class SignallingConnection extends ReqlConnection {
  _init_connection() {
    this._retry_timer = null;
    this._max_reconnect_delay = 15000;
    return r.connect(this._rdb_options).then((conn) => {
      if (this._interrupted_err) {
        return Promise.reject(this._interrupted_err);
      }
      this._conn = conn;
      logger.info('Singalling Connection to RethinkDB ready: ' +
        `${this._rdb_options.user} @ ${this._rdb_options.host}:${this._rdb_options.port}`);

      this._reconnect_delay = 0;

      this._conn.once('close', () => {
        logger.error('Lost connection to RethinkDB.');
        this._reconnect();
      });
      // This is to avoid EPIPE errors - handling is done by the 'close' listener
      this._conn.on('error', () => { });
      return initialize_metadata(this._rdb_options.db, this._conn);
    }).then(() => {
      this._collection = new Collection(this._rdb_options.db, 'signalling');
      return create_collection(this._rdb_options.db, 'signalling', this._conn);
    }).then((res) => {
      let name = this._collection.name;
      error.check(!res.error, `Collection "${name}" creation failed: ${res.error}`);
      logger.warn(`Collection created: "${name}"`);
      var p = new Promise((resolve) => this._collection._on_ready(resolve));
      this._collection._update_table('signalling', [], this._conn);
      return p; 
    }).then(() => {
        return new Promise((resolve) => this._collection._create_index([['id1']], this._conn, resolve));
    }).then(() => {
        return this;
    }).catch((err) => {
      return this._reconnect();
    });
  }

  tcp_connection() {
      return this._conn;
  }
};

class SignallingPool {
    /* 
       options {
         hostNameTemplate: 'rethinkdb-signalling-%d',
         domain: '.skunk-works.no',
         count: 3
       }
    */
    constructor(options) {
        this._connections = new Map();
        this._interruptor = new Promise((resolve, reject) => {
            this._interrupt = reject;
        });
        this._next_conn = -1;
        assert(options.count < 20);
        for (var i=0; i < options.count; i++) {
            const hostName = options.hostNameTemplate.replace('%d', i);
            console.log('connecting sig pool to ', hostName + options.domain, ':', options.rdb_port);
            this._connections.set(hostName,
                                  new SignallingConnection(hostName + options.domain,
                                                     options.rdb_port,
                                                     options.project_name,
                                                     false,
                                                     false,
                                                     options.rdb_user || null,
                                                     options.rdb_password || null,
                                                     options.rdb_timeout || null,
                                                     this._interruptor));
                                  
        }

    }

    ready() {
        var p = [];
        this._connections.forEach((v, k)=>p.push(v.ready()));
        return Promise.race(p);
    }

    pick_pool_coordinate() {
        const keys = [...this._connections.keys()];
        for (var i=0; i < this._connections.size; i++) {
            this._next_conn++;
            if (this._next_conn >= this._connections.size) {
                this._next_conn = 0;
            }
            const c = this._connections.get(keys[this._next_conn]);
            if (c.is_ready()) {
                return keys[this._next_conn];
            }
        }
        return null;
    }

    get_connection(coord) {
        return this._connections.get(coord);
    }

    get_collection() {
        return this._connections.values().next().value._collection;
    }
        
};

module.exports = {
  SignallingPool
};
