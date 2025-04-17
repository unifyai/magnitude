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
    content string @description(#"
        Content to type, insert sequences <enter> or <tab> for those keypresses respectively.
    "#)
}

class ScrollIngredient {
    variant "scroll" @description(#"
        Hover mouse over target and scroll
    "#)
    target string
    deltaX int @description(#"
        Pixels to scroll horizontally
    "#)
    deltaY int @description(#"
        Pixels to scroll vertically
    "#)
}

class CheckIngredient {
    variant "check"
    description string
}

type Ingredient = ActionIngredient | CheckIngredient
type ActionIngredient = ClickIngredient | TypeIngredient | ScrollIngredient

class PartialRecipe {
    reasoning string @description(#"Consider what you can see right now and what actions you can plan without guessing"#)
    actions ActionIngredient[]
    finished bool
}

function CreatePartialRecipe (screenshot: image, step: TestStep, previousActions: string[]) -> PartialRecipe {
    client SonnetAnthropic
    prompt #"
        {{ _.role("system") }}
        Plan out web actions that should be executed in order to complete the step:
        <step>{{ step.description }}</step>
        Specified targets should be very descriptive.
        Only plan out actions that involve things you can see right now.
        Note that many actions combine click + something else, so you may not need to click separately.
        
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
    reasoning string
    // Not used as output rn but as an indicator for the LLM, it will not convert and return original check
    should_pass bool
    check string
}

function RemoveImplicitCheckContext (screenshot: image, check: string, previousActions: string[]) -> CheckNoContext {
    client SonnetAnthropic
    prompt #"
        {{ _.role("system") }}
        Your job is to convert a "check" which may implicitly depend on historical context to one that can be verified based on the current screenshot alone.
        You should NOT add any detail to the check, but rather replace any context-dependent details.
        However, make sure the check is very simple, even if this means dropping some details. Only a short description.

        If the check does NOT hold true based on the screenshot, instead set should_pass to false, and return the original check.

        {{ ctx.output_format }}

        {{ _.role("user")}}

        The history of previous actions:
        {%if previousActions %}
        (there are none)
        {%endif%}
        {%for action in previousActions%}
        {{ action }}
        {%endfor%}
        
        The "check" to convert: 
        {{ check }}

        Current screenshot:
        {{screenshot}}
    "# 
}
