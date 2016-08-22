var bunyan = require('bunyan'),
  PrettyStream = require('bunyan-pretty-stream');

const DEFAULT_CONSOLE_LOG_LEVEL = "info";


/* ************************************************** *
 * ******************** Constructor
 * ************************************************** */

var Log = function() {

};

Log.prototype.createLogger = function(options) {
  if ( ! options) {
    options = {};
  }

  if( ! options.bunyanInstance) {
    //var prettyStdOut = new PrettySteam();
    //prettyStdOut.pipe(process.stdout);

    var bunyanOptions = {
      name: options.name || "Unknown",
      serializers: bunyan.stdSerializers,
      streams: [
        {
          level: options.consoleLogLevel || DEFAULT_CONSOLE_LOG_LEVEL,
          stream: new PrettyStream() // prettyStdOut //process.stdout//new PrettySteam()
        }
      ]
    };

    // If database log level is defined, then add a stream to the database.
    if(options.databaseLogLevel) {
      if( ! options.database) {
        options.database = {};
      }

      switch(options.database.type) {
        default:
        case "dynamodb":
          let BunyanDynamo = require('bunyan-dynamo');
          var bunyanDynamoStream = new BunyanDynamo(options.database);
          bunyanOptions.streams.push({
            level: options.databaseLogLevel,
            stream: bunyanDynamoStream,
            type: 'raw'
          });
          break;
      }
    }

    options.bunyanInstance = bunyan.createLogger(bunyanOptions)
  }

  return options.bunyanInstance;
};

/* ************************************************** *
 * ******************** Exports
 * ************************************************** */

exports = module.exports = Log;
exports = Log;
