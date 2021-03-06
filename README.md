# fNES.js
an NES emulator in (pure?) Javascript by Marko 'Fador' Viitanen

Node.js and HTML5 canvas support

Test version up at [https://fador.be/fnes/](https://fador.be/fnes/)

- CPU is mostly implemented
- Hacky PPU implementation done
  - Scrolling etc missing
- APU not done

**Lots of features missing**

### Installation

fNES.js is tested with [Node.js](https://nodejs.org/) v13.

Node.js implementation depends on [node-sdl2](https://github.com/fador/node-sdl2)

In windows, add `SDL2.dll` to fnes.js directory before running

#### Node.js / node-sdl2
```sh
$ cd fnes.js
$ npm install
$ node main.js
```

#### Browser / HTML5 canvas

Customize the .nes file loading at the end of `html/main.js`

```sh
$ cd fnes.js/html
$ browserify main.js > system_browserify.js
```

Upload `index.html`, `system_browserify.js` and the `.nes` to your site

License
----

[MIT](LICENSE)

