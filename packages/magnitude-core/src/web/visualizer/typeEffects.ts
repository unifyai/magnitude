import { BrowserContext } from "playwright";

export class TypeEffectVisual {
    private baseOpacity: number;
    private groupTimeout: number;
    private maxWidthPercent: number;

    constructor(baseOpacity: number = 0.8, groupTimeout: number = 1000, maxWidthPercent: number = 80) {
        this.baseOpacity = baseOpacity;
        this.groupTimeout = groupTimeout;
        this.maxWidthPercent = maxWidthPercent;
    }

    async setContext(context: BrowserContext) {
        await context.addInitScript((options: { opacity: number, groupTimeout: number, maxWidthPercent: number }) => {
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', setupTypeEffects);
            } else {
                setupTypeEffects();
            }
            
            function setupTypeEffects() {
                // Create container for all type groups
                const container = document.createElement('div');
                container.id = 'type-effects-container';
                container.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    pointer-events: none;
                    z-index: 1000000060;
                `;
                document.body.appendChild(container);

                // Add styles for type groups
                const style = document.createElement('style');
                style.setAttribute('data-type-effects', 'true');
                style.textContent = `
                    @keyframes typeIn {
                        0% {
                            opacity: 0;
                            transform: translateX(-50%) scale(0.8) translateY(10px);
                        }
                        100% {
                            opacity: 1;
                            transform: translateX(-50%) scale(1) translateY(0);
                        }
                    }
                    @keyframes fadeOut {
                        0% {
                            opacity: 1;
                            transform: translateX(-50%) translateY(0);
                        }
                        100% {
                            opacity: 0;
                            transform: translateX(-50%) translateY(20px);
                        }
                    }
                    .type-group {
                        position: fixed;
                        bottom: 40px;
                        left: 50%;
                        transform: translateX(-50%);
                        max-width: ${options.maxWidthPercent}vw;
                        background: rgba(0, 150, 255, ${options.opacity * 0.15});
                        border: 1px solid rgba(0, 150, 255, ${options.opacity * 0.5});
                        border-radius: 4px;
                        padding: 8px 12px;
                        font-family: monospace;
                        font-size: 14px;
                        color: rgba(0, 150, 255, ${options.opacity});
                        pointer-events: none;
                        animation: typeIn 0.2s ease-out forwards;
                        box-shadow: 0 2px 8px rgba(0, 150, 255, ${options.opacity * 0.3});
                        backdrop-filter: blur(4px);
                        white-space: pre-wrap;
                        word-wrap: break-word;
                        text-align: center;
                        line-height: 1.4;
                    }
                    .type-group.fading {
                        animation: fadeOut 0.5s ease-out forwards;
                    }
                    .type-group .char {
                        display: inline;
                        animation: typeIn 0.1s ease-out;
                        animation-fill-mode: both;
                    }
                `;
                document.head.appendChild(style);

                // Create the single type group element
                const typeGroup = document.createElement('div');
                typeGroup.className = 'type-group';
                typeGroup.style.display = 'none';
                container.appendChild(typeGroup);

                // State management
                let groupTimeout: ReturnType<typeof setTimeout> | null = null;
                let fadeTimeout: ReturnType<typeof setTimeout> | null = null;
                let lastKeyTime = 0;

                // Handle keydown events
                document.addEventListener('keydown', (e) => {
                    const now = Date.now();
                    const key = e.key;
                    
                    // Skip modifier keys and special keys
                    if (e.ctrlKey || e.metaKey || e.altKey || 
                        ['Shift', 'Control', 'Meta', 'Alt', 'CapsLock', 'Tab', 'Escape'].includes(key)) {
                        return;
                    }

                    // Clear existing timeouts
                    if (groupTimeout) {
                        clearTimeout(groupTimeout);
                        groupTimeout = null;
                    }
                    if (fadeTimeout) {
                        clearTimeout(fadeTimeout);
                        fadeTimeout = null;
                    }

                    // Cancel any ongoing fade
                    typeGroup.classList.remove('fading');

                    // Clear group if timeout exceeded
                    if (now - lastKeyTime > options.groupTimeout) {
                        typeGroup.innerHTML = '';
                    }

                    // Show the group
                    typeGroup.style.display = 'block';

                    // Add the typed character
                    let displayChar = key;
                    
                    // Handle special keys
                    if (key === 'Enter') displayChar = '↵';
                    else if (key === 'Backspace') displayChar = '⌫';
                    else if (key === 'Delete') displayChar = '⌦';
                    else if (key === 'ArrowLeft') displayChar = '←';
                    else if (key === 'ArrowRight') displayChar = '→';
                    else if (key === 'ArrowUp') displayChar = '↑';
                    else if (key === 'ArrowDown') displayChar = '↓';
                    else if (key === ' ') displayChar = '␣';
                    
                    const charSpan = document.createElement('span');
                    charSpan.className = 'char';
                    charSpan.textContent = displayChar;
                    
                    // Reduce delay for better performance with fast typing
                    const charCount = typeGroup.children.length;
                    const delay = Math.min(charCount * 0.01, 0.15); // Cap at 150ms max delay
                    charSpan.style.animationDelay = `${delay}s`;
                    
                    typeGroup.appendChild(charSpan);
                    lastKeyTime = now;

                    // Set timeout to fade out after inactivity
                    groupTimeout = setTimeout(() => {
                        typeGroup.classList.add('fading');
                        
                        fadeTimeout = setTimeout(() => {
                            typeGroup.style.display = 'none';
                            typeGroup.innerHTML = '';
                            typeGroup.classList.remove('fading');
                        }, 500);
                    }, options.groupTimeout * 2);
                });

                // Clean up on page hide
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) {
                        typeGroup.innerHTML = '';
                        typeGroup.style.display = 'none';
                        typeGroup.classList.remove('fading');
                        if (groupTimeout) {
                            clearTimeout(groupTimeout);
                            groupTimeout = null;
                        }
                        if (fadeTimeout) {
                            clearTimeout(fadeTimeout);
                            fadeTimeout = null;
                        }
                    }
                });
            }
        }, { opacity: this.baseOpacity, groupTimeout: this.groupTimeout, maxWidthPercent: this.maxWidthPercent });
    }
}