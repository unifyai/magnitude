
test DoNotOverplan {
    functions [CreatePartialRecipe]
    args {
        screenshot {
            url "https://magnitude-test-screenshots.s3.us-east-1.amazonaws.com/d17a1cb1-3219-4711-b93a-8ddac3818a20.png"
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
    @@assert( {{ this.actions|length == 1 }} )
}