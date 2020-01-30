/*    
 * Copyright (C) 2020, Twinkle Labs, LLC.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*


MUX: A message multiplex.

It is used to connect to a remote space, sending and receiving messages.
It can be used for local message dispatch as well.
Different viewers can use the mux for sending events.

Sending

 - notify: just send a message to the remote.

 - request: send a request but expecting a response, then use dispatch.

 - dispatch: dispatch a message to local immediately


Receiving

on(method, v, cb): listen of a specific type of messages.
off(): stop receiving notifications.

*/

function MUX(ws_url) {
    var self = this;
    var reqcnt = 0;
    var ws = null;
    var opened = false;
    var mq = [];
    var reqs = {};
    var listeners = {};
    var reconnect_count = 0;

    self.pid = null;
    self.clientId = null;
    self.currentUser = null;
    self.currentSpace = null;

    // Test if current user is the owner of space
    self.isOwner = function() {
        return self.currentUser && self.currentSpace &&
            self.currentUser.uuid === self.currentSpace.uuid;
    };

    function connect() {
        opened = false;
        ws = new WebSocket(ws_url);
        ws.addEventListener('open', onWSOpen);
        ws.addEventListener('message', onWSMessage);
        ws.addEventListener('error', onWSError);
        ws.addEventListener('close', onWSClose);
    }

    function send(msg)
    {
        if (opened) {
            console.log("WS Send:"+msg);
            ws.send(msg);
        } else {
            mq.push(msg);
        }
    }

    self.dispatch = function(e, args) {
	if (listeners[e]) {
	    listeners[e].forEach(function(x){
		x.callback.apply(x.receiver, args);
	    });
	}
    };

    function onWSOpen() {
	var s = "(hello)";
        console.log("WS Send: " + s);
	ws.send(s);
    }

    function onWSMessage(event) {
        console.log("WS Received:" + event.data);
        var msg = SEXP.parseMessage(event.data);
        if (msg.method == 'on-notify') {
	    /* (on-notify <event> <args>)
	     */
	    var ev = msg.args[0];
	    var args = msg.args[1];
	    self.dispatch(ev, args);
	} else if (msg.method == 'did-request') {
	    var req_id = msg.args[0];
	    var r = reqs[req_id];
	    if (r) {
		var res = msg.args[1];
		if (Array.isArray(res) && res.length > 0 && res[0] == 'error') {
		    var e = {
			error: res.length > 1 ? res[1] : 'Unknown'
		    };
		    if (res.length > 2) {
			e.errArgs = res.slice(2);
		    }
                    res = e;
		} 
		r.callback(res);
		delete reqs[req_id];
	    } else {
		console.log("error: no matched request");
	    }
        } else if (msg.method == 'did-hello') {
            self.clientId = msg.args[0];
            self.pid = msg.args[1];
            var x = msg.args[2];
			
			// Allow dispatch handler to send messages right away
			// It's critical, otherwise the websocket seems to be closed
			// if we send from mq later after dispatch (CEF specific problem).
			opened = true;
			
            if (!self.currentUser) {
                // First time connect
                self.currentUser = x[0];
                self.currentSpace = x[1];
		spaceName = x[2];
                self.dispatch('ready', []);
            } else {
                self.dispatch('mux-state', [self, 'reattached']);
                self.dispatch('reattached', []);
            }
            reconnect_count = 0;
            mq.forEach(function(e) {
                ws.send(e);
            });
            mq = [];
        } else if (msg.method == 'keep-alive') {

        } else {
            console.log("Unsupported message:", msg);
        }
    }

    function reconnect() {
        if (!opened) {
            reconnect_count++;
        } else {
            opened = false;
            reconnect_count=1;
        }
        if (reconnect_count < 10) {
            self.dispatch("mux-state",[self, "reattaching " + reconnect_count ]);
            setTimeout(function() {
                connect();
            }, 3000); // 3 seconds retry
        } else {
            self.dispatch("mux-state", [self, "can not attach to space process"]);
        }
    }
    
    function onWSError(error) {
        console.log("ws error",error);
        reconnect();
    }
    
    function onWSClose() {
        console.log("ws closed");
        opened = false;
        // When connection failed normal the browser will call onWSError.
        // iOS 9.3 safari will use the websocket close 
        reconnect(); 
    }

    this.on = function(method, receiver, callback) {
    	var a = listeners[method];
    	if (!a) {
    	    a = [{
    		    receiver: receiver,
    		    callback: callback
    	    }];
    	} else {
    	    a.push({
    		receiver: receiver,
    		callback: callback
    	    });
    	}
    	listeners[method] = a;	
    };

    this.off = function(method, receiver) {
	   var a = listeners[method];
        if (!a)
            return;
        for (var i = 0; i < a.length; i++) {
            if (a[i].receiver == receiver) {
                a.splice(i, 1);
                i--;
            }
        }
    };

    // Notify a channel member <to>.
    // If <to> is '*', then notify all members
    this.notify = function(channel, to, params) {
        // TODO Validate channel name
	   var reqString = "(notify " + channel;
        if (to == '*') {
            reqString += " * ";
        } else {
            reqString += " " + JSON.stringify(to);
        }
    	for (var i = 0; i < params.length; i++) {
    	    if (typeof params[i] === 'number') {
    		reqString += " " + params[i];
    	    } else if (params[i] === true) {
    		reqString += " true";
    	    } else if (params[i] === false) {
    		reqString += " false";
    	    } else if (typeof params[i] === 'string') {
    		reqString += " " + JSON.stringify(params[i]);
    	    } else {
    		console.log("error: notify: invalid parameter#" + i + ": ", params[i]);
    		throw new Error("notify: invalid parameter");
    	    }
    	}
    	reqString += ")";
    	send(reqString);
    };

    this.notifyAll = function(channel, params) {
        self.notify(channel, '*', params);
    };

    this.request = function(method,params,callback) {
    	var reqString =  method;
    	for (var i = 0; i < params.length; i++) {
    	    if (typeof params[i] === 'number') {
    		reqString += " " + params[i];
    	    } else if (params[i] === true) {
    		reqString += " true";
    	    } else if (params[i] === false) {
    		reqString += " false";
    	    } else if (typeof params[i] === 'string') {
    		reqString += " " + JSON.stringify(params[i]);
    	    } else {
    		console.log("error: request: invalid parameter#" + i + ": ", params[i]);
    		throw new Error("request: invalid parameter");
    	    }
    	}
        this.sendRequestString(reqString, callback);
    };

    this.sendRequestString = function(reqString, callback) {
    	var reqId = 'req-'+(++reqcnt);
    	var reqTime = (new Date()).getTime()/1000;
    	var reqString = "(request \"" + reqId + "\" " + reqTime + " " + reqString + ")";
    	send(reqString);
    	reqs[reqId] = {
    	    reqTime: reqTime,
    	    callback: callback
    	};
        // TODO remove timed out requests
        var k = Object.keys(reqs);
        if (k.length > 1000) {
            for (var i = 0;i < k.length; i++) {
                if (reqTime - k[i].reqTime) {

                }
            }
        }
    };
    
    // User info caches
    // key: uuid
    // value: a dictionary
    //    - lastUpdated : time
    //    - waitingList : array of requests on this key
    //    - info: the actual data
    // If the waitingList is not empty, it means that there is already
    // a request. but if the lastUpdated time is more than 10 seconds away,
    // always request for a newer version
    var userInfos = {};
    this.getUserInfo = function(userId, cb, forceUpdate) {
        if (!userInfos[userId])
            userInfos[userId] = {
                lastUpdated: 0,
                waitingList: [],
                info: null
            };

        var now = unixtime();

        if (forceUpdate || now - userInfos[userId].lastUpdated > 60) {
            // always update after 1 minute
            userInfos[userId].waitingList.push(cb);
        } else if (userInfos[userId].waitingList.length > 0) {
            userInfos[userId].waitingList.push(cb);
            if (now - userInfos[userId].lastUpdated < 5)
                return;                
            // If the previous request for some reason doesn't return in time
            // we should retry
        } else {
            cb(userInfos[userId].info);
            return;
        }

        userInfos[userId].lastUpdated = now; // used for mark the query time
        this.request('space', ["find-user", userId], function(data) {
            if (data && data.id) {
                userInfos[userId].info = data;
                userInfos[userId].lastUpdated = unixtime();
                // Incase the callback wants to access the waitingList
                var a = userInfos[userId].waitingList;
                userInfos[userId].waitingList=[];
                a.forEach(function(cb) {
                    cb(data);
                });
            } else {
                cb(null);
            }
        });
    };

    connect();
};
