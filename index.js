let path = require('path'),
  Server = require(path.resolve('./server.js'));

let server = new Server();
server.start();