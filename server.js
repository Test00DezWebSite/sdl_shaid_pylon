"use strict";
/* eslint no-console: 0 */

/* ************************************************** *
 * ******************** NPM Modules
 * ************************************************** */

const async = require('async'),
  config = require('config'),
  EventEmitter = require('events'),
  fs = require('fs'),
  os = require('os'),
  path = require('path'),
  Remie = require('remie'),
  Riposte = require('riposte'),
  util = require('util');

// Path to the node.js application files. (e.g. api endpoints)
const applicationPath = path.resolve("./app"),
  npmConfig = path.resolve("./package.json");


/* ************************************************** *
 * ******************** Local Modules
 * ************************************************** */

const Log = require(path.resolve('./libs/log')),
  Sdl = require(path.resolve('./libs/sdl'));


/* ************************************************** *
 * ******************** Private Non-Class Methods
 * ************************************************** */

/**
 * Create an asynchronous function that will call a
 * classes method with the result returned to a callback.
 * @param self is the class instance.
 * @param methodName is the name of the classes method.
 * @returns {Function} a new function that accepts a
 * callback as it's only parameter.  The function will
 * call the specified classes method with the callback
 * as the only parameter.
 */
let createClassAsyncMethod = function (self, methodName) {
  return function (cb) {
    self[methodName](cb);
  }
};


/* ************************************************** *
 * ******************** Node Server Class
 * ************************************************** */

class Server {
  constructor(options) {
    this.initConfig(options);

    // Add event emitter properties to the class instance.
    EventEmitter.call(this);

    // Create a new logger instance.
    this.log = (new Log()).createLogger(config.get('log'));

    // Add the Package.json information to the server instance.
    this.npmConfig = npmConfig;

    return this;
  }

  /* ************************************************** *
   * ******************** Public Methods
   * ************************************************** */

  /**
   * Start the Node.js server.  Events, such as ready and
   * error, will be emitted using the standard event emitter.
   */
  start(options) {
    let self = this,
      tasks = [];

    tasks.push(createClassAsyncMethod(self, "initI18next"));
    tasks.push(createClassAsyncMethod(self, "initRemie"));
    tasks.push(createClassAsyncMethod(self, "initDynamoDB"));
    tasks.push(createClassAsyncMethod(self, "initRiposte"));
    tasks.push(createClassAsyncMethod(self, "initExpress"));
    tasks.push(createClassAsyncMethod(self, "initSeneca"));
    tasks.push(createClassAsyncMethod(self, "initApplication"));
    //tasks.push(createClassAsyncMethod(self, "loadStaticData"));
    tasks.push(createClassAsyncMethod(self, "startExpressServer"));

    async.series(tasks, function(err) {
      if(err) {
        self.log.error(err);
      } else {
        self.emit('ready', self.app);
      }
    });

    return self;
  }

  stop(options) {
    // TODO: stop the server gracefully.
  }

  log() {
    return this.log;
  }

  application() {
    return this.app;
  }


  /* ************************************************** *
   * ******************** Private Methods
   * ************************************************** */

  // Load the application models and endpoints.
  initApplication (cb) {
    let crave = require('crave'),
      self = this;

    self.log.trace('Load application models and endpoints.');

    let craveCallback = function(err, files, results) {
      if(err) {
        cb(err);
      } else {
        if(self.seneca) {
          self.seneca.ready(function () {
            for (var i = 0; i < results.length; i++) {
              if (results[i] && results[i].onSenecaReady) {
                results[i].onSenecaReady();
              }
            }
          });
        }

        if(self.riposte) {
          self.app = self.riposte.addExpressPostMiddleware(self.app);
        }

        cb();
      }
    };

    crave.setConfig(config.get('crave'));

    // Create a new SDL library instance
    self.sdl = new Sdl(self);

    // Recursively load all files of the specified type(s) that are also located in the specified folder.
    crave.directory(path.resolve("./app"), ["api"], craveCallback, self);
  }

  /**
   * Modify the config object with any dynamic values,
   * then make it immutable.  This must be called before
   * config.get().
   * @param {object} options is the options object
   * passed into the classes constructor.
   */
  initConfig(options) {
    let self = this;

    if( ! config.has('log.name')) {
      config.log.name = config.server.name;
    }

    if( config.has('session') && ! config.has('session.name')) {
      config.session.name = config.server.name + ".sid";
    }
    
    if( ! config.has('server.url')) {
      config.server.url = (config.server.port === 80) ? config.server.protocol + "://" + config.server.domainName : config.server.protocol + "://" + config.server.domainName + ":" + config.server.port;
    }

    // Make the configuration object immutable.
    config.get('server');
    self.config = config;
  }

  initDynamoDB(cb) {
    let self = this;

    if(config.has('dynamoDb')) {
      self.log.trace('Initializing Dynamo DB.');
      let AWS = require('aws-sdk');
      self.dynamoDb = new AWS.DynamoDB(config.get('dynamoDb.aws'));
    }
    cb();
  }

  // Must be called before initExpress
  initRiposte(cb) {
    let self = this;
    self.log.trace("Initializing Riposte.");

    self.riposte = new Riposte({
      log: self.log,
      remie: self.remie
    });

    cb();
  }

  initExpress(cb) {
    let self = this;
    self.log.trace('Initializing express.');

    let compress = require('compression'),
      express = require('express'),
      bodyParser = require('body-parser'),
      session = require('express-session'),
      userAgent = require('express-useragent');

    // Create an express application object.
    let app = express();

    // If the cookie is secure and proxy is enabled. We need to enable express' trust proxy for it set cookies correctly.
    if (config.has('session') && config.get('session.cookie.secure') && config.get('session.proxy')) {
      app.enable('trust proxy');
    }

    // Disable the "X-Powered-By: Express" HTTP header, which is enabled by default.
    app.disable("x-powered-by");

    // Parses the user agent string and exposes helpful properties.
    app.use(userAgent.express());

    // Enable G-ZIP compression.
    app.use(compress());

    // Parse url encoded json, "Content-Type: application/x-www-form-urlencoded"
    app.use(bodyParser.urlencoded({ extended: false }));

    // Parse bodies with json, "Content-Type: application/json"
    app.use(bodyParser.json());

    // If using riposte, add the express pre middleware.
    if(self.riposte) {
      app = self.riposte.addExpressPreMiddleware(app);
    }

    // Allow Cross-Origin Resource Sharing.
    if(config.has('server.allowCors') && config.get('server.allowCors')) {
      let cors = require('cors');
      app.use(cors());
    }

    self.initSessionStore(function (err, expressSessionStore) {
      if(err) {
        cb(err);
      } else {
        if(expressSessionStore) {
          app.use(expressSessionStore);
        }

        // If included, configure webpack.
        if(config.has('webpack.configFilePath')) {
          let webpack = require('webpack'),
            webpackHotMiddleware = require('webpack-hot-middleware'),
            webpackMiddleware = require('webpack-dev-middleware');

          let webpackConfig = require(path.resolve(config.get('webpack.configFilePath')));

          let compiler = webpack(webpackConfig),
            middleware = webpackMiddleware(compiler, config.get('webpack-dev-middleware'));

          app.use(middleware);
          app.use(webpackHotMiddleware(compiler));
        }

        // Configure i18n with express.
        if(config.has('i18n')) {
          let i18next = require('i18next'),
            i18nextMiddleware = require('i18next-express-middleware');

          app.use(i18nextMiddleware.handle(i18next));
          app.post('/locales/add/:lng/:ns', i18nextMiddleware.missingKeyHandler(i18next)); // serves missing key route for consumers (browser)
          app.get('/locales/resources.json', i18nextMiddleware.getResourcesHandler(i18next)); // serves resources for consumers (browser)
        }

        // Add the image folder as a static path.
        app.use('/img', express.static(path.join(__dirname + '/client/src/img'), config.get('express.static')));

        self.app = app;
        cb();
      }
    });
  }

  initI18next(cb) {
    let self = this;

    if(config.has('i18n')) {
      self.log.trace('Initializing i18next.');

      let i18next = require('i18next'),
        i18nextMiddleware = require('i18next-express-middleware'),
        i18nextFileSystemBackEnd = require('i18next-node-fs-backend'),
        i18nextSprintf = require('i18next-sprintf-postprocessor');

      i18next
        .use(i18nextMiddleware.LanguageDetector)
        .use(i18nextFileSystemBackEnd)
        .use(i18nextSprintf)
        .init(config.get('i18n'), function (err, i18nextTranslate) {
          self.i18nextTranslate = i18nextTranslate;
          cb(err);
        });

      i18next.on('missingKey', function (lngs, namespace, key, res) {
        self.log.warn("i18next(): Missing %s %s %s", lngs, namespace, key);
      });

      self.i18next = i18next;
    } else {
      cb();
    }
  }

  // If using i18next, must be run after initI18next.
  initRemie(cb) {
    let self = this;
    self.log.trace('Initializing Remie.');

    self.remie = new Remie({
      defaultSanitizeOptions: {
        error:{
          stack: true
        }
      },
      i18next: self.i18next
    });

    cb();
  }

  initSeneca(cb) {
    if(config.has('seneca')) {
      this.seneca = require('seneca')();
      cb();
    } else {
      cb();
    }
  }
  
  initSessionStore(cb) {
    let self = this;
    if(config.has('session')) {
      self.log.trace('Initializing session store.');

      // Set-up express sessions
      let sessionConfig = {
        name: config.get('session.name'),
        secret: config.get('session.secret'),
        cookie: {
          secure: config.get('session.cookie.secure')
        },
        resave: config.get('session.resave'),
        saveUninitialized: config.get('session.saveUninitialized')
      };

      // Create and add a session store.
      let sessionStore = (config.has('session.store')) ? config.get('session.store').toLowerCase() : undefined;
      switch (sessionStore) {
        case "mongoose":
          let MongoStore = require('connect-mongo')(session);

          sessionConfig.store = new MongoStore({
            mongooseConnection: self.mongoose.connection
          });

          cb(undefined, session(sessionConfig));
          break;

        case "cassandra":
          if (!config.has('cassandra')) {
            self.log.error("Cannot use cassandra as a session store because it has not been configured in the config.");
          } else {
            let columns = [
              "sid text",
              "session text",
              "expires timestamp",
              "PRIMARY KEY (sid)"
            ];
            self.cql.createTable("sessions", columns, function (err, result) {
              if(err) {
                cb(err);
              } else {
                cb(undefined, session(sessionConfig));
              }
            })
          }
          break;
        default:
          if (process.env.NODE_ENV.toLowerCase() === "production") {
            self.log.warn("A session store needs to be defined.");
          }
          cb(undefined, session(sessionConfig));
          break;
      }
    } else {
      cb();
    }
  }

  // Load static data.
  loadStaticData(cb) {
    let self = this;

    self.log.trace("Loading static data into database.");

    let cramit = require('cramit')();

    cramit.setConfig({
      database: {
        type: 'mongoose',
        instance: require('mongoose')
      },
      fixtureFileSuffix: "data"
    });

    cramit.findAllFixturesAndUpsertData(applicationPath, {}, cb);
  }

  // Start express server and listen on configured port
  startExpressServer(cb) {
    let self = this,
      port = process.env.PORT || config.get('server.port');

    self.server = self.app.listen(port, function () {
      let serverInfo = this.address();
      let address = (serverInfo.address === "0.0.0.0" || serverInfo.address === "::") ? "localhost" : serverInfo.address;

      self.log.info("Listening on http://%s:%s with the %s config.", address, serverInfo.port, process.env.NODE_ENV || "default");
      cb();
    });
  }

}

util.inherits(Server, EventEmitter);

module.exports = Server;