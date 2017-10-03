'use strict';
const check = require('./error').check;
const logger = require('./logger');
const LRU = require('lru-cache');

class SignallingDispatcher {
    constructor(sigPool) {
        this._cache = LRU(10000);
        this._sigPool = sigPool;
    }
    get_tcp_connection_for_call_id(callId) {
        const coord = this.get_call_coordinate(callId)
        const sig_conn = this._sigPool.get_connection(coord);
        return sig_conn.tcp_connection();
    }
    bind_call(collection, row, conn) {
        if (collection === 'signalling' && row.id1) {
            return this.get_tcp_connection_for_call_id(row.id1);
        }
        if (collection !== 'call' || !row.id) {
            return conn;
        }
        const host = this._sigPool.pick_pool_coordinate();
        this._cache.set(row.id, host);
        row.sigCoord = host;
        return conn;
    }

    track_bound_call(collection, row) {
        if (collection !== 'call' || !row.id) {
            return row;
        }
        if (!row.sigCoord) {
            return row;
        }
        if (this.get_call_coordinate(row.id)) {
            return row;
        }
        this._cache.set(row.id, row.sigCoord);
        return row;
    }
    
    get_query_collection(collection) {
        if (collection.name === 'signalling') {
            return this._sigPool.get_collection();
        }
        return collection;
    }
    
    get_query_connection(query, conn) {
        if (query.options.collection !== 'signalling') {
            return conn;
        }
        let objWithCallId = query.options.find_all;
        if (objWithCallId == undefined) {
            objWithCallId = query.options.data;
        }
        console.log(objWithCallId[0]);
        const callId = objWithCallId[0].id1;
        return this.get_tcp_connection_for_call_id(callId);
    }
    
    get_call_coordinate(callId) {
        return this._cache.get(callId);
    }
        
};

module.exports = {
  SignallingDispatcher
};
