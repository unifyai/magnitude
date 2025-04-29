

export class Magnus {
    async step(description: string) {
        console.log("step:", description)
        await new Promise((resolve, reject) => setTimeout(resolve, 1000));
    }

    async check(description: string) {
        console.log("check:", description)
        await new Promise((resolve, reject) => setTimeout(resolve, 500));
    }
}