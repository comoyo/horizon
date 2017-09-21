'use strict';
const check = require('./error').check;
const logger = require('./logger');
const LRU = require('lru-cache');

class SignallingDispatcher {
    constructor() {
        this.cache = LRU(10000);
    }
    
    bind_call(collection, row) {
        if (collection !== 'call' || !row.id) {
            return row;
        }
        var host = 'localhost'
        this.cache.set(row.id, host);
        row.sigCoord = host;
        return row;
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
        console.log(row.id, row.sigCoord);
        this.cache.set(row.id, row.sigCoord);
        return row;
    }

    get_call_coordinate(callId) {
        return this.cache.get(callId);
    }
        
};

module.exports = {
  SignallingDispatcher
};
