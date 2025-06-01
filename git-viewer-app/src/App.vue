<template>
  <div class="container-fluid h-100" :class="{ 'dark-theme': isDarkTheme }">
    <div class="row h-100">
      <!-- Left Panel -->
      <div class="col-4 border-end h-100 d-flex flex-column">
        <div class="p-3">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">Git Viewer</h5>
            <div class="d-flex gap-2">
              <button @click="toggleGitHubAuth" class="btn btn-outline-primary btn-sm">
                <i class="bi bi-github"></i>
                {{ isGitHubAuthenticated ? 'Sign Out' : 'Sign In' }}
              </button>
              <button @click="toggleTheme" class="btn btn-outline-secondary btn-sm">
                <i :class="isDarkTheme ? 'bi bi-sun' : 'bi bi-moon'"></i>
              </button>
            </div>
          </div>
          
          <!-- GitHub Auth Status -->
          <div v-if="isGitHubAuthenticated" class="alert alert-success mb-3 py-2">
            <small><i class="bi bi-check-circle"></i> Signed in to GitHub</small>
          </div>
          
          <!-- Repository Management -->
          <div class="mb-3">
            <label class="form-label">Repository</label>
            <div class="input-group mb-2">
              <input 
                v-model="repoUrl" 
                type="text" 
                class="form-control" 
                placeholder="https://github.com/user/repo.git"
              >
              <button 
                @click="cloneRepository" 
                class="btn btn-primary"
                :disabled="isLoading || !repoUrl"
              >
                Clone
              </button>
            </div>
            <div class="d-grid">
              <button 
                @click="openLocalRepository" 
                class="btn btn-outline-secondary btn-sm"
                :disabled="isLoading"
              >
                <i class="bi bi-folder-plus"></i> Open Local Repository
              </button>
            </div>
          </div>

          <!-- Repository Selector -->
          <div class="mb-3" v-if="repositories.length > 0">
            <label class="form-label">Select Repository</label>
            <select v-model="selectedRepo" class="form-select" @change="loadRepository">
              <option value="">Choose a repository...</option>
              <option v-for="repo in repositories" :key="repo.name" :value="repo.name">
                {{ repo.displayName || repo.name }}
              </option>
            </select>
          </div>

          <!-- Git Commands -->
          <div class="mb-3" v-if="selectedRepo">
            <label class="form-label">Git Commands</label>
            <div class="d-grid gap-2">
              <button @click="fetchChanges" class="btn btn-outline-info btn-sm">
                <i class="bi bi-download"></i> Fetch
              </button>
              <button @click="commitChanges" class="btn btn-outline-success btn-sm">
                <i class="bi bi-check-circle"></i> Commit Changes
              </button>
              <button @click="pushChanges" class="btn btn-outline-warning btn-sm">
                <i class="bi bi-upload"></i> Push
              </button>
            </div>
          </div>
        </div>

        <!-- Tabs and Content -->
        <div class="flex-grow-1 border-top overflow-hidden d-flex flex-column" v-if="selectedRepo">
          <!-- Tab Navigation -->
          <div class="d-flex border-bottom">
            <button 
              @click="activeTab = 'files'" 
              :class="['btn', 'btn-link', 'text-decoration-none', 'border-0', 'rounded-0', { 'active': activeTab === 'files' }]"
            >
              <i class="bi bi-folder"></i> Files
            </button>
            <button 
              @click="activeTab = 'commits'" 
              :class="['btn', 'btn-link', 'text-decoration-none', 'border-0', 'rounded-0', { 'active': activeTab === 'commits' }]"
            >
              <i class="bi bi-clock-history"></i> Commits
            </button>
          </div>

          <!-- Tab Content -->
          <div class="flex-grow-1 overflow-hidden">
            <!-- File Tree Tab -->
            <div v-if="activeTab === 'files'" class="h-100 d-flex flex-column">
              <FileTree 
                v-if="fileTree.length > 0"
                :files="fileTree" 
                @file-selected="selectFile"
                :selected-file="selectedFile"
                class="flex-grow-1 overflow-hidden"
              />
            </div>

            <!-- Commits Tab -->
            <div v-if="activeTab === 'commits'" class="h-100">
              <CommitList 
                :repo-name="selectedRepo"
                @commit-selected="selectCommit"
                :selected-commit="selectedCommit"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Right Panel -->
      <div class="col-8 h-100 d-flex flex-column">
        <div v-if="selectedCommit" class="p-3 border-bottom">
          <h6>Commit: {{ selectedCommit.oid.substring(0, 7) }}</h6>
        </div>
        
        <div class="flex-grow-1 d-flex flex-column">
          <!-- File Editor / Content -->
          <div 
            class="content-area" 
            :style="{ flex: `1 1 ${contentHeight}px` }"
          >
            <!-- File Editor -->
            <FileEditor 
              v-if="selectedFile"
              :file-path="selectedFile"
              :content="fileContent"
              @content-changed="updateFileContent"
            />
            
            <!-- Commit Details -->
            <div v-else-if="selectedCommit" class="p-3 h-100 overflow-auto">
              <div class="card">
                <div class="card-header">
                  <strong>{{ selectedCommit.commit.message }}</strong>
                </div>
                <div class="card-body">
                  <p><strong>Author:</strong> {{ selectedCommit.commit.author.name }} &lt;{{ selectedCommit.commit.author.email }}&gt;</p>
                  <p><strong>Date:</strong> {{ new Date(selectedCommit.commit.author.timestamp * 1000).toLocaleString() }}</p>
                  <p><strong>SHA:</strong> {{ selectedCommit.oid }}</p>
                  
                  <h6 class="mt-4">Changed Files:</h6>
                  <div v-if="commitFiles.length > 0">
                    <div v-for="file in commitFiles" :key="file" class="border-start border-3 border-primary ps-2 mb-1">
                      {{ file }}
                    </div>
                  </div>
                  <div v-else class="text-muted">
                    Loading changed files...
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Default State -->
            <div v-else class="d-flex align-items-center justify-content-center h-100 text-muted">
              Select a file from the tree to start editing or a commit to view details
            </div>
          </div>
          
          <!-- Resize Handle -->
          <div 
            class="resize-handle"
            @mousedown="startResize"
          ></div>
          
          <!-- Terminal Panel -->
          <div 
            ref="terminalPanel"
            class="terminal-panel" 
            :style="{ flex: `0 0 ${terminalHeight}px` }"
          >
            <div ref="terminalContainer" class="h-100" style="background: #1e1e1e;"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div v-if="isLoading" class="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-dark bg-opacity-50" style="z-index: 9999;">
      <div class="text-center text-white" style="min-width: 300px;">
        <div class="spinner-border mb-3" role="status"></div>
        <div class="mb-2">{{ loadingMessage }}</div>
        
        <!-- Progress bar for cloning -->
        <div v-if="cloneProgress.phase && cloneProgress.total > 0" class="mt-3">
          <div class="progress mb-2" style="height: 20px;">
            <div 
              class="progress-bar" 
              role="progressbar" 
              :style="{ width: cloneProgress.percentage + '%' }"
              :aria-valuenow="cloneProgress.percentage" 
              aria-valuemin="0" 
              aria-valuemax="100"
            >
              {{ cloneProgress.percentage }}%
            </div>
          </div>
          <small class="text-light">
            {{ cloneProgress.loaded.toLocaleString() }} / {{ cloneProgress.total.toLocaleString() }}
            <span v-if="cloneProgress.phase !== loadingMessage">- {{ cloneProgress.phase }}</span>
          </small>
        </div>
      </div>
    </div>

    <!-- GitHub Authentication Modal -->
    <GitHubAuthModal 
      :show="showAuthModal" 
      @authenticate="handleGitHubAuth"
      @cancel="showAuthModal = false"
    />
  </div>
</template>

<script>
import { ref, onMounted, provide } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import FileTree from './components/FileTree.vue'
import FileEditor from './components/FileEditor.vue'
import CommitList from './components/CommitList.vue'
import GitHubAuthModal from './components/GitHubAuthModal.vue'
import { gitService } from './services/gitService.js'

export default {
  name: 'App',
  components: {
    FileTree,
    FileEditor,
    CommitList,
    GitHubAuthModal
  },
  setup() {
    const repoUrl = ref('')
    const selectedRepo = ref('')
    const repositories = ref([])
    const fileTree = ref([])
    const selectedFile = ref('')
    const fileContent = ref('')
    const isLoading = ref(false)
    const loadingMessage = ref('')
    const isDarkTheme = ref(false)
    const activeTab = ref('files')
    const selectedCommit = ref(null)
    const commitFiles = ref([])
    const fsRemoteConnected = ref(false)
    const fsRemoteError = ref('')
    const isGitHubAuthenticated = ref(false)
    const gitHubToken = ref('')
    const showAuthModal = ref(false)
    const cloneProgress = ref({
      phase: '',
      percentage: 0,
      loaded: 0,
      total: 0
    })
    const terminalContainer = ref(null)
    const terminalPanel = ref(null)
    const terminalHeight = ref(200)
    const contentHeight = ref(400)
    const isResizing = ref(false)
    
    let terminal = null
    let fitAddon = null

    const initTerminal = () => {
      if (!terminalContainer.value) return
      
      terminal = new Terminal({
        fontSize: 14,
        fontFamily: '"Segoe UI 8", "Menlo", "Ubuntu Mono", "Consolas", "source-code-pro", monospace',
        theme: {
          background: '#1e1e1e',
          foreground: '#cccccc'
        },
        rows: 12,
        cols: 80
      })
      
      fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      
      terminal.open(terminalContainer.value)
      fitAddon.fit()
      
      // Setup resize observer to refit terminal when panel is resized
      const terminalPanel = terminalContainer.value.parentElement
      const resizeObserver = new ResizeObserver(() => {
        if (fitAddon) {
          setTimeout(() => fitAddon.fit(), 10)
        }
      })
      resizeObserver.observe(terminalPanel)
      
      terminal.writeln('Git Console initialized...')
      
      // Setup console redirection after terminal is ready
      setupConsoleRedirection()
    }

    const startResize = (e) => {
      isResizing.value = true
      const startY = e.clientY
      const startTerminalHeight = terminalHeight.value
      
      const handleMouseMove = (e) => {
        if (!isResizing.value) return
        const deltaY = startY - e.clientY
        const newTerminalHeight = Math.max(100, Math.min(600, startTerminalHeight + deltaY))
        terminalHeight.value = newTerminalHeight
        
        // Refit terminal on resize
        if (fitAddon) {
          setTimeout(() => fitAddon.fit(), 10)
        }
      }
      
      const handleMouseUp = () => {
        isResizing.value = false
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
      e.preventDefault()
    }

    const writeToTerminal = (message, color = '#ffffff') => {
      if (!terminal) return
      const timestamp = new Date().toLocaleTimeString()
      
      // Handle different log levels with colors
      let colorCode = '37' // white by default
      if (color === '#ff0000' || color === 'error') colorCode = '31' // red
      else if (color === '#ffa500' || color === 'warn') colorCode = '33' // yellow
      else if (color === '#00ff00' || color === 'success') colorCode = '32' // green
      else if (color === '#0080ff' || color === 'info') colorCode = '36' // cyan
      else if (color === '#888888' || color === 'debug') colorCode = '90' // gray
      
      terminal.writeln(`\x1b[90m[${timestamp}]\x1b[0m \x1b[${colorCode}m${message}\x1b[0m`)
    }

    // Override console methods to redirect to terminal
    const setupConsoleRedirection = () => {
      const originalLog = console.log
      const originalError = console.error
      const originalWarn = console.warn
      const originalInfo = console.info

      console.log = (...args) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ')
        writeToTerminal(message, 'info')
        originalLog.apply(console, args) // Keep original console output too
      }

      console.error = (...args) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ')
        writeToTerminal(message, 'error')
        originalError.apply(console, args)
      }

      console.warn = (...args) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ')
        writeToTerminal(message, 'warn')
        originalWarn.apply(console, args)
      }

      console.info = (...args) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ')
        writeToTerminal(message, 'info')
        originalInfo.apply(console, args)
      }
    }

    // Setup git logging callback for terminal
    const onGitMessage = (message) => {
      writeToTerminal(message)
    }
    
    const loadRepositories = async () => {
      repositories.value = await gitService.getRepositories()
    }

    const cloneRepository = async () => {
      if (!repoUrl.value) return
      
      isLoading.value = true
      loadingMessage.value = 'Initializing clone...'
      
      // Reset progress
      cloneProgress.value = {
        phase: '',
        percentage: 0,
        loaded: 0,
        total: 0
      }
      
      try {
        const repoName = await gitService.cloneRepository(repoUrl.value, (progress) => {
          cloneProgress.value = progress
          loadingMessage.value = `${progress.phase}: ${progress.percentage}%`
        }, onGitMessage)
        
        loadingMessage.value = 'Finalizing...'
        await loadRepositories()
        selectedRepo.value = repoName
        await loadRepository()
        repoUrl.value = ''
      } catch (error) {
        alert('Error cloning repository: ' + error.message)
      } finally {
        isLoading.value = false
        cloneProgress.value = { phase: '', percentage: 0, loaded: 0, total: 0 }
      }
    }

    const loadRepository = async () => {
      if (!selectedRepo.value) return
      
      isLoading.value = true
      loadingMessage.value = 'Loading repository...'
      
      try {
        fileTree.value = await gitService.getFileTree(selectedRepo.value)
        selectedFile.value = ''
        fileContent.value = ''
      } catch (error) {
        alert('Error loading repository: ' + error.message)
      } finally {
        isLoading.value = false
      }
    }

    const selectFile = async (filePath) => {
      if (selectedFile.value === filePath) return
      
      try {
        fileContent.value = await gitService.readFile(selectedRepo.value, filePath)
        selectedFile.value = filePath
      } catch (error) {
        fileContent.value = 'Error reading file: ' + error.message
      }
    }

    const updateFileContent = async (newContent) => {
      if (!selectedFile.value) return
      
      try {
        await gitService.writeFile(selectedRepo.value, selectedFile.value, newContent)
        fileContent.value = newContent
      } catch (error) {
        alert('Error saving file: ' + error.message)
      }
    }

    const commitChanges = async () => {
      if (!selectedRepo.value) return
      
      // Create a more modern commit message dialog
      const message = await new Promise((resolve) => {
        const modal = document.createElement('div')
        modal.style.cssText = `
          position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
          background: rgba(0,0,0,0.5); display: flex; align-items: center; 
          justify-content: center; z-index: 10000;
        `
        
        const dialog = document.createElement('div')
        dialog.style.cssText = `
          background: ${isDarkTheme.value ? '#2d2d2d' : '#fff'}; 
          padding: 24px; border-radius: 8px; min-width: 400px; max-width: 600px;
          color: ${isDarkTheme.value ? '#e0e0e0' : '#000'};
          border: 1px solid ${isDarkTheme.value ? '#404040' : '#dee2e6'};
        `
        
        dialog.innerHTML = `
          <h5 style="margin: 0 0 16px 0;">Commit Changes</h5>
          <textarea 
            id="commit-message" 
            placeholder="Enter commit message..." 
            style="width: 100%; height: 80px; padding: 8px; border: 1px solid ${isDarkTheme.value ? '#404040' : '#ced4da'}; 
                   border-radius: 4px; background: ${isDarkTheme.value ? '#1e1e1e' : '#fff'}; 
                   color: ${isDarkTheme.value ? '#e0e0e0' : '#000'}; resize: vertical; font-family: inherit;"
          >Update files</textarea>
          <div style="margin-top: 16px; text-align: right;">
            <button id="cancel-btn" style="margin-right: 8px; padding: 8px 16px; border: 1px solid ${isDarkTheme.value ? '#6c757d' : '#6c757d'}; 
                                          background: transparent; color: ${isDarkTheme.value ? '#e0e0e0' : '#6c757d'}; border-radius: 4px; cursor: pointer;">
              Cancel
            </button>
            <button id="commit-btn" style="padding: 8px 16px; border: none; background: #28a745; color: white; border-radius: 4px; cursor: pointer;">
              Commit
            </button>
          </div>
        `
        
        modal.appendChild(dialog)
        document.body.appendChild(modal)
        
        const textarea = dialog.querySelector('#commit-message')
        const commitBtn = dialog.querySelector('#commit-btn')
        const cancelBtn = dialog.querySelector('#cancel-btn')
        
        textarea.focus()
        textarea.select()
        
        const cleanup = () => document.body.removeChild(modal)
        
        commitBtn.onclick = () => {
          const msg = textarea.value.trim()
          cleanup()
          resolve(msg || null)
        }
        
        cancelBtn.onclick = () => {
          cleanup()
          resolve(null)
        }
        
        modal.onclick = (e) => {
          if (e.target === modal) {
            cleanup()
            resolve(null)
          }
        }
        
        textarea.onkeydown = (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            commitBtn.click()
          }
          if (e.key === 'Escape') {
            cancelBtn.click()
          }
        }
      })
      
      if (!message) return
      
      isLoading.value = true
      loadingMessage.value = 'Committing changes...'
      
      try {
        await gitService.commitChanges(selectedRepo.value, message, onGitMessage)
      } catch (error) {
        alert('Error committing changes: ' + error.message)
      } finally {
        isLoading.value = false
      }
    }

    const pushChanges = async () => {
      if (!selectedRepo.value) return
      
      isLoading.value = true
      loadingMessage.value = 'Pushing changes...'
      
      try {
        await gitService.pushChanges(selectedRepo.value, onGitMessage)
        alert('Changes pushed successfully!')
      } catch (error) {
        alert('Error pushing changes: ' + error.message)
      } finally {
        isLoading.value = false
      }
    }

    const fetchChanges = async () => {
      if (!selectedRepo.value) return
      
      isLoading.value = true
      loadingMessage.value = 'Fetching changes...'
      
      try {
        await gitService.fetchChanges(selectedRepo.value, onGitMessage)
        alert('Changes fetched successfully!')
      } catch (error) {
        alert('Error fetching changes: ' + error.message)
      } finally {
        isLoading.value = false
      }
    }

    const toggleTheme = () => {
      isDarkTheme.value = !isDarkTheme.value
      localStorage.setItem('darkTheme', isDarkTheme.value)
    }

    const toggleGitHubAuth = () => {
      if (isGitHubAuthenticated.value) {
        // Sign out
        gitHubToken.value = ''
        isGitHubAuthenticated.value = false
        localStorage.removeItem('githubToken')
        
        // Update git service to remove auth
        gitService.setGitHubAuth(null)
      } else {
        // Show sign in modal
        showAuthModal.value = true
      }
    }

    const handleGitHubAuth = (token) => {
      gitHubToken.value = token
      isGitHubAuthenticated.value = true
      localStorage.setItem('githubToken', token)
      showAuthModal.value = false
      
      // Update git service with auth
      gitService.setGitHubAuth(token)
    }

    const selectCommit = async (commit) => {
      selectedCommit.value = commit
      selectedFile.value = ''
      fileContent.value = ''
      
      try {
        commitFiles.value = await gitService.getCommitFiles(selectedRepo.value, commit.oid)
      } catch (error) {
        console.error('Error loading commit files:', error)
        commitFiles.value = []
      }
    }

    const openLocalRepository = async () => {
      try {
        // Check if File System Access API is supported
        if ('showDirectoryPicker' in window) {
          const directoryHandle = await window.showDirectoryPicker()
          
          isLoading.value = true
          loadingMessage.value = 'Checking local repository...'
          
          // Test if the selected directory is a git repository
          const repoName = await gitService.openLocalRepository(directoryHandle)
          await loadRepositories()
          selectedRepo.value = repoName
          await loadRepository()
        } else {
          // Fallback for browsers that don't support File System Access API
          alert('Directory picker not supported in this browser. Please use a Chromium-based browser.')
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          // User cancelled the directory picker
          return
        }
        console.error('Error opening local repository:', error)
        alert('Error opening local repository: ' + error.message)
      } finally {
        isLoading.value = false
      }
    }

    const checkLocalFSConnection = async () => {
      try {
        const result = await gitService.testLocalFSConnection()
        fsRemoteConnected.value = result.connected
        if (!result.connected) {
          fsRemoteError.value = result.suggestion || result.error
        } else {
          fsRemoteError.value = ''
        }
      } catch (error) {
        fsRemoteConnected.value = false
        fsRemoteError.value = 'Cannot access local filesystem'
      }
    }

    // Provide dark theme state to child components
    provide('isDarkTheme', isDarkTheme)

    // Load theme and GitHub token from localStorage
    onMounted(async () => {
      const savedTheme = localStorage.getItem('darkTheme')
      isDarkTheme.value = savedTheme === 'true'
      
      const savedToken = localStorage.getItem('githubToken')
      if (savedToken) {
        gitHubToken.value = savedToken
        isGitHubAuthenticated.value = true
        gitService.setGitHubAuth(savedToken)
      }
      
      // Initialize terminal
      setTimeout(() => {
        initTerminal()
      }, 100)
      
      await loadRepositories()
      await checkLocalFSConnection()
    })

    return {
      repoUrl,
      selectedRepo,
      repositories,
      fileTree,
      selectedFile,
      fileContent,
      isLoading,
      loadingMessage,
      isDarkTheme,
      activeTab,
      selectedCommit,
      commitFiles,
      fsRemoteConnected,
      fsRemoteError,
      isGitHubAuthenticated,
      showAuthModal,
      cloneProgress,
      terminalContainer,
      terminalPanel,
      terminalHeight,
      contentHeight,
      startResize,
      cloneRepository,
      loadRepository,
      selectFile,
      updateFileContent,
      commitChanges,
      pushChanges,
      fetchChanges,
      toggleTheme,
      toggleGitHubAuth,
      handleGitHubAuth,
      selectCommit,
      openLocalRepository
    }
  }
}
</script>

<style>
html, body, #app {
  height: 100vh;
  margin: 0;
  padding: 0;
}

.h-100 {
  height: 100% !important;
}

/* Dark Theme */
.dark-theme {
  background-color: #1a1a1a;
  color: #e0e0e0;
}

.dark-theme .card {
  background-color: #2d2d2d;
  border-color: #404040;
  color: #e0e0e0;
}

.dark-theme .card-header {
  background-color: #363636;
  border-color: #404040;
}

.dark-theme .border-end,
.dark-theme .border-top,
.dark-theme .border-bottom {
  border-color: #404040 !important;
}

.dark-theme .form-control,
.dark-theme .form-select {
  background-color: #2d2d2d;
  border-color: #404040;
  color: #e0e0e0;
}

.dark-theme .btn-outline-secondary {
  border-color: #404040;
  color: #e0e0e0;
}

.dark-theme .btn-outline-secondary:hover {
  background-color: #404040;
  border-color: #404040;
}

.dark-theme .btn-link {
  color: #9ca3af;
}

.dark-theme .btn-link.active {
  color: #e0e0e0;
  background-color: #363636;
}

.dark-theme .text-muted {
  color: #9ca3af !important;
}

.dark-theme .list-group-item {
  background-color: #2d2d2d;
  border-color: #404040;
  color: #e0e0e0;
}

.dark-theme .list-group-item:hover {
  background-color: #363636;
}

.dark-theme .list-group-item.active {
  background-color: #0d6efd;
  border-color: #0d6efd;
}

.dark-theme .bg-light {
  background-color: #2d2d2d !important;
}

/* Fix FileTree controls in dark theme */
.dark-theme .tree-controls {
  background-color: #252526 !important;
  border-color: #404040 !important;
}

.dark-theme .tree-controls .btn-outline-secondary {
  background-color: #404040 !important;
  border-color: #6c757d !important;
  color: #e0e0e0 !important;
}

.dark-theme .tree-controls .btn-outline-secondary:hover {
  background-color: #505357 !important;
  border-color: #6c757d !important;
  color: #fff !important;
}

/* Fix FileEditor toolbar in dark theme */
.dark-theme .toolbar {
  background-color: #252526 !important;
  border-color: #404040 !important;
}

/* Fix FileTree item highlighting in dark theme */
.dark-theme .file-item {
  color: #e0e0e0 !important;
}

.dark-theme .file-item:hover {
  background-color: #2a2d2e !important;
}

.dark-theme .file-item.selected {
  background-color: #37373d !important;
  color: #ffffff !important;
}

.dark-theme .file-item.selected:hover {
  background-color: #424247 !important;
}

/* Content Area */
.content-area {
  overflow: hidden;
  min-height: 200px;
}

/* Terminal Panel */
.terminal-panel {
  border-top: 1px solid #dee2e6;
  min-height: 100px;
  max-height: 600px;
}

.dark-theme .terminal-panel {
  border-top-color: #404040;
}

/* Resize Handle */
.resize-handle {
  height: 4px;
  background: #dee2e6;
  cursor: ns-resize;
  position: relative;
  flex: 0 0 4px;
  z-index: 10;
}

.dark-theme .resize-handle {
  background: #404040;
}

.resize-handle:hover {
  background: #007bff;
}

.resize-handle::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 2px;
  background: #666;
  border-radius: 1px;
}

.dark-theme .resize-handle::after {
  background: #999;
}
</style>