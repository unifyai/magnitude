// Custom select manager script for browser injection
module.exports = function getSelectManagerScript() {
  return function() {
    if (typeof window.customSelectManager !== 'undefined') {
      console.warn('customSelectManager already defined. Cleaning up old one.');
      if(typeof window.customSelectManager.cleanup === 'function') {
        window.customSelectManager.cleanup();
      }
    }

    window.customSelectManager = {
      activeDropdown: null,
      originalSelect: null,
      boundHandleDocumentMousedown: null,
      boundHandleOutsideClick: null,

      init: function() {
        this.boundHandleDocumentMousedown = this.handleDocumentMousedown.bind(this);
        // Use capture phase to intercept before default select behavior
        document.addEventListener('mousedown', this.boundHandleDocumentMousedown, true);
        console.log('Custom select mousedown listener added.');
      },

      handleDocumentMousedown: function(e) {
        const target = e.target;
        if (!target) return;

        if (target.tagName === 'SELECT' || (target.tagName === 'OPTION' && target.parentElement.tagName === 'SELECT')) {
          e.preventDefault();
          e.stopPropagation();
          
          const selectElement = (target.tagName === 'SELECT' ? target : target.parentElement);
          
          // If clicking the same select that already has a custom dropdown,
          // treat it as a toggle (or just close it).
          if (this.activeDropdown && this.originalSelect === selectElement) {
            this.closeDropdown();
            return;
          }

          this.closeDropdown(); // Close any existing dropdown

          this.originalSelect = selectElement;
          this.originalSelect.blur(); // Remove focus from native select
          
          this.createAndShowDropdown(this.originalSelect);
        }
      },

      createAndShowDropdown: function(select) {
        const rect = select.getBoundingClientRect();
        const vh = window.innerHeight;
        
        const dropdown = document.createElement('div');
        dropdown.style.cssText = `
          position: fixed;
          left: ${rect.left}px;
          top: ${rect.bottom + 2}px; /* Added 2px spacing */
          width: ${rect.width}px;
          background: white;
          border: 1px solid #ccc;
          box-shadow: 0 2px 10px rgba(0,0,0,0.15);
          z-index: 2147483647; /* Max z-index */
          max-height: ${Math.min(300, vh - rect.bottom - 20)}px; /* Max height with some viewport padding */
          overflow-y: auto;
          border-radius: 4px;
        `;

        const innerContainer = document.createElement('div');
        innerContainer.style.cssText = `
          padding: 5px 0; /* Reduced padding */
        `;
        
        Array.from(select.options).forEach((option, index) => {
          const div = document.createElement('div');
          div.textContent = option.text;
          div.style.cssText = `
            padding: 8px 12px;
            margin: 0; /* Removed margin */
            cursor: pointer;
            background-color: ${index === select.selectedIndex ? '#e0e0e0' : 'white'};
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          `;
          div.setAttribute('data-index', index.toString());

          div.onmouseenter = function() {
            this.style.backgroundColor = index === select.selectedIndex ? '#d0d0d0' : '#f0f0f0';
          };
          
          div.onmouseleave = function() {
            this.style.backgroundColor = index === select.selectedIndex ? '#e0e0e0' : 'white';
          };
          
          div.onclick = () => {
            select.selectedIndex = index;
            // Dispatch 'input' and 'change' events for better compatibility with frameworks
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            this.closeDropdown();
          };
          
          innerContainer.appendChild(div);
        });

        dropdown.appendChild(innerContainer);
        document.body.appendChild(dropdown);
        this.activeDropdown = dropdown;
        
        // Add listener for clicks outside the dropdown
        // Use setTimeout to ensure this mousedown event doesn't immediately close it
        setTimeout(() => {
          this.boundHandleOutsideClick = this.handleOutsideClick.bind(this);
          document.addEventListener('mousedown', this.boundHandleOutsideClick, true);
        }, 0);

        console.log('Custom dropdown created for:', select.id || select.name);
      },

      handleOutsideClick: function(e) {
        if (this.activeDropdown && !this.activeDropdown.contains(e.target) && e.target !== this.originalSelect) {
          // Make sure not to close if clicking on the original select again (which would re-open)
          if(this.originalSelect && this.originalSelect.contains(e.target)) return;
          this.closeDropdown();
        }
      },

      closeDropdown: function() {
        if (this.activeDropdown) {
          this.activeDropdown.remove();
          this.activeDropdown = null;
        }
        this.originalSelect = null; // Clear original select reference
        if (this.boundHandleOutsideClick) {
          document.removeEventListener('mousedown', this.boundHandleOutsideClick, true);
          this.boundHandleOutsideClick = null;
        }
        console.log('Custom dropdown closed.');
      },

      cleanup: function() {
        this.closeDropdown();
        if (this.boundHandleDocumentMousedown) {
          document.removeEventListener('mousedown', this.boundHandleDocumentMousedown, true);
          this.boundHandleDocumentMousedown = null;
        }
        console.log('Custom select manager cleaned up.');
      }
    };

    window.customSelectManager.init();
  }.toString();
}
