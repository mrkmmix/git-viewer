import git from 'isomorphic-git'
import http from 'isomorphic-git/http/web'
import LightningFS from '@isomorphic-git/lightning-fs'

class GitService {
  constructor() {
    this.fs = new LightningFS('fs')
    this.pfs = this.fs.promises // promisified fs
    this.repositories = new Map() // Store repo metadata in memory
  }

  extractRepoName(url) {
    const match = url.match(/([^\/]+)\.git$/) || url.match(/([^\/]+)$/)
    return match ? match[1] : 'repository'
  }

  async cloneRepository(url) {
    const repoName = this.extractRepoName(url)
    const dir = `/${repoName}`
    
    try {
      // Clone the repository
      await git.clone({
        fs: this.fs,
        http,
        dir,
        url,
        singleBranch: true,
        depth: 50, // Get recent commits for history
        corsProxy: 'https://cors.isomorphic-git.org'
      })

      // Store repository metadata in memory
      this.repositories.set(repoName, {
        name: repoName,
        url,
        clonedAt: new Date().toISOString(),
        branch: 'main'
      })

      return repoName
    } catch (error) {
      console.error('Clone failed:', error)
      throw new Error(`Failed to clone repository: ${error.message}`)
    }
  }

  async getRepositories() {
    // Check Lightning FS for existing repositories
    const repos = []
    try {
      const entries = await this.pfs.readdir('/')
      for (const entry of entries) {
        try {
          const stat = await this.pfs.stat(`/${entry}`)
          if (stat.isDirectory()) {
            // Check if it's a git repository
            try {
              
              await this.pfs.stat(`/${entry}/.git`)
              repos.push({
                name: entry,
                url: this.repositories.get(entry)?.url || 'unknown',
                clonedAt: this.repositories.get(entry)?.clonedAt || 'unknown'
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
      console.error('Error getting repositories:', error)
    }
    return repos
  }

  async getFileTree(repoName) {
    const dir = `/${repoName}`
    try {
      const files = await this.getAllFiles(dir)
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

  async getAllFiles(dir, currentPath = '') {
    const files = []
    try {
      const entries = await this.pfs.readdir(currentPath ? `${dir}/${currentPath}` : dir)
      
      for (const entry of entries) {
        if (entry === '.git') continue // Skip .git directory
        
        const fullPath = currentPath ? `${currentPath}/${entry}` : entry
        const stat = await this.pfs.stat(`${dir}/${fullPath}`)
        
        if (stat.isDirectory()) {
          const subFiles = await this.getAllFiles(dir, fullPath)
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
      const fullPath = `/${repoName}/${filePath}`
      const content = await this.pfs.readFile(fullPath, 'utf8')
      return content
    } catch (error) {
      console.error('Error reading file:', error)
      throw new Error(`Failed to read file: ${error.message}`)
    }
  }

  async writeFile(repoName, filePath, content) {
    try {
      const dir = `/${repoName}`
      const fullPath = `${dir}/${filePath}`
      
      // Ensure directory exists
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'))
      try {
        await this.pfs.mkdir(dirPath, { recursive: true })
      } catch (error) {
        // Directory might already exist
      }
      
      await this.pfs.writeFile(fullPath, content, 'utf8')
    } catch (error) {
      console.error('Error writing file:', error)
      throw new Error(`Failed to write file: ${error.message}`)
    }
  }

  async commitChanges(repoName, message) {
    const dir = `/${repoName}`
    
    try {
      // Add all files to git index
      const files = await this.getAllFiles(dir)
      for (const filePath of files) {
        await git.add({
          fs: this.fs,
          dir,
          filepath: filePath
        })
      }

      // Create commit
      await git.commit({
        fs: this.fs,
        dir,
        author: {
          name: 'Git Viewer User',
          email: 'user@gitviewer.app'
        },
        message
      })
    } catch (error) {
      console.error('Commit failed:', error)
      throw new Error(`Failed to commit changes: ${error.message}`)
    }
  }

  async pushChanges(repoName) {
    const dir = `/${repoName}`
    
    try {
      await git.push({
        fs: this.fs,
        http,
        dir,
        remote: 'origin',
        ref: 'main', // or detect current branch
        corsProxy: 'https://cors.isomorphic-git.org'
      })
    } catch (error) {
      console.error('Push failed:', error)
      throw new Error(`Failed to push changes: ${error.message}`)
    }
  }

  async getCommits(repoName, maxCount = 50) {
    const dir = `/${repoName}`
    
    try {
      // Get only commit metadata from what's already available (no additional fetch)
      const commits = await git.log({
        fs: this.fs,
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
      console.error('Error getting commits:', error)
      throw new Error(`Failed to get commits: ${error.message}`)
    }
  }

  async getCommitFiles(repoName, commitOid) {
    const dir = `/${repoName}`
    
    try {
      // Get the tree for this commit
      const { commit } = await git.readCommit({
        fs: this.fs,
        dir,
        oid: commitOid
      })
      
      // If this is the first commit, return all files
      if (commit.parent.length === 0) {
        return await this.getAllFiles(dir)
      }
      
      // Compare with parent commit to get changed files
      const parentOid = commit.parent[0]
      const changes = []
      
      // Get all files from both commits
      const currentFiles = await this.getCommitTree(dir, commitOid)
      const parentFiles = await this.getCommitTree(dir, parentOid)
      
      // Find differences
      const allPaths = new Set([...Object.keys(currentFiles), ...Object.keys(parentFiles)])
      
      for (const path of allPaths) {
        if (!parentFiles[path]) {
          changes.push(path) // Added file
        } else if (!currentFiles[path]) {
          changes.push(path) // Deleted file
        } else if (currentFiles[path] !== parentFiles[path]) {
          changes.push(path) // Modified file
        }
      }
      
      return changes
    } catch (error) {
      console.error('Error getting commit files:', error)
      // Fallback: return empty array
      return []
    }
  }

  async getCommitTree(dir, commitOid) {
    try {
      const { commit } = await git.readCommit({
        fs: this.fs,
        dir,
        oid: commitOid
      })
      
      const tree = await git.readTree({
        fs: this.fs,
        dir,
        oid: commit.tree
      })
      
      const files = {}
      
      const processTree = async (tree, prefix = '') => {
        for (const entry of tree.tree) {
          const path = prefix + entry.path
          if (entry.type === 'blob') {
            files[path] = entry.oid
          } else if (entry.type === 'tree') {
            const subtree = await git.readTree({
              fs: this.fs,
              dir,
              oid: entry.oid
            })
            await processTree(subtree, path + '/')
          }
        }
      }
      
      await processTree(tree)
      return files
    } catch (error) {
      console.error('Error reading commit tree:', error)
      return {}
    }
  }
}

export const gitService = new GitService()