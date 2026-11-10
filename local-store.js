/* Fungi Field Key, offline phone version: local store, v001 (10 November 2026, Session 6).
   Stands in for the claude.ai artifact runtime (db, user, assets, downloads) so the same app code runs
   from a static site without signal. Records and photographs stay in this browser's IndexedDB on the phone;
   nothing is sent anywhere. Also registers the service worker that keeps the guide and its photographs
   available offline, and tracks which finds have been exported. */
(function(){
  'use strict';
  var DBN = 'fungi-field-key', DBV = 1, dbp = null;
  function openDb(){
    if(dbp) return dbp;
    dbp = new Promise(function(res, rej){
      var r = indexedDB.open(DBN, DBV);
      r.onupgradeneeded = function(){ var d = r.result;
        if(!d.objectStoreNames.contains('docs')){ var s = d.createObjectStore('docs', {keyPath: ['col', 'id']}); s.createIndex('col', 'col'); }
        if(!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs'); };
      r.onsuccess = function(){ res(r.result); };
      r.onerror = function(){ rej(r.error); };
    });
    return dbp;
  }
  function run(store, mode, fn){
    return openDb().then(function(d){ return new Promise(function(res, rej){
      var t = d.transaction(store, mode), out; fn(t.objectStore(store), function(v){ out = v; });
      t.oncomplete = function(){ res(out); }; t.onerror = function(){ rej(t.error); }; t.onabort = function(){ rej(t.error || new Error('aborted')); };
    }); });
  }
  function newId(){ var a = new Uint8Array(15), c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = '';
    crypto.getRandomValues(a); for(var i = 0; i < a.length; i++) s += c[a[i] % 62]; return s; }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }

  /* ---------- documents (the subset of the artifact db interface the app uses) ---------- */
  var listeners = {};
  function readCol(col){ return run('docs', 'readonly', function(s, done){ var r = s.index('col').getAll(col); r.onsuccess = function(){ done(r.result || []); }; }); }
  function snapshot(rows, changed){
    var docs = rows.map(function(x){ return {id: x.id, data: function(){ return clone(x.data); }}; });
    return {docs: docs, size: docs.length, empty: !docs.length, metadata: {fromCache: false, hasPendingWrites: false},
      docChanges: function(){ return changed ? [{type: 'modified'}] : docs.map(function(){ return {type: 'added'}; }); }};
  }
  function notify(col){ var ls = listeners[col]; if(!ls || !ls.length) return;
    readCol(col).then(function(rows){ var sn = snapshot(rows, true); ls.slice().forEach(function(l){ try{ l.cb(sn); }catch(e){ console.error(e); } }); }); }
  function docRef(col, id){
    id = id || newId();
    return {id: id,
      get: function(){ return run('docs', 'readonly', function(s, done){ var r = s.get([col, id]); r.onsuccess = function(){ var x = r.result; done({id: id, exists: !!x, data: function(){ return x ? clone(x.data) : undefined; }}); }; }); },
      set: function(data, opt){ return run('docs', 'readwrite', function(s){
          if(opt && opt.merge){ var r = s.get([col, id]); r.onsuccess = function(){ s.put({col: col, id: id, data: Object.assign({}, r.result ? r.result.data : {}, clone(data))}); }; }
          else s.put({col: col, id: id, data: clone(data)}); }).then(function(){ notify(col); }); },
      update: function(data){ return run('docs', 'readwrite', function(s){ var r = s.get([col, id]);
          r.onsuccess = function(){ if(!r.result){ s.transaction.abort(); return; } s.put({col: col, id: id, data: Object.assign({}, r.result.data, clone(data))}); }; }).then(function(){ notify(col); }); },
      delete: function(){ return run('docs', 'readwrite', function(s){ s.delete([col, id]); }).then(function(){ notify(col); }); }};
  }
  function collection(col){
    return {id: col, doc: function(id){ return docRef(col, id); },
      get: function(){ return readCol(col).then(function(rows){ return snapshot(rows, false); }); },
      onSnapshot: function(cb, err){ var l = {cb: cb}; (listeners[col] = listeners[col] || []).push(l);
        readCol(col).then(function(rows){ cb(snapshot(rows, false)); }, function(e){ if(err) err(e); });
        return function(){ listeners[col] = (listeners[col] || []).filter(function(x){ return x !== l; }); }; }};
  }

  /* ---------- photographs ---------- */
  var urls = {};
  function preload(){ return run('blobs', 'readonly', function(s, done){ var out = {}, r = s.openCursor();
      r.onsuccess = function(){ var c = r.result; if(c){ out[c.key] = c.value; c.continue(); } else done(out); }; })
    .then(function(all){ Object.keys(all).forEach(function(k){ if(!urls[k]) urls[k] = URL.createObjectURL(all[k]); }); }); }
  var assets = {
    upload: function(blob){ var id = newId();
      return run('blobs', 'readwrite', function(s){ s.put(blob, id); }).then(function(){ urls[id] = URL.createObjectURL(blob); return {id: id, size: blob.size, type: blob.type}; },
        function(e){ throw Object.assign(new Error('store'), {code: e && e.name === 'QuotaExceededError' ? 'quota_or_state' : 'store_failed'}); }); },
    remove: function(id){ return run('blobs', 'readwrite', function(s){ s.delete(id); }).then(function(){ if(urls[id]){ URL.revokeObjectURL(urls[id]); delete urls[id]; } }); }
  };

  /* ---------- files saved to the phone ---------- */
  var downloads = {
    save: function(o){ var b = o.data instanceof Blob ? o.data : new Blob([o.data], {type: o.type || 'application/octet-stream'});
      var u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = o.filename; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); }, 60000); return Promise.resolve(true); }
  };

  var ready = Promise.all([openDb(), preload()]).catch(function(e){ console.error(e); });
  window.claude = {use: function(name){
    if(name === 'db') return ready.then(function(){ return {collection: collection}; });
    if(name === 'user') return Promise.resolve({id: function(){ return Promise.resolve('me'); }, name: function(){ return Promise.resolve(''); }});
    if(name === 'assets') return ready.then(function(){ return assets; });
    if(name === 'downloads') return Promise.resolve(downloads);
    return Promise.resolve(null); }};

  /* ---------- export tracking and offline status ---------- */
  function lsGet(k, d){ try{ var v = localStorage.getItem('fk:' + k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
  function lsSet(k, v){ try{ localStorage.setItem('fk:' + k, JSON.stringify(v)); }catch(e){} }
  var off = {state: 'none', done: 0, total: 0};
  function rerender(){ try{ if(typeof window.rr === 'function') window.rr(); }catch(e){} }
  var LOCAL = window.LOCAL = {
    url: function(id){ return urls[id] || ''; },
    markExported: function(finds){ var m = lsGet('exported', {}); finds.forEach(function(f){ m[f.id] = f.updated || f.created || ''; }); lsSet('exported', m); lsSet('lastExport', new Date().toISOString()); },
    unexported: function(finds){ var m = lsGet('exported', {}); return (finds || []).filter(function(f){ return m[f.id] !== (f.updated || f.created || ''); }).length; },
    offline: off,
    statusHTML: function(finds){
      var n = LOCAL.unexported(finds), out = '';
      if(n) out += '<div class="box warn local-exp">' + n + (n === 1 ? ' find' : ' finds') + ' not yet exported. Records are kept only on this phone until you export them.' + (location.hash === '#finds' ? '' : ' <a href="#finds">My finds</a>') + '</div>';
      if(off.state === 'caching') out += '<div class="box local-off">Saving the guide for use without signal: ' + off.done + ' of ' + off.total + ' photographs. Keep this page open.</div>';
      else if(off.state === 'error') out += '<div class="box warn local-off">Some photographs could not be saved for use without signal (' + off.done + ' of ' + off.total + '). Open the app again with signal to finish.</div>';
      return out; }
  };

  if('serviceWorker' in navigator && location.protocol !== 'file:'){
    navigator.serviceWorker.addEventListener('message', function(ev){ var m = ev.data || {};
      if(m.type === 'img-progress'){ off.done = m.done; off.total = m.total; off.state = m.final ? (m.failed ? 'error' : 'ready') : 'caching';
        if(m.final || m.done % 25 === 0) rerender(); } });
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').then(function(){ return navigator.serviceWorker.ready; })
        .then(function(reg){ if(reg.active) reg.active.postMessage({type: 'cache-images'}); }).catch(function(e){ console.error(e); });
    });
  }
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function(){});
})();
