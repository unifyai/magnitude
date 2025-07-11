import { BrowserContext } from "playwright";

export class MouseEffectVisual { 
    async setContext(context: BrowserContext) {
        await context.addInitScript(() => {
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
                    border: 2px solid #ff0000;
                    border-radius: 50%;
                    background: rgba(255, 0, 0, 0.3);
                    pointer-events: none;
                    z-index: 999999;
                    transition: transform 0.1s ease-out, width 0.1s ease-out, height 0.1s ease-out;
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
                    z-index: 999997;
                    overflow: visible;
                `;
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('stroke', '#ff0000');
                line.setAttribute('stroke-width', '2');
                line.setAttribute('stroke-dasharray', '5,5');
                line.setAttribute('opacity', '0.8');
                line.style.display = 'none';
                dragLine.appendChild(line);
                document.body.appendChild(dragLine);

                let isMouseDown = false;
                let dragStartX = 0;
                let dragStartY = 0;

                // Track mouse movement
                document.addEventListener('mousemove', (e) => {
                    // Update cursor position based on its current size
                    const cursorSize = isMouseDown ? 10 : 20;
                    const offset = cursorSize / 2;
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

                    // Shrink cursor
                    cursor.style.width = '10px';
                    cursor.style.height = '10px';
                    cursor.style.left = e.clientX - 5 + 'px';
                    cursor.style.top = e.clientY - 5 + 'px';
                    cursor.style.background = 'rgba(255, 0, 0, 0.6)';
                });

                // Mouse up - end drag and restore cursor
                document.addEventListener('mouseup', (e) => {
                    isMouseDown = false;

                    // Hide drag line
                    line.style.display = 'none';

                    // Restore cursor size
                    cursor.style.width = '20px';
                    cursor.style.height = '20px';
                    cursor.style.left = e.clientX - 10 + 'px';
                    cursor.style.top = e.clientY - 10 + 'px';
                    cursor.style.background = 'rgba(255, 0, 0, 0.3)';
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
                        border: 3px solid #ff0000;
                        border-radius: 50%;
                        pointer-events: none;
                        z-index: 999998;
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
                    cursor.style.background = 'rgba(255, 0, 0, 0.8)';
                    cursor.style.transform = 'scale(1.5)';

                    setTimeout(() => {
                        cursor.style.background = 'rgba(255, 0, 0, 0.3)';
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
                        border: 3px solid #0000ff;
                        border-radius: 50%;
                        pointer-events: none;
                        z-index: 999998;
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
        });
    }
}