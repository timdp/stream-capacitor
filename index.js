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
    this._closed = false
    this._boundUpdate = this._update.bind(this)
    this._input = new Port(this, options)
    this._output = new Port(this, options)
  }

  get highWaterMark () {
    return this._highWaterMark
  }

  set highWaterMark (value) {
    this._highWaterMark = value
    this._update()
  }

  get lowWaterMark () {
    return this._lowWaterMark
  }

  set lowWaterMark (value) {
    this._lowWaterMark = value
    this._update()
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

  get closed () {
    return this._closed
  }

  set closed (value) {
    if (this._closed === value) {
      return
    }
    this._closed = value
    if (this._closed) {
      this._input.cork()
      this.emit('close')
    } else {
      this._input.uncork()
      this.emit('open')
    }
  }

  _update () {
    if (this._closed) {
      if (this.count < this._lowWaterMark) {
        this.closed = false
      }
    } else if (this.count >= this._highWaterMark) {
      this.closed = true
    }
  }
}

module.exports = StreamCapacitor
