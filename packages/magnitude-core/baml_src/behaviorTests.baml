
test DoNotOverplan1 {
    functions [CreatePartialRecipe]
    args {
        screenshot {
            url "https://magnitude-test-screenshots.s3.us-east-1.amazonaws.com/do_not_overplan_1.png"
        }
        step {
            description #"Create a new company"#
            checks [
                #"Company added successfully"#
            ]
            testData {
                data [

                ]
                other #"Make up the first 2 values and use defaults for the rest"#
            }
        }
        previousActions [

        ]
    }
    @@assert( one_action, {{ this.actions|length == 1 }} )
    @@assert( not_marked_finished, {{ this.finished == false }} )
}


test DoNotOverplan2 {
    // Especially with the test data, planner might be tempted to click create company and also plan to fill form fields.
    // BUT we do not want it to do that - it should only click the button.
    functions [CreatePartialRecipe]
    args {
        screenshot {
            url "https://magnitude-test-screenshots.s3.us-east-1.amazonaws.com/do_not_overplan_2.png"
        }
        step {
            description #"Create a new company"#
            checks [
                #"Company added successfully"#
            ]
            testData {
                data [

                ]
                other #"Make up the first 2 values and use defaults for the rest"#
            }
        }
        previousActions [
            #"
            {
                "variant": "click",
                "target": "Companies option in the left sidebar menu"
            }
            "#
        ]
    }
    @@assert( one_action, {{ this.actions|length == 1 }} )
    @@assert( not_marked_finished, {{ this.finished == false }} )
}