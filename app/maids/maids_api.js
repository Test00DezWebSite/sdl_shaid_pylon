module.exports = function(server) {

  let app = server.app,
    config = server.config,
    express = require('express'),
    log = server.log,
    seneca = server.seneca,
    sdl = server.sdl;

  const METHODS = {
    create: "create",
    register: "register"
  };

  const MODELS = {
    appids: "appids",
    health: "health"
  };

  const API_TOKEN_MAIDS = process.env.API_TOKEN_MAIDS || config.get('apiTokens.maids');


  /* ************************************************** *
   * ******************** API Routes and Permissions
   * ************************************************** */

  var api = express.Router();

  api.route('/health').get(setParams({ model: 'health', method: 'find' }), validateRequest,  sendCmd);
  api.route('/:model').post(setParams({ method: 'create'}), validateRequest, validateAccessToken, sendCmd);
  api.route('/:model/:method').all(validateRequest, validateAccessToken, sendCmd);

  app.use('/maids/:version', api);


  /* ************************************************** *
   * ******************** Route Methods
   * ************************************************** */

  function setParams(obj) {
    if(obj) {
      return function (req, res, next) {
        for(var key in obj) {
          if(obj.hasOwnProperty(key)) {
            req.params[key] = obj[key];
          }
        }
        next();
      }
    }
  }

  function validateAccessToken(req, res, next) {
    let accessToken = req.headers['authorization'] || req.query.access_token;

    if( ! accessToken) {
      res.reply.sendUnauthorized(res, next);
    } else {
      sdl.getUserProfile(accessToken, function(err, userProfile) {
        if(err) {
          log.error("[%s] Error using %s with access token %s.\nError: %s", res.reply.id, options.url, accessToken, err);
          res.reply.addErrorsAndSend(err, res, next);
        } else if( ! userProfile || ! userProfile.id ) {
          res.reply.sendUnauthorized(res, next);
        } else {
          req.user = userProfile;
          next();
        }
      });
    }
  }

  function validateRequest(req, res, next) {
    if(MODELS[req.params.model] && METHODS[req.params.method]) {
      next();
    } else {
      res.reply.sendNotFound(res, next);
    }
  }

  function sendCmd(req, res, next) {
    let pattern = {
      access_token: API_TOKEN_MAIDS,
      id: res.reply.id,
      method: METHODS[req.params.method],
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
        res.reply.sendInternalServerError(res, next);
      } else {
        res.reply.fromObject(response);
        next();
      }
    });
  }


  /* ************************************************** *
   * ******************** MAIDS Class
   * ************************************************** */

  class Maids {
    constructor() {

    }

    onSenecaReady() {
      seneca.client({ host: process.env.MAIDS_HOST || 'localhost', type: 'http', pin: 'service:maids' });
    }
  }

  return new Maids();
};