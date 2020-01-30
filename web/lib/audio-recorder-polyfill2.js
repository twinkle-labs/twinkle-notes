(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var AudioContext = window.AudioContext || window.webkitAudioContext

function createWorker (fn) {
  var js = fn
    .toString()
    .replace(/^function\s*\(\)\s*{/, '')
    .replace(/}$/, '')
  var blob = new Blob([js])
  return new Worker(URL.createObjectURL(blob))
}

function error (method) {
  var event = new Event('error')
  event.data = new Error('Wrong state for ' + method)
  return event
}

var context

/**
 * Audio Recorder with MediaRecorder API.
 *
 * @param {MediaStream} stream The audio stream to record.
 *
 * @example
 * navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
 *   var recorder = new MediaRecorder(stream)
 * })
 *
 * @class
 */
function MediaRecorder (stream) {
  /**
   * The `MediaStream` passed into the constructor.
   * @type {MediaStream}
   */
  this.stream = stream

  /**
   * The current state of recording process.
   * @type {"inactive"|"recording"|"paused"}
   */
  this.state = 'inactive'

  this.em = document.createDocumentFragment()
  this.encoder = createWorker(MediaRecorder.encoder)

  var recorder = this
  this.encoder.addEventListener('message', function (e) {
    var event = new Event('dataavailable')
    event.data = new Blob([e.data], { type: recorder.mimeType })
    recorder.em.dispatchEvent(event)
    if (recorder.state === 'inactive') {
      recorder.em.dispatchEvent(new Event('stop'))
    }
  })
}

MediaRecorder.prototype = {
  /**
   * The MIME type that is being used for recording.
   * @type {string}
   */
  mimeType: 'audio/wav',

  /**
   * Begins recording media.
   *
   * @param {number} [timeslice] The milliseconds to record into each `Blob`.
   *                             If this parameter isn’t included, single `Blob`
   *                             will be recorded.
   *
   * @return {undefined}
   *
   * @example
   * recordButton.addEventListener('click', function () {
   *   recorder.start()
   * })
   */
  start: function start (timeslice) {
    if (this.state !== 'inactive') {
      return this.em.dispatchEvent(error('start'))
    }

    this.state = 'recording'

    if (!context) {
      context = new AudioContext()
    }
    var input = context.createMediaStreamSource(this.stream)
    var processor = context.createScriptProcessor(2048, 1, 1)

    var recorder = this
    processor.onaudioprocess = function (e) {
      if (recorder.state === 'recording') {
        recorder.encoder.postMessage([
            'encode', e.inputBuffer.getChannelData(0), context.sampleRate
        ])
      }
    }

    input.connect(processor)
    processor.connect(context.destination)

    this.em.dispatchEvent(new Event('start'))

    if (timeslice) {
      this.slicing = setInterval(function () {
        if (recorder.state === 'recording') recorder.requestData()
      }, timeslice)
    }

    return undefined
  },

  /**
   * Stop media capture and raise `dataavailable` event with recorded data.
   *
   * @return {undefined}
   *
   * @example
   * finishButton.addEventListener('click', function () {
   *   recorder.stop()
   * })
   */
  stop: function stop () {
    if (this.state === 'inactive') {
      return this.em.dispatchEvent(error('stop'))
    }

    this.requestData()
    this.state = 'inactive'
    return clearInterval(this.slicing)
  },

  /**
   * Pauses recording of media streams.
   *
   * @return {undefined}
   *
   * @example
   * pauseButton.addEventListener('click', function () {
   *   recorder.pause()
   * })
   */
  pause: function pause () {
    if (this.state !== 'recording') {
      return this.em.dispatchEvent(error('pause'))
    }

    this.state = 'paused'
    return this.em.dispatchEvent(new Event('pause'))
  },

  /**
   * Resumes media recording when it has been previously paused.
   *
   * @return {undefined}
   *
   * @example
   * resumeButton.addEventListener('click', function () {
   *   recorder.resume()
   * })
   */
  resume: function resume () {
    if (this.state !== 'paused') {
      return this.em.dispatchEvent(error('resume'))
    }

    this.state = 'recording'
    return this.em.dispatchEvent(new Event('resume'))
  },

  /**
   * Raise a `dataavailable` event containing the captured media.
   *
   * @return {undefined}
   *
   * @example
   * this.on('nextData', function () {
   *   recorder.requestData()
   * })
   */
  requestData: function requestData () {
    if (this.state === 'inactive') {
      return this.em.dispatchEvent(error('requestData'))
    }

    return this.encoder.postMessage(['dump', context.sampleRate])
  },

  /**
   * Add listener for specified event type.
   *
   * @param {"start"|"stop"|"pause"|"resume"|"dataavailable"|"error"}
   * type Event type.
   * @param {function} listener The listener function.
   *
   * @return {undefined}
   *
   * @example
   * recorder.addEventListener('dataavailable', function (e) {
   *   audio.src = URL.createObjectURL(e.data)
   * })
   */
  addEventListener: function addEventListener () {
    this.em.addEventListener.apply(this.em, arguments)
  },

  /**
   * Remove event listener.
   *
   * @param {"start"|"stop"|"pause"|"resume"|"dataavailable"|"error"}
   * type Event type.
   * @param {function} listener The same function used in `addEventListener`.
   *
   * @return {undefined}
   */
  removeEventListener: function removeEventListener () {
    this.em.removeEventListener.apply(this.em, arguments)
  },

  /**
   * Calls each of the listeners registered for a given event.
   *
   * @param {Event} event The event object.
   *
   * @return {boolean} Is event was no canceled by any listener.
   */
  dispatchEvent: function dispatchEvent () {
    this.em.dispatchEvent.apply(this.em, arguments)
  }
}

/**
 * Returns `true` if the MIME type specified is one the polyfill can record.
 *
 * This polyfill supports only `audio/wav`.
 *
 * @param {string} mimeType The mimeType to check.
 *
 * @return {boolean} `true` on `audio/wav` MIME type.
 */
MediaRecorder.isTypeSupported = function isTypeSupported (mimeType) {
  return /audio\/wave?/.test(mimeType)
}

/**
 * `true` if MediaRecorder can not be polyfilled in the current browser.
 * @type {boolean}
 *
 * @example
 * if (MediaRecorder.notSupported) {
 *   showWarning('Audio recording is not supported in this browser')
 * }
 */
MediaRecorder.notSupported = !navigator.mediaDevices || !AudioContext

/**
 * Converts RAW audio buffer to compressed audio files.
 * It will be loaded to Web Worker.
 * By default, WAVE encoder will be used.
 * @type {function}
 *
 * @example
 * MediaRecorder.prototype.mimeType = 'audio/ogg'
 * MediaRecorder.encoder = oggEncoder
 */
MediaRecorder.encoder = require('./wave-encoder')

module.exports = MediaRecorder

},{"./wave-encoder":3}],2:[function(require,module,exports){
window.MediaRecorder = require('./index.js');

},{"./index.js":1}],3:[function(require,module,exports){
// Copied from https://github.com/chris-rudmin/Recorderjs

module.exports = function () {
    const BYTES_PER_SAMPLE = 2;
    const SAMPLE_RATE = 8820;
  var recorded = []

    function encode (buffer, sampleRate) {
        
        var length = buffer.length;
        var step = Math.round(sampleRate/SAMPLE_RATE);
        if (step < 1) step = 1;
        var nSamples = Math.floor(length/step);
        var data = new Uint8Array(nSamples * BYTES_PER_SAMPLE);
//        console.log("encode samples:", length, sampleRate, nSamples);
        var index = 0;
        for (var i = 0; i < length; i+=step) {
            var sample = buffer[i]
            if (sample > 1) {
                sample = 1
            } else if (sample < -1) {
                sample = -1
            }
            sample = sample * 32768
            data[index] = sample
            data[index + 1] = sample >> 8
            index += 2;
        }
        recorded.push(data)
    }

    function dump (sampleRate1) {
        var sampleRate = SAMPLE_RATE;
    var bufferLength = recorded.length ? recorded[0].length : 0
    var length = recorded.length * bufferLength
    var wav = new Uint8Array(44 + length)
    var view = new DataView(wav.buffer)

    // RIFF identifier 'RIFF'
    view.setUint32(0, 1380533830, false)
    // file length minus RIFF identifier length and file description length
    view.setUint32(4, 36 + length, true)
    // RIFF type 'WAVE'
    view.setUint32(8, 1463899717, false)
    // format chunk identifier 'fmt '
    view.setUint32(12, 1718449184, false)
    // format chunk length
    view.setUint32(16, 16, true)
    // sample format (raw)
    view.setUint16(20, 1, true)
    // channel count
    view.setUint16(22, 1, true)
    // sample rate
    view.setUint32(24, sampleRate, true)
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true)
    // block align (channel count * bytes per sample)
    view.setUint16(32, BYTES_PER_SAMPLE, true)
    // bits per sample
    view.setUint16(34, 8 * BYTES_PER_SAMPLE, true)
    // data chunk identifier 'data'
    view.setUint32(36, 1684108385, false)
    // data chunk length
    view.setUint32(40, length, true)

    for (var i = 0; i < recorded.length; i++) {
      wav.set(recorded[i], i * bufferLength + 44)
    }
//        console.log("encoded:", wav.buffer.byteLength);
    recorded = []
    postMessage(wav.buffer, [wav.buffer])
  }

  onmessage = function (e) {
    if (e.data[0] === 'encode') {
        encode(e.data[1], e.data[2])
    } else {
      dump(e.data[1])
    }
  }
}

},{}]},{},[2]);
