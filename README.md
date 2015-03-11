# bitchan-node [![Build Status](https://travis-ci.org/bitchan/bitchan-node.svg?branch=master)](https://travis-ci.org/bitchan/bitchan-node) [![npm version](https://badge.fury.io/js/bitchan-node.svg)](http://badge.fury.io/js/bitchan-node)

**NOTE: bitchan-node is in early alpha and may contain a lot of bugs. So it is recommended to use only trusted peer mode for a moment.**

bitchan and Bitmessage client for Node.js.

Works as a common node in the [Bitmessage network](https://bitmessage.org/wiki/Main_Page) and also provides WebSocket gateway for [bitchan web clients](https://github.com/bitchan/bitchan-web). Read more about bitchan [at the wiki](https://github.com/bitchan/meta/wiki).

## Usage

### With npm

```bash
$ [sudo] npm install -g bitchan-node
$ bitchan
```

It will automatically create [default config](etc/bitchan.yaml.example)
at `~/.bitchan/bitchan.yaml` and run `bitchan-node` in a trusted peer
mode. Trusted peer is located at localhost:8444 by default (if you have
PyBitmessage running at the same computer, most probably it will listen
here). WebSocket server will listen at 18444. By default SQLite database
will be used to store Bitmessage objects at `~/.bitchan/bitchan.db`.
Logs will be placed at `~/.bitchan/bitchan.log`.

By default `bitchan-node` will also spawn [web interface](https://github.com/bitchan/bitchan-web) at 28444 port which should be accessible in browser by http://localhost:28444/

To run `bitchan-node` in a background you may either use
[forever utility](https://www.npmjs.com/package/forever) or some sort of
terminal multiplexing/nohup.

### With deb package

*TODO*

## License

bitchan-node - Node bitchan client

Written in 2014-2015 by Kagami Hiiragi <kagami@genshiken.org>

To the extent possible under law, the author(s) have dedicated all copyright and related and neighboring rights to this software to the public domain worldwide. This software is distributed without any warranty.

You should have received a copy of the CC0 Public Domain Dedication along with this software. If not, see <http://creativecommons.org/publicdomain/zero/1.0/>.
