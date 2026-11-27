// Runs inside Telegram's developer page (my.telegram.org/apps) once a second.
// Returns {ok:1,id,hash} when both keys are readable; otherwise does one helpful step and returns {ok:0}.
(function () {
  var text = document.body ? document.body.innerText : '';
  var id = /App\s+api[_ ]?id\s*:?\s*(\d{4,12})/i.exec(text);
  var hash = /api[_ ]?hash[\s\S]{0,80}?\b([a-f0-9]{32})\b/i.exec(text);
  // The page can also keep the value in an input.
  if (!hash) {
    var inputs = document.querySelectorAll('input');
    for (var k = 0; k < inputs.length && !hash; k++) {
      var m = /^[a-f0-9]{32}$/i.exec(inputs[k].value || '');
      if (m) hash = [m[0], m[0]];
    }
  }
  if (id && hash) return { ok: 1, id: id[1], hash: hash[1].toLowerCase() };

  // The app exists but the api_hash is hidden behind an eye button: press it (then, if that was
  // the wrong button, the next one on later rounds).
  if (id && !hash) {
    var leaves = [].filter.call(document.querySelectorAll('*'), function (e) {
      return e.children.length === 0 && /api[_ ]?hash/i.test(e.textContent || '');
    });
    var tile = leaves[0];
    for (var up = 0; tile && up < 5; up++) {
      tile = tile.parentElement;
      if (tile && tile.querySelectorAll('button,[role=button]').length) break;
    }
    var buttons = tile ? tile.querySelectorAll('button,[role=button]') : [];
    window.__mqTry = (window.__mqTry || 0) + 1;
    if (buttons.length && window.__mqTry <= buttons.length * 2) {
      buttons[(window.__mqTry - 1) % buttons.length].click();
      return { ok: 0, revealing: window.__mqTry };
    }
    return { ok: 0, needHash: 1 };
  }

  // No app yet: fill in and submit the create form.
  var title = document.getElementById('app_title');
  var short = document.getElementById('app_shortname');
  if (title && short && !window.__mqSubmitted) {
    var set = function (el, v) {
      var proto = Object.getPrototypeOf(el);
      var setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter && setter.set) setter.set.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(title, 'Marquee');
    set(short, 'mq' + Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) + Math.floor(Math.random() * 90000 + 10000));
    var platform = document.querySelector('input[name=app_platform][value=android]');
    if (platform) { platform.checked = true; platform.click(); }
    var button = document.getElementById('app_save_btn') || document.querySelector('form button[type=submit]') || document.querySelector('form input[type=submit]');
    if (button) { window.__mqSubmitted = true; button.click(); return { ok: 0, submitted: 1 }; }
  }
  return { ok: 0 };
})()
