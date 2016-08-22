var _ = require('lodash'),
  async = require('async'),
  path = require('path');


/* ************************************************** *
 * ******************** Private Non-Class Methods
 * ************************************************** */

let sanitize = function(items, options, cb) {
  let returnAsArray,
    tasks = [];

  if( ! _.isObject(items)) {
    cb(undefined, items);
  } else {

    if (_.isArray(items)) {
      returnAsArray = true;
    } else {
      items = [items];
      returnAsArray = false;
    }

    for (let i = 0; i < items.length; i++) {
      tasks.push(function (next) {
        if (items[i].sanitize) {
          items[i].sanitize(options, next);
        }
      });
    }

    async.parallel(tasks, function (err, sanitizedItems) {
      if (err) {
        cb(err);
      } else if (!sanitizedItems || (sanitizedItems.length == 0 && !returnAsArray)) {
        cb();
      } else {
        cb(undefined, (returnAsArray) ? sanitizedItems : sanitizedItems[0]);
      }
    });
  }
};

let convertToRichError = function(RichError, error, options) {
  if(error instanceof RichError) {
    return error;
  } else {
    return new RichError(error, options);
  }
};

/**
 * Gets the response value's type.
 * @param v is the value to determine the type of.
 * @returns {string} a lowercase string description of the value type.  (e.g. array, boolean, object, etc.)
 */
var getType = function(v) {
  return ({}).toString.call(v).match(/\s([a-zA-Z]+)/)[1].toLowerCase()
};


/* ************************************************** *
 * ******************** Response Class
 * ************************************************** */

class Response {
  constructor(options) {
    this.config = options.config;
    this.i18next = options.i18next;
    this.RichError = options.RichError;
    this.log = options.log;
    this.logAllResponses = (this.config && this.config.has('log.logAllResponses') && this.config.get('log.logAllResponses') === true) ? true : false;
    this.richErrorResponseOptions = {
      error: {
        stack: this.config.enableStackTrace
      }
    }
  }

  createResponseHandler() {
    let self = this;
    return function(req, res, next) {
      self.createResponse(undefined, req, res, function(err, responseObject, statusCode) {
        if(self.logAllResponses) {
          self.log.trace('Response with Status Code: %s\nResponse Body: %s', statusCode, JSON.stringify(responseObject, undefined, 2));
        }
        res.status(statusCode).json(responseObject);
      });
    }
  }

  createErrorHandler() {
    let self = this;
    return function(err, req, res, next) {
      self.createResponse(err, req, res, function(err, responseObject, statusCode) {
        if(self.logAllResponses) {
          self.log.trace('Response with Status Code: %s\nResponse Body: %s', statusCode, JSON.stringify(responseObject, undefined, 2));
        }
        res.status(statusCode).json(responseObject);
      });
    }
  }

  createResponse(errs, req, res, cb) {
    let responseData = res.locals.responseData,
      responseErrors = res.locals.responseErrors,
      responseWarnings = res.locals.responseWarnings,
      options = res.locals.responseOptions || {},
      self = this,
      tasks = [];

    // Check if the response was handled.
    if(responseData === undefined
      && (errs === undefined || errs.length == 0)
      && (responseErrors === undefined || responseErrors.length == 0)) {
      errs = new self.RichError('server.400.notFound');
    }

    // Create the response object and add raw data.
    tasks.push(function(next) {
      next(undefined, { response: responseData });
    });

    // Add all the current rich errors to response object.
    tasks.push(function (responseObject, next) {
      responseObject.errors = [];

      if(responseErrors) {
        if (_.isArray(responseErrors)) {
          for (let i = 0; i < responseErrors.length; i++) {
            responseObject.errors.push(convertToRichError(self.RichError, responseErrors[i]));
          }
        } else {
          responseObject.errors.push(convertToRichError(self.RichError, responseErrors));
        }
      }

      if(errs) {
        if (_.isArray(errs)) {
          for (let i = 0; i < errs.length; i++) {
            responseObject.errors.push(convertToRichError(self.RichError, errs[i]));
          }
        } else {
          responseObject.errors.push(convertToRichError(self.RichError, errs));
        }
      }

      next(undefined, responseObject);
    });

    // Sanitize and add the response data.
    if(options.sanitizeData === true) {
      tasks.push(function (responseObject, next) {
        sanitize(data, options, function (err, sanitizedData) {
          if(err) {
            responseObject.errors.push(convertToRichError(self.RichError, err));
            responseObject.response = null;
            next(undefined, responseObject);
          } else {
            responseObject.response = sanitizedData;
            next(undefined, responseObject);
          }
        })
      });
    }

    // Format the errors.
    tasks.push(function(responseObject, next) {
      let highestStatusCode = 200;

      if( ! responseObject.errors || ! _.isArray(responseObject.errors) || responseObject.errors.length == 0) {
        delete responseObject.errors;
      } else {
        for (let i = 0; i < responseObject.errors.length; i++) {
          if (responseObject.errors[i].statusCode && (highestStatusCode === undefined || responseObject.errors[i].statusCode > highestStatusCode)) {
            highestStatusCode = responseObject.errors[i].get("statusCode");
          }
          responseObject.errors[i] = responseObject.errors[i].toResponseObject(self.richErrorResponseOptions);
        }
      }

      next(undefined, responseObject, highestStatusCode);
    });


    async.waterfall(tasks, cb)
  };

  createExpressMethods() {
    let self = this;

    return function (req, res, callback) {

      res.setSuccess = function(next) {
        res.locals.responseData = true;
        if(next) {
          return next();
        }
      };

      res.handleSenecaResponse = function(next) {
        let self = this;
        return function(err, response) {
          if(err) {
            next(err);
          } else {
            self.addErrors(response.errors);
            self.setData(response.response, next);
          }
        }
      };

      res.setData = function (data, next) {
        res.locals.responseData = data;
        if(next) {
          return next();
        }
      };

      res.getData = function() {
        return res.locals.responseData
      };

      res.addWarnings = function(warnings, next) {
        if( ! res.locals.responseWarnings) {
          res.locals.responseWarnings = [];
        }

        if(_.isArray(warnings)) {
          res.locals.responseWarnings.concat(warnings);
        } else {
          res.locals.responseWarnings.push(warnings);
        }

        if(next) {
          return next();
        }
      };

      res.addErrors = function(errors, next) {
        if(errors) {
          if ( ! res.locals.responseErrors) {
            res.locals.responseErrors = [];
          }

          if (_.isArray(errors)) {
            res.locals.responseErrors = res.locals.responseErrors.concat(errors);
          } else {
            res.locals.responseErrors.push(errors);
          }
        }

        if(next) {
          next();
        }
      };

      res.setBadRequest = function(next) {
        return next(new self.RichError('server.400.badRequest'));
      };

      res.setUnauthorized = function(next) {
        return next(new self.RichError('server.400.unauthorized'));
      };

      res.setForbidden = function(next) {
        return next(new self.RichError('server.400.forbidden'));
      };

      res.setNotFound = function(next) {
        return next(new self.RichError('server.400.notFound'));
      };

      callback();
    };
  }

  createSenecaResponse() {

  }
}

module.exports = Response;
