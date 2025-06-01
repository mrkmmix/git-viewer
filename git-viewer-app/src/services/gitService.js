import git from 'isomorphic-git'
import http from 'isomorphic-git/http/web'
import FSAbstraction, { FS_TYPES } from './fsAbstraction.js'

class GitService {
  constructor() {
    // Default to browser filesystem
    this.browserFS = new FSAbstraction(FS_TYPES.BROWSER)
    this.localFS = null // Will be initialized when needed
    this.repositories = new Map() // Store repo metadata in memory
    this.currentFS = this.browserFS // Current active filesystem
    // One status‑matrix cache *per* repository so paths don’t clash.
    // Each cache is a *plain object*; isomorphic‑git stores symbol‑keyed
    // fields on it, which aren’t visible via Object.keys().
    this._statusCaches = new Map() // Map<repoName, Object>
    this.githubToken = null // GitHub authentication token
    this.corsProxy = 'http://localhost:9999' // Local CORS proxy
  }

  setGitHubAuth(token) {
    this.githubToken = token
  }

  getHttpOptions() {
    const options = {
      corsProxy: this.corsProxy
    }
    
    if (this.githubToken) {
      // For GitHub Personal Access Tokens, use onAuth callback
      options.onAuth = () => ({
        username: 'mrkmmix',
        password: this.githubToken,
      })
      console.log('GitService: Using GitHub token for authentication via onAuth', {
        corsProxy: this.corsProxy,
        hasToken: !!this.githubToken,
        tokenPrefix: this.githubToken?.substring(0, 10) + '...'
      })
    } else {
      console.log('GitService: No GitHub token available')
    }
    
    return options
  }

  extractRepoName(url) {
    const match = url.match(/([^\/]+)\.git$/) || url.match(/([^\/]+)$/)
    return match ? match[1] : 'repository'
  }

  async cloneRepository(url, onProgress = null, onMessage = null) {
    const repoName = this.extractRepoName(url)
    const dir = `/${repoName}`
    
    try {
      console.log(`git clone ${url}`)
      // Use browser filesystem for cloned repos
      await this.browserFS.ensureInitialized()
      
      // Clone the repository with progress callback
      const httpOptions = this.getHttpOptions()
      await git.clone({
        fs: this.browserFS.getRawFS(),
        http,
        dir,
        url,
        singleBranch: true,
        depth: 50, // Get recent commits for history
        ...httpOptions,
        onProgress: onProgress ? (progressEvent) => {
          onProgress({
            phase: progressEvent.phase,
            loaded: progressEvent.loaded,
            total: progressEvent.total,
            percentage: progressEvent.total > 0 ? Math.floor(100 * progressEvent.loaded / progressEvent.total) : 0
          })
        } : undefined,
        onMessage: onMessage || undefined
      })

      // Store repository metadata in memory
      this.repositories.set(repoName, {
        name: repoName,
        url,
        clonedAt: new Date().toISOString(),
        branch: 'main',
        type: 'browser',
        fsType: FS_TYPES.BROWSER
      })

      console.log(`git clone completed: ${repoName}`)
      return repoName
    } catch (error) {
      console.error('Clone failed:', error)
      throw new Error(`Failed to clone repository: ${error.message}`)
    }
  }

  async openLocalRepository(directoryHandle) {
    try {
      // Create filesystem with directory handle
      const localFS = new FSAbstraction(FS_TYPES.LOCAL, { directoryHandle })
      await localFS.ensureInitialized()

      // Check if the directory is a git repository
      const isGitRepo = await localFS.isGitRepository('.')
      if (!isGitRepo) {
        throw new Error('Selected directory is not a git repository')
      }

      // Create a unique name for the local repo
      const repoName = `local-${directoryHandle.name}`
      
      // Store the filesystem instance
      this.localFS = localFS
      
      // Store repository metadata
      this.repositories.set(repoName, {
        name: repoName,
        displayName: `[local] ${directoryHandle.name}`,
        path: '.',
        directoryHandle,
        type: 'local',
        fsType: FS_TYPES.LOCAL,
        clonedAt: new Date().toISOString()
      })

      return repoName
    } catch (error) {
      console.error('Error opening local repository:', error)
      throw new Error(`Failed to open local repository: ${error.message}`)
    }
  }

  async testLocalFSConnection() {
    try {
      if (!this.localFS) {
        return { 
          connected: false, 
          error: 'No local repository open',
          suggestion: 'Please open a local repository first.'
        }
      }
      return await this.localFS.testConnection()
    } catch (error) {
      return { 
        connected: false, 
        error: error.message,
        suggestion: 'Directory access may have been revoked. Please select the directory again.'
      }
    }
  }

  // Helper method to get the appropriate filesystem for a repository
  getFileSystemForRepo(repoName) {
    const repoData = this.repositories.get(repoName)
    if (repoData && repoData.fsType === FS_TYPES.LOCAL) {
      // Create a new filesystem instance for this specific repository
      if (repoData.directoryHandle) {
        return new FSAbstraction(FS_TYPES.LOCAL, { directoryHandle: repoData.directoryHandle })
      }
      return this.localFS // fallback
    }
    return this.browserFS
  }

  // Helper method to get the directory path for a repository
  getRepoPath(repoName) {
    const repoData = this.repositories.get(repoName)
    if (repoData && repoData.fsType === FS_TYPES.LOCAL) {
      return repoData.path
    }
    return `/${repoName}`
  }

  async getRepositories() {
    const repos = []
    
    // Get browser-based repositories from Lightning FS
    try {
      await this.browserFS.ensureInitialized()
      const entries = await this.browserFS.readdir('/')
      for (const entry of entries) {
        try {
          const stat = await this.browserFS.stat(`/${entry}`)
          if (stat.isDirectory()) {
            // Check if it's a git repository
            try {
              await this.browserFS.stat(`/${entry}/.git`)
              const repoData = this.repositories.get(entry)
              repos.push({
                name: entry,
                displayName: `[browser] ${entry}`,
                url: repoData?.url || 'unknown',
                clonedAt: repoData?.clonedAt || 'unknown',
                type: 'browser',
                fsType: FS_TYPES.BROWSER
              })
            } catch {
              // Not a git repository, skip
            }
          }
        } catch {
          // Skip if can't stat
        }
      }
    } catch (error) {
      console.error('Error getting browser repositories:', error)
    }

    // Add local repositories from memory
    for (const [repoName, repoData] of this.repositories) {
      if (repoData.type === 'local') {
        repos.push({
          name: repoName,
          displayName: repoData.displayName,
          path: repoData.path,
          clonedAt: repoData.clonedAt,
          type: 'local',
          fsType: FS_TYPES.LOCAL
        })
      }
    }
    
    return repos
  }

  async getFileTree(repoName) {
    const fs = this.getFileSystemForRepo(repoName)
    const dir = this.getRepoPath(repoName)
    
    try {
      await fs.ensureInitialized()
      const files = await this.getAllFiles(repoName, dir, fs)
      const tree = []
      
      // Create a set to track directories we've already added
      const addedDirs = new Set()
      
      for (const filePath of files) {
        const pathParts = filePath.split('/')
        
        // Add directories
        for (let i = 0; i < pathParts.length - 1; i++) {
          const dirPath = pathParts.slice(0, i + 1).join('/')
          if (!addedDirs.has(dirPath)) {
            tree.push({
              name: pathParts[i],
              path: dirPath,
              isDirectory: true,
              depth: i
            })
            addedDirs.add(dirPath)
          }
        }
        
        // Add file
        tree.push({
          name: pathParts[pathParts.length - 1],
          path: filePath,
          isDirectory: false,
          depth: pathParts.length - 1
        })
      }
      
      return tree.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
    } catch (error) {
      console.error('Error getting file tree:', error)
      throw new Error(`Failed to get file tree: ${error.message}`)
    }
  }

  async getAllFiles(repoName, dir, fs, currentPath = '') {
    const files = []
    try {
      const readPath = currentPath ? `${dir}/${currentPath}` : dir
      const entries = await fs.readdir(readPath)
      
      for (const entry of entries) {
        if (entry === '.git') continue // Skip .git directory
        
        const fullPath = currentPath ? `${currentPath}/${entry}` : entry
        
        // Construct the stat path properly
        let statPath
        if (dir === '.') {
          statPath = fullPath
        } else {
          statPath = `${dir}/${fullPath}`
        }
        
        const stat = await fs.stat(statPath)
        
        if (stat.isDirectory()) {
          const subFiles = await this.getAllFiles(repoName, dir, fs, fullPath)
          files.push(...subFiles)
        } else {
          files.push(fullPath)
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dir}/${currentPath}:`, error)
    }
    
    return files
  }

  async readFile(repoName, filePath) {
    try {
      const fs = this.getFileSystemForRepo(repoName)
      const dir = this.getRepoPath(repoName)
      await fs.ensureInitialized()
      
      const fullPath = `${dir}/${filePath}`
      const content = await fs.readFile(fullPath, 'utf8')
      return content
    } catch (error) {
      console.error('Error reading file:', error)
      throw new Error(`Failed to read file: ${error.message}`)
    }
  }

  async writeFile(repoName, filePath, content) {
    try {
      const fs = this.getFileSystemForRepo(repoName)
      const dir = this.getRepoPath(repoName)
      await fs.ensureInitialized()
      
      // For local repositories, use simple path, for browser repos use full path
      const repoData = this.repositories.get(repoName)
      let fullPath
      if (repoData && repoData.fsType === FS_TYPES.LOCAL) {
        fullPath = filePath // Local repos use relative paths
      } else {
        fullPath = `${dir}/${filePath}` // Browser repos use full paths
      }
      
      // Ensure directory exists for browser repos
      if (repoData && repoData.fsType !== FS_TYPES.LOCAL) {
        const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'))
        try {
          await fs.mkdir(dirPath, { recursive: true })
        } catch (error) {
          // Directory might already exist
        }
      }
      
      await fs.writeFile(fullPath, content, 'utf8')
      console.log(`File saved: ${fullPath}`)
    } catch (error) {
      console.error('Error writing file:', error)
      throw new Error(`Failed to write file: ${error.message}`)
    }
  }

  async commitChanges(repoName, message, onMessage = null) {
    const fs = this.getFileSystemForRepo(repoName)
    // -------------------------------------------------------------------
    // Pick (or create) the cache dedicated to this repository
    let repoCache = this._statusCaches.get(repoName)
    if (!repoCache) {
      repoCache = {}            // plain object works best with isomorphic‑git
      this._statusCaches.set(repoName, repoCache)
    }
    const dir = this.getRepoPath(repoName)
    
    try {
      await fs.ensureInitialized()
      
      // Batch stage changed paths more efficiently
      // -------------------------------------------------------------------
      // 1. Build the status matrix once, re‑using a cache to avoid
      //    re‑stat'ing unchanged paths on subsequent commits.
      const FILE = 0, HEAD = 1, WORKDIR = 2, STAGE = 3
      const matrix = await git.statusMatrix({
        fs: fs.getRawFS(),
        dir,
        cache: repoCache,
        ignored: false, // Include ignored files
      })
      
      const toAdd = []
      const toRemove = []
      
      for (const row of matrix) {
        const [filepath, head, workdir] = row
        if (head === workdir) continue        // unmodified
                
        if (workdir === 0) {
          // deleted in workdir
          toRemove.push(filepath)
          if (onMessage) onMessage(`  deleted: ${filepath}`)
        } else {
          // new or modified
          toAdd.push(filepath)
          if (onMessage) onMessage(`  added/modified: ${filepath}`)
        }
      }
      
      // 2. Stage all additions / deletions in *one* call each.
      if (toAdd.length) {
        await git.add({
          fs: fs.getRawFS(),
          dir,
          filepath: toAdd,
          parallel: true                   // use parallel mode for speed
        })
      }
      if (toRemove.length) {
        await git.remove({
          fs: fs.getRawFS(),
          dir,
          filepath: toRemove,
          parallel: true
        })
      }

      if (onMessage) onMessage(`git commit -m "${message}"`)
      // Create commit
      await git.commit({
        fs: fs.getRawFS(),
        dir,
        author: {
          name: 'Git Viewer User',
          email: 'user@gitviewer.app'
        },
        message
      })
      console.log(`git commit completed`)
    } catch (error) {
      console.error('Commit failed:', error)
      throw new Error(`Failed to commit changes: ${error.message}`)
    }
  }

  async pushChanges(repoName, onMessage = null) {
    const fs = this.getFileSystemForRepo(repoName)
    const dir = this.getRepoPath(repoName)
    
    try {
      await fs.ensureInitialized()
      
      // Detect current branch
      const currentBranch = await git.currentBranch({
        fs: fs.getRawFS(),
        dir,
        fullname: false
      })
      
      if (!currentBranch) {
        throw new Error('No current branch found. Make sure you have commits in the repository.')
      }
      
      if (onMessage) onMessage(`git push origin ${currentBranch}`)
      const httpOptions = this.getHttpOptions()
      await git.push({
        fs: fs.getRawFS(),
        http,
        dir,
        remote: 'origin',
        ref: currentBranch,
        ...httpOptions,
        onMessage: onMessage || undefined
      })
      console.log(`git push completed`)
    } catch (error) {
      console.error('Push failed:', error)
      throw new Error(`Failed to push changes: ${error.message}`)
    }
  }

  async fetchChanges(repoName, onMessage = null) {
    const fs = this.getFileSystemForRepo(repoName)
    const dir = this.getRepoPath(repoName)
    
    try {
      await fs.ensureInitialized()
      
      // Check if directory exists and is accessible
      try {
        await fs.stat(dir)
      } catch (dirError) {
        throw new Error(`Repository directory not found: ${dir}. Error: ${dirError.message}`)
      }
      
      // Check if .git directory exists
      try {
        const gitDir = fs.joinPath ? fs.joinPath(dir, '.git') : `${dir}/.git`
        await fs.stat(gitDir)
      } catch (gitError) {
        throw new Error(`Not a git repository: ${dir}. Missing .git directory.`)
      }
      
      // Detect current branch
      const currentBranch = await git.currentBranch({
        fs: fs.getRawFS(),
        dir,
        fullname: false
      })
      
      if (!currentBranch) {
        throw new Error('No current branch found. Make sure you have commits in the repository.')
      }
      
      if (onMessage) onMessage(`git fetch origin ${currentBranch}`)
      const httpOptions = this.getHttpOptions()
      await git.fetch({
        fs: fs.getRawFS(),
        http,
        dir: './',
        remote: 'origin',
        ref: currentBranch,
        ...httpOptions,
        onMessage: onMessage || undefined
      })
      console.log(`git fetch completed`)
    } catch (error) {
      console.error('Fetch failed:', error)
      throw new Error(`Failed to fetch changes: ${error.message}`)
    }
  }

  async getCommits(repoName, maxCount = 50) {
    const fs = this.getFileSystemForRepo(repoName)
    const dir = this.getRepoPath(repoName)
    
    try {
      await fs.ensureInitialized()
      
      // Get only commit metadata from what's already available (no additional fetch)
      const commits = await git.log({
        fs: fs.getRawFS(),
        dir,
        depth: maxCount
      })
      
      // Return just the essential metadata (no file trees or changes)
      return commits.map(commit => ({
        oid: commit.oid,
        commit: {
          message: commit.commit.message,
          author: {
            name: commit.commit.author.name,
            email: commit.commit.author.email,
            timestamp: commit.commit.author.timestamp
          }
        }
      }))
    } catch (error) {
      console.error(`Error getting commits for ${repoName}:`, error)
      throw new Error(`Failed to get commits: ${error.message}`)
    }
  }

  async getCommitFiles(repoName, commitOid) {
    const fs = this.getFileSystemForRepo(repoName)
    const dir = this.getRepoPath(repoName)
    
    try {
      await fs.ensureInitialized()
      
      const { commit } = await git.readCommit({
        fs: fs.getRawFS(),
        dir,
        oid: commitOid
      })
      
      // If this is the first commit, return all files in that commit
      if (commit.parent.length === 0) {
        const changes = []
        await this.walkCommitTree(fs.getRawFS(), dir, commit.tree, '', changes)
        return changes
      }
      
      // Use git walk to efficiently compare with parent
      const parentOid = commit.parent[0]
      const changes = []
      
      await git.walk({
        fs: fs.getRawFS(),
        dir,
        trees: [git.TREE({ ref: commitOid }), git.TREE({ ref: parentOid })],
        map: async function(filepath, [A, B]) {
          // Skip directories
          if (filepath === '.') return
          
          // Get file info
          const aType = await A?.type()
          const bType = await B?.type()
          
          // Only process files, not directories
          if (aType === 'tree' || bType === 'tree') return
          
          const aOid = await A?.oid()
          const bOid = await B?.oid()
          
          // File was added, deleted, or modified
          if (aOid !== bOid) {
            changes.push(filepath)
          }
        }
      })
      
      return changes
    } catch (error) {
      console.error('Error getting commit files:', error)
      return []
    }
  }

  // Helper method to walk tree for first commit
  async walkCommitTree(fs, dir, treeOid, prefix, files) {
    try {
      const tree = await git.readTree({ fs, dir, oid: treeOid })
      
      for (const entry of tree.tree) {
        const path = prefix + entry.path
        if (entry.type === 'blob') {
          files.push(path)
        } else if (entry.type === 'tree') {
          await this.walkCommitTree(fs, dir, entry.oid, path + '/', files)
        }
      }
    } catch (error) {
      console.error('Error walking commit tree:', error)
    }
  }

}

export const gitService = new GitService()