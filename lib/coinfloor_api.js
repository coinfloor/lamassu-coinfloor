/*
 * Copyright 2014 Coinfloor, Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
"use strict";

var WebSocket = require("ws");
var atob = require("atob");
var btoa = require("btoa");
var ecp = require("./ecp");
var util = require("./util");

var DEFAULT_URL = "wss://api.coinfloor.co.uk/";

var _websocket;
var _server_nonce;
var _tag = 0;
var _idle_ping_timer_id;
var _event_handlers = {};
var _result_handlers = {};

function on(type, handler) {
	var handlers = _event_handlers[type];
	if (handlers) {
		handlers.push(handler);
	}
	else {
		_event_handlers[type] = [ handler ];
	}
}

function trigger(type, data) {
	var handlers = _event_handlers[type];
	if (handlers) {
		for (var i = 0; i < handlers.length; ++i) {
			handlers[i](data);
		}
	}
}

function request(request, callback) {
	var tag = request.tag = ++_tag;
	console.log("Coinfloor <<", request);
	_websocket.send(JSON.stringify(request));
	_result_handlers[tag] = callback;
	reset_idle_ping_timer();
}

function reset_idle_ping_timer() {
	if (_idle_ping_timer_id) {
		clearTimeout(_idle_ping_timer_id);
	}
	_idle_ping_timer_id = setTimeout(function () {
		request({ }, null);
	}, 45000);
}

module.exports = {

	DEFAULT_URL: DEFAULT_URL,

	on: on,

	trigger: trigger,

	isConnected: function () {
		return _websocket && _websocket.readyState == WebSocket.OPEN;
	},

	/*
	 * Initiates a connection to a Coinfloor API server and returns the new
	 * WebSocket object. A websocket URL may be given to override the default.
	 * If a callback function is provided, it will be invoked after the
	 * connection is established.
	 */
	connect: function (url, callback) {
		if (_websocket) {
			_websocket.close();
			_websocket = null;
		}
		var ws = _websocket = new WebSocket(url || DEFAULT_URL);
		ws.onopen = function (event) {
			trigger("open", event);
		};
		ws.onerror = function (event) {
			trigger("error", event);
		};
		ws.onclose = function (event) {
			trigger("close", event);
		};
		var handler = function (event) {
			reset_idle_ping_timer();
			var msg = JSON.parse(event.data);
			console.log("Coinfloor >>", msg);
			if ("tag" in msg) {
				var handler = _result_handlers[msg.tag];
				delete _result_handlers[msg.tag];
				if (handler) {
					handler(msg);
				}
				else if (handler === undefined) {
					console.error("Coinfloor:", msg);
				}
			}
			else if ("notice" in msg) {
				trigger(msg.notice, msg);
			}
		};
		ws.onmessage = function (event) {
			var msg = JSON.parse(event.data);
			_server_nonce = atob(msg.nonce);
			this.onmessage = handler;
			handler(event);
			if (callback) {
				callback(msg);
			}
		};
	},

	/*
	 * Authenticates as the specified user with the given authentication cookie
	 * and passphrase.
	 */
	authenticate: function (user_id, cookie, passphrase, callback) {
		var packed_user_id = String.fromCharCode(0, 0, 0, 0, user_id >> 24 & 0xFF, user_id >> 16 & 0xFF, user_id >> 8 & 0xFF, user_id & 0xFF);
		var client_nonce = "";
		for (var i = 0; i < 16; ++i) {
			client_nonce += String.fromCharCode(Math.random() * 256);
		}
		var seed = packed_user_id + unescape(encodeURIComponent(passphrase));
		var data = packed_user_id + _server_nonce + client_nonce;
		var d = ecp.mpn_pack(util.hash_string_to_words(seed));
		var z = ecp.mpn_pack(util.hash_string_to_words(data));
		var r = ecp.mpn_new(8), s = ecp.mpn_new(8);
		ecp.ecp_sign(r, s, ecp.secp224k1_p, ecp.secp224k1_a, ecp.secp224k1_G, ecp.secp224k1_n, d, z, 8);
		request({
			method: "Authenticate",
			user_id: user_id,
			cookie: cookie,
			nonce: btoa(client_nonce),
			signature: [ btoa(util.words_to_string(ecp.mpn_unpack(r))), btoa(util.words_to_string(ecp.mpn_unpack(s))) ],
		}, callback);
	},

	request: request,

};
