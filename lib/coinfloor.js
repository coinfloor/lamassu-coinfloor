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

var Coinfloor = require("./coinfloor_api");

var XBT = { id: 0xF800, code: "XBT", symbol: "\u0243", symbolAfter: false, scale: 4 };
var EUR = { id: 0xFA00, code: "EUR", symbol: "\u20AC", symbolAfter: false, scale: 2 };
var GBP = { id: 0xFA20, code: "GBP", symbol: "\u00A3", symbolAfter: false, scale: 2 };
var AUD = { id: 0xFA40, code: "AUD", symbol: "AU$", symbolAfter: false, scale: 2 };
var NZD = { id: 0xFA60, code: "NZD", symbol: "NZ$", symbolAfter: false, scale: 2 };
var USD = { id: 0xFA80, code: "USD", symbol: "US$", symbolAfter: false, scale: 2 };
var CAD = { id: 0xFAA0, code: "CAD", symbol: "CA$", symbolAfter: false, scale: 2 };
var CHF = { id: 0xFAC0, code: "CHF", symbol: "CHF\u00A0", symbolAfter: false, scale: 2 };
var JPY = { id: 0xFAE0, code: "JPY", symbol: "JP\u00A5", symbolAfter: false, scale: 0 };
var PLN = { id: 0xFDA8, code: "PLN", symbol: "\u00A0z\u0142", symbolAfter: true, scale: 2 };

var assets_by_id = { 0xF800: XBT, 0xFA00: EUR, 0xFA20: GBP, 0xFA40: AUD, 0xFA60: NZD, 0xFA80: USD, 0xFAA0: CAD, 0xFAC0: CHF, 0xFAE0: JPY, 0xFDA8: PLN };
var assets_by_code = { XBT: XBT, EUR: EUR, GBP: GBP, AUD: AUD, NZD: NZD, USD: USD, CAD: CAD, CHF: CHF, JPY: JPY, PLN: PLN };

var _config;
var _base = XBT;
var _counter;
var _url = false;
var _tickers = {};
var _ticker_callback;
var _balances = {};
var _balance_callback;

Coinfloor.on("open", function () {
	console.log("Coinfloor: WebSocket connected to " + (_url || Coinfloor.DEFAULT_URL));
});

Coinfloor.on("close", function () {
	console.log("Coinfloor: WebSocket disconnected");
	_url = false;
});

Coinfloor.on("Welcome", function () {
	Coinfloor.authenticate(_config.user_id, _config.cookie, _config.passphrase, function (msg) {
		if (msg.error_code) {
			console.error("Coinfloor: Failed to authenticate: " + msg.error_msg);
		}
		else {
			console.log("Coinfloor: Authentication succeeded");
		}
	});
});

Coinfloor.on("BalanceChanged", function (msg) {
	var asset;
	if (asset = assets_by_id[msg.asset]) {
		if (asset === XBT) {
			_balances["BTC"] = msg.balance.scale10(8 - XBT.scale);
		}
		else {
			_balances[asset.code] = msg.balance.scale10(-asset.scale);
		}
		if (_balance_callback) {
			_balance_callback(null, _balances);
		}
	}
});

Coinfloor.on("OrdersMatched", function (msg) {
	var base, counter;
	if ((base = assets_by_id[msg.base]) && (counter = assets_by_id[msg.counter])) {
		if ("bid_base_fee" in msg) {
			console.log("Coinfloor: Bought " + format_amount(base, msg.quantity) + " @ " + format_price(base, counter, msg.price));
		}
		if ("ask_base_fee" in msg) {
			console.log("Coinfloor: Sold " + format_amount(base, msg.quantity) + " @ " + format_price(base, counter, msg.price));
		}
	}
});

Coinfloor.on("TickerChanged", function (msg) {
	var base, counter;
	if ((base = assets_by_id[msg.base]) === _base && (counter = assets_by_id[msg.counter])) {
		var ticker = _tickers[counter.code];
		if (!ticker) {
			ticker = _tickers[counter.code] = { currency: counter.code, rates: {} };
		}
		if ("bid" in msg) {
			ticker.rates.bid = msg.bid == null ? null : msg.bid.scale10(-counter.scale + base.scale - 4);
		}
		if ("ask" in msg) {
			ticker.rates.ask = msg.ask == null ? null : msg.ask.scale10(-counter.scale + base.scale - 4);
		}
		if (_ticker_callback) {
			_ticker_callback(null, _tickers);
		}
	}
});

Number.prototype.scale10 = function (e) {
  var parts = this.toString().split("e");
  return parseFloat(parts[0] + "e" + ((parts[1] | 0) + (e | 0)));
};

function format_amount(asset, amount) {
	amount = amount.scale10(-asset.scale).toFixed(asset.scale);
	return asset.symbolAfter ? amount + asset.symbol : asset.symbol + amount;
}

function format_price(base, counter, price) {
	var scale = counter.scale - base.scale + 4;
	price = price.scale10(-scale).toFixed(scale);
	return (counter.symbolAfter ? price + counter.symbol : counter.symbol + price) + "/" + base.code;
}

function trade(satoshis, opts, callback) {
	var quantity = Math.round(satoshis.scale10(XBT.scale - 8));
	console.log("Coinfloor: " + (quantity > 0 ? "Buying" : "Selling") + " " + format_amount(XBT, quantity));
	Coinfloor.request({
		method: "PlaceOrder",
		base: _base.id,
		counter: _counter.id,
		quantity: quantity,
	}, function (msg) {
		callback(msg.error_code ? new Error(msg.error_msg) : null);
	});
}

module.exports = {

	NAME: "Coinfloor",
	SUPPORTED_MODULES: [ "ticker", "trader" ],

	config: function (config) {
		var counter = assets_by_code[config.currency];
		if (!counter) {
			throw new Error("unsupported currency: " + currency);
		}
		_counter = counter;
		_config = config;
		if (config.url !== _url) {
			Coinfloor.connect(_url = config.url);
		}
		if (Coinfloor.isConnected()) {
			Coinfloor.authenticate(config.user_id, config.cookie, config.passphrase);
		}
	},

	ticker: function (currencies, callback) {
		if (typeof currencies == "string") {
			currencies = [ currencies ];
		}
		var remaining = currencies.length;
		for (var i = 0; i < currencies.length; ++i) {
			var currency = currencies[i];
			if (!(currency in _tickers) && currency in assets_by_code) {
				var doWatch = (function (base, counter) {
					return function () {
						console.log("Coinfloor: Subscribing to ticker for " + base.code + ":" + counter.code);
						Coinfloor.request({
							method: "WatchTicker",
							base: base.id,
							counter: counter.id,
							watch: true,
						}, function (msg) {
							if (msg.error_code == 0) {
								msg.base = base.id;
								msg.counter = counter.id;
								Coinfloor.trigger("TickerChanged", msg);
								if (!--remaining) {
									callback(null, _tickers);
									_ticker_callback = callback;
								}
							}
						});
					};
				})(_base, assets_by_code[currency]);
				Coinfloor.on("Welcome", doWatch);
				if (Coinfloor.isConnected()) {
					doWatch();
				}
			}
			else if (!--remaining) {
				callback(null, _tickers);
				_ticker_callback = callback;
			}
		}
	},

	balance: function (callback) {
		Coinfloor.request({
			method: "GetBalances"
		}, function (msg) {
			if (msg.error_code) {
				callback(new Error(msg.error_msg));
			}
			else {
				if (msg.balances) {
					_balance_callback = null;
					for (var i = 0; i < msg.balances.length; ++i) {
						Coinfloor.trigger("BalanceChanged", msg.balances[i]);
					}
				}
				callback(null, _balances);
				_balance_callback = callback;
			}
		});
	},

	purchase: function (satoshis, opts, callback) {
		trade(satoshis, opts, callback);
	},

	sell: function (satoshis, opts, callback) {
		trade(-satoshis, opts, callback);
	},

};
