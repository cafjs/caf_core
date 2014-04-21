/*!
Copyright 2014 Hewlett-Packard Development Company, L.P.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 *  Conduits are functional processing pipelines assembled in a series-parallel
 * task graph. Each task implements an asynchronous action that uses standard
 * node.js callback conventions, and data flows through pipelines by folding
 * a map in a graph traversal that respects the graph topological order.
 * Map entries are labelled with the originating task, enabling communication
 * between tasks. Unique task labels can be chosen by the application or
 * assigned by the library.
 *
 *  An error in any of the tasks aborts the traversal, returning in a callback
 * this error and previous results already in the map.
 *
 *  The structure and configuration of conduits can be serialized, and later
 * on, after parsing, can be bound  to a different set of implementation
 * methods. This simplifies uploading conduits (from the browser to a CA) in a
 * secure manner, and modify their behavior based on the execution context.
 *
 * Conduits are immutable data structures and, therefore, reusing pipeline
 *  elements never creates side-effects. Task graphs are built using a stack,
 * similar to an HP calculator with reverse polish notation (RPN), but with only
 * two operators __seq__(n) and __par__(n). For example:
 *
 *          c = newInstance(['foo','bar'])
 *          c = c.foo({'arg':1}, 'fx0')
 *               .foo({'arg':2, 'prev': 'fx0'}, 'fx1')
 *               .foo({'arg':4, 'prev': 'fx1'}, 'fx3')
 *               .__seq__(3)
 *               .bar({'arg':2}, 'bx')
 *               .bar({'arg':4}, 'b1x')
 *               .__seq__()
 *               .__par__()
 * will execute in parallel two sequences, one with three foos and the other
 * one with two bars. Note how custom labels allow a task in a sequence to know
 * about its predecessor.
 *
 * And this can be composed with another conduit as follows:
 *
 *          b = newInstance(['foo','bar'])
 *          b = b.foo({'arg':1}, 'ffx')
 *               .__push__(c)
 *               .__seq__()
 *
 * And serialized with:
 *
 *   var st = b.__stringify__()
 *   var c = conduit.parse(st);
 *
 * It is easy to add meaning to `foo` and `bar`:
 *
 *   var actions = {
 *                   'foo' : function(acc, args, cb) {
 *                    var whatever = (args.prev && acc[args.prev] &&
 *                                      acc[args.prev].data &&
 *                                      acc[args.prev].data.whatever) || 0;
 *                      cb(null, {'whatever': whatever + 1})
 *                    },
 *                    'bar' : function(acc, args, cb) {
 *                      ...
 *                    }
 *                 }
 *    b = b.__behavior__(actions)
 *
 * where `acc` is the accumulator object passed in the fold operation,
 * `args` is the first argument that we passed to `foo` containing task
 * configuration, and `cb` is a callback to return an error or value when the
 * asynchronous task finishes (never use `return` to return values or signal
 * the end of the task).
 *
 * And then execute a task graph:
 *
 *   var acc = {}
 *   b.__fold__(acc, function(err, data) {
 *                          // data refers to `acc` with a new entry for each
 *                          //  task (key is the given label or a unique string,
 *                          //        value is {err: <err>, data: <whatever>})
 *                         ...
 *   });
 *
 */
(function () {
     'use strict';
     var async = (typeof module !== 'undefined' && module.exports &&
                  require('async')) || null;

     var conduit = {};

     // Thanks to async.js/caolan on how to load on browser and node.js.
     var root, previous_conduit;

     root = this || (0, eval)('this');// global object in strict mode
     if (root !== null) {
         async = async || (root.async && root.async.noConflict()) || null;
         previous_conduit = root.conduit;
     }

     conduit.noConflict = function () {
        root.conduit = previous_conduit;
        return conduit;
     };


     /**
      * An immutable stack as base class.
      *
      */
     var newStack = function(node) {
         var newNode = function(data, next) {
             var that = {};
             that.getData = function() {
                 return data;
             };
             that.getNext = function() {
                 return next;
             };
             return that;
         };
         var top = node || null;
         var that = {};

         that.__push_internal__ = function(data) {
             return newStack(newNode(data, top));
         };

         that.__peek__ = function() {
             return top && top.getData();
         };

         that.__pop_internal__ = function() {
             return top && newStack(top.getNext());
         };

         that.__forEach__ = function(f) {
             var i = top;
             var s = 0;
             while (i !== null) {
                 f(i.getData(), s);
                 s = s +1;
                 i = i.getNext();
             }
         };
         that.__map__ = function(f) {
             var i = top;
             var result = [];
             while (i !== null) {
                 result.push(f(i.getData()));
                 i = i.getNext();
             }
             return result;
         };

         that.__length__ = function() {
             var count = 0;
             that.__forEach__(function() { count = count + 1;});
             return count;
         };

         return that;
     };


     var METHOD='method';
     var SEQ='seq';
     var PAR='par';

     var sanitize = function(inToken) {
         var deepFreeze = function(token) {
             if (Array.isArray(token)) {
                 token.forEach(function(x) { deepFreeze(x);});
                 return Object.freeze(token);
             } if ((typeof token === 'object') && token !== null) {
                 Object.keys(token).forEach(function(x) {
                                                deepFreeze(token[x]);
                                            });
                 return Object.freeze(token);
             } else {
                 return token;
             }
         };
         var deepClone = function(token) {
             if (Array.isArray(token)) {
                 return token.map(function(x) { return deepClone(x);});
             } else if ((typeof token === 'object') && token !== null) {
                 var result = {};
                 Object.keys(token).forEach(function(x) {
                                                result[x] = deepClone(token[x]);
                                            });
                 return result;
             } else {
                 // assumed already type checked.
                 return token;
             }
         };
         var deepType = function(token) {
             var childrenOK = function(children) {
                 if (Array.isArray(children)) {
                     var result = true;
                     children.forEach(function(x) {
                                          result = result && deepType(x);
                                      });
                     return result;
                 } else {
                     return false;
                 }
             };
             var isOK =
                 (typeof token.type === 'string' || token.type === null) &&
                 (typeof token.name === 'string' || token.name === null) &&
                 // token.args is any JSON serializable type (no functions)
                 (typeof token.args === 'string' ||
                  typeof token.args === 'number' ||
                  typeof token.args === 'object' ||
                  typeof token.args === 'boolean'||
                  token.args === null) &&
                 (typeof token.label === 'string' || token.label === null) &&
                 ((Array.isArray(token.children) &&
                   childrenOK(token.children)) || token.children === null);
             if (!isOK) {
                 throw new Error('Typing error in token' +
                                 JSON.stringify(token));
             }
             return token;
         };

         return deepFreeze(deepClone(deepType(inToken)));

     };

     var newToken = function(type, name, args, label, children) {
         var that =  { 'type': type, 'name' : name, 'args' : args,
                       'label' : label, 'children' : children};
         return that;
     };

     var newMethod = function(name, args, label) {
         return newToken(METHOD, name, args, label, null);
     };

     var newSeq = function(mArray) {
         return newToken(SEQ, null, null, null, mArray);
     };

     var newPar = function(mArray) {
         return newToken(PAR, null, null, null, mArray);
     };


     var counterF = function(prefix) {
         var count = 0;
         return function() {
             var result = prefix + count;
             count = count + 1;
             return result;
         };
     };
     var nextId = counterF('id_');

     var newConduit = function(methodNames, behavior, initStack) {
         var that  = initStack || newStack();

         methodNames.forEach(function (name) {
                                 that[name] = function(args, label) {
                                     var m = newMethod(name, args, label);
                                     return that.__push__(m);
                                 };
                             });

         var seqPar = function(n, f) {
             var nFrames = ((n > 2) ? n : 2);
             if (that.__length__() >= nFrames) {
                 var mArray = [];
                 var result = that;
                 for (var i =0; i< nFrames; i++) {
                     mArray.unshift(result.__peek__());
                     result = result.__pop__();
                 }
                 var m = f(mArray);
                 // __push__ will sanitize again,  not very efficient...
                 return newConduit(methodNames, behavior, result.__push__(m));
             } else {
                 throw new Error('not enough frames' + that.__length__() +
                                 ' < ' + nFrames);
             }
         };

         that.__seq__ = function(n) {
             return seqPar(n, function(mArray) { return newSeq(mArray); });
         };

         that.__par__ = function(n)  {
             return seqPar(n, function(mArray) { return newPar(mArray); });
         };

         that.__push__ = function(data) {
             if ((typeof data === 'object') && data.__peek__) {
                 // assume `data` is a conduit.
                 if (data.__length__() == 1) {
                     var inData = sanitize(data.__peek__());
                     return newConduit(methodNames, behavior,
                                       that.__push_internal__(inData));
                 } else {
                     throw new Error('Trying to push a not fully resolved '+
                                     'conduit:' + data.__stringify__());
                 }
             } else {
                 return newConduit(methodNames, behavior,
                                   that.__push_internal__(sanitize(data)));
             }
         };

         that.__pop__ = function() {
             return newConduit(methodNames, behavior, that.__pop_internal__());
         };


         that.__behavior__ = function(actions) {
             var newActions = {};
             methodNames.forEach(function(x) {
                                     if (typeof actions[x] == 'function') {
                                         newActions[x] = actions[x];
                                     }
                                 });
             return newConduit(methodNames, newActions, that);
         };


         /**
          * Serializes the structure and configuration of this conduit
          *
          */
         that.__stringify__ = function() {
             var result = {
                 'methodNames' : methodNames,
                 'tasks' : that.__map__(function(x) { return x;})
             };
             return JSON.stringify(result);
         };

         var foldImpl = function(acc, data, cb) {
             var buildChildren = function(children) {
                 return children.map(function(child) {
                                         return function(cb0) {
                                             foldImpl(acc, child, cb0);
                                         };
                                     });
             };
             switch (data.type) {
             case SEQ:
                 async.series(buildChildren(data.children), cb);
                 break;
             case PAR:
                 async.parallel(buildChildren(data.children), cb);
                 break;
             case METHOD:
                 if (typeof behavior[data.name] !== 'function') {
                     throw new Error('behaviour  not defined for method ' +
                                     data.name);
                 }
                 var id = data.label || nextId();
                 if (acc[id]) {
                     throw new Error('Duplicate label in the task graph: ' +
                                     id);
                 }
                 var cb1 = function(err, res) {
                     acc[id] = {'err': err, 'data' : res};
                     // res propagated with acc
                     cb(err);
                 };
                 behavior[data.name](acc, data.args, cb1);
                 break;
             default:
                 throw new Error('Unknown type ' + data.type);
             }
         };

         that.__fold__ = function(acc, cb) {
             var results = acc || {};
             if (that.__length__() !== 1) {
                 throw new Error('Not fully resolved:' + that.__stringify__);
             }
             if (typeof behavior !== 'object') {
                 throw new Error('No behavior in fold.');
             }
             var cb1 = function(err, res) {
                 cb(err, acc);
             };
             foldImpl(results,  that.__peek__(),  cb1);
         };

         return that;
     };


     var checkMethodNames = function(methodNames) {
         var allOK = true;
         methodNames.forEach(function(x) {
                                 if ((typeof x !== 'string') ||
                                     (x.indexOf('__') === 0)) {
                                     allOK = false;
                                 }
                             });
         return allOK;
     };

     /*
      * External methods.
      *
      */

     /**
      * Factory method to create a conduit.
      *
      * @param {Array<string>} methodNames An array containing names for user
      * defined methods.
      *
      * @return {Object} An immutable conduit.
      *
      */
     var newInstance = conduit.newInstance = function(methodNames) {
         var methodNamesClone = methodNames.slice(0);
         if (checkMethodNames(methodNamesClone)) {
             var that = newConduit(methodNamesClone);
             return that;
         } else {
             throw new Error('Invalid method names:' +
                             JSON.stringify(methodNamesClone));
         }
     };


     /**
      * Parses a JSON description of a conduit.
      *
      * @param {string} str A string with a serialized conduit.
      *
      * @return {Object} An immutable conduit.
      *
      */
     var parse = conduit.parse = function(str) {
         var c = JSON.parse(str);
         var result = newInstance(c.methodNames);
         c.tasks.reverse().forEach(function (x) {
                                       result = result.__push__(x);
                                   });
         return result;
     };


     // Node.js
     if (typeof module !== 'undefined' && module.exports) {
         module.exports = conduit;
     }
     // AMD / RequireJS
     else if (typeof define !== 'undefined' && define.amd) {
         define([], function () {
                    return conduit;
                });
     }
     // included with <script> tag
     else {
         root.conduit = conduit;
     }

 }());
