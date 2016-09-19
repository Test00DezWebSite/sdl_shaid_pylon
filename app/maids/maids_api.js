module.exports = function(server) {

  let app = server.app,
    config = server.config,
    express = require('express'),
    log = server.log,
    request = require('request'),
    seneca = server.seneca;

  const METHODS = {
    create: "create",
    register: "register"
  };

  const MODELS = {
    appids: "appids",
    health: "health"
  };

  const SMARTDEVICELINK_BASE_URL = config.get('smartdevicelink.baseUrl'),
    SMARTDEVICELINK_PROFILE_URL = SMARTDEVICELINK_BASE_URL + config.get('smartdevicelink.profileUrl');
  
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
    let access_token = req.headers['authorization'] || req.query.access_token;

    if( ! access_token) {
      res.reply.setUnauthorized(next);
    } else {
      let options = {
        "headers": {
          "Authorization": "token "+access_token
        },
        "method": "GET",
        "url": SMARTDEVICELINK_PROFILE_URL
      };
      request(options, function(err, response, body) {
        if(err) {
          log.error("[%s] Error using %s with access token %s.\nError: %s", res.reply.id, options.url, access_token, err);
          res.reply.addErrors(err, next);
        } else if( ! body){
          log.error("[%s] Error using %s with access token %s: No body returned", res.reply.id, options.url, access_token);
          res.reply.addErrors(new Error("Error in request to "+options.url), next);
        } else {
          body = JSON.parse(body);
          log.trace("[%s] Response from %s using token %s\nBody: %s", res.reply.id, options.url, access_token, JSON.stringify(body, undefined, 2));
          if( ! body.id) {
            res.reply.setUnauthorized(next);
          } else {
            body.id = "" + body.id;
            req.user = body;
            next();
          }
        }
      });
    }
  }

  function validateRequest(req, res, next) {
    if(MODELS[req.params.model] && METHODS[req.params.method]) {
      next();
    } else {
      res.reply.setNotFound();
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
        res.reply.setInternalServerError(next);
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