//Released to the public domain.

var http = require('http');
var socketio = require('socket.io');
var child = require('child_process');

function callbackOrDummy(callback) {
    if (callback === undefined) callback = function () {};
    return callback;
}

function unwrapArray(arr) {
    return arr && arr.length == 1 ? arr[0] : arr
}

var processes = [];

module.exports = {
    create: function (callback, options) {
        if (options === undefined) options = {};
        if (options.phantomPath === undefined) options.phantomPath = 'phantomjs';
        if (options.parameters === undefined) options.parameters = {};

        function spawnPhantom(port, callback) {
            var args = [];
            for (var parm in options.parameters) {
                args.push('--' + parm + '=' + options.parameters[parm]);
            }
            args = args.concat([__dirname + '/bridge.js', port]);

            var phantom = child.spawn(options.phantomPath, args);
            processes.push(phantom);
            phantom.stdout.on('data', function (data) {
                return console.log('phantom stdout: ' + data);
            });
            phantom.stderr.on('data', function (data) {
                return console.warn('phantom stderr: ' + data);
            });
            var hasErrors = false;
            phantom.on('error', function () {
                hasErrors = true;
            });
            phantom.on('exit', function (code) {
                hasErrors = true; //if phantom exits it is always an error
            });
            setTimeout(function () { //wait a bit to see if the spawning of phantomjs immediately fails due to bad path or similar
                callback(hasErrors, phantom);
            }, 100);
        }

        var server = http.createServer(function (request, response) {
            response.writeHead(200, {
                "Content-Type": "text/html"
            });
            response.end('<html><head><script src="/socket.io/socket.io.js" type="text/javascript"></script><script type="text/javascript">\n\
                window.onload=function(){\n\
                    var socket = new io.connect("http://" + window.location.hostname);\n\
                    socket.on("cmd", function(msg){\n\
                        alert(msg);\n\
                    });\n\
                    window.socket = socket;\n\
                };\n\
            </script></head><body></body></html>');
        }).listen(null, '127.0.0.1', function () {
            var io = socketio.listen(server, {
                'log level': 1
            });

            // Force XHR polling
            io.set('transports', [
                'xhr-polling'
            ]);

            var port = server.address().port;
            spawnPhantom(port, function (err, phantom) {
                if (err) {
                    server.close();
                    callback(true);
                    return;
                }
                var pages = {};
                var cmds = {};
                var cmdid = 0;

                function request(socket, args, callback) {
                    args.splice(1, 0, cmdid);
                    //                  console.log('requesting:'+args);
                    socket.emit('cmd', JSON.stringify(args));

                    cmds[cmdid] = {
                        cb: callback
                    };
                    cmdid++;
                }
                var connectionSocket = null;
                io.sockets.on('connection', function (socket) {
                    socket.on('res', function (response) {
                        //                      console.log(response);
                        var id = response[0];
                        var cmdId = response[1];
                        switch (response[2]) {
                        case 'pageCreated':
                            var pageProxy = {
                                open: function (url, callback) {
                                    if (callback === undefined) {
                                        request(connectionSocket, [id, 'pageOpen', url]);
                                    } else {
                                        request(connectionSocket, [id, 'pageOpenWithCallback', url], callback);
                                    }
                                },
                                post: function (url, data, callback) {
                                    if (callback === undefined) {
                                        request(connectionSocket, [id, 'pagePost', url, data]);
                                    } else {
                                        request(connectionSocket, [id, 'pagePostWithCallback', url, data], callback);
                                    }
                                },
                                close: function (callback) {
                                    request(connectionSocket, [id, 'pageClose'], callbackOrDummy(callback));
                                },
                                render: function (filename, callback) {
                                    request(connectionSocket, [id, 'pageRender', filename], callbackOrDummy(callback));
                                },
                                renderBase64: function (extension, callback) {
                                    request(connectionSocket, [id, 'pageRenderBase64', extension], callbackOrDummy(callback));
                                },
                                injectJs: function (url, callback) {
                                    request(connectionSocket, [id, 'pageInjectJs', url], callbackOrDummy(callback));
                                },
                                includeJs: function (url, callback) {
                                    request(connectionSocket, [id, 'pageIncludeJs', url], callbackOrDummy(callback));
                                },
                                sendEvent: function (event, x, y, callback) {
                                    request(connectionSocket, [id, 'pageSendEvent', event, x, y], callbackOrDummy(callback));
                                },
                                uploadFile: function (selector, filename, callback) {
                                    request(connectionSocket, [id, 'pageUploadFile', selector, filename], callbackOrDummy(callback));
                                },
                                evaluate: function (evaluator, callback) {
                                    request(connectionSocket, [id, 'pageEvaluate', evaluator.toString()].concat(Array.prototype.slice.call(arguments, 2)), callbackOrDummy(callback));
                                },
                                evaluateAsync: function (evaluator, callback) {
                                    request(connectionSocket, [id, 'pageEvaluateAsync', evaluator.toString()].concat(Array.prototype.slice.call(arguments, 2)), callbackOrDummy(callback));
                                },
                                set: function (name, value, callback) {
                                    request(connectionSocket, [id, 'pageSet', name, value], callbackOrDummy(callback));
                                },
                                get: function (name, callback) {
                                    request(connectionSocket, [id, 'pageGet', name], callbackOrDummy(callback));
                                },
                                setFn: function (pageCallbackName, fn, callback) {
                                    request(connectionSocket, [id, 'pageSetFn', pageCallbackName, fn.toString()], callbackOrDummy(callback));
                                },
                                setViewport: function (viewport, callback) {
                                    request(connectionSocket, [id, 'pageSetViewport', viewport.width, viewport.height], callbackOrDummy(callback));
                                }
                            }
                            pages[id] = pageProxy;
                            cmds[cmdId].cb(null, pageProxy);
                            delete cmds[cmdId];
                            break;
                        case 'phantomExited':
                            request(connectionSocket, [0, 'exitAck']);
                            server.close();
                            io.set('client store expiration', 0);
                            cmds[cmdId].cb();
                            delete cmds[cmdId];
                            break;
                        case 'pageJsInjected':
                        case 'jsInjected':
                            cmds[cmdId].cb(JSON.parse(response[3]) === true ? null : true);
                            delete cmds[cmdId];
                            break;
                        case 'pageOpened':
                            if (cmds[cmdId] !== undefined) { //if page is redirected, the pageopen event is called again - we do not want that currently.
                                if (cmds[cmdId].cb !== undefined) {
                                    cmds[cmdId].cb(null, response[3]);
                                }
                                delete cmds[cmdId];
                            }
                            break;
                        case 'pageRenderBase64Done':
                            cmds[cmdId].cb(null, response[3]);
                            delete cmds[cmdId];
                            break;
                        case 'pageGetDone':
                        case 'pageEvaluated':
                            cmds[cmdId].cb(null, JSON.parse(response[3]));
                            delete cmds[cmdId];
                            break;
                        case 'pageClosed':
                            delete pages[id]; // fallthru
                        case 'pageSetDone':
                        case 'pageJsIncluded':
                        case 'cookieAdded':
                        case 'pageRendered':
                        case 'pageEventSent':
                        case 'pageFileUploaded':
                        case 'pageSetViewportDone':
                        case 'pageEvaluatedAsync':
                            cmds[cmdId].cb(null);
                            delete cmds[cmdId];
                            break;

                        default:
                            console.error('got unrecognized response:' + response);
                            break;
                        }
                    });
                    socket.on('push', function (request) {
                        var id = request[0];
                        var cmd = request[1];
                        var callback = callbackOrDummy(pages[id] ? pages[id][cmd] : undefined);
                        callback(unwrapArray(request[2]));
                    });
                    var proxy = {
                        createPage: function (callback) {
                            request(connectionSocket, [0, 'createPage'], callbackOrDummy(callback));
                        },
                        injectJs: function (filename, callback) {
                            request(connectionSocket, [0, 'injectJs', filename], callbackOrDummy(callback));
                        },
                        addCookie: function (cookie, callback) {
                            request(connectionSocket, [0, 'addCookie', cookie], callbackOrDummy(callback));
                        },
                        exit: function (callback) {
                            phantom.removeListener('exit', prematureExitHandler); //an exit is no longer premature now
                            request(connectionSocket, [0, 'exit'], callbackOrDummy(callback));
                            phantom.kill('SIGTERM');
                            // for(var i = 0; i < processes.length; ++i) {
                            //     if (processes[i].pid) {
                            //         process.kill(processes[i].pid);
                            //     }
                            // }
                        },
                        on: function () {
                            phantom.on.apply(phantom, arguments);
                        },
                        _phantom: phantom
                    };
                    var executeCallback = !connectionSocket;
                    connectionSocket = socket;
                    if (executeCallback) {
                        callback(null, proxy);
                    }
                });

                // An exit event listener that is registered AFTER the phantomjs process
                // is successfully created.
                var prematureExitHandler = function (code, signal) {
                    console.warn('phantom crash: code ' + code);
                    server.close();
                };

                phantom.on('exit', prematureExitHandler);
            });
        });
    }
};

process.on('exit', function() {
    for(var i = 0; i < processes.length; ++i) {
        if (processes[i].pid) {
            process.kill(processes[i].pid);
        }
    }
});
