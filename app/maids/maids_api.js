module.exports = function(server) {

  let app = server.app,
    config = server.config,
    express = require('express'),
    log = server.log,
    RichError = server.RichError,
    seneca = server.seneca,
    _ = require('lodash');

  const METHODS = {
    register: "register"
  };

  const MODELS = {
    appids: "appids"
  };


  /* ************************************************** *
   * ******************** API Routes and Permissions
   * ************************************************** */

  var api = express.Router();


  api.route('/:model').post(validateAccessToken, sendCmd);
  api.route('/:model/:method').all(validateAccessToken, sendCmd);

  app.use('/maids/:version', api);


  /* ************************************************** *
   * ******************** Route Methods
   * ************************************************** */

  function validateAccessToken(req, res, next) {
    let access_token = req.headers['authorization'] || req.query.access_token;

    if( ! access_token) {
      res.reply.setUnauthorized(next);
    } else {
      req.user = {
        id: "1"
      };
      next();
    }
  }

  function sendCmd(req, res, next) {
    let pattern = {
      access_token: "SHAID_PYLON",
      method: getMethod(req.method, req.params),
      model: MODELS[req.params.model],
      service: "maids",
      user: req.user,
      version: req.params.version
    };

    for(var key in req.body) {
      if(req.body.hasOwnProperty(key)) {
        switch(key) {
          case "access_token":
          case "method":
          case "model":
          case "service":
          case "user":
          case "version":
            break;
          default:
            pattern[key] = req.body[key];
            break;
        }
      }
    }

    log.trace("ACT PATTERN: %s", JSON.stringify(pattern, undefined, 2));
    seneca.act(pattern, function(err, response) {
      if(err) {
        res.reply.setInternalServerError(next);
      } else {
        res.reply.setData(response);
        next();
      }
    });
  }

  let getMethod = function (requestMethod, requestParams) {
    if(METHODS[requestParams.method]) {
      return METHODS[requestParams.method];
    } else {
      switch(requestMethod) {
        case "PUT":
          return "update";
        case "POST":
          return "create";
        case "GET":
          return "find";
        case "DELETE":
          return "delete";
        default:
          console.log("UNKNOWN METHOD: " + req.method);
          return "";
      }
    }
  };

  class Maids {
    constructor() {

    }

    onSenecaReady() {
      seneca.client({ type: 'http', pin: 'service:maids' });
    }
  }


  return new Maids();
};