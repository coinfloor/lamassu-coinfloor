# Coinfloor plugin for Lamassu Rakía

This plugin enables Lamassu machines to obtain bitcoin pricing information from Coinfloor and to execute trades on Coinfloor. It implements the `ticker` and `trader` plugin interfaces of the Lamassu Rakía platform.

## Configuration

| Variable     | Description
|--------------|-------------
| `url`        | *Optional.* If set, overrides the default URL to Coinfloor's WebSocket API.
| `user_id`    | *Required for trading.* The numeric identifier of a Coinfloor user.
| `cookie`     | *Required for trading.* The authentication cookie for the specified user.
| `passphrase` | *Required for trading.* The passphrase of the specified user.
