import type { Page } from 'playwright';
import getSelectManagerScript from './selectScript';

export class DOMTransformer {
    private page!: Page;

    constructor() {}

    public setActivePage(newPage: Page) {
        this.page = newPage;

        newPage.on('load', async () => { await this.setupScript(); });
    }
    
    public async setupScript() {
        try {
            // Get the script as a string from the separate file
            const scriptFnString = getSelectManagerScript();
            
            // Evaluate the script function in the browser
            // We need to wrap it in a self-executing function
            await this.page.evaluate(`(${scriptFnString})()`);
            
            console.log('Script injected into page.');
        } catch (error) {
            console.warn(`Error injecting script: ${(error as Error).message}`);
        }
    }
}
