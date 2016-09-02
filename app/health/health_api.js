module.exports = function(server) {

  let app = server.app,
    config = server.config,
    express = require('express'),
    log = server.log,
    RichError = server.RichError,
    seneca = server.seneca,
    _ = require('lodash');

  /* ************************************************** *
   * ******************** API Routes and Permissions
   * ************************************************** */

  var api = express.Router();

  api.route('/').get(sendHealth);

  app.use('/health/:version', api);

  /* ************************************************** *
   * ******************** Route Methods
   * ************************************************** */

  /**
   * Health check for pylon.
   */
  function sendHealth(req, res, next) {
    res.sendStatus(200);
  }

  class Health {
    constructor() {

    }

  }

  return new Health();
};