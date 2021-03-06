// jsmpeg by Dominic Szablewski - phoboslab.org, github.com/phoboslab
//
// Consider this to be under MIT license. It's largely based an an Open Source
// Decoder for Java under GPL, while I looked at another Decoder from Nokia
// (under no particular license?) for certain aspects.
// I'm not sure if this work is "derivative" enough to have a different license
// but then again, who still cares about MPEG1?
//
// Based on "Java MPEG-1 Video Decoder and Player" by Korandi Zoltan:
// http://sourceforge.net/projects/javampeg1video/
//
// Inspired by "MPEG Decoder in Java ME" by Nokia:
// http://www.developer.nokia.com/Community/Wiki/MPEG_decoder_in_Java_ME

var EventEmitter2 = require('eventemitter2').EventEmitter2;
var inherits = require('inherits');

var VideoLoader = require('./VideoLoader.js');
var BitReader = require('./BitReader.js');
var Decoder = require('./Decoder.js');
var ScrollWatcher = require('./ScrollWatcher.js');

var requestAnimationFrame = (function() {
  return window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame || function(callback) {
      window.setTimeout(callback, 1000 / 60);
    };
})();

var getTime = function() {
  if (window.performance) {
    if (window.performance.now) {
      return window.performance.now();
    }
  }
  return Date.now();
};

var jsmpeg = module.exports = function(url, options) {
  options = options || {};

  this.url = url;
  this.videoIndex = 0;
  this.el = this.canvas = options.canvas || document.createElement('canvas');
  this.ctx = this.canvas.getContext('2d');

  this.videoLoader = new VideoLoader();
  this.autoplay = options.autoplay || 'scroll';
  this.preload = options.preload || 'auto';
  this.repeat = !!options.repeat;

  this.decoder = new Decoder(this.canvas);
  this.currentTime = 0;

  this.on('show', this.play.bind(this));
  this.on('unshow', this.pause.bind(this));

  if (this.preload != 'none') {
    this.doPreload(options.preloadTimeout);
  }

  if (this.autoplay == 'scroll') {
      ScrollWatcher.add(this);
  } else if (this.autoplay) {
    this.load();
  }
};

inherits(jsmpeg, EventEmitter2);
module.exports.ScrollWatcher = ScrollWatcher;


jsmpeg.prototype.doPreload = function(timeout) {
  if (this.preload === 'meta') {
    // ignore
    return;
  }

  if (this.preload === 'auto') {
    // load all videos
    this.videoLoader.add(this.url);
  }

  if (typeof this.preload === 'number') {
    if (this.preload > 0 && Array.isArray(this.url)) {
      var urls = this.url.slice(0, this.preload);
      this.videoLoader.add(urls);
    } else {
      // load all videos
      this.videoLoader.add(this.url);
    }
  }

  this.videoLoader.once('load', (function(video) {
    this.emit('preload');
    this.loadVideo(video);
  }.bind(this)));
  if (typeof timeout !== 'undefined') {
    this.videoLoader.once('timeout', (function() {
      this.emit('preloadTimeout');
    }).bind(this));
  }
  this.videoLoader.load(timeout);
};

jsmpeg.prototype.load = function() {
  if (!this.playing) {
    this.videoLoader.once('load', (function(video) {
      this.loadVideo(video);
    }.bind(this)));
  }
  this.videoLoader.add(this.url);
  this.videoLoader.load();
};

jsmpeg.prototype.loadVideo = function(video) {
  this.videoIndex = video.index;
  this.decoder.loadBuffer(video.data);

  // Load the first frame
  this.processFrame();

  if (this.autoplay) {
    this.play();
  }
};

jsmpeg.prototype.play = function() {
  if (this.playing) {
    return;
  }

  this.emit('play');
  this.playing = true;
  this.load();
  this.animate();
};

jsmpeg.prototype.pause = function() {
  if (!this.playing) {
    return;
  }

  this.emit('pause');
  this.playing = false;
};

jsmpeg.prototype.stop = function() {
  this.emit('stop');

  this.loadVideo(this.videoLoader.findByIndex(0));
  this.playing = false;
};

jsmpeg.prototype.processFrame = function() {
  if (this.decoder.nextFrame()) {
    this.ctx.drawImage(
      this.decoder.canvas,
      0, 0, this.decoder.width, this.decoder.height,
      0, 0, this.canvas.width, this.canvas.height
    );
  } else {
    var video = this.videoLoader.findByIndex(this.videoIndex+1);
    if (!video) {
      this.emit('ended');
      if (this.repeat) {
        video = this.videoLoader.findByIndex(0);
        this.loadVideo(video);
      } else {
        this.stop();
      }
    } else {
      if (video.status === 'loaded') {
        this.loadVideo(video);
      } else {
        this.pause();
        this.videoLoader.once('load', (function(video) {
          if (video) {
            this.loadVideo(video);
            this.play();
          }
        }.bind(this)));
        if (video.status != 'loading') {
          this.load();
        }
      }
    }
  }
};

jsmpeg.prototype.animate = function() {
  if (!this.playing) {
    return;
  }

  var now = getTime();
  if (!this.lastTime) {
    this.lastTime = now;
  }
  var interval = 1000 / this.decoder.pictureRate;
  var delta = now - this.lastTime;

  if (delta > interval) {
    this.processFrame();
    this.lastTime = now - (delta % interval);
    this.currentTime += interval;
    this.emit('timeupdate');
  }

  requestAnimationFrame(this.animate.bind(this));
};
