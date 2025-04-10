
// class ClickAction {
//     x float
//     y float
// }

// class TypeAction {
//     x float
//     y float
//     // You can press enter with <enter>
//     // cant get em to use this
//     content string @description(#"
//         You can press enter with <enter>   
//     "#)
// }

// It may make sense to have variants of the prompt for specific types of targets
function LocateTarget(screenshot: image, target: string) -> string {
    client Molmo
    prompt #"
        {{ _.role("user") }}
        {{ screenshot }}
        Point to where you would click to interact with:  {{ target }}. Use only one point.
    "#
}

function EvaluateCheck(screenshot: image, check: string) -> string {
    client Molmo
    prompt #"
        {{ _.role("user") }}
        {{ screenshot }}
        Evaluate whether this holds true, responding with simply Yes or No: {{ check }}
    "#
}