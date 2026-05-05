const Server = require('./server.js');
const Handler = require('./handler.js');

const mmsrv = {
    Server: Server,
    Handler: Handler,
    secretKey: "k3GD#9fg@"
};

// Expose to global scope so demo.js can use `mmsrv.Server` directly
if (typeof global !== 'undefined') {
    global.mmsrv = mmsrv;
}

module.exports = mmsrv;
