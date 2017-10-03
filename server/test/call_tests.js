'use strict';

const utils = require('./utils');
const horizon_writes = require('../src/endpoint/writes');

const assert = require('assert');
const crypto = require('crypto');

const hz_v = horizon_writes.version_field;
const invalidated_msg = horizon_writes.invalidated_msg;

const all_tests = (collection) => {
  const num_rows = 10;

  before('Create call collection', (done) => utils.create_collection('call', done));
  before('Create signalling collection', (done) => utils.create_collection('signalling', done));
  beforeEach('Clear collection', (done) => utils.clear_collection('call', done));
  beforeEach('Authenticate client', utils.horizon_admin_auth);
  console.log(collection);
  const make_request = (collection, type, data, options) => ({
    request_id: crypto.randomBytes(4).readUInt32BE(),
    type,
      options: Object.assign({}, options || {}, { collection:collection, data:data} ),
  });
  const without_version = (item) => {
      const res = Object.assign({ }, item);
      delete res[hz_v];
      return res;
  };
  const check_collection_data = (actual, expected) => {
      // TODO: make sure that versions increment properly
      assert.deepStrictEqual(actual.map(without_version),
                             expected.map(without_version));
  };
  
  const check_collection = (collection, expected, done) => {
    utils.table(collection).orderBy({ index: 'id' }).coerceTo('array')
      .run(utils.rdb_conn()).then((res) => {
        check_collection_data(res, expected);
        done();
      }).catch((err) => done(err));
  };
    
  it('call set coordinate.', (done) => {
      const request = (row) => make_request('call', 'store', [ row ]);
      utils.stream_test(request({ id: 'callid-1', fromMsisdn: '1' }), (err, res) => {
          assert.ifError(err);
          const expected = [ { id: 'callid-1', fromMsisdn: '1', sigCoord:'localhost' } ];
          check_collection('call', expected, done);
      });
  });

  it('call read coordinate.', (done) => {
    const test_data = [ { id: 'callid-2', sigCoord: 'bar' } ];
    const test_case = () => {
        utils.stream_test(
            {
                request_id: 0,
                type: 'query',
                options: { collection:'call' },
            },
            (err, res) => {
                assert.ifError(err);
                assert.strictEqual(utils.sig_dispatcher().get_call_coordinate('callid-2'), 'bar');
                done();
            });
    }
    utils.populate_collection('call', test_data, test_case);       
  });

  it('signalling write.', (done) => {
      const request = (row) => make_request('call', 'store', [ row ]);
      const sig_request = (row) => make_request('signalling', 'store', [ row ]);
      const sig = { id: 'sig-1', id1: 'callid-1', type: 'offer' };

      const test_case_write = () => {
          utils.stream_test(sig_request(sig), (err, res) => {
              assert.ifError(err);
              const expected = [ sig ];
              check_collection('signalling', [sig], test_case_read);
          });
      }
      
      const test_case_read = () => {
          utils.stream_test(
              {
                  request_id: 0,
                  type: 'query',
                  options: {
                      collection:'signalling',
                      find_all: [ { id1: 'callid-1' } ],
                  },
              },
              (err, res) => {
                  assert.ifError(err);
                  console.log(res);
                  check_collection_data(res, [sig]);
                  done();
              });
      }
      
      utils.stream_test(request({ id: 'callid-1', fromMsisdn: '1' }), (err, res) => {
          assert.ifError(err);
          const expected = [ { id: 'callid-1', fromMsisdn: '1', sigCoord:'localhost' } ];
          check_collection('call', expected, test_case_write);
      });
  });
    
  it('signalling upsert.', (done) => {
      const request = (row) => make_request('call', 'store', [ row ]);
      const sig_request = (row) => make_request('signalling', 'upsert', [ row ]);
      const sig = { id: 'sig-1', id1: 'callid-1', type: 'offer' };

      const test_case_write = () => {
          utils.stream_test(sig_request(sig), (err, res) => {
              assert.ifError(err);
              const expected = [ sig ];
              check_collection('signalling', [sig], test_case_read);
          });
      }
      
      const test_case_read = () => {
          utils.stream_test(
              {
                  request_id: 0,
                  type: 'query',
                  options: {
                      collection:'signalling',
                      find_all: [ { id1: 'callid-1' } ],
                  },
              },
              (err, res) => {
                  assert.ifError(err);
                  console.log(res);
                  check_collection_data(res, [sig]);
                  done();
              });
      }
      
      utils.stream_test(request({ id: 'callid-1', fromMsisdn: '1' }), (err, res) => {
          assert.ifError(err);
          const expected = [ { id: 'callid-1', fromMsisdn: '1', sigCoord:'localhost' } ];
          check_collection('call', expected, test_case_write);
      });
  });    
    
};

const suite = (collection) => describe('Call ', () => all_tests(collection));

module.exports = { suite };
