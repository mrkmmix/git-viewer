import { openDB } from 'idb'

class DBService {
  constructor() {
    this.dbName = 'GitViewerDB'
    this.version = 1
    this.db = null
  }

  async init() {
    if (this.db) return this.db

    this.db = await openDB(this.dbName, this.version, {
      upgrade(db) {
        // Store for repository metadata
        if (!db.objectStoreNames.contains('repositories')) {
          const repoStore = db.createObjectStore('repositories', { keyPath: 'name' })
          repoStore.createIndex('url', 'url', { unique: false })
        }

        // Store for file contents
        if (!db.objectStoreNames.contains('files')) {
          const fileStore = db.createObjectStore('files', { keyPath: 'id' })
          fileStore.createIndex('repoName', 'repoName', { unique: false })
          fileStore.createIndex('path', 'path', { unique: false })
        }

        // Store for git objects and metadata
        if (!db.objectStoreNames.contains('gitObjects')) {
          db.createObjectStore('gitObjects', { keyPath: 'id' })
        }
      },
    })

    return this.db
  }

  // File operations
  async saveFile(repoName, filePath, content) {
    const db = await this.init()
    const tx = db.transaction('files', 'readwrite')
    const fileData = {
      id: `${repoName}:${filePath}`,
      repoName,
      path: filePath,
      content,
      lastModified: new Date().toISOString()
    }
    await tx.objectStore('files').put(fileData)
  }

  async getFile(repoName, filePath) {
    const db = await this.init()
    const tx = db.transaction('files', 'readonly')
    return await tx.objectStore('files').get(`${repoName}:${filePath}`)
  }

  async getFilesByRepo(repoName) {
    const db = await this.init()
    const tx = db.transaction('files', 'readonly')
    const index = tx.objectStore('files').index('repoName')
    return await index.getAll(repoName)
  }

  async deleteFile(repoName, filePath) {
    const db = await this.init()
    const tx = db.transaction('files', 'readwrite')
    await tx.objectStore('files').delete(`${repoName}:${filePath}`)
  }

  // Git objects storage (for isomorphic-git)
  async saveGitObject(repoName, oid, object) {
    const db = await this.init()
    const tx = db.transaction('gitObjects', 'readwrite')
    const objData = {
      id: `${repoName}:${oid}`,
      repoName,
      oid,
      object,
      created: new Date().toISOString()
    }
    await tx.objectStore('gitObjects').put(objData)
  }

  async getGitObject(repoName, oid) {
    const db = await this.init()
    const tx = db.transaction('gitObjects', 'readonly')
    const result = await tx.objectStore('gitObjects').get(`${repoName}:${oid}`)
    return result?.object
  }

  async hasGitObject(repoName, oid) {
    const db = await this.init()
    const tx = db.transaction('gitObjects', 'readonly')
    const result = await tx.objectStore('gitObjects').get(`${repoName}:${oid}`)
    return !!result
  }

  // Clear all data (for debugging)
  async clearAll() {
    const db = await this.init()
    const tx = db.transaction(['repositories', 'files', 'gitObjects'], 'readwrite')
    await tx.objectStore('repositories').clear()
    await tx.objectStore('files').clear()
    await tx.objectStore('gitObjects').clear()
  }
}

export const dbService = new DBService()