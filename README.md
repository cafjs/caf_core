# Caf.js

Co-design permanent, active, stateful, reliable cloud proxies with your web app and your gadgets.

See https://www.cafjs.com

## Caf.js Core

This repository provides the main `Caf.js` entry point, creating a framework instance for hosting CAs.

It exports the core packages and an `init` function that initializes the framework.

For example, in a file called by default `ca_methods.js` (see `methodsFileName` property in config file `ca.json` {@link external:caf_ca} to change the name)

```
const caf = require('caf_core');

exports.methods = {
    async __ca_init__() {
        this.state.counter = 0;
        return [];
    },
    async hello(msg, cb) {
        this.$.log && this.$.log.debug('Got ' + msg);
        this.state.counter = this.state.counter + 1
        return [null, this.state.counter];
    }
};

caf.init(module);
```

Passing the `module` argument to `caf.init` simplifies loading resources with relative paths. For example, to find `ca++.json` or `framework++.json` in the same directory as your `ca_methods.js` file. See {@link external:caf_components} for details.

Note that the framework initialization and the methods declaration could be
in separate files. It is just convenient to pack them together, and the module caching in `require` guarantees that we only initialize the framework once.

However, the methods declaration should be in a file named `ca_methods.js`, unless we configure a different file name, as explained above.
