import LightningFS from '@isomorphic-git/lightning-fs'

export const FS_TYPES = {
  BROWSER: 'browser',
  LOCAL: 'local'
}

// File System Access API wrapper to match fs interface
class FileSystemAccessFS {
  constructor(directoryHandle) {
    this.rootHandle = directoryHandle
    
    // Set up method bindings for isomorphic-git compatibility
    this.setupMethods()
  }

  setupMethods() {
    // Initialize method (Lightning FS has this)
    this.init = async () => { /* Already initialized in constructor */ }

    // Additional Lightning FS methods
    this.rename = async (oldPath, newPath) => {
      // Simple implementation: read old file, write to new location, delete old
      const content = await this.readFile(oldPath)
      await this.writeFile(newPath, content)
      await this.unlink(oldPath)
    }

    this.readlink = async () => {
      throw new Error('Symbolic links not supported in File System Access API')
    }

    this.symlink = async () => {
      throw new Error('Symbolic links not supported in File System Access API')
    }

    this.backFile = async () => {
      // Not applicable for File System Access API
      return undefined
    }

    this.du = async (filepath) => {
      // Return approximate size - not exact but good enough
      try {
        const stat = await this.stat(filepath)
        if (stat.isFile()) {
          const file = await this.getHandleFromPath(filepath)
          const fileObj = await file.getFile()
          return fileObj.size
        }
        return 0
      } catch {
        return 0
      }
    }

    this.flush = async () => {
      // File System Access API doesn't need explicit flushing
    }

    // Promises API with all Lightning FS methods
    this.promises = {
      init: this.init.bind(this),
      readdir: this.readdir.bind(this),
      stat: this.stat.bind(this),
      readFile: this.readFile.bind(this),
      writeFile: this.writeFile.bind(this),
      mkdir: this.mkdir.bind(this),
      rmdir: this.rmdir.bind(this),
      unlink: this.unlink.bind(this),
      rename: this.rename.bind(this),
      lstat: this.stat.bind(this), // For now, same as stat
      readlink: this.readlink.bind(this),
      symlink: this.symlink.bind(this),
      backFile: this.backFile.bind(this),
      du: this.du.bind(this),
      flush: this.flush.bind(this)
    }

    // Direct method references
    this.lstat = this.stat.bind(this)
  }

  async readdir(path) {
    const handle = await this.getHandleFromPath(path)
    const entries = []
    for await (const [name] of handle.entries()) {
      entries.push(name)
    }
    return entries
  }

  async stat(path) {
    try {
      const handle = await this.getHandleFromPath(path)
      const kind = handle.kind
      if (kind === 'file') {
        // File handle – get detailed info
        const fileObj = await handle.getFile()
        const now = fileObj.lastModified ?? Date.now()
        return {
          /* Node‑style tests */
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,

          /* Times */
          atimeMs: now,
          mtimeMs: now,
          ctimeMs: now,

          /* Required numeric fields */
          dev: 0,
          ino: 0,
          uid: 0,
          gid: 0,
          mode: 0o100644, // regular file
          size: fileObj.size
        }
      } else if (kind === 'directory') {
        // Directory handle – synthetic stats
        const now = Date.now()
        return {
          isFile: () => false,
          isDirectory: () => true,
          isSymbolicLink: () => false,

          atimeMs: now,
          mtimeMs: now,
          ctimeMs: now,

          dev: 0,
          ino: 0,
          uid: 0,
          gid: 0,
          mode: 0o040755, // directory
          size: 0
        }
      } else {
        throw new Error(`Unknown handle kind: ${kind}`)
      }
    } catch (error) {
      console.error(`stat failed for path "${path}":`, error)
      throw error
    }
  }
  
  async readFile(path, options) {
    // Handle isomorphic-git's test call with undefined path
    if (path === undefined) {
      console.log('readFile called with undefined path (isomorphic-git test)')
      return undefined
    }
    
    const handle = await this.getHandleFromPath(path)
    if (handle.kind !== 'file') {
      throw new Error(`Path is not a file: ${path}`)
    }
    const file = await handle.getFile()
    
    // Handle different option formats that isomorphic-git might use
    let encoding
    if (typeof options === 'string') {
      encoding = options
    } else if (options && typeof options === 'object') {
      encoding = options.encoding
    }
    
    console.log(`readFile(${path}, encoding: ${encoding})`)
    
    // Respect the encoding parameter
    if (encoding === 'utf8' || encoding === 'utf-8') {
      const text = await file.text()
      console.log(`-> returning string of length ${text.length}`)
      return text
    } else if (encoding === null || encoding === 'buffer' || encoding === undefined) {
      // Return Uint8Array for binary data
      const buffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(buffer)
      console.log(`-> returning Uint8Array of length ${uint8Array.length}`)
      return uint8Array
    } else {
      // For any other encoding, default to text
      const text = await file.text()
      console.log(`-> returning string of length ${text.length} (default)`)
      return text
    }
  }

  async writeFile(path, content) {
    const pathParts = path.split('/').filter(p => p)
    const fileName = pathParts.pop()
    
    // Navigate to parent directory and create if needed
    let currentHandle = this.rootHandle
    for (const part of pathParts) {
      try {
        currentHandle = await currentHandle.getDirectoryHandle(part)
      } catch {
        currentHandle = await currentHandle.getDirectoryHandle(part, { create: true })
      }
    }

    // Create or get file handle
    const fileHandle = await currentHandle.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()
  }

  async mkdir(path, options = {}) {
    const pathParts = path.split('/').filter(p => p)
    let currentHandle = this.rootHandle
    
    for (const part of pathParts) {
      try {
        currentHandle = await currentHandle.getDirectoryHandle(part)
      } catch {
        if (options.recursive) {
          currentHandle = await currentHandle.getDirectoryHandle(part, { create: true })
        } else {
          throw new Error(`Directory does not exist: ${part}`)
        }
      }
    }
  }

  async rmdir(path) {
    const pathParts = path.split('/').filter(p => p)
    const dirName = pathParts.pop()
    
    let currentHandle = this.rootHandle
    for (const part of pathParts) {
      currentHandle = await currentHandle.getDirectoryHandle(part)
    }
    
    await currentHandle.removeEntry(dirName, { recursive: true })
  }

  async unlink(path) {
    const pathParts = path.split('/').filter(p => p)
    const fileName = pathParts.pop()
    
    let currentHandle = this.rootHandle
    for (const part of pathParts) {
      currentHandle = await currentHandle.getDirectoryHandle(part)
    }
    
    await currentHandle.removeEntry(fileName)
  }

  async getHandleFromPath(path) {

    
    // Normalize path - remove leading ./ if present
    const normalizedPath = path.startsWith('./') ? path.slice(2) : path
    if (normalizedPath === '.' || normalizedPath === '' || normalizedPath === '/') {
      return this.rootHandle
    }
    const pathParts = normalizedPath.split('/').filter(p => p)
    let currentHandle = this.rootHandle
    
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i]
      const isLastPart = i === pathParts.length - 1
      
      try {
        // Try directory first
        currentHandle = await currentHandle.getDirectoryHandle(part)
      } catch {
        if (isLastPart) {
          // If it's the last part, try file
          try {
            return await currentHandle.getFileHandle(part)
          } catch {
            const err = new Error(`ENOENT: no such file or directory, '${path}'`)
            // Node-style error code so libraries like isomorphic‑git can recognise a missing path
            err.code = 'ENOENT'
            throw err
          }
        } else {
          // If it's not the last part and not a directory, path is invalid
          const err = new Error(`ENOENT: no such file or directory, '${path}'`)
          // Node-style error code so libraries like isomorphic‑git can recognise a missing path
          err.code = 'ENOENT'
          throw err
        }
      }
    }
    
    return currentHandle
  }
}

class FSAbstraction {
  constructor(type = FS_TYPES.BROWSER, options = {}) {
    this.type = type
    this.options = options
    this.fs = null
    this.pfs = null
    this.initialized = false
    this.directoryHandle = options.directoryHandle || null
  }

  async initialize() {
    if (this.initialized) return

    try {
      if (this.type === FS_TYPES.BROWSER) {
        this.fs = new LightningFS('fs')
        this.pfs = this.fs.promises
      } else if (this.type === FS_TYPES.LOCAL) {
        if (!this.directoryHandle) {
          throw new Error('Directory handle is required for local filesystem')
        }
        // For local filesystem, we'll use File System Access API directly
        this.fs = new FileSystemAccessFS(this.directoryHandle)
        this.pfs = this.fs
      } else {
        throw new Error(`Unknown filesystem type: ${this.type}`)
      }
      
      this.initialized = true
    } catch (error) {
      console.error('Failed to initialize filesystem:', error)
      throw new Error(`Failed to initialize ${this.type} filesystem: ${error.message}`)
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  // Basic filesystem operations
  async readdir(path) {
    await this.ensureInitialized()
    return this.pfs.readdir(path)
  }

  async stat(path) {
    await this.ensureInitialized()
    return this.pfs.stat(path)
  }

  async readFile(path, encoding) {
    await this.ensureInitialized()
    return this.pfs.readFile(path, encoding)
  }

  async writeFile(path, content, encoding = 'utf8') {
    await this.ensureInitialized()
    return this.pfs.writeFile(path, content, encoding)
  }

  async mkdir(path, options = {}) {
    await this.ensureInitialized()
    return this.pfs.mkdir(path, options)
  }

  async rmdir(path) {
    await this.ensureInitialized()
    return this.pfs.rmdir(path)
  }

  async unlink(path) {
    await this.ensureInitialized()
    return this.pfs.unlink(path)
  }

  async exists(path) {
    await this.ensureInitialized()
    try {
      await this.pfs.stat(path)
      return true
    } catch {
      return false
    }
  }

  // Git-specific helpers
  async isGitRepository(path) {
    await this.ensureInitialized()
    try {
      let gitPath
      if (path === '.' || path === '') {
        gitPath = '.git'
      } else {
        gitPath = this.joinPath(path, '.git')
      }
      const stat = await this.pfs.stat(gitPath)
      return stat.isDirectory() || stat.isFile() // .git can be a directory or a file (worktrees)
    } catch {
      return false
    }
  }

  // Path utilities
  joinPath(...parts) {
    // Simple path joining - works for both browser and local paths
    return parts.join('/').replace(/\/+/g, '/')
  }

  // Get the raw fs object for isomorphic-git
  getRawFS() {
    if (!this.initialized) {
      throw new Error('Filesystem not initialized')
    }
    return this.fs
  }

  getType() {
    return this.type
  }

  getServerUrl() {
    return this.options.serverUrl
  }

  // Test connection (for File System Access API)
  async testConnection() {
    await this.ensureInitialized()
    
    if (this.type === FS_TYPES.LOCAL) {
      try {
        // Try to read the directory to test access
        await this.pfs.readdir('.')
        return { connected: true }
      } catch (error) {
        return { 
          connected: false, 
          error: error.message,
          suggestion: 'Directory access may have been revoked. Please select the directory again.'
        }
      }
    }
    
    return { connected: true }
  }
}

export default FSAbstraction