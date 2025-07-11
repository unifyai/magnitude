import { BrowserContext } from "playwright";

export class MouseEffectVisual {
    private baseOpacity: number;

    constructor(baseOpacity: number = 0.4) {
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
                    background: rgba(0, 150, 255, ${opacity * 0.33});
                    pointer-events: none;
                    z-index: 1000000050;
                    transition: transform 0.1s ease-out, width 0.1s ease-out, height 0.1s ease-out, border-color 0.1s ease-out;
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
                let currentSize = 20; // Track intended size explicitly

                // Track mouse movement
                document.addEventListener('mousemove', (e) => {
                    // Update cursor position - always center on mouse
                    const offset = currentSize / 2;
                    cursor.style.left = e.clientX - offset + 'px';
                    cursor.style.top = e.clientY - offset + 'px';

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

                    // Temporarily disable transition for instant repositioning
                    cursor.style.transition = 'none';
                    
                    // Shrink cursor and update size tracking
                    currentSize = 10;
                    cursor.style.width = '10px';
                    cursor.style.height = '10px';
                    cursor.style.background = `rgba(0, 150, 255, ${opacity * 2})`;
                    cursor.style.border = `2px solid rgba(0, 150, 255, ${opacity * 2.67})`;
                    // Immediately reposition the smaller cursor
                    cursor.style.left = e.clientX - 5 + 'px';
                    cursor.style.top = e.clientY - 5 + 'px';
                    
                    // Re-enable transition after a frame
                    requestAnimationFrame(() => {
                        cursor.style.transition = 'transform 0.1s ease-out, width 0.1s ease-out, height 0.1s ease-out, border-color 0.1s ease-out';
                    });
                });

                // Mouse up - end drag and restore cursor
                document.addEventListener('mouseup', (e) => {
                    isMouseDown = false;

                    // Hide drag line
                    line.style.display = 'none';

                    // Temporarily disable transition for instant repositioning
                    cursor.style.transition = 'none';
                    
                    // Restore cursor size and update size tracking
                    currentSize = 20;
                    cursor.style.width = '20px';
                    cursor.style.height = '20px';
                    cursor.style.background = `rgba(0, 150, 255, ${opacity * 0.33})`;
                    cursor.style.border = `2px solid rgba(0, 150, 255, ${opacity})`;
                    // Immediately reposition the restored cursor
                    cursor.style.left = e.clientX - 10 + 'px';
                    cursor.style.top = e.clientY - 10 + 'px';
                    
                    // Re-enable transition after a frame
                    requestAnimationFrame(() => {
                        cursor.style.transition = 'transform 0.1s ease-out, width 0.1s ease-out, height 0.1s ease-out, border-color 0.1s ease-out';
                    });
                });

                // Visualize clicks
                document.addEventListener('click', (e) => {
                    // Create ripple effect
                    const ripple = document.createElement('div');
                    ripple.style.cssText = `
                        position: fixed;
                        left: ${e.clientX - 30}px;
                        top: ${e.clientY - 30}px;
                        width: 60px;
                        height: 60px;
                        border: 3px solid #0096ff;
                        border-radius: 50%;
                        pointer-events: none;
                        z-index: 1000000040;
                        animation: ripple 0.6s ease-out;
                    `;

                    // Add ripple animation
                    const style = document.createElement('style');
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
                    `;
                    if (!document.querySelector('style[data-cursor-effects]')) {
                        style.setAttribute('data-cursor-effects', 'true');
                        document.head.appendChild(style);
                    }

                    document.body.appendChild(ripple);

                    // Flash the cursor
                    cursor.style.background = `rgba(0, 150, 255, ${opacity * 2.67})`;
                    cursor.style.border = `2px solid rgba(0, 150, 255, 1)`;
                    cursor.style.transform = 'scale(1.5)';

                    setTimeout(() => {
                        cursor.style.background = `rgba(0, 150, 255, ${opacity * 0.33})`;
                        cursor.style.border = `2px solid rgba(0, 150, 255, ${opacity})`;
                        cursor.style.transform = 'scale(1)';
                    }, 200);

                    // Remove ripple after animation
                    setTimeout(() => ripple.remove(), 600);
                });

                // Also track right clicks
                document.addEventListener('contextmenu', (e) => {
                    // Don't prevent default - let context menu show

                    // Create different colored ripple for right click
                    const ripple = document.createElement('div');
                    ripple.style.cssText = `
                        position: fixed;
                        left: ${e.clientX - 30}px;
                        top: ${e.clientY - 30}px;
                        width: 60px;
                        height: 60px;
                        border: 3px solid #0096ff;
                        border-radius: 50%;
                        pointer-events: none;
                        z-index: 1000000040;
                        animation: ripple 0.6s ease-out;
                    `;

                    document.body.appendChild(ripple);
                    setTimeout(() => ripple.remove(), 600);
                });

                // Hide cursor when it leaves the viewport
                document.addEventListener('mouseleave', () => {
                    cursor.style.display = 'none';
                });

                document.addEventListener('mouseenter', () => {
                    cursor.style.display = 'block';
                });
            }
        }, this.baseOpacity);
    }
}