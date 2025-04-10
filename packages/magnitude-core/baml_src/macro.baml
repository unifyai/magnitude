class TestDataEntry {
    key string
    value string
    sensitive bool
}

class TestData {
    data TestDataEntry[]?
    other string?
}

class TestStep {
    description string
    checks string[]
    testData TestData
}

class TestCase {
    url string
    steps TestStep[]
}

class ClickIngredient {
    variant "click" @description(#"
        Click something
    "#)
    target string
}

class TypeIngredient {
    variant "type" @description(#"
        Click something and type into it
    "#)
    target string
    content string
}

class CheckIngredient {
    variant "check"
    description string
}

type Ingredient = ActionIngredient | CheckIngredient
type ActionIngredient = ClickIngredient | TypeIngredient

class PartialRecipe {
    reasoning string @description(#"Consider what you can see right now and what actions you can plan without guessing"#)
    actions ActionIngredient[]
    finished bool
}

function CreatePartialRecipe (screenshot: image, step: TestStep, previousActions: string[]) -> PartialRecipe {
    client SonnetAnthropic
    prompt #"
        {{ _.role("system") }}
        Plan out web actions that should be executed in order to complete the step: {{ step.description }}
        Specified targets should be very descriptive.
        Only plan out actions that involve things you can see right now.
        
        {{ ctx.output_format }}

        {{ _.role("user") }}
        {%if previousActions %}
        Keep in mind that you've already taken these actions:
        {%for action in previousActions%}
        {{ action }}
        {%endfor%}
        {%endif%}

        {%if step.testData.data or step.testData.other %}
        Additionally, bake this test data into the actions you plan out (only where appropriate):
        {%if step.testData.data %}
        {%for field in step.testData.data %}
        {{field.key}} = {{field.value}}
        {%endfor%}
        {%endif%}
        {%if step.testData.other %}
        {{ step.testData.other }}
        {%endif%}
        {%endif%}

        {{ screenshot }}
    "# 
}

class CheckNoContext {
    check string
}

function RemoveImplicitCheckContext (screenshot: image, check: string, previousActions: string[]) -> CheckNoContext {
    client SonnetAnthropic
    prompt #"
        {{ _.role("system") }}
        Your job is to convert a "check" which may implicitly depend on historical context to one that can be verified based on the current screenshot alone.
        You should NOT add any detail to the check, but rather replace any context-dependent details.
        The history of previous actions:
        {%if previousActions %}
        (there are none)
        {%endif%}
        {%for action in previousActions%}
        {{ action }}
        {%endfor%}
        
        The "check" to convert: 
        {{ check }}

        {{ ctx.output_format }}
    "# 
}
