import { BrowserContext } from "playwright";

export class MouseEffectVisual {
    private baseOpacity: number;

    constructor(baseOpacity: number = 0.5) {
        this.baseOpacity = baseOpacity;
    }

    async setContext(context: BrowserContext) {
        await context.addInitScript((opacity: number) => {
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', setupCursorEffects);
            } else {
                setupCursorEffects();
            }
            
            function setupCursorEffects() {
                // Create custom cursor element
                const cursor = document.createElement('div');
                cursor.id = 'custom-cursor';
                cursor.style.cssText = `
                    position: fixed;
                    width: 20px;
                    height: 20px;
                    border: 2px solid rgba(0, 150, 255, ${opacity});
                    border-radius: 50%;
                    background: rgba(0, 150, 255, ${opacity * 0.5});
                    pointer-events: none;
                    z-index: 1000000050;
                    transition: transform 0.1s ease-out;
                `;
                document.body.appendChild(cursor);

                // Create drag line element
                const dragLine = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                dragLine.id = 'drag-line';
                dragLine.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    pointer-events: none;
                    z-index: 1000000030;
                    overflow: visible;
                `;
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('stroke', '#0096ff');
                line.setAttribute('stroke-width', '2');
                line.setAttribute('stroke-dasharray', '5,5');
                line.setAttribute('opacity', '0.8');
                line.style.display = 'none';
                dragLine.appendChild(line);
                document.body.appendChild(dragLine);

                let isMouseDown = false;
                let dragStartX = 0;
                let dragStartY = 0;
                const activeRipples = new Set<HTMLElement>();

                // Track mouse movement
                document.addEventListener('mousemove', (e) => {
                    // Update cursor position - always center on mouse
                    cursor.style.left = e.clientX - 10 + 'px';
                    cursor.style.top = e.clientY - 10 + 'px';

                    // Update drag line if dragging
                    if (isMouseDown) {
                        line.setAttribute('x1', dragStartX.toString());
                        line.setAttribute('y1', dragStartY.toString());
                        line.setAttribute('x2', e.clientX.toString());
                        line.setAttribute('y2', e.clientY.toString());
                        line.style.display = 'block';
                    }
                });

                // Mouse down - start drag and shrink cursor
                document.addEventListener('mousedown', (e) => {
                    isMouseDown = true;
                    dragStartX = e.clientX;
                    dragStartY = e.clientY;

                    // Use transform scale instead of changing width/height
                    cursor.style.transform = 'scale(0.5)';
                    cursor.style.background = `rgba(0, 150, 255, ${opacity * 1.5})`;
                    cursor.style.border = `2px solid rgba(0, 150, 255, ${opacity * 2})`;
                });

                // Mouse up - end drag and restore cursor
                document.addEventListener('mouseup', (e) => {
                    isMouseDown = false;

                    // Hide drag line
                    line.style.display = 'none';

                    // Restore cursor
                    cursor.style.transform = 'scale(1)';
                    cursor.style.background = `rgba(0, 150, 255, ${opacity * 0.5})`;
                    cursor.style.border = `2px solid rgba(0, 150, 255, ${opacity})`;
                });

                // Visualize clicks
                document.addEventListener('click', (e) => {
                    // Add ripple animation styles once
                    if (!document.querySelector('style[data-cursor-effects]')) {
                        const style = document.createElement('style');
                        style.setAttribute('data-cursor-effects', 'true');
                        style.textContent = `
                            @keyframes ripple {
                                0% {
                                    transform: scale(0);
                                    opacity: 1;
                                }
                                100% {
                                    transform: scale(2);
                                    opacity: 0;
                                }
                            }
                            .click-ripple {
                                position: fixed;
                                width: 60px;
                                height: 60px;
                                border: 3px solid #0096ff;
                                border-radius: 50%;
                                pointer-events: none;
                                z-index: 1000000040;
                                transform: scale(0);
                                opacity: 0;
                            }
                            .click-ripple.active {
                                animation: ripple 0.6s ease-out forwards;
                            }
                        `;
                        document.head.appendChild(style);
                    }

                    // Create ripple effect
                    const ripple = document.createElement('div');
                    ripple.className = 'click-ripple';
                    ripple.style.left = `${e.clientX - 30}px`;
                    ripple.style.top = `${e.clientY - 30}px`;
                    
                    document.body.appendChild(ripple);
                    activeRipples.add(ripple);
                    
                    // Trigger animation on next frame to ensure proper initialization
                    requestAnimationFrame(() => {
                        ripple.classList.add('active');
                    });

                    // Flash the cursor only if not already scaled down
                    const currentTransform = cursor.style.transform;
                    if (currentTransform !== 'scale(0.5)') {
                        cursor.style.background = `rgba(0, 150, 255, ${opacity * 1.5})`;
                        cursor.style.border = `2px solid rgba(0, 150, 255, 1)`;
                        cursor.style.transform = 'scale(1.5)';

                        setTimeout(() => {
                            cursor.style.background = `rgba(0, 150, 255, ${opacity * 0.5})`;
                            cursor.style.border = `2px solid rgba(0, 150, 255, ${opacity})`;
                            cursor.style.transform = 'scale(1)';
                        }, 200);
                    }

                    // Remove ripple after animation
                    setTimeout(() => {
                        ripple.remove();
                        activeRipples.delete(ripple);
                    }, 600);
                });

                // Also track right clicks
                document.addEventListener('contextmenu', (e) => {
                    // Don't prevent default - let context menu show

                    // Create ripple for right click (reuse same styles)
                    const ripple = document.createElement('div');
                    ripple.className = 'click-ripple';
                    ripple.style.left = `${e.clientX - 30}px`;
                    ripple.style.top = `${e.clientY - 30}px`;
                    
                    document.body.appendChild(ripple);
                    activeRipples.add(ripple);
                    
                    // Trigger animation on next frame
                    requestAnimationFrame(() => {
                        ripple.classList.add('active');
                    });
                    
                    setTimeout(() => {
                        ripple.remove();
                        activeRipples.delete(ripple);
                    }, 600);
                });

                // Hide cursor when it leaves the viewport
                document.addEventListener('mouseleave', () => {
                    cursor.style.display = 'none';
                    // Clean up any active ripples
                    activeRipples.forEach(ripple => ripple.remove());
                    activeRipples.clear();
                });

                document.addEventListener('mouseenter', () => {
                    cursor.style.display = 'block';
                });
            }
        }, this.baseOpacity);
    }
}