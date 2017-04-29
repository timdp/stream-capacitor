'use strict'

const test = require('ava')
const sinon = require('sinon')
const isStream = require('is-stream')
const pumpify = require('pumpify')
const stream = require('stream')
const StreamCapacitor = require('./')

const disposables = []

class TimedReadable extends stream.Readable {
  constructor (time, max) {
    super({objectMode: true})
    this._time = time
    this._max = max || 0
    this._id = 0
    disposables.push(this)
  }

  _read () {
    if (this._interval) {
      return
    }
    this._interval = setInterval(() => {
      if (this._max > 0 && this._id >= this._max) {
        this._clearInterval()
        this.push(null)
      } else {
        this.push({id: this._id++})
      }
    }, this._time)
  }

  dispose () {
    this._clearInterval()
  }

  _clearInterval () {
    if (this._interval) {
      clearInterval(this._interval)
      this._interval = null
    }
  }
}

class TimedTransform extends stream.Transform {
  constructor (time) {
    super({objectMode: true})
    this._time = time
    disposables.push(this)
  }

  get time () {
    return this._time
  }

  set time (value) {
    this._time = value
    if (this._timeout) {
      this._clearTimeout()
      const elapsed = Date.now() - this._started
      const remaining = Math.max(0, this._time - elapsed)
      setTimeout(this._cb, remaining)
    }
  }

  _transform (chunk, enc, cb) {
    if (this._timeout) {
      cb(new Error('Already working'))
      return
    }
    this._cb = () => {
      this._timeout = null
      cb(null, chunk)
    }
    this._started = Date.now()
    this._timeout = setTimeout(this._cb, this._time)
  }

  dispose () {
    this._clearTimeout()
  }

  _clearTimeout () {
    if (this._timeout) {
      clearTimeout(this._timeout)
      this._timeout = null
    }
  }
}

test.after(() => {
  for (const disp of disposables) {
    disp.dispose()
  }
})

test('delta defaults to 0', (t) => {
  const cap = new StreamCapacitor(100, 10)
  t.is(cap.delta, 0)
})

test('count defaults to 0', (t) => {
  const cap = new StreamCapacitor(100, 10)
  t.is(cap.count, 0)
})

test('input is a stream', (t) => {
  const cap = new StreamCapacitor(100, 10)
  t.true(isStream(cap.input))
})

test('output is a stream', (t) => {
  const cap = new StreamCapacitor(100, 10)
  t.true(isStream(cap.output))
})

test.cb('does not throttle below high-water mark', (t) => {
  const readable = new TimedReadable(50)
  const transform = new TimedTransform(0)
  const cap = new StreamCapacitor(10000, 5000, {objectMode: true})
  const onClose = sinon.spy()
  const onOpen = sinon.spy()
  cap.on('close', onClose)
  cap.on('open', onOpen)
  pumpify.obj(
    readable,
    cap.input,
    transform,
    cap.output
  )
  setTimeout(() => {
    t.false(onClose.called)
    t.false(onOpen.called)
    t.end()
  }, 500)
})

test.cb('throttles above high-water mark', (t) => {
  const readable = new TimedReadable(50)
  const transform = new TimedTransform(10000)
  const cap = new StreamCapacitor(5, 2, {objectMode: true})
  const onClose = sinon.spy()
  const onOpen = sinon.spy()
  cap.on('close', onClose)
  cap.on('open', onOpen)
  pumpify.obj(
    readable,
    cap.input,
    transform,
    cap.output
  )
  setTimeout(() => {
    t.true(onClose.called)
    t.false(onOpen.called)
    t.end()
  }, 500)
})

test.cb('unthrottles below low-water mark', (t) => {
  const readable = new TimedReadable(10)
  const transform = new TimedTransform(100)
  const cap = new StreamCapacitor(10, 5, {objectMode: true})
  const onClose = sinon.spy(() => {
    transform.time = 1
  })
  const onOpen = sinon.spy()
  cap.on('close', onClose)
  cap.on('open', onOpen)
  pumpify.obj(
    readable,
    cap.input,
    transform,
    cap.output
  )
  setTimeout(() => {
    t.true(onClose.called)
    t.true(onOpen.called)
    t.end()
  }, 500)
})

test.cb('uses custom count function', (t) => {
  const readable = new TimedReadable(0, 1)
  const count = sinon.spy(() => 5)
  const cap = new StreamCapacitor(100, 10, {
    objectMode: true,
    count
  })
  readable.pipe(cap.input)
  setTimeout(() => {
    t.true(count.called)
    t.deepEqual(count.firstCall.args, [{id: 0}, 'utf8'])
    t.is(cap.count, 5)
    t.end()
  }, 100)
})

test.cb('uses delta', (t) => {
  const readable = new TimedReadable(0, 3)
  const cap = new StreamCapacitor(100, 10, {objectMode: true})
  cap.input.once('data', () => {
    cap.delta = 10
  })
  readable.pipe(cap.input)
  setTimeout(() => {
    t.is(cap.count, 13)
    t.end()
  }, 100)
})

test('exposes closed flag', (t) => {
  const cap = new StreamCapacitor(100, 10)
  t.false(cap.closed)
})

test('updates closed flag', (t) => {
  const cap = new StreamCapacitor(100, 10)
  cap.closed = true
  t.true(cap.closed)
})

test('emits close event upon close', (t) => {
  const spy = sinon.spy()
  const cap = new StreamCapacitor(100, 10)
  cap.on('close', spy)
  cap.closed = true
  t.true(spy.called)
})

test('emits open event upon open', (t) => {
  const spy = sinon.spy()
  const cap = new StreamCapacitor(100, 10)
  cap.on('open', spy)
  cap.closed = true
  cap.closed = false
  t.true(spy.called)
})

test('closed is idempotent', (t) => {
  const spy = sinon.spy()
  const cap = new StreamCapacitor(100, 10)
  cap.on('close', spy)
  cap.closed = true
  cap.closed = true
  cap.closed = true
  t.is(spy.callCount, 1)
})

test('exposes high-water mark', (t) => {
  const cap = new StreamCapacitor(100, 50)
  t.is(cap.highWaterMark, 100)
})

test('updates high-water mark', (t) => {
  const cap = new StreamCapacitor(100, 50)
  cap.highWaterMark = 200
  t.is(cap.highWaterMark, 200)
})

test('exposes low-water mark', (t) => {
  const cap = new StreamCapacitor(100, 50)
  t.is(cap.lowWaterMark, 50)
})

test('updates low-water mark', (t) => {
  const cap = new StreamCapacitor(100, 50)
  cap.lowWaterMark = 20
  t.is(cap.lowWaterMark, 20)
})

test('reopens when updating high-water mark', (t) => {
  const cap = new StreamCapacitor(100, 50)
  cap.closed = true
  cap.highWaterMark = 200
  t.false(cap.closed)
})

test('reopens when updating low-water mark', (t) => {
  const cap = new StreamCapacitor(100, 50)
  cap.closed = true
  cap.lowWaterMark = 20
  t.false(cap.closed)
})
