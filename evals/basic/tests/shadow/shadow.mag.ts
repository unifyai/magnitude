import { test } from 'magnitude-test';


test.group('shadow DOM arena', { url: 'localhost:8080/shadow' }, () => {
    // test('dropdown test 1', async ({ ai, page }) => {
    //     //await ai.step('select Canada as the country');
    //     await page.screenshot({ path: 'foo.png'});
    //     await ai.click("Select a country...")
    // });
    // test('dropdown test 1', async ({ ai }) => {
    //     await ai.step("Select Option 2 for standard select")
    // });

    test('dropdown test 2', async ({ ai, page }) => {
        //await ai.step('Select option 2 in the dropdown');
        await ai.click('Option 1');
        //await page.click('select');
        await ai.click('Option 2');
        // await new Promise(resolve => setTimeout(resolve, 2000));
        // await page.pause();
        // //await ai.harness.screenshot({ path: 'foo.png' });
        // //await ai.harness.applyTransformations();
        // await new Promise(resolve => setTimeout(resolve, 20000));
        //await ai.step("Select Option 2 for standard select")

        //await page.reload();
    });
})
