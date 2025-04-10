
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


test CheckContextRemove1 {
    // Manual for now - ideally we'd want to verify that executor can check the returned description successfully
    functions [RemoveImplicitCheckContext]
    args {
        screenshot {
            url "https://magnitude-test-screenshots.s3.us-east-1.amazonaws.com/check_context_remove_1.png"
        }
        check #"Company added successfully"#
        previousActions [
            #"
                {
                    "variant": "click",
                    "target": "Companies option in the left sidebar menu"
                }
            "#,
            #"
                {
                    "variant": "click",
                    "target": "'Add Company' button in the top right corner of the Companies page"
                }
            "#,
            #"
                {
                    "variant": "type",
                    "target": "Name input field",
                    "content": "Acme Solutions"
                }
            "#,
            #"
                {
                    "variant": "type",
                    "target": "Domain input field",
                    "content": "acmesolutions.com"
                }
            "#,
            #"
                {
                    "variant": "type",
                    "target": "Logo URL input field",
                    "content": "https://example.com/image.jpg"
                }
            "#,
            #"
                {
                    "variant": "type",
                    "target": "Industry input field",
                    "content": "Technology"
                }
            "#,
            #"
                {
                    "variant": "click",
                    "target": "Size dropdown menu"
                }
            "#,
            #"
                {
                    "variant": "click",
                    "target": "1-10 option in the Size dropdown"
                }
            "#,
            #"
                {
                    "variant": "click",
                    "target": "Revenue dropdown menu"
                }
            "#,
            #"
                {
                    "variant": "click",
                    "target": "<$100K option in the Revenue dropdown"
                }
            "#,
            #"
                {
                    "variant": "click",
                    "target": "ICP Fit dropdown menu"
                }
            "#,
            #"
                {
                    "variant": "click",
                    "target": "Medium option in the ICP Fit dropdown"
                }
            "#,
            #"
                {
                    "variant": "click",
                    "target": "Est. ARR dropdown menu"
                }
            "#,
            #"
                {
                    "variant": "click",
                    "target": "<$10K option in the Est. ARR dropdown"
                }
            "#,
            #"
                {
                    "variant": "click",
                    "target": "Connection Strength dropdown menu"
                }
            "#,
            #"
                {
                    "variant": "click",
                    "target": "Weak option in the Connection Strength dropdown"
                }
            "#,
            #"
                {
                    "variant": "click",
                    "target": "Save button"
                }
            "#
        ]
    }
}