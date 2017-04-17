'use strict'

const Transform = require('stream').Transform
const EventEmitter = require('events').EventEmitter

const DEFAULT_COUNT = () => 1

class Port extends Transform {
  constructor (parent, options) {
    super(options)
    this._parent = parent
    this._count = 0
  }

  get count () {
    return this._count
  }

  _transform (chunk, enc, cb) {
    this._count += this._parent._count(chunk, enc)
    this._parent._update()
    cb(null, chunk)
  }
}

class StreamCapacitor extends EventEmitter {
  constructor (highWaterMark, lowWaterMark, options) {
    super()
    options = Object.assign({}, options)
    if (options.count != null) {
      this._count = options.count
      delete options.count
    } else {
      this._count = DEFAULT_COUNT
    }
    this._highWaterMark = highWaterMark
    this._lowWaterMark = lowWaterMark
    this._delta = 0
    this._corked = false
    this._boundUpdate = this._update.bind(this)
    this._input = new Port(this, options)
    this._output = new Port(this, options)
  }

  get delta () {
    return this._delta
  }

  set delta (value) {
    this._delta = value
    this._update()
  }

  get count () {
    return this._input.count - this._output.count + this._delta
  }

  get input () {
    return this._input
  }

  get output () {
    return this._output
  }

  _update () {
    const count = this.count
    if (count >= this._highWaterMark) {
      this._cork()
    } else if (count < this._lowWaterMark) {
      this._uncork()
    }
  }

  _cork () {
    if (!this._corked) {
      this._corked = true
      this._input.cork()
      this.emit('close')
    }
  }

  _uncork () {
    if (this._corked) {
      this._corked = false
      this._input.uncork()
      this.emit('open')
    }
  }
}

module.exports = StreamCapacitor
