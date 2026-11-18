/**
 * The script served at `/__vinkup/bridge.js`. It runs inside the trainee's page before
 * any of their scripts and forwards console output, errors, navigation and storage
 * changes to the workspace.
 *
 * It is a plain string (not a TypeScript function) because the main process tsconfig
 * has no DOM library. Keep it self-contained: no imports, no build step.
 */
export const BRIDGE_SCRIPT = `(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var runId = params.get('run') || '';
  var parentOrigin = params.get('parent') || '*';
  var maxMessages = 500;
  var initialStorage = {};
  try {
    initialStorage = JSON.parse(params.get('storage') || '{}') || {};
  } catch (error) {
    initialStorage = {};
  }

  var MAX_STRING = 2000;
  var MAX_DEPTH = 3;
  var sentCount = 0;
  var isLimited = false;

  function postEvent(message) {
    try {
      message.runId = runId;
      var body = JSON.stringify(message);
      if (navigator.sendBeacon) {
        // text/plain is CORS-safelisted: the sandboxed page has an opaque origin, so a
        // JSON content type would trigger a preflight the preview server never allows.
        navigator.sendBeacon(
          '/__vinkup/bridge-event',
          new Blob([body], { type: 'text/plain;charset=UTF-8' })
        );
      } else {
        fetch('/__vinkup/bridge-event', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: body,
          keepalive: true,
        }).catch(function () {});
      }
    } catch (error) {
      // The workspace server is gone; nothing to do.
    }
  }

  function postToParent(message) {
    try {
      message.__itp = true;
      message.runId = runId;
      window.parent.postMessage(message, parentOrigin);
    } catch (error) {
      // The parent is gone (the preview was replaced).
    }
  }

  function send(message) {
    if (message.type === 'console' || message.type === 'runtime-error') {
      if (sentCount >= maxMessages) {
        if (!isLimited) {
          isLimited = true;
          postEvent({
            type: 'console',
            level: 'warn',
            args: ['Console output limited to ' + maxMessages + ' messages'],
            ts: Date.now(),
          });
        }
        return;
      }
      sentCount += 1;
    }
    postEvent(message);
  }

  function note(level, args) {
    send({ type: 'console', level: level, args: args, ts: Date.now() });
  }

  function cut(text) {
    return text.length > MAX_STRING ? text.slice(0, MAX_STRING) + '\\u2026' : text;
  }

  function tagOf(value) {
    return Object.prototype.toString.call(value);
  }

  function isError(value) {
    var tag = tagOf(value);
    return tag === '[object Error]' || tag === '[object DOMException]';
  }

  function isElement(value) {
    return value && value.nodeType === 1 && typeof value.tagName === 'string';
  }

  function format(value, depth, seen) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return depth === 0 ? value : JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'bigint') return String(value) + 'n';
    if (typeof value === 'symbol') return value.toString();
    if (typeof value === 'function') return '\\u0192 ' + (value.name || 'anonymous') + '()';
    if (typeof value !== 'object') return typeof value;

    if (isError(value)) return value.name + ': ' + value.message;
    if (isElement(value)) {
      var id = value.id ? '#' + value.id : '';
      var classes = (value.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean);
      var classText = classes.map(function (name) { return '.' + name; }).join('');
      return '<' + value.tagName.toLowerCase() + id + classText + '>';
    }

    var tag = tagOf(value);
    if (tag === '[object Date]') {
      var time = value.getTime();
      return isNaN(time) ? 'Invalid Date' : value.toISOString();
    }
    if (tag === '[object RegExp]') return String(value);

    if (seen.indexOf(value) !== -1) return '[Circular]';
    var isArray = Array.isArray(value);
    if (depth >= MAX_DEPTH) return isArray ? '[\\u2026]' : '{\\u2026}';

    seen.push(value);
    var text;
    if (isArray) {
      text = '[' + value.map(function (item) { return format(item, depth + 1, seen); }).join(', ') + ']';
    } else if (tag === '[object Map]') {
      var pairs = [];
      value.forEach(function (v, k) {
        pairs.push(format(k, depth + 1, seen) + ' => ' + format(v, depth + 1, seen));
      });
      text = 'Map(' + pairs.length + ') {' + pairs.join(', ') + '}';
    } else if (tag === '[object Set]') {
      var items = [];
      value.forEach(function (v) { items.push(format(v, depth + 1, seen)); });
      text = 'Set(' + items.length + ') {' + items.join(', ') + '}';
    } else {
      var fields = Object.keys(value).map(function (key) {
        var field;
        try {
          field = value[key];
        } catch (error) {
          field = '[Getter threw]';
        }
        return key + ': ' + format(field, depth + 1, seen);
      });
      text = '{' + fields.join(', ') + '}';
    }
    seen.pop();
    return text;
  }

  function serialize(value) {
    return cut(format(value, 0, []));
  }

  function locationFromStack(stack) {
    if (typeof stack !== 'string') return null;
    var frames = stack.split('\\n').slice(1);
    for (var i = 0; i < frames.length; i += 1) {
      var match = /(?:\\(|@|at )([^\\s()@]+):(\\d+):(\\d+)\\)?\\s*$/.exec(frames[i]);
      if (match && match[1] !== 'about:srcdoc') {
        return { source: match[1], line: Number(match[2]), column: Number(match[3]) };
      }
    }
    return null;
  }

  var con = window.console;
  var levels = ['log', 'info', 'warn', 'error', 'debug'];
  levels.forEach(function (level) {
    var original = con[level].bind(con);
    con[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      original.apply(con, args);
      send({ type: 'console', level: level, args: args.map(serialize), ts: Date.now() });
    };
  });
  var originalTable = con.table.bind(con);
  con.table = function () {
    var args = Array.prototype.slice.call(arguments);
    originalTable.apply(con, args);
    send({ type: 'console', level: 'log', args: args.map(serialize), ts: Date.now() });
  };
  var originalClear = con.clear.bind(con);
  con.clear = function () {
    originalClear();
    send({ type: 'console-clear' });
  };

  window.addEventListener('error', function (event) {
    var message = {
      type: 'console',
      level: 'error',
      args: ['Uncaught ' + (event.message || 'Script error.')],
      ts: Date.now(),
    };
    var stack = event.error && event.error.stack;
    var filename = event.filename;
    if (filename && filename !== 'about:srcdoc') {
      message.args.push(filename + (event.lineno ? ':' + event.lineno : ''));
    } else {
      var where = locationFromStack(stack);
      if (where) message.args.push(where.source + ':' + where.line);
    }
    send(message);
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    send({
      type: 'console',
      level: 'error',
      args: ['Uncaught (in promise) ' + serialize(reason)],
      ts: Date.now(),
    });
  });

  document.addEventListener('securitypolicyviolation', function (event) {
    note('error', [
      "Blocked by the page's security policy (" + event.effectiveDirective + '):',
      event.blockedURI || '(inline)',
    ]);
  });

  document.addEventListener('DOMContentLoaded', function () {
    postEvent({ type: 'preview-ready' });
  });

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (target && target.nodeType === 3) target = target.parentElement;
    var anchor = target && target.closest ? target.closest('a[href]') : null;
    if (!anchor) return;

    var href = (anchor.getAttribute('href') || '').trim();
    if (href.indexOf('#') === 0) return; // same-page anchor
    event.preventDefault();

    var isExternal = /^([a-z][a-z\\d+.-]*:|\\/\\/)/i.test(href);
    var path = href.split(/[?#]/)[0];
    if (!isExternal && /\\.html$/i.test(path)) {
      postToParent({ type: 'navigate', href: href });
    } else {
      note('warn', ['External links are blocked in the preview.', href]);
    }
  }, true);

  window.addEventListener('submit', function (event) {
    if (event.defaultPrevented) return;
    event.preventDefault();
    var fields = {};
    try {
      new FormData(event.target).forEach(function (value, key) { fields[key] = value; });
    } catch (error) {
      // not a real form element
    }
    note('info', ['Form submitted (blocked in the preview)', serialize(fields)]);
  });

  function createStorage(initial, onChange) {
    var data = new Map(Object.entries(initial || {}));
    return {
      get length() { return data.size; },
      key: function (index) { return Array.from(data.keys())[index] || null; },
      getItem: function (key) { return data.has(String(key)) ? data.get(String(key)) : null; },
      setItem: function (key, value) {
        var k = String(key);
        var v = String(value);
        data.set(k, v);
        if (onChange) onChange({ type: 'storage', op: 'set', key: k, value: v });
      },
      removeItem: function (key) {
        var k = String(key);
        data.delete(k);
        if (onChange) onChange({ type: 'storage', op: 'remove', key: k });
      },
      clear: function () {
        data.clear();
        if (onChange) onChange({ type: 'storage', op: 'clear' });
      },
    };
  }

  try {
    Object.defineProperty(window, 'localStorage', {
      value: createStorage(initialStorage, postToParent),
      configurable: true,
    });
  } catch (error) {
    // leave the browser's own
  }
  try {
    Object.defineProperty(window, 'sessionStorage', {
      value: createStorage({}, null),
      configurable: true,
    });
  } catch (error) {
    // leave the browser's own
  }
})();`;

export const BRIDGE_PATH = '/__vinkup/bridge.js';
export const BRIDGE_EVENT_PATH = '/__vinkup/bridge-event';
export const EVENTS_PATH = '/__vinkup/events';
export const BUNDLE_PATH = '/__vinkup/bundle.js';
