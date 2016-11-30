# CAF.js (Cloud Assistant Framework)

Co-design permanent, active, stateful, reliable cloud proxies with your web app and your gadgets.

See http://www.cafjs.com

## CAF Core

This repository provides the main CAF entry point, creating a framework instance for hosting CAs.

It exports the core packages, and an `init` function that initializes the framework.

For example, in a file called by default `ca_methods.js` (see `methodsFileName` property in config file `ca.json` {@link external:caf_ca})

```
var caf = require('caf_core');

exports.methods = {
    __ca_init__: function(cb) {
        this.state.counter = 0;
        cb(null);
    },
    hello: function(msg, cb) {
        this.$.log && this.$.log.debug('Got ' + msg);
        this.state.counter = this.state.counter + 1
        cb(null, this.state.counter);
    }
};

caf.init(module);
```

Note that the framework initialization, and the methods declaration, could be
in separate files. However, the default is always that the methods declaration is in a file named `ca_methods.js`.

It is just convenient to pack them together, and the module caching in `require` guarantees that we only initialize the framework once.

The `module` argument to `caf.init` simplifies loading resources with relative paths, see {@link external:caf_components}.
