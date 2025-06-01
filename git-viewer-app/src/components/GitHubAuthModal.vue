<template>
<!-- backdrop -->
<div v-if="show" class="modal-overlay" @click.self="handleOverlayClick">
  <!-- dialog -->
  <div class="modal-dialog" @click.stop>
      <div class="modal-header">
        <h5><i class="bi bi-github"></i> GitHub Authentication</h5>
      </div>
      
      <div class="modal-body">
        <p class="help-text">
          To access private repositories, you need a GitHub Personal Access Token.
        </p>
        
        <div class="instructions">
          <strong>Steps to create a token:</strong>
          <ol>
            <li>Go to GitHub Settings → Developer settings → Personal access tokens</li>
            <li>Click "Generate new token (classic)"</li>
            <li>Select scopes: <code>repo</code> (for private repos)</li>
            <li>Copy the generated token and paste it below</li>
          </ol>
        </div>
        
        <input 
          ref="tokenInput"
          v-model="token"
          type="password" 
          class="token-input"
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          @keydown="handleKeydown"
        />
      </div>
      
      <div class="modal-footer">
        <button @click="cancel" class="btn btn-cancel">
          Cancel
        </button>
        <button @click="authenticate" class="btn btn-primary" :disabled="!token.trim()">
          Authenticate
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, nextTick, inject } from 'vue'

export default {
  name: 'GitHubAuthModal',
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  emits: ['authenticate', 'cancel'],
  setup(props, { emit }) {
    const token = ref('')
    const tokenInput = ref(null)
    const isDarkTheme = inject('isDarkTheme')

    const authenticate = () => {
      const trimmedToken = token.value.trim()
      if (trimmedToken) {
        emit('authenticate', trimmedToken)
        token.value = ''
      }
    }

    const cancel = () => {
      emit('cancel')
      token.value = ''
    }

    const handleOverlayClick = () => {
      // This will only be called when clicking the overlay
      // because @click.stop on .modal-dialog prevents bubbling
      cancel()
    }

    const handleKeydown = (e) => {
      if (e.key === 'Enter') {
        authenticate()
      } else if (e.key === 'Escape') {
        cancel()
      }
    }

    // Focus input when modal shows
    nextTick(() => {
      if (props.show && tokenInput.value) {
        tokenInput.value.focus()
      }
    })

    return {
      token,
      tokenInput,
      isDarkTheme,
      authenticate,
      cancel,
      handleOverlayClick,
      handleKeydown
    }
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal-dialog {
  pointer-events: auto;
  background: var(--bs-body-bg, #fff);
  color: var(--bs-body-color, #000);
  padding: 0;
  border-radius: 8px;
  min-width: 500px;
  max-width: 600px;
  border: 1px solid var(--bs-border-color, #dee2e6);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  user-select: text;
}

.modal-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--bs-border-color, #dee2e6);
}

.modal-header h5 {
  margin: 0;
  font-size: 1.25rem;
}

.modal-body {
  padding: 20px 24px;
}

.help-text {
  margin-bottom: 16px;
  color: var(--bs-secondary-color, #666);
}

.instructions {
  margin-bottom: 20px;
}

.instructions strong {
  display: block;
  margin-bottom: 8px;
}

.instructions ol {
  margin: 0;
  padding-left: 20px;
  color: var(--bs-secondary-color, #666);
}

.instructions code {
  background: var(--bs-gray-100, #f8f9fa);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: monospace;
}

.token-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--bs-border-color, #ced4da);
  border-radius: 4px;
  background: var(--bs-body-bg, #fff);
  color: var(--bs-body-color, #000);
  font-family: monospace;
  font-size: 14px;
}

.token-input:focus {
  outline: none;
  border-color: #0d6efd;
  box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25);
}

.modal-footer {
  padding: 16px 24px 20px;
  text-align: right;
  border-top: 1px solid var(--bs-border-color, #dee2e6);
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  border: 1px solid transparent;
  margin-left: 8px;
}

.btn-cancel {
  border-color: var(--bs-secondary, #6c757d);
  background: transparent;
  color: var(--bs-secondary, #6c757d);
}

.btn-cancel:hover {
  background: var(--bs-secondary, #6c757d);
  color: white;
}

.btn-primary {
  background: #0d6efd;
  color: white;
  border-color: #0d6efd;
}

.btn-primary:hover:not(:disabled) {
  background: #0b5ed7;
  border-color: #0a58ca;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Dark theme support */
:global(.dark-theme) .modal-dialog {
  background: #2d2d2d;
  color: #e0e0e0;
  border-color: #404040;
}

:global(.dark-theme) .modal-header,
:global(.dark-theme) .modal-footer {
  border-color: #404040;
}

:global(.dark-theme) .help-text,
:global(.dark-theme) .instructions ol {
  color: #b0b0b0;
}

:global(.dark-theme) .instructions code {
  background: #1e1e1e;
  color: #e0e0e0;
}

:global(.dark-theme) .token-input {
  background: #1e1e1e;
  color: #e0e0e0;
  border-color: #404040;
}

:global(.dark-theme) .btn-cancel {
  color: #e0e0e0;
  border-color: #6c757d;
}

.modal-dialog {
  border: 2px solid red;   /* TEMP */
}
</style>