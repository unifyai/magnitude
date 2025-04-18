import { test } from 'magnitude-test';

// test('bogus')
//     .step('do nothin')
//         .check('picture of a sloth is visible')
//     //.step('click on the sloth')
//     .step('create a todo')
//         .data("Pay Antropic bill")
//         .check('see todo')


test('can add and complete todos', { url: 'http://localhost:5173' })
    .step('create a todos')
        .data('Buy groceries')
        .check('should see a todo')
