import { Intent } from "./types";


export class Recipe {
    private ingredients: Intent[];
    
    constructor () {
        this.ingredients = [];
    }

    add(item: Intent) {
        this.ingredients.push(item);
    }

    getIngredients() {
        return this.ingredients;
    }
}