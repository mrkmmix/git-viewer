<template>
  <div class="file-editor h-100 d-flex flex-column">
    <div class="toolbar border-bottom p-2 d-flex justify-content-between align-items-center">
      <div class="file-path">
        <i class="bi bi-file-text me-1"></i>
        <span class="fw-bold">{{ filePath }}</span>
      </div>
      <div class="toolbar-actions">
        <span v-if="hasUnsavedChanges" class="text-warning me-2">
          <i class="bi bi-circle-fill"></i> Unsaved changes
        </span>
        <button 
          @click="saveFile" 
          class="btn btn-sm btn-primary"
          :disabled="!hasUnsavedChanges"
        >
          Save
        </button>
      </div>
    </div>
    
    <div ref="editorContainer" class="editor-container flex-grow-1"></div>
  </div>
</template>

<script>
import { ref, watch, onMounted, onBeforeUnmount, inject } from 'vue'
import * as monaco from 'monaco-editor'

// Provide a minimal require.toUrl implementation for Monaco
if (!window.require) {
  window.require = {};
}
if (!window.require.toUrl) {
  window.require.toUrl = function(path) {
    // Convert module paths to URLs
    return new URL(path, import.meta.url).href;
  };
}

export default {
  name: 'FileEditor',
  props: {
    filePath: {
      type: String,
      required: true
    },
    content: {
      type: String,
      required: true
    }
  },
  emits: ['content-changed'],
  setup(props, { emit }) {
    const editorContainer = ref(null)
    let editor = null  // Not reactive - just a regular variable
    const hasUnsavedChanges = ref(false)

    // Get dark theme state from parent component
    const isDarkTheme = inject('isDarkTheme', ref(false))

    const getLanguageFromFilePath = (filePath) => {
      const extension = filePath.split('.').pop()?.toLowerCase()
      const languageMap = {
        'js': 'javascript',
        'ts': 'typescript',
        'jsx': 'javascript',
        'tsx': 'typescript',
        'vue': 'html',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'json': 'json',
        'md': 'markdown',
        'py': 'python',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'go': 'go',
        'rs': 'rust',
        'php': 'php',
        'rb': 'ruby',
        'sh': 'shell',
        'yml': 'yaml',
        'yaml': 'yaml',
        'xml': 'xml',
        'sql': 'sql',
        'cs': 'csharp',
        'csx': 'csharp',
        'h': 'cpp',
        'hpp': 'cpp',
        'hxx': 'cpp',
        'cc': 'cpp',
        'cxx': 'cpp'
      }
      return languageMap[extension] || 'plaintext'
    }

    const initializeEditor = () => {
      if (!editorContainer.value) return

      const language = getLanguageFromFilePath(props.filePath)
      
      editor = monaco.editor.create(editorContainer.value, {
        value: props.content,
        language: language,
        theme: isDarkTheme.value ? 'vs-dark' : 'vs',
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        fontSize: 14,
        lineNumbers: 'on',
        renderWhitespace: 'selection',
        links: false,
        tabSize: 2,
        insertSpaces: true,
        // Enable language features for better support
        quickSuggestions: true,
        parameterHints: { enabled: true },
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnEnter: 'on',
        tabCompletion: 'on',
        wordBasedSuggestions: true
      });
      
      // Listen for content changes
      editor.onDidChangeModelContent(() => {
        hasUnsavedChanges.value = true
      });
    }

    const updateTheme = () => {
      if (editor) {
        monaco.editor.setTheme(isDarkTheme.value ? 'vs-dark' : 'vs')
      }
    }
    
    const updateLanguage = () => {
      if (editor) {
        const language = getLanguageFromFilePath(props.filePath)
        const model = editor.getModel()
        if (model) {
          monaco.editor.setModelLanguage(model, language)
        }
      }
    }

    const saveFile = () => {
      if (editor && hasUnsavedChanges.value) {
        emit('content-changed', editor.getValue())
        hasUnsavedChanges.value = false
      }
    }

    watch(() => props.filePath, (newPath, oldPath) => {
      if (newPath !== oldPath && editor) {
        // Just update the content and language, no model disposal
        editor.setValue(props.content)
        hasUnsavedChanges.value = false
        updateLanguage()
      }
    })
    
    watch(() => props.content, (newContent) => {
      if (editor && newContent !== editor.getValue()) {
        editor.setValue(newContent)
        hasUnsavedChanges.value = false
      }
    })
    watch(isDarkTheme, updateTheme)

    onMounted(() => {
      initializeEditor()
    })

    onBeforeUnmount(() => {
      if (editor) {
        editor.dispose()
      }
    })

    return {
      editorContainer,
      saveFile,
      hasUnsavedChanges
    }
  }
}
</script>

<style scoped>
.file-editor {
  height: 100%;
}

.editor-container {
  height: 100%;
  min-height: 300px;
}

.toolbar {
  background-color: #f8f9fa;
  border-color: #dee2e6;
}

:global(.dark-theme) .toolbar {
  background-color: #252526;
  border-color: #404040;
}
</style>