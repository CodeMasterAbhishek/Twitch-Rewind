class DiskSegmentBuffer {
  constructor(maxDurationMs = 60 * 60 * 1000) {
    this._maxDuration = maxDurationMs;
    this._dbName = `TwitchRewindDB_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    this._storeName = "segments";
    this._db = null;
    this._pinTimestamp = null;
    this._metaCache = []; 
    this._totalBytes = 0;
    this._initPromise = this._initDB();

    window.addEventListener("unload", () => {
      if (this._db) this._db.close();
      indexedDB.deleteDatabase(this._dbName);
    });
  }

  async _initDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._dbName, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        db.createObjectStore(this._storeName, { keyPath: "timestamp" });
      };
      req.onsuccess = (e) => {
        this._db = e.target.result;
        resolve();
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async addChunk(chunk, mimeType, timestamp) {
    await this._initPromise;
    const size = chunk.byteLength || chunk.size || chunk.length || 0;
    this._metaCache.push({ timestamp, mimeType, size });
    this._totalBytes += size;
    
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this._storeName, "readwrite");
      tx.objectStore(this._storeName).put({ timestamp, data: chunk, mimeType });
      tx.oncomplete = () => {
        this._evict().then(resolve).catch(reject);
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async _evict() {
    if (this._maxDuration === -1) return; // Infinite limit

    const newestTimestamp = this._metaCache.length > 0 ? this._metaCache[this._metaCache.length - 1].timestamp : 0;
    const cutoff = newestTimestamp - this._maxDuration;

    let toDelete = [];
    while (this._metaCache.length > 0) {
      const oldest = this._metaCache[0];
      if (this._pinTimestamp !== null && oldest.timestamp >= this._pinTimestamp) break;
      if (oldest.timestamp >= cutoff) break;
      
      const removed = this._metaCache.shift();
      this._totalBytes -= removed.size || 0;
      toDelete.push(removed.timestamp);
    }

    if (toDelete.length > 0) {
      return new Promise((resolve, reject) => {
        const tx = this._db.transaction(this._storeName, "readwrite");
        const store = tx.objectStore(this._storeName);
        toDelete.forEach(ts => store.delete(ts));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
  }

  async getChunks(startTime, endTime) {
    await this._initPromise;
    const validMeta = this._metaCache.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
    if (validMeta.length === 0) return [];

    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this._storeName, "readonly");
      const store = tx.objectStore(this._storeName);
      const results = [];
      let pending = validMeta.length;

      validMeta.forEach(meta => {
        const req = store.get(meta.timestamp);
        req.onsuccess = () => {
          if (req.result) results.push(req.result);
          pending--;
          if (pending === 0) {
            results.sort((a, b) => a.timestamp - b.timestamp);
            resolve(results.map(r => r.data));
          }
        };
        req.onerror = () => {
          pending--;
          if (pending === 0) resolve(results.map(r => r.data));
        };
      });
    });
  }

  pin(startTime) { this._pinTimestamp = startTime; }
  unpin() { this._pinTimestamp = null; this._evict(); }
  getBufferedDuration() { return this._metaCache.length < 2 ? 0 : this._metaCache[this._metaCache.length - 1].timestamp - this._metaCache[0].timestamp; }
  getOldestTimestamp() { return this._metaCache.length > 0 ? this._metaCache[0].timestamp : 0; }
  getNewestTimestamp() { return this._metaCache.length > 0 ? this._metaCache[this._metaCache.length - 1].timestamp : 0; }
  getTotalBytes() { return this._totalBytes; }
  setMaxDuration(seconds) { 
    this._maxDuration = seconds === -1 ? -1 : seconds * 1000; 
    if (this._maxDuration !== -1) this._evict(); 
  }
  clear() { 
    this._metaCache = []; 
    this._pinTimestamp = null; 
    this._totalBytes = 0;
    if (this._db) {
      const tx = this._db.transaction(this._storeName, "readwrite");
      tx.objectStore(this._storeName).clear();
    }
  }
}
