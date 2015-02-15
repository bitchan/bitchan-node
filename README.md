# bitchan-node [![Build Status](https://travis-ci.org/bitchan/bitchan-node.svg?branch=master)](https://travis-ci.org/bitchan/bitchan-node)

[![NPM](https://nodei.co/npm/bitchan-node.png)](https://www.npmjs.com/package/bitchan-node)

**NOTE: bitchan-node is in early alpha and may not work at all at this stage.**

bitchan/Bitmessage client for Node.js.

Works as a common node in the Bitmessage network and also provides WebSocket gateway for [bitchan web clients](https://github.com/bitchan/bitchan-web). Read more about bitchan [at the wiki](https://github.com/bitchan/meta/wiki).

## Usage

### With npm

```bash
$ [sudo] npm install -g bitchan-node
$ bitchan
```

It will automatically create default config at `~/.bitchan/bitchan.yaml`
and run `bitchan-node` with TCP server at 8444 port and WebSocket server
at 18444. By default SQLite database will be used to store Bitmessage
objects at `~/.bitchan/bitchan.db`. Logs will be placed at
`~/.bitchan/bitchan.log`.

### With deb package

## License

bitchan-node - Node bitchan client

Written in 2014-2015 by Kagami Hiiragi <kagami@genshiken.org>

To the extent possible under law, the author(s) have dedicated all copyright and related and neighboring rights to this software to the public domain worldwide. This software is distributed without any warranty.

You should have received a copy of the CC0 Public Domain Dedication along with this software. If not, see <http://creativecommons.org/publicdomain/zero/1.0/>.
