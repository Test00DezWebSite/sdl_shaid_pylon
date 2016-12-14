module.exports = function(server) {

  let app = server.app,
    config = server.config,
    express = require('express'),
    log = server.log,
    npmConfig = server.npmConfig,
    RichError = server.RichError,
    seneca = server.seneca,
    _ = require('lodash');

  /* ************************************************** *
   * ******************** API Routes and Permissions
   * ************************************************** */

  var api = express.Router();

  api.route('/').get(sendHealth);

  api.route('/version').get(sendAppVersion);

  app.use('/api/:version/health', api);


  /* ************************************************** *
   * ******************** Route Methods
   * ************************************************** */

  /**
   * Health check for pylon.
   */
  function sendHealth(req, res, next) {
    res.sendStatus(200);
  }

  function sendAppVersion(req, res, next) {
    res.send(npmConfig.version);
  }

  class Health {
    constructor() {

    }
    
  }

  return new Health();
};