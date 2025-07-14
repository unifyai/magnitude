import { BrowserContext } from "playwright";

export class TypeEffectVisual {
    private baseOpacity: number;
    private groupTimeout: number;

    constructor(baseOpacity: number = 0.8, groupTimeout: number = 1000) {
        this.baseOpacity = baseOpacity;
        this.groupTimeout = groupTimeout;
    }

    async setContext(context: BrowserContext) {
        await context.addInitScript((options: { opacity: number, groupTimeout: number }) => {
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
                            transform: scale(0.8) translateY(10px);
                        }
                        100% {
                            opacity: 1;
                            transform: scale(1) translateY(0);
                        }
                    }
                    @keyframes fadeOut {
                        0% {
                            opacity: 1;
                            transform: translateY(0);
                        }
                        100% {
                            opacity: 0;
                            transform: translateY(-20px);
                        }
                    }
                    .type-group {
                        position: fixed;
                        background: rgba(0, 150, 255, ${options.opacity * 0.15});
                        border: 1px solid rgba(0, 150, 255, ${options.opacity * 0.5});
                        border-radius: 4px;
                        padding: 4px 8px;
                        font-family: monospace;
                        font-size: 14px;
                        color: rgba(0, 150, 255, ${options.opacity});
                        pointer-events: none;
                        animation: typeIn 0.2s ease-out;
                        box-shadow: 0 2px 8px rgba(0, 150, 255, ${options.opacity * 0.3});
                        backdrop-filter: blur(4px);
                        white-space: pre;
                    }
                    .type-group.fading {
                        animation: fadeOut 0.5s ease-out forwards;
                    }
                    .type-group .char {
                        display: inline-block;
                        animation: typeIn 0.1s ease-out;
                        animation-fill-mode: both;
                    }
                `;
                document.head.appendChild(style);

                // State management
                let currentGroup: HTMLElement | null = null;
                let groupTimeout: ReturnType<typeof setTimeout> | null = null;
                let lastKeyTime = 0;
                let groupPosition = { x: 100, y: 100 };
                let activeGroups = new Set<HTMLElement>();

                // Handle keydown events
                document.addEventListener('keydown', (e) => {
                    const now = Date.now();
                    const key = e.key;
                    
                    // Skip modifier keys and special keys
                    if (e.ctrlKey || e.metaKey || e.altKey || 
                        ['Shift', 'Control', 'Meta', 'Alt', 'CapsLock', 'Tab', 'Escape'].includes(key)) {
                        return;
                    }

                    // Clear existing timeout
                    if (groupTimeout) {
                        clearTimeout(groupTimeout);
                    }

                    // Create new group if needed
                    if (!currentGroup || now - lastKeyTime > options.groupTimeout) {
                        // Fade out previous group if exists
                        if (currentGroup) {
                            const prevGroup = currentGroup;
                            prevGroup.classList.add('fading');
                            setTimeout(() => {
                                prevGroup.remove();
                                activeGroups.delete(prevGroup);
                            }, 500);
                        }

                        // Create new group
                        currentGroup = document.createElement('div');
                        currentGroup.className = 'type-group';
                        
                        // Position based on focused element or mouse position
                        const focused = document.activeElement;
                        if (focused && focused !== document.body && focused.getBoundingClientRect) {
                            const rect = focused.getBoundingClientRect();
                            groupPosition.x = rect.left + rect.width / 2;
                            groupPosition.y = rect.top - 30;
                        } else {
                            // Use last mouse position with some offset
                            groupPosition.x = Math.min(Math.max(groupPosition.x, 50), window.innerWidth - 200);
                            groupPosition.y = Math.min(Math.max(groupPosition.y, 50), window.innerHeight - 100);
                        }

                        currentGroup.style.left = `${groupPosition.x}px`;
                        currentGroup.style.top = `${groupPosition.y}px`;
                        currentGroup.style.transform = 'translateX(-50%)';
                        
                        container.appendChild(currentGroup);
                        activeGroups.add(currentGroup);
                    }

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
                    charSpan.style.animationDelay = `${currentGroup.children.length * 0.02}s`;
                    
                    currentGroup.appendChild(charSpan);
                    lastKeyTime = now;

                    // Set timeout to fade out after inactivity
                    groupTimeout = setTimeout(() => {
                        if (currentGroup) {
                            currentGroup.classList.add('fading');
                            setTimeout(() => {
                                if (currentGroup) {
                                    currentGroup.remove();
                                    activeGroups.delete(currentGroup);
                                }
                            }, 500);
                            currentGroup = null;
                        }
                    }, options.groupTimeout * 2);
                });

                // Track mouse position for positioning fallback
                document.addEventListener('mousemove', (e) => {
                    if (!currentGroup) {
                        groupPosition.x = e.clientX;
                        groupPosition.y = e.clientY - 40;
                    }
                });

                // Clean up on page hide
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) {
                        activeGroups.forEach(group => group.remove());
                        activeGroups.clear();
                        currentGroup = null;
                    }
                });
            }
        }, { opacity: this.baseOpacity, groupTimeout: this.groupTimeout });
    }
}