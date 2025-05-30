<template>
  <div class="container-fluid h-100" :class="{ 'dark-theme': isDarkTheme }">
    <div class="row h-100">
      <!-- Left Panel -->
      <div class="col-4 border-end h-100 d-flex flex-column">
        <div class="p-3">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">Git Viewer</h5>
            <button @click="toggleTheme" class="btn btn-outline-secondary btn-sm">
              <i :class="isDarkTheme ? 'bi bi-sun' : 'bi bi-moon'"></i>
            </button>
          </div>
          
          <!-- Repository URL Input -->
          <div class="mb-3">
            <label class="form-label">Repository URL</label>
            <div class="input-group">
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
          </div>

          <!-- Repository Selector -->
          <div class="mb-3" v-if="repositories.length > 0">
            <label class="form-label">Select Repository</label>
            <select v-model="selectedRepo" class="form-select" @change="loadRepository">
              <option value="">Choose a repository...</option>
              <option v-for="repo in repositories" :key="repo.name" :value="repo.name">
                {{ repo.name }}
              </option>
            </select>
          </div>

          <!-- Git Commands -->
          <div class="mb-3" v-if="selectedRepo">
            <label class="form-label">Git Commands</label>
            <div class="d-grid gap-2">
              <button @click="commitChanges" class="btn btn-outline-success btn-sm">
                Commit Changes
              </button>
              <button @click="pushChanges" class="btn btn-outline-warning btn-sm">
                Push
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
              <h6 class="px-3 pt-3 mb-2" v-if="fileTree.length > 0">Files</h6>
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
        <div class="p-3 border-bottom">
          <h6 v-if="selectedFile">{{ selectedFile }}</h6>
          <h6 v-else-if="selectedCommit">Commit: {{ selectedCommit.oid.substring(0, 7) }}</h6>
          <span v-else class="text-muted">Select a file to view/edit or a commit to view details</span>
        </div>
        
        <div class="flex-grow-1">
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
      </div>
    </div>

    <!-- Loading Overlay -->
    <div v-if="isLoading" class="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-dark bg-opacity-50" style="z-index: 9999;">
      <div class="text-center text-white">
        <div class="spinner-border mb-2" role="status"></div>
        <div>{{ loadingMessage }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, provide } from 'vue'
import FileTree from './components/FileTree.vue'
import FileEditor from './components/FileEditor.vue'
import CommitList from './components/CommitList.vue'
import { gitService } from './services/gitService.js'

export default {
  name: 'App',
  components: {
    FileTree,
    FileEditor,
    CommitList
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


    const loadRepositories = async () => {
      repositories.value = await gitService.getRepositories()
    }

    const cloneRepository = async () => {
      if (!repoUrl.value) return
      
      isLoading.value = true
      loadingMessage.value = 'Cloning repository...'
      
      try {
        const repoName = await gitService.cloneRepository(repoUrl.value)
        await loadRepositories()
        selectedRepo.value = repoName
        await loadRepository()
        repoUrl.value = ''
      } catch (error) {
        alert('Error cloning repository: ' + error.message)
      } finally {
        isLoading.value = false
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
      
      const message = prompt('Commit message:', 'Update files')
      if (!message) return
      
      isLoading.value = true
      loadingMessage.value = 'Committing changes...'
      
      try {
        await gitService.commitChanges(selectedRepo.value, message)
        alert('Changes committed successfully!')
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
        await gitService.pushChanges(selectedRepo.value)
        alert('Changes pushed successfully!')
      } catch (error) {
        alert('Error pushing changes: ' + error.message)
      } finally {
        isLoading.value = false
      }
    }

    const toggleTheme = () => {
      isDarkTheme.value = !isDarkTheme.value
      localStorage.setItem('darkTheme', isDarkTheme.value)
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

    // Provide dark theme state to child components
    provide('isDarkTheme', isDarkTheme)

    // Load theme from localStorage
    onMounted(async () => {
      const savedTheme = localStorage.getItem('darkTheme')
      isDarkTheme.value = savedTheme === 'true'
      console.log('Dark theme loaded:', isDarkTheme.value);
      await loadRepositories()
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
      cloneRepository,
      loadRepository,
      selectFile,
      updateFileContent,
      commitChanges,
      pushChanges,
      toggleTheme,
      selectCommit
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
</style>