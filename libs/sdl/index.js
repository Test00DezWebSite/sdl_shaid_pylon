let request = require('request'),
  backoff = require('backoff');

let executeRequest = function(sdl, options, cb) {
  request(options, function(err, response, body) {
    if(err) {
      cb(err, response, body);
    } else if( ! response) {
      cb(sdl.remie.create("No response returned from "+options.url, { internalMessage: "No response returned while using access "+options.headers.Authorization, referenceData: options.url }));
    } else {
      switch(response.statusCode) {
        case 200:
          cb(err, response, body);
          break;
        case 401:
        case 403:
          cb(err, response);
          break;
        default:
          sdl.log.warn("%s %s failed with a status code of %s.", options.method, options.url, response.statusCode, (body) ? "\nBody: " + body : undefined);
          cb(new Error("Request to "+options.url+" failed."));
          break;
      }
    }
  });
};


class Sdl {
  constructor(server) {
    let self = this;
    self.log = server.log;
    self.config = server.config;
    self.riposte = server.riposte;
    self.remie = server.remie;
    self.baseUrl = self.config.get('smartdevicelink.baseUrl');
    self.getProfileUrl = self.baseUrl + self.config.get('smartdevicelink.profileUrl');
  }



  getUserProfile(accessToken, cb) {
    let self = this;

    let options = {
      "headers": {
        "Authorization": "token "+accessToken
      },
      "method": "GET",
      "url": self.getProfileUrl
    };

    self.log.trace("%s %s\nHeaders:  %s",options.method, options.url, JSON.stringify(options.headers, undefined, 2));
    let getProfileRequest = backoff.call(executeRequest, self, options, function(err, response, body) {
      let retryCount = getProfileRequest.getNumRetries();
      if(retryCount > 1) {
        if(retryCount >= 10) {
          self.log.error("Attempted the maximum number of retries allowed (%s) for a request to %s", retryCount, options.url);
        } else {
          self.log.warn("%s failed requests to %s before a successful attempt was made.", retryCount, options.url);
        }
      }

      if(err) {
        cb(self.remie.create(err, { internalMessage: "Error occurred while using access token "+accessToken, referenceData: options.url }));
      } else {
        if(body) {
          try {
            body = JSON.parse(body);
          } catch (err) {
            return cb(self.remie.create(err, {
              internalMessage: "Error converting body to JSON object while using access token " + accessToken,
              referenceData: body
            }));
          }

          if (body && body.id) {
            body.id = "" + body.id;
          }
        }

        self.log.trace("Response from %s %s\n%s", options.method, options.url, (body) ? JSON.stringify(body, undefined, 2) : undefined);
        cb(undefined, body);
      }
    });

    getProfileRequest.retryIf(function(err) {
      return (err);
    });

    getProfileRequest.setStrategy(new backoff.FibonacciStrategy({
      initialDelay: 10,
      maxDelay: 300,
      randomisationFactor: 0
    }));

    getProfileRequest.failAfter(10);
    getProfileRequest.start();
  }
}

module.exports = Sdl;