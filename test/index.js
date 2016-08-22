let assert = require('assert'),
  config = require('config'),
  crave = require("crave"),
  path = require("path");

let applicationPath = path.resolve("./app"),
  Log = require(path.resolve('./libs/log')),
  Server = require(path.resolve('./server.js'));

let server = {
  config: config,
  log: (new Log()).createLogger(config.get('log')),
  maids: require(require('path').resolve('./server.js'))
};

crave.setConfig(config.get('crave'));

describe('MAIDS', function () {

  // Load the test data object that will be passed into each test file.
  before(function (done) {
    this.timeout(0);

    server.maidsInstance = new Server();
    server.maidsInstance.start().on('ready', function (expressApp) {
      assert(expressApp);
      server.expressApp = expressApp;
      server.app = require('supertest')(expressApp);
      done();
    })
  });

  it('load all tests', function (done) {
    this.timeout(0);

    // Recursively load all the test files that are located in the apps folder.
    crave.directory(applicationPath, ["test"], done, server);
  });

});