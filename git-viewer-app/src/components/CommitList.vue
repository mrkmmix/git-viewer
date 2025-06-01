<template>
  <div class="h-100 d-flex flex-column">
    
    <div v-if="isLoading" class="d-flex justify-content-center p-3">
      <div class="spinner-border spinner-border-sm" role="status"></div>
      <span class="ms-2">Loading commits...</span>
    </div>
    
    <div v-else-if="commits.length === 0" class="px-3 text-muted">
      No commits found
    </div>
    
    <div v-else class="flex-grow-1 overflow-auto">
      <div class="list-group list-group-flush">
        <button
          v-for="commit in commits"
          :key="commit.oid"
          @click="selectCommit(commit)"
          :class="['list-group-item', 'list-group-item-action', 'border-0', { 'active': selectedCommit?.oid === commit.oid }]"
        >
          <div class="d-flex w-100 justify-content-between">
            <div class="flex-grow-1">
              <h6 class="mb-1">{{ commit.commit.message.split('\n')[0] }}</h6>
              <p class="mb-1 text-muted small">{{ commit.commit.author.name }}</p>
              <small class="text-muted">{{ formatDate(commit.commit.author.timestamp) }}</small>
            </div>
            <small class="text-muted font-monospace">{{ commit.oid.substring(0, 7) }}</small>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, watch, onMounted } from 'vue'
import { gitService } from '../services/gitService.js'

export default {
  name: 'CommitList',
  props: {
    repoName: {
      type: String,
      required: true
    },
    selectedCommit: {
      type: Object,
      default: null
    }
  },
  emits: ['commit-selected'],
  setup(props, { emit }) {
    const commits = ref([])
    const isLoading = ref(false)

    const loadCommits = async () => {
      if (!props.repoName) return
      
      isLoading.value = true
      try {
        commits.value = await gitService.getCommits(props.repoName)
      } catch (error) {
        console.error('Error loading commits:', error)
        commits.value = []
      } finally {
        isLoading.value = false
      }
    }

    const selectCommit = (commit) => {
      emit('commit-selected', commit)
    }

    const formatDate = (timestamp) => {
      return new Date(timestamp * 1000).toLocaleString()
    }

    watch(() => props.repoName, loadCommits, { immediate: true })

    return {
      commits,
      isLoading,
      selectCommit,
      formatDate
    }
  }
}
</script>