'use strict';
const assert = require('assert');
const check = require('./error').check;
const logger = require('./logger');
const r = require('rethinkdb');
const ReqlConnection = require('./reql_connection').ReqlConnection;

class SignallingConnection extends ReqlConnection {
  _init_connection() {
    this._retry_timer = null;

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

      return this;
    }).catch((err) => {
      logger.error(`Signalling Connection to RethinkDB terminated: ${err}`);
      logger.debug(`stack: ${err.stack}`);
      return this._reconnect();
    });
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
        assert(options.count < 20);
        for (var i=0; i < options.count; i++) {
            const hostName = options.hostNameTemplate.replace('%d', i);
            console.log('connecting sig pool to ', hostName + options.domain);
            this._connections.set(hostName,
                                  new SignallingConnection(hostName + options.domain,
                                                     options.rdb_port || 28015,
                                                     options.project_name || 'test',
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
        console.log(p);
        return Promise.race(p);
    }
        
};

module.exports = {
  SignallingPool
};
